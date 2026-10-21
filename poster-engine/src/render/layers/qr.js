'use strict';

const QRCode = require('qrcode');
const sharp = require('sharp');
const { alignIn, color } = require('../util');

const hex = (v, fallback) => (color(v, fallback) === 'transparent' ? '#00000000' : color(v, fallback));

module.exports = async function renderQr(layer) {
  if (!layer.data) return [];
  const size = Math.round(Math.min(layer.box.w, layer.box.h));
  const svg = await QRCode.toString(layer.data, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: layer.margin ?? 1,
    color: { dark: hex(layer.color, '#000000'), light: hex(layer.background, '#ffffff') },
  });
  const input = await sharp(Buffer.from(svg)).resize(size, size, { kernel: 'nearest' }).png().toBuffer();
  return [{ input, ...alignIn(layer.box, size, size) }];
};
