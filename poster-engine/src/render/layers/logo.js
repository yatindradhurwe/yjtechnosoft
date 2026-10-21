'use strict';

const sharp = require('sharp');
const { alignIn, svgFill } = require('../util');

module.exports = async function renderLogo(layer, rc) {
  if (!layer.src) return [];
  const s = layer._s;
  let source = await rc.loadAsset(layer.src);
  if (layer.trim !== false) {
    // Uploaded logos often carry wide empty margins; trim them so the logo fills its box.
    try {
      source = await sharp(source).ensureAlpha().trim({ threshold: 10 }).png().toBuffer();
    } catch {
      /* image is a single flat colour; keep it as is */
    }
  }
  const pad = (layer.plate?.padding || 0) * s;
  const inner = { w: Math.max(1, Math.round(layer.box.w - pad * 2)), h: Math.max(1, Math.round(layer.box.h - pad * 2)) };
  const { data, info } = await sharp(source)
    .resize(inner.w, inner.h, { fit: 'inside' })
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });

  let input = data;
  let width = info.width;
  let height = info.height;
  if (layer.plate) {
    width = Math.round(info.width + pad * 2);
    height = Math.round(info.height + pad * 2);
    const { paint, defs } = svgFill(layer.plate.fill ?? '#ffffff', `p_${layer.id.replace(/[^a-z0-9]/gi, '_')}`);
    const r = Math.min((layer.plate.radius || 0) * s, width / 2, height / 2);
    const plate = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>${defs}</defs><rect width="${width}" height="${height}" rx="${r}" fill="${paint}"/></svg>`,
    );
    input = await sharp(plate).composite([{ input: data, left: Math.round(pad), top: Math.round(pad) }]).png().toBuffer();
  }
  return [{ input, ...alignIn(layer.box, width, height, layer.align || 'center', layer.verticalAlign || 'middle') }];
};
