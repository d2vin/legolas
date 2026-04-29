/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__, { width: 420, height: 680 });

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  if (clean === 'transparent') return { r: 0.9, g: 0.9, b: 0.9 };
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(clean);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 0.5, g: 0.5, b: 0.5 };
}

const BLOCK_COLORS: Record<string, string> = {
  paragraph: '#3B82F6',
  heading: '#1D4ED8',
  blockquote: '#7C3AED',
  button: '#059669',
  image: '#D97706',
  logo: '#EA580C',
  divider: '#94A3B8',
  html: '#DC2626',
  youtube: '#B91C1C',
  poll: '#CA8A04',
  curation: '#0D9488',
  newrss: '#0F766E',
  wordpress: '#2563EB',
  dynamic: '#0891B2',
  promotion: '#BE185D',
  newpromotion: '#9D174D',
  profile: '#4F46E5',
  share: '#0284C7',
  rss: '#B45309',
  evvnt: '#6D28D9',
  news: '#1E40AF',
  revContent: '#78350F',
  iterable: '#065F46',
  googleDocs: '#166534',
  view_in_browser: '#475569',
  aiText: '#7C3AED',
  audio: '#0369A1',
  layout: '#64748B',
  'nested-layout-2-column': '#334155',
  footer: '#1E293B',
};

figma.ui.onmessage = async (msg: { type: string; blockData?: unknown }) => {
  if (msg.type === 'create-block' && msg.blockData) {
    const block = msg.blockData as Record<string, unknown>;
    const blockType = block.type as string;
    const colorHex = BLOCK_COLORS[blockType] ?? '#6B7280';
    const headerColor = hexToRgb(colorHex);

    try {
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
    } catch {
      figma.notify('Could not load Inter font. Block still created.', { timeout: 2000 });
    }

    const FRAME_WIDTH = 640;

    const outerFrame = figma.createFrame();
    outerFrame.name = `[${blockType}] Newsletter Block`;
    outerFrame.resize(FRAME_WIDTH, 100);
    outerFrame.layoutMode = 'VERTICAL';
    outerFrame.primaryAxisSizingMode = 'AUTO';
    outerFrame.counterAxisSizingMode = 'FIXED';
    outerFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    outerFrame.strokes = [{ type: 'SOLID', color: hexToRgb('#E2E8F0') }];
    outerFrame.strokeWeight = 1;
    outerFrame.cornerRadius = 8;
    outerFrame.clipsContent = true;
    outerFrame.itemSpacing = 0;

    // Header bar
    const headerFrame = figma.createFrame();
    headerFrame.name = 'Header';
    headerFrame.resize(FRAME_WIDTH, 44);
    headerFrame.layoutMode = 'HORIZONTAL';
    headerFrame.primaryAxisSizingMode = 'FIXED';
    headerFrame.counterAxisSizingMode = 'AUTO';
    headerFrame.fills = [{ type: 'SOLID', color: headerColor }];
    headerFrame.paddingTop = 12;
    headerFrame.paddingRight = 16;
    headerFrame.paddingBottom = 12;
    headerFrame.paddingLeft = 16;
    headerFrame.itemSpacing = 0;
    headerFrame.counterAxisAlignItems = 'CENTER';

    const typeLabel = figma.createText();
    typeLabel.characters = blockType.toUpperCase();
    typeLabel.fontName = { family: 'Inter', style: 'Bold' };
    typeLabel.fontSize = 12;
    typeLabel.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    typeLabel.letterSpacing = { value: 0.8, unit: 'PIXELS' };
    headerFrame.appendChild(typeLabel);
    outerFrame.appendChild(headerFrame);

    // JSON body
    const bodyFrame = figma.createFrame();
    bodyFrame.name = 'JSON';
    bodyFrame.resize(FRAME_WIDTH, 100);
    bodyFrame.layoutMode = 'VERTICAL';
    bodyFrame.primaryAxisSizingMode = 'AUTO';
    bodyFrame.counterAxisSizingMode = 'FIXED';
    bodyFrame.fills = [{ type: 'SOLID', color: { r: 0.973, g: 0.980, b: 0.988 } }];
    bodyFrame.paddingTop = 16;
    bodyFrame.paddingRight = 20;
    bodyFrame.paddingBottom = 16;
    bodyFrame.paddingLeft = 20;

    const jsonNode = figma.createText();
    jsonNode.characters = JSON.stringify(block, null, 2);
    jsonNode.fontName = { family: 'Inter', style: 'Regular' };
    jsonNode.fontSize = 10;
    jsonNode.fills = [{ type: 'SOLID', color: hexToRgb('#1E293B') }];
    jsonNode.resize(FRAME_WIDTH - 40, 100);
    jsonNode.textAutoResize = 'HEIGHT';
    jsonNode.lineHeight = { value: 15, unit: 'PIXELS' };

    bodyFrame.appendChild(jsonNode);
    outerFrame.appendChild(bodyFrame);

    const center = figma.viewport.center;
    outerFrame.x = Math.round(center.x - FRAME_WIDTH / 2);
    outerFrame.y = Math.round(center.y - 100);

    figma.currentPage.appendChild(outerFrame);
    figma.currentPage.selection = [outerFrame];
    figma.viewport.scrollAndZoomIntoView([outerFrame]);

    figma.notify(`Created ${blockType} block`, { timeout: 2000 });
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
