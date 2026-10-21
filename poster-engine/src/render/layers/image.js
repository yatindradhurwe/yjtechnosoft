'use strict';

const sharp = require('sharp');
const { alignIn } = require('../util');

const POSITIONS = { center: 'centre', top: 'north', bottom: 'south', left: 'west', right: 'east', attention: sharp.strategy.attention, entropy: sharp.strategy.entropy };

/** Round the corners of a PNG buffer with an SVG mask. */
async function roundCorners(buffer, w, h, r) {
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`);
  return sharp(buffer).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

module.exports = async function renderImage(layer, rc) {
  if (!layer.src) return [];
  const source = await rc.loadAsset(layer.src);
  const { w, h } = layer.box;
  const fit = layer.fit || 'cover';
  const { data, info } = await sharp(source)
    .rotate() // honour EXIF orientation of phone photos
    .resize(w, h, { fit: fit === 'contain' ? 'inside' : fit, position: POSITIONS[layer.position || 'center'] })
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });
  const input = layer.radius ? await roundCorners(data, info.width, info.height, layer.radius * layer._s) : data;
  return [{ input, ...alignIn(layer.box, info.width, info.height) }];
};

module.exports.roundCorners = roundCorners;
