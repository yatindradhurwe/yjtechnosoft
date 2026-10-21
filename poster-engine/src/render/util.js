'use strict';

const sharp = require('sharp');

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

/** Normalise a template colour for SVG/Pango. Unresolved or invalid colours fall back. */
function color(value, fallback = '#000000') {
  if (value === 'transparent') return 'transparent';
  if (typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return value;
  return fallback;
}

/** SVG paint for a colour or linear gradient. Returns { paint, defs }. */
function svgFill(fill, id, fallback = '#000000') {
  if (fill && typeof fill === 'object' && fill.type === 'linear') {
    const rad = ((fill.angle ?? 90) * Math.PI) / 180;
    const x = Math.cos(rad) / 2;
    const y = Math.sin(rad) / 2;
    const stops = fill.stops
      .map((s) => `<stop offset="${s.offset}" stop-color="${color(s.color, fallback)}" stop-opacity="${s.opacity ?? 1}"/>`)
      .join('');
    return {
      paint: `url(#${id})`,
      defs: `<linearGradient id="${id}" x1="${0.5 - x}" y1="${0.5 - y}" x2="${0.5 + x}" y2="${0.5 + y}">${stops}</linearGradient>`,
    };
  }
  return { paint: color(fill, fallback), defs: '' };
}

/** Multiply the alpha channel of a PNG buffer by `opacity`. */
async function applyOpacity(buffer, opacity) {
  if (opacity == null || opacity >= 1) return buffer;
  const alpha = Math.round(Math.max(0, opacity) * 255);
  return sharp(buffer)
    .ensureAlpha()
    .composite([{ input: Buffer.from([255, 255, 255, alpha]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** Rotate a layer around its centre. The returned offset keeps that centre in place. */
async function rotate(buffer, degrees, left, top) {
  if (!degrees) return { input: buffer, left, top };
  const before = await sharp(buffer).metadata();
  const { data, info } = await sharp(buffer)
    .rotate(degrees, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true });
  return {
    input: data,
    left: Math.round(left - (info.width - before.width) / 2),
    top: Math.round(top - (info.height - before.height) / 2),
  };
}

/** Crop an overlay to the canvas. sharp rejects overlays that extend past the base image. */
async function clipToCanvas(overlay, canvasW, canvasH) {
  const meta = await sharp(overlay.input).metadata();
  const x0 = Math.max(0, overlay.left);
  const y0 = Math.max(0, overlay.top);
  const x1 = Math.min(canvasW, overlay.left + meta.width);
  const y1 = Math.min(canvasH, overlay.top + meta.height);
  if (x1 <= x0 || y1 <= y0) return null;
  if (x0 === overlay.left && y0 === overlay.top && x1 - x0 === meta.width && y1 - y0 === meta.height) return overlay;
  const input = await sharp(overlay.input)
    .extract({ left: x0 - overlay.left, top: y0 - overlay.top, width: x1 - x0, height: y1 - y0 })
    .png()
    .toBuffer();
  return { input, left: x0, top: y0 };
}

/** Offset of an item of size (w, h) aligned inside a box. */
function alignIn(box, w, h, align = 'center', verticalAlign = 'middle') {
  const dx = align === 'left' ? 0 : align === 'right' ? box.w - w : (box.w - w) / 2;
  const dy = verticalAlign === 'top' ? 0 : verticalAlign === 'bottom' ? box.h - h : (box.h - h) / 2;
  return { left: Math.round(box.x + dx), top: Math.round(box.y + dy) };
}

function roundBox(box) {
  return { x: Math.round(box.x), y: Math.round(box.y), w: Math.max(1, Math.round(box.w)), h: Math.max(1, Math.round(box.h)) };
}

module.exports = { escapeXml, color, svgFill, applyOpacity, rotate, clipToCanvas, alignIn, roundBox };
