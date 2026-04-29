/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__, { width: 420, height: 720 });

type BlockData = Record<string, unknown>;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = (hex || '').replace('#', '');
  if (!clean || clean === 'transparent') return { r: 0.89, g: 0.89, b: 0.89 };
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(clean);
  return result
    ? { r: parseInt(result[1], 16) / 255, g: parseInt(result[2], 16) / 255, b: parseInt(result[3], 16) / 255 }
    : { r: 0.5, g: 0.5, b: 0.5 };
}

const BLOCK_COLORS: Record<string, string> = {
  paragraph: '#3B82F6', heading: '#1D4ED8', blockquote: '#7C3AED',
  button: '#059669', image: '#D97706', logo: '#EA580C',
  divider: '#94A3B8', html: '#DC2626', youtube: '#B91C1C',
  poll: '#CA8A04', curation: '#0D9488', newrss: '#0F766E',
  wordpress: '#2563EB', dynamic: '#0891B2', promotion: '#BE185D',
  newpromotion: '#9D174D', profile: '#4F46E5', share: '#0284C7',
  rss: '#B45309', evvnt: '#6D28D9', news: '#1E40AF',
  revContent: '#78350F', iterable: '#065F46', googleDocs: '#166534',
  view_in_browser: '#475569', aiText: '#7C3AED', audio: '#0369A1',
  layout: '#64748B', 'nested-layout-2-column': '#334155', footer: '#1E293B',
};

// ─── Font helpers ─────────────────────────────────────────────────────────────

async function loadFonts(): Promise<void> {
  const variants = ['Regular', 'Bold', 'Italic', 'Medium'];
  for (const style of variants) {
    try { await figma.loadFontAsync({ family: 'Inter', style }); } catch (_) { /* skip */ }
  }
}

async function makeText(opts: {
  text: string;
  size?: number;
  color?: string;
  weight?: 'Regular' | 'Bold' | 'Italic' | 'Medium';
  align?: 'LEFT' | 'CENTER' | 'RIGHT';
  width?: number;
  lineH?: number;
}): Promise<TextNode> {
  const style = opts.weight || 'Regular';
  // Ensure the specific variant is loaded (no-op if already cached)
  try { await figma.loadFontAsync({ family: 'Inter', style }); } catch (_) {
    try { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); } catch (__) { /* */ }
  }
  const node = figma.createText();
  node.fontName = { family: 'Inter', style };
  node.fontSize = opts.size || 14;
  node.fills = [{ type: 'SOLID', color: hexToRgb(opts.color || '#1E293B') }];
  if (opts.lineH) node.lineHeight = { value: opts.lineH, unit: 'PIXELS' };
  // Set characters FIRST (node auto-sizes in WIDTH_AND_HEIGHT default mode)
  // so node.height is valid before we constrain the width.
  node.characters = opts.text || ' ';
  if (opts.width) {
    node.textAutoResize = 'HEIGHT';
    node.resize(opts.width, node.height);
  }
  if (opts.align) node.textAlignHorizontal = opts.align;
  return node;
}

// ─── Auto-layout frame factory ────────────────────────────────────────────────

function makeFrame(opts: {
  name?: string;
  dir?: 'VERTICAL' | 'HORIZONTAL';
  bg?: string;
  width?: number;
  padTop?: number; padRight?: number; padBottom?: number; padLeft?: number;
  gap?: number;
  radius?: number;
  mainAlign?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  crossAlign?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  noFill?: boolean;
}): FrameNode {
  const f = figma.createFrame();
  f.name = opts.name || 'frame';
  const dir = opts.dir || 'VERTICAL';
  f.layoutMode = dir;
  // resize() sets both axes to FIXED in Figma's auto-layout engine.
  // Call it first, then override the axis that should grow — not before.
  if (opts.width !== undefined) {
    f.resize(opts.width, 10);
  }
  if (dir === 'VERTICAL') {
    f.primaryAxisSizingMode = 'AUTO';
    f.counterAxisSizingMode = opts.width !== undefined ? 'FIXED' : 'AUTO';
  } else {
    f.primaryAxisSizingMode = opts.width !== undefined ? 'FIXED' : 'AUTO';
    f.counterAxisSizingMode = 'AUTO';
  }
  f.fills = opts.noFill ? [] : [{ type: 'SOLID', color: hexToRgb(opts.bg || '#FFFFFF') }];
  f.paddingTop = opts.padTop || 0;
  f.paddingRight = opts.padRight || 0;
  f.paddingBottom = opts.padBottom || 0;
  f.paddingLeft = opts.padLeft || 0;
  f.itemSpacing = opts.gap || 0;
  if (opts.radius) f.cornerRadius = opts.radius;
  if (opts.mainAlign) f.primaryAxisAlignItems = opts.mainAlign;
  if (opts.crossAlign) f.counterAxisAlignItems = opts.crossAlign;
  return f;
}

function makeRect(w: number, h: number, color: string, radius = 0): RectangleNode {
  const r = figma.createRectangle();
  r.resize(w, h);
  r.fills = [{ type: 'SOLID', color: hexToRgb(color) }];
  if (radius) r.cornerRadius = radius;
  return r;
}

function extractText(delta: unknown): string {
  if (!delta || typeof delta !== 'object') return '';
  const ops = (delta as Record<string, unknown>)['ops'];
  if (!Array.isArray(ops)) return '';
  return ops
    .filter((op) => typeof (op as Record<string, unknown>)['insert'] === 'string')
    .map((op) => (op as Record<string, unknown>)['insert'] as string)
    .join('').trim();
}

function bm(block: BlockData): BlockData {
  return (block['blockModel'] as BlockData) || {};
}

// ─── JSON frame (existing behavior) ──────────────────────────────────────────

async function createJsonFrame(block: BlockData): Promise<FrameNode> {
  const blockType = block['type'] as string;
  const headerColor = hexToRgb(BLOCK_COLORS[blockType] || '#6B7280');
  const W = 640;

  const outer = makeFrame({ name: `[${blockType}] JSON`, dir: 'VERTICAL', width: W });
  outer.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  outer.strokes = [{ type: 'SOLID', color: hexToRgb('#E2E8F0') }];
  outer.strokeWeight = 1;
  outer.cornerRadius = 8;
  outer.clipsContent = true;
  outer.itemSpacing = 0;

  // Header
  const header = makeFrame({ name: 'Header', dir: 'HORIZONTAL', width: W, padTop: 12, padRight: 16, padBottom: 12, padLeft: 16, crossAlign: 'CENTER' });
  header.primaryAxisSizingMode = 'FIXED';
  header.fills = [{ type: 'SOLID', color: headerColor }];

  const lbl = await makeText({ text: blockType.toUpperCase(), size: 12, color: '#FFFFFF', weight: 'Bold' });
  lbl.letterSpacing = { value: 0.8, unit: 'PIXELS' };
  header.appendChild(lbl);
  outer.appendChild(header);

  // Body
  const body = makeFrame({ name: 'JSON', dir: 'VERTICAL', width: W, bg: '#F8FAFC', padTop: 16, padRight: 20, padBottom: 16, padLeft: 20 });
  const json = await makeText({ text: JSON.stringify(block, null, 2), size: 10, color: '#1E293B', width: W - 40, lineH: 15 });
  body.appendChild(json);
  outer.appendChild(body);

  return outer;
}

// ─── Visual block renderer ────────────────────────────────────────────────────

async function createVisualBlock(block: BlockData): Promise<FrameNode> {
  const W = 600;
  const type = (block['type'] as string) || 'paragraph';
  const bgColor = (block['backgroundColor'] as string) || '#FFFFFF';
  const textColor = (block['textColor'] as string) || '#020617';
  const pt = (block['paddingTop'] as number) || 10;
  const pr = (block['paddingRight'] as number) || 25;
  const pb = (block['paddingBottom'] as number) || 10;
  const pl = (block['paddingLeft'] as number) || 25;
  const fs = (block['fontSize'] as number) || 14;
  const model = bm(block);
  const cw = W - pl - pr; // content width

  const outer = makeFrame({ name: `[${type}] Visual`, dir: 'VERTICAL', bg: bgColor, width: W, padTop: pt, padRight: pr, padBottom: pb, padLeft: pl, gap: 8 });

  // Border
  const thick = block['borderThickness'] as Record<string, number> | undefined;
  if (thick && (thick.top + thick.right + thick.bottom + thick.left) > 0) {
    outer.strokes = [{ type: 'SOLID', color: hexToRgb((block['borderColor'] as string) || '#CCCCCC') }];
    outer.strokeWeight = thick.top || 1;
    outer.strokeAlign = 'INSIDE';
  }
  const bRad = block['borderRadius'] as Record<string, number> | undefined;
  if (bRad) {
    outer.topLeftRadius = bRad.topLeft || 0;
    outer.topRightRadius = bRad.topRight || 0;
    outer.bottomLeftRadius = bRad.bottomLeft || 0;
    outer.bottomRightRadius = bRad.bottomRight || 0;
  }

  switch (type) {

    case 'paragraph': {
      const text = extractText(block['delta']) || 'Start writing...';
      const align = ((model['align'] as string) || 'left').toUpperCase() as 'LEFT' | 'CENTER' | 'RIGHT';
      outer.appendChild(await makeText({ text, size: fs, color: textColor, align, width: cw }));
      break;
    }

    case 'heading': {
      const text = extractText(block['delta']) || 'Heading';
      const ht = (model['headingType'] as string) || 'h1';
      const sizeMap: Record<string, number> = { h1: 36, h2: 30, h3: 24, h4: 20, h5: 18, h6: 16 };
      const align = ((model['align'] as string) || 'left').toUpperCase() as 'LEFT' | 'CENTER' | 'RIGHT';
      outer.appendChild(await makeText({ text, size: sizeMap[ht] || 36, color: textColor, weight: 'Bold', align, width: cw }));
      break;
    }

    case 'blockquote': {
      const text = extractText(block['delta']) || 'A compelling quote goes here.';
      const accent = (model['borderColor'] as string) || '#1D2D4D';
      const row = makeFrame({ dir: 'HORIZONTAL', width: cw, gap: 14, crossAlign: 'MIN', noFill: true });
      row.primaryAxisSizingMode = 'FIXED';
      const bar = makeRect(4, 20, accent);
      bar.layoutAlign = 'STRETCH';
      row.appendChild(bar);
      row.appendChild(await makeText({ text, size: fs, color: textColor, weight: 'Italic', width: cw - 18 }));
      outer.appendChild(row);
      break;
    }

    case 'button': {
      const label = (model['value'] as string) || 'Click Here';
      const btnBg = (model['backgroundColor'] as string) || '#1D2D4D';
      const btnColor = (model['color'] as string) || '#FFFFFF';
      const align = (model['align'] as string) || 'left';
      const ip = (model['innerPadding'] as Record<string, number>) || { top: 10, right: 12, bottom: 10, left: 12 };
      const br = (model['borderRadius'] as Record<string, number>) || { topLeft: 6, topRight: 6, bottomLeft: 6, bottomRight: 6 };

      const row = makeFrame({ dir: 'HORIZONTAL', width: cw, noFill: true });
      row.primaryAxisSizingMode = 'FIXED';
      row.primaryAxisAlignItems = align === 'center' ? 'CENTER' : align === 'right' ? 'MAX' : 'MIN';

      const btn = makeFrame({ dir: 'HORIZONTAL', bg: btnBg, padTop: ip.top, padRight: ip.right, padBottom: ip.bottom, padLeft: ip.left, mainAlign: 'CENTER', crossAlign: 'CENTER' });
      btn.topLeftRadius = br.topLeft || 6; btn.topRightRadius = br.topRight || 6;
      btn.bottomLeftRadius = br.bottomLeft || 6; btn.bottomRightRadius = br.bottomRight || 6;
      btn.appendChild(await makeText({ text: label, size: fs || 16, color: btnColor, weight: 'Bold' }));
      row.appendChild(btn);
      outer.appendChild(row);
      break;
    }

    case 'image':
    case 'logo': {
      const imgW = Math.min((model['width'] as number) || (type === 'logo' ? 200 : W), cw);
      const imgH = Math.round(imgW * (type === 'logo' ? 0.4 : 0.5));
      const align = (model['align'] as string) || 'left';
      const br = (model['borderRadius'] as Record<string, number>) || { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };

      const row = makeFrame({ dir: 'HORIZONTAL', width: cw, noFill: true });
      row.primaryAxisSizingMode = 'FIXED';
      row.resize(cw, imgH);
      row.counterAxisSizingMode = 'FIXED';
      row.primaryAxisAlignItems = align === 'center' ? 'CENTER' : align === 'right' ? 'MAX' : 'MIN';
      row.counterAxisAlignItems = 'MIN';

      const ph = makeRect(imgW, imgH, '#E2E8F0');
      ph.topLeftRadius = br.topLeft || 0; ph.topRightRadius = br.topRight || 0;
      ph.bottomLeftRadius = br.bottomLeft || 0; ph.bottomRightRadius = br.bottomRight || 0;
      row.appendChild(ph);
      outer.appendChild(row);

      const altText = (model['alt'] as string) || '';
      if (altText) {
        outer.appendChild(await makeText({ text: altText, size: 10, color: '#94A3B8', width: cw }));
      }
      break;
    }

    case 'divider': {
      const divColor = (model['color'] as string) || '#CCCCCC';
      const divH = (model['width'] as number) || 1;
      const divStyle = (model['style'] as string) || 'solid';
      const line = makeRect(cw, Math.max(divH, 1), divColor);
      if (divStyle === 'dashed' || divStyle === 'dotted') {
        line.fills = [];
        line.strokes = [{ type: 'SOLID', color: hexToRgb(divColor) }];
        line.strokeWeight = divH;
        line.dashPattern = divStyle === 'dashed' ? [8, 4] : [2, 4];
      }
      outer.appendChild(line);
      break;
    }

    case 'html': {
      const html = (model['html'] as string) || '<p>Custom HTML goes here</p>';
      const box = makeFrame({ dir: 'VERTICAL', bg: '#F1F5F9', width: cw, padTop: 12, padRight: 12, padBottom: 12, padLeft: 12, radius: 4 });
      const lbl = await makeText({ text: 'HTML', size: 9, color: '#94A3B8', weight: 'Bold' });
      lbl.letterSpacing = { value: 1, unit: 'PIXELS' };
      box.appendChild(lbl);
      box.itemSpacing = 6;
      box.appendChild(await makeText({ text: html, size: 11, color: '#475569', width: cw - 24, lineH: 16 }));
      outer.appendChild(box);
      break;
    }

    case 'youtube': {
      const ytW = Math.min((model['width'] as number) || W, cw);
      const ytH = Math.round(ytW * 9 / 16);
      const align = (model['align'] as string) || 'left';

      const row = makeFrame({ dir: 'HORIZONTAL', width: cw, noFill: true });
      row.primaryAxisSizingMode = 'FIXED';
      row.resize(cw, ytH);
      row.counterAxisSizingMode = 'FIXED';
      row.primaryAxisAlignItems = align === 'center' ? 'CENTER' : align === 'right' ? 'MAX' : 'MIN';

      const thumb = makeRect(ytW, ytH, '#1E1E1E', 4);
      row.appendChild(thumb);
      outer.appendChild(row);

      // Play icon overlay (centered in thumbnail via separate pass — use a label below)
      outer.appendChild(await makeText({ text: '▶ YouTube Video', size: 11, color: '#94A3B8', width: cw }));
      break;
    }

    case 'poll': {
      const question = (model['questionText'] as string) || 'Poll question?';
      const title = (model['title'] as string) || '';
      const opts = (model['options'] as Array<Record<string, unknown>>) || [];
      const btnBg = (model['buttonBackgroundColor'] as string) || '#1D2D4D';
      const btnTc = (model['buttonTextColor'] as string) || '#FFFFFF';
      const btnAlign = (model['buttonAlignment'] as string) || 'full width';
      const br = (model['buttonBorderRadius'] as Record<string, number>) || { topLeft: 3, topRight: 3, bottomLeft: 3, bottomRight: 3 };
      const ip = (model['buttonInnerPadding'] as Record<string, number>) || { top: 10, right: 12, bottom: 10, left: 12 };

      if (title) outer.appendChild(await makeText({ text: title, size: fs + 2, color: textColor, weight: 'Bold', width: cw }));
      outer.appendChild(await makeText({ text: question, size: fs, color: textColor, width: cw }));

      for (const opt of opts) {
        const optText = (opt['optionText'] as string) || 'Option';
        const isFullWidth = btnAlign === 'full width';

        const wrapper = makeFrame({ dir: 'HORIZONTAL', width: cw, noFill: true });
        wrapper.primaryAxisSizingMode = 'FIXED';
        wrapper.primaryAxisAlignItems = btnAlign === 'center' ? 'CENTER' : btnAlign === 'right' ? 'MAX' : 'MIN';

        const optBtn = makeFrame({ dir: 'HORIZONTAL', bg: btnBg, padTop: ip.top, padRight: ip.right, padBottom: ip.bottom, padLeft: ip.left, mainAlign: 'CENTER', crossAlign: 'CENTER' });
        if (isFullWidth) { optBtn.resize(cw, 10); optBtn.primaryAxisSizingMode = 'FIXED'; optBtn.counterAxisSizingMode = 'AUTO'; }
        optBtn.topLeftRadius = br.topLeft || 3; optBtn.topRightRadius = br.topRight || 3;
        optBtn.bottomLeftRadius = br.bottomLeft || 3; optBtn.bottomRightRadius = br.bottomRight || 3;
        optBtn.appendChild(await makeText({ text: optText, size: fs, color: btnTc }));
        wrapper.appendChild(optBtn);
        outer.appendChild(wrapper);
      }
      break;
    }

    case 'curation':
    case 'newrss':
    case 'wordpress':
    case 'dynamic': {
      const hasImage = model['hasImage'] !== false;
      const hasTitle = model['hasTitle'] !== false;
      const hasExcerpt = model['hasExcerpt'] !== false;
      const tSettings = (model['titleSettings'] as BlockData) || {};
      const eSettings = (model['excerptSettings'] as BlockData) || {};
      const link = (model['link'] as string) || '';

      if (hasImage) outer.appendChild(makeRect(cw, Math.round(cw * 0.5), '#E2E8F0', 4));
      if (hasTitle) outer.appendChild(await makeText({ text: (model['title'] as string) || 'Article Title', size: (tSettings['fontSize'] as number) || 18, color: (tSettings['color'] as string) || textColor, weight: 'Bold', width: cw }));
      if (hasExcerpt) outer.appendChild(await makeText({ text: (model['excerpt'] as string) || 'Article excerpt goes here. Click to read more about this interesting topic.', size: (eSettings['fontSize'] as number) || fs, color: (eSettings['color'] as string) || textColor, width: cw }));
      if (link) outer.appendChild(await makeText({ text: '→ ' + (link.length > 55 ? link.substring(0, 55) + '…' : link), size: 11, color: '#6366F1', width: cw }));
      break;
    }

    case 'promotion':
    case 'newpromotion': {
      const title = (model['title'] as string) || (type === 'newpromotion' ? 'Promotion Placeholder' : '');
      const disclaimer = model['displayDisclaimer'] !== false ? ((model['disclaimer'] as string) || 'Sponsored') : '';
      const hSettings = (model['headingSettings'] as BlockData) || {};

      if (disclaimer) {
        const discT = await makeText({ text: disclaimer.toUpperCase(), size: 9, color: '#94A3B8', weight: 'Bold' });
        discT.letterSpacing = { value: 1, unit: 'PIXELS' };
        outer.appendChild(discT);
      }
      if (title) outer.appendChild(await makeText({ text: title, size: (hSettings['fontSize'] as number) || 18, color: textColor, weight: 'Bold', width: cw }));
      outer.appendChild(makeRect(cw, 70, '#F1F5F9', 4));
      break;
    }

    case 'profile':
    case 'share': {
      const align = (model['align'] as string) || 'center';
      const gap = (model['gap'] as number) || 16;
      const row = makeFrame({ dir: 'HORIZONTAL', width: cw, gap, noFill: true, crossAlign: 'CENTER' });
      row.primaryAxisSizingMode = 'FIXED';
      row.primaryAxisAlignItems = align === 'center' ? 'CENTER' : align === 'right' ? 'MAX' : 'MIN';
      for (let i = 0; i < 4; i++) {
        const circle = figma.createEllipse();
        circle.resize(32, 32);
        circle.fills = [{ type: 'SOLID', color: hexToRgb('#CBD5E1') }];
        row.appendChild(circle);
      }
      outer.appendChild(row);
      break;
    }

    case 'audio': {
      const title = (model['title'] as string) || 'Episode Title';
      const subtitle = (model['subtitle'] as string) || 'Podcast Show';
      const br = (model['borderRadius'] as Record<string, number>) || { topLeft: 8, topRight: 8, bottomLeft: 8, bottomRight: 8 };

      const player = makeFrame({ dir: 'HORIZONTAL', bg: '#F1F5F9', width: cw, padTop: 16, padRight: 16, padBottom: 16, padLeft: 16, gap: 14, crossAlign: 'CENTER' });
      player.topLeftRadius = br.topLeft || 8; player.topRightRadius = br.topRight || 8;
      player.bottomLeftRadius = br.bottomLeft || 8; player.bottomRightRadius = br.bottomRight || 8;

      const playBtn = makeFrame({ bg: '#1D2D4D', mainAlign: 'CENTER', crossAlign: 'CENTER' });
      playBtn.resize(40, 40); playBtn.cornerRadius = 20;
      playBtn.primaryAxisSizingMode = 'FIXED'; playBtn.counterAxisSizingMode = 'FIXED';
      playBtn.appendChild(await makeText({ text: '▶', size: 14, color: '#FFFFFF', weight: 'Bold' }));
      player.appendChild(playBtn);

      const info = makeFrame({ dir: 'VERTICAL', gap: 4, noFill: true });
      info.appendChild(await makeText({ text: title, size: 14, color: textColor, weight: 'Bold' }));
      info.appendChild(await makeText({ text: subtitle, size: 12, color: '#64748B' }));
      player.appendChild(info);
      outer.appendChild(player);
      break;
    }

    case 'aiText': {
      const prompt = (model['prompt'] as string) || 'AI prompt text...';
      const box = makeFrame({ dir: 'VERTICAL', bg: '#EEF2FF', width: cw, padTop: 14, padRight: 14, padBottom: 14, padLeft: 14, gap: 8, radius: 6 });
      box.strokes = [{ type: 'SOLID', color: hexToRgb('#C7D2FE') }]; box.strokeWeight = 1;
      const labelT = await makeText({ text: '✦ AI Text', size: 10, color: '#4F46E5', weight: 'Bold' });
      labelT.letterSpacing = { value: 0.5, unit: 'PIXELS' };
      box.appendChild(labelT);
      box.appendChild(await makeText({ text: prompt, size: 12, color: '#475569', width: cw - 28 }));
      outer.appendChild(box);
      break;
    }

    case 'view_in_browser': {
      const linkText = (model['linkText'] as string) || 'View in browser';
      const align = ((model['align'] as string) || 'left').toUpperCase() as 'LEFT' | 'CENTER' | 'RIGHT';
      const t = await makeText({ text: linkText, size: fs, color: '#6366F1', align, width: cw });
      t.textDecoration = 'UNDERLINE';
      outer.appendChild(t);
      break;
    }

    case 'rss': {
      const count = Math.min((model['count'] as number) || 1, 3);
      for (let i = 0; i < count; i++) {
        const item = makeFrame({ dir: 'VERTICAL', bg: '#F8FAFC', width: cw, padTop: 10, padRight: 12, padBottom: 10, padLeft: 12, gap: 6, radius: 4 });
        item.strokes = [{ type: 'SOLID', color: hexToRgb('#E2E8F0') }]; item.strokeWeight = 1;
        item.appendChild(await makeText({ text: `RSS Item ${i + 1}: Article Title`, size: 14, color: textColor, weight: 'Bold', width: cw - 24 }));
        item.appendChild(await makeText({ text: 'Brief excerpt from this RSS feed item…', size: 12, color: '#64748B', width: cw - 24 }));
        outer.appendChild(item);
      }
      break;
    }

    case 'evvnt': {
      const cta = (model['callToAction'] as string) || 'Get Tickets';
      const btnBg = (model['backgroundColor'] as string) || '#1D2D4D';
      const btnColor = (model['color'] as string) || '#FFFFFF';
      const layout = (model['layout'] as number) || 0;
      const cols = layout === 1 ? 2 : 1;
      const eventW = cols === 2 ? Math.floor((cw - 16) / 2) : cw;

      const row = makeFrame({ dir: 'HORIZONTAL', width: cw, gap: 16, noFill: true, crossAlign: 'MIN' });
      row.primaryAxisSizingMode = 'FIXED';

      for (let c = 0; c < cols; c++) {
        const evt = makeFrame({ dir: 'VERTICAL', bg: '#F8FAFC', width: eventW, padTop: 12, padRight: 12, padBottom: 12, padLeft: 12, gap: 8, radius: 4 });
        evt.appendChild(makeRect(eventW - 24, Math.round((eventW - 24) * 0.5), '#E2E8F0', 4));
        evt.appendChild(await makeText({ text: 'Event Name', size: 16, color: textColor, weight: 'Bold', width: eventW - 24 }));
        evt.appendChild(await makeText({ text: 'Date · Venue · $Price', size: 12, color: '#64748B', width: eventW - 24 }));
        const ctaBtn = makeFrame({ dir: 'HORIZONTAL', bg: btnBg, padTop: 8, padRight: 12, padBottom: 8, padLeft: 12, radius: 4, mainAlign: 'CENTER', crossAlign: 'CENTER' });
        ctaBtn.appendChild(await makeText({ text: cta, size: 13, color: btnColor, weight: 'Bold' }));
        evt.appendChild(ctaBtn);
        row.appendChild(evt);
      }
      outer.appendChild(row);
      break;
    }

    case 'news': {
      outer.appendChild(makeRect(cw, Math.round(cw * 0.4), '#E2E8F0', 4));
      outer.appendChild(await makeText({ text: 'News Item', size: 16, color: textColor, weight: 'Bold', width: cw }));
      break;
    }

    case 'layout': {
      const lt = (block['layoutType'] as number) || 1;
      const gap = 16;
      const colW = Math.floor((cw - gap) / 2);
      const layoutRow = makeFrame({ dir: 'HORIZONTAL', width: cw, gap, noFill: true, crossAlign: 'MIN' });
      layoutRow.primaryAxisSizingMode = 'FIXED';

      const LABEL_MAP: Record<number, [string, string]> = {
        1: ['Image', 'Text'], 2: ['Text', 'Image'], 3: ['Image', 'Image'],
        4: ['Text', 'Text'], 5: ['Image', 'Paragraph'], 7: ['Image', 'Text'],
        9: ['Product', 'Showcase'],
      };
      const [l1, l2] = LABEL_MAP[lt] || ['Left', 'Right'];

      for (const lbl of [l1, l2]) {
        const col = makeFrame({ dir: 'VERTICAL', bg: '#F1F5F9', width: colW, padTop: 12, padRight: 12, padBottom: 12, padLeft: 12, gap: 8, radius: 4 });
        col.strokes = [{ type: 'SOLID', color: hexToRgb('#E2E8F0') }]; col.strokeWeight = 1;
        if (lbl === 'Image' || lbl === 'Product') col.appendChild(makeRect(colW - 24, Math.round((colW - 24) * 0.6), '#CBD5E1', 4));
        col.appendChild(await makeText({ text: lbl + ' Column', size: 12, color: '#64748B', weight: 'Medium', width: colW - 24 }));
        layoutRow.appendChild(col);
      }
      outer.appendChild(layoutRow);
      break;
    }

    case 'nested-layout-2-column': {
      const cols = block['blocks'] as BlockData[][] | undefined;
      const gap = 16;
      const colW = Math.floor((cw - gap) / 2);
      const row = makeFrame({ dir: 'HORIZONTAL', width: cw, gap, noFill: true, crossAlign: 'MIN' });
      row.primaryAxisSizingMode = 'FIXED';

      for (let ci = 0; ci < 2; ci++) {
        const colBlocks = (cols && cols[ci]) ? cols[ci] : [];
        const col = makeFrame({ dir: 'VERTICAL', bg: '#F8FAFC', width: colW, padTop: 8, padRight: 8, padBottom: 8, padLeft: 8, gap: 6, radius: 4 });
        col.strokes = [{ type: 'SOLID', color: hexToRgb('#E2E8F0') }]; col.strokeWeight = 1;

        for (const cb of colBlocks) {
          const cbText = extractText(cb['delta']) || ((cb['type'] as string) + ' block');
          col.appendChild(await makeText({ text: cbText, size: 12, color: '#374151', width: colW - 16 }));
        }
        if (colBlocks.length === 0) {
          col.appendChild(await makeText({ text: `Column ${ci + 1}`, size: 12, color: '#94A3B8', weight: 'Medium', width: colW - 16 }));
        }
        row.appendChild(col);
      }
      outer.appendChild(row);
      break;
    }

    case 'footer': {
      const text = extractText(block['delta']) || 'Unsubscribe | Manage preferences';
      const align = ((model['align'] as string) || 'left').toUpperCase() as 'LEFT' | 'CENTER' | 'RIGHT';
      outer.appendChild(await makeText({ text, size: fs || 12, color: '#64748B', align, width: cw }));
      break;
    }

    default: {
      // Generic placeholder for remaining types
      const accent = BLOCK_COLORS[type] || '#6B7280';
      const ph = makeFrame({ dir: 'HORIZONTAL', width: cw, bg: accent + '18', radius: 4, mainAlign: 'CENTER', crossAlign: 'CENTER' });
      ph.resize(cw, 60); ph.counterAxisSizingMode = 'FIXED';
      ph.strokes = [{ type: 'SOLID', color: hexToRgb(accent) }]; ph.strokeWeight = 1;
      ph.appendChild(await makeText({ text: type + ' block', size: 12, color: accent, weight: 'Medium' }));
      outer.appendChild(ph);
      break;
    }
  }

  return outer;
}

// ─── Message handler ──────────────────────────────────────────────────────────

figma.ui.onmessage = async (msg: { type: string; blockData?: unknown; outputMode?: string }) => {
  if (msg.type === 'create-block' && msg.blockData) {
    const block = msg.blockData as BlockData;
    const mode = msg.outputMode || 'json';

    try { await loadFonts(); } catch (_) { /* continue */ }

    const frame = mode === 'visual'
      ? await createVisualBlock(block)
      : await createJsonFrame(block);

    const center = figma.viewport.center;
    frame.x = Math.round(center.x - frame.width / 2);
    frame.y = Math.round(center.y - 100);

    figma.currentPage.appendChild(frame);
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
    figma.notify(`Created ${block['type'] as string} block (${mode})`, { timeout: 2000 });
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
