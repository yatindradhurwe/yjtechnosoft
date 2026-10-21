'use strict';

const sharp = require('sharp');
const { renderTextBlock } = require('../text');
const { iconSvg } = require('../icons');
const { alignIn, color, svgFill } = require('../util');

/** A contact pill: [icon] text, e.g. a phone number or website, on a rounded background. */
module.exports = async function renderBadge(layer, rc) {
  const text = (layer.text || '').trim();
  if (!text) return [];
  const s = layer._s;
  const st = layer.style || {};
  const h = layer.box.h;
  const fontSize = (st.fontSize || h * 0.45 / s) * s;
  const paddingX = (st.paddingX ?? 18) * s;
  const gap = (st.gap ?? 10) * s;
  const iconSize = Math.round(fontSize * 1.1);
  const hasIcon = layer.icon && layer.icon !== 'none';
  const textColor = color(st.color, '#ffffff');
  const maxTextW = Math.max(1, layer.box.w - paddingX * 2 - (hasIcon ? iconSize + gap : 0));

  const block = await renderTextBlock(text, {
    maxW: maxTextW,
    maxH: h * 0.8,
    maxLines: 1,
    fonts: rc.fonts,
    style: { fontFamily: st.fontFamily, fontWeight: st.fontWeight || 600, fontSize, color: textColor },
  });

  const contentW = (hasIcon ? iconSize + gap : 0) + block.width;
  const width = Math.round(layer.width === 'fill' ? layer.box.w : Math.min(layer.box.w, contentW + paddingX * 2));
  const radius = Math.min(st.radius != null ? st.radius * s : h / 2, h / 2, width / 2);
  const { paint, defs } = svgFill(st.background ?? '#000000', `b_${layer.id.replace(/[^a-z0-9]/gi, '_')}`);
  const bw = (st.border?.width || 0) * s;
  const border = bw ? ` stroke="${color(st.border.color, '#ffffff')}" stroke-width="${bw}"` : '';
  const pill = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}"><defs>${defs}</defs>` +
      `<rect x="${bw / 2}" y="${bw / 2}" width="${width - bw}" height="${h - bw}" rx="${radius}" fill="${paint}"${border}/></svg>`,
  );

  const startX = Math.round((width - contentW) / 2);
  const parts = [];
  if (hasIcon) {
    parts.push({ input: iconSvg(layer.icon, iconSize, color(st.iconColor, textColor)), left: startX, top: Math.round((h - iconSize) / 2) });
  }
  parts.push({ input: block.buffer, left: Math.round(startX + (hasIcon ? iconSize + gap : 0)), top: Math.round((h - block.height) / 2) });

  const input = await sharp(pill).composite(parts).png().toBuffer();
  return [{ input, ...alignIn(layer.box, width, h, layer.align || 'left', 'middle') }];
};
