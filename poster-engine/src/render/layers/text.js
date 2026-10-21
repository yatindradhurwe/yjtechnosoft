'use strict';

const sharp = require('sharp');
const { renderTextBlock } = require('../text');
const { alignIn, color } = require('../util');

module.exports = async function renderText(layer, rc) {
  const text = (layer.text || '').trim();
  if (!text) return [];
  const s = layer._s;
  const st = layer.style || {};
  const style = { ...st, fontSize: (st.fontSize || 32) * s, letterSpacing: (st.letterSpacing || 0) * s };
  const opts = { maxW: layer.box.w, maxH: layer.box.h, style, fit: layer.fit, maxLines: layer.maxLines, fonts: rc.fonts };

  let block = await renderTextBlock(text, opts);
  if (block.width > layer.box.w || block.height > layer.box.h) {
    // fit='fixed' may overflow: clip to the box rather than spill over other layers.
    const width = Math.min(block.width, layer.box.w);
    const height = Math.min(block.height, layer.box.h);
    block = { ...block, width, height, buffer: await sharp(block.buffer).extract({ left: 0, top: 0, width, height }).png().toBuffer() };
  }
  const pos = alignIn(layer.box, block.width, block.height, st.align || 'left', st.verticalAlign || 'middle');
  const out = [];

  if (st.shadow) {
    const sh = st.shadow;
    const shadowBlock = await renderTextBlock(text, { ...opts, style: { ...style, fontSize: block.fontSize }, fit: 'fixed', fillOverride: color(sh.color, '#000000') });
    let img = sharp(shadowBlock.buffer);
    const blur = (sh.blur ?? 6) * s;
    const pad = Math.ceil(blur * 2);
    img = img.extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } });
    if (blur >= 0.3) img = sharp(await img.png().toBuffer()).blur(blur);
    out.push({
      input: await img.png().toBuffer(),
      left: Math.round(pos.left + (sh.dx ?? 2) * s - pad),
      top: Math.round(pos.top + (sh.dy ?? 2) * s - pad),
      opacity: sh.opacity ?? 0.6,
    });
  }
  out.push({ input: block.buffer, ...pos });
  return out;
};
