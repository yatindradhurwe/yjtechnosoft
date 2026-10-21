'use strict';

const crypto = require('crypto');
const sharp = require('sharp');
const { validateTemplate } = require('../template/validate');
const { resolveDeep } = require('../template/bindings');
const { applyOpacity, rotate, clipToCanvas, color, roundBox } = require('./util');
const { createAssetLoader } = require('./assets');

const RENDERERS = {
  image: require('./layers/image'),
  shape: require('./layers/shape'),
  text: require('./layers/text'),
  logo: require('./layers/logo'),
  badge: require('./layers/badge'),
  qr: require('./layers/qr'),
};
const OVERRIDABLE = ['text', 'src', 'data', 'box', 'style', 'hidden', 'opacity', 'fill'];

/**
 * Replace each `frame` placeholder with the chosen frame's layers as a group scaled into the slot.
 * A frame is a template of kind "frame": the same layer types, in its own design size.
 */
async function expandFrames(layers, { frameId, loadFrame }) {
  const out = [];
  for (const layer of layers) {
    if (layer.type === 'group') {
      out.push({ ...layer, layers: await expandFrames(layer.layers, { frameId, loadFrame }) });
      continue;
    }
    if (layer.type !== 'frame') {
      out.push(layer);
      continue;
    }
    let id = frameId || layer.defaultFrameId;
    if (id && layer.accepts?.length && !layer.accepts.includes(id)) id = layer.defaultFrameId;
    if (!id || !loadFrame || layer.hidden) continue;
    const frame = validateTemplate(await loadFrame(id));
    if (frame.kind !== 'frame') throw new Error(`"${id}" is not a frame`);
    if (frame.meta?.slot && frame.meta.slot !== layer.slot) throw new Error(`frame "${id}" fills slot "${frame.meta.slot}", not "${layer.slot}"`);
    out.push({
      id: layer.id,
      type: 'group',
      box: layer.box,
      opacity: layer.opacity,
      designSize: { width: frame.canvas.width, height: frame.canvas.height },
      layers: frame.layers,
    });
  }
  return out;
}

/**
 * Flatten groups into absolute canvas coordinates. Child ids become "group/child" so the editor
 * can override a single element inside a frame. `_s` is the uniform scale for sizes (fonts, radii).
 */
function flatten(layers, t, overrides, prefix = '', inheritedOpacity = 1) {
  const out = [];
  for (const original of layers) {
    const id = prefix + original.id;
    const layer = { ...original, ...pick(overrides[id]), id };
    if (overrides[id]?.style) layer.style = { ...original.style, ...overrides[id].style };
    if (layer.hidden) continue;
    const box = {
      x: t.x + layer.box.x * t.sx,
      y: t.y + layer.box.y * t.sy,
      w: layer.box.w * t.sx,
      h: layer.box.h * t.sy,
    };
    const opacity = inheritedOpacity * (layer.opacity ?? 1);
    if (layer.type === 'group') {
      const sx = box.w / layer.designSize.width;
      const sy = box.h / layer.designSize.height;
      out.push(...flatten(layer.layers, { x: box.x, y: box.y, sx, sy, s: Math.min(sx, sy) }, overrides, `${id}/`, opacity));
    } else {
      out.push({ ...layer, box: roundBox(box), opacity, _s: t.s });
    }
  }
  return out;
}

/** Free-plan watermark: large diagonal text across the middle, drawn above everything else. */
function watermarkLayer(wm, w, h, scale) {
  return {
    id: '_watermark',
    type: 'text',
    text: wm.text || 'Made with Poster Engine',
    box: roundBox({ x: w * 0.1, y: h * 0.4, w: w * 0.8, h: h * 0.2 }),
    maxLines: 1,
    rotation: wm.rotation ?? -30,
    opacity: wm.opacity ?? 0.25,
    style: { fontWeight: 800, fontSize: 96, color: wm.color || '#ffffff', align: 'center', shadow: { color: '#000000', blur: 4, dx: 0, dy: 0, opacity: 0.6 } },
    _s: scale,
  };
}

function pick(o) {
  if (!o) return {};
  const r = {};
  for (const k of OVERRIDABLE) if (k in o && k !== 'style') r[k] = o[k];
  return r;
}

/**
 * Render a template to an image.
 *
 * @param {object} template        Template JSON (see schemas/template.schema.json)
 * @param {object} data            Binding context: { business, brand, event, ... }
 * @param {object} [options]
 * @param {number} [options.width]          Output width in px (height keeps the aspect ratio). Default: canvas width.
 * @param {'png'|'webp'|'jpeg'} [options.format]
 * @param {number} [options.quality]        WebP/JPEG quality, default 90
 * @param {string} [options.frameId]        Frame to place in the template's frame slot
 * @param {(id: string) => Promise<object>} [options.loadFrame]
 * @param {object} [options.overrides]      Per-layer edits from the canvas editor, keyed by layer id
 * @param {Function} [options.loadAsset]    (src) => Promise<Buffer>; defaults to createAssetLoader(options.assets)
 * @param {object} [options.fonts]          { family: { 400: '/path.ttf', 700: '/path-bold.ttf' } }
 * @param {object} [options.watermark]      { text, color?, opacity?, rotation? } for free-plan exports
 * @param {boolean} [options.strict]        Throw on a layer error instead of skipping the layer
 * @returns {Promise<{ buffer: Buffer, info: object, stats: object }>}
 */
async function renderTemplate(template, data = {}, options = {}) {
  const started = process.hrtime.bigint();
  validateTemplate(template);
  if (template.kind !== 'template') throw new Error('renderTemplate expects kind "template"; frames are rendered through a template slot');

  const { width: cw, height: ch } = template.canvas;
  const outW = Math.round(options.width || cw);
  const scale = outW / cw;
  const outH = Math.round(ch * scale);
  const rc = {
    fonts: options.fonts || {},
    loadAsset: options.loadAsset || createAssetLoader(options.assets),
  };

  const layers = await expandFrames(template.layers, options);
  const flat = flatten(layers, { x: 0, y: 0, sx: scale, sy: scale, s: scale }, options.overrides || {});
  if (options.watermark) flat.push(watermarkLayer(options.watermark, outW, outH, scale));

  const skipped = [];
  const rendered = await Promise.all(
    flat.map(async (raw) => {
      const layer = resolveDeep(raw, data);
      try {
        const overlays = await RENDERERS[layer.type](layer, rc);
        const out = [];
        for (const o of overlays) {
          let input = await sharp(o.input).png().toBuffer();
          input = await applyOpacity(input, (o.opacity ?? 1) * (layer.opacity ?? 1));
          const placed = await rotate(input, layer.rotation, o.left, o.top);
          const clipped = await clipToCanvas(placed, outW, outH);
          if (clipped) out.push(clipped);
        }
        if (!out.length) skipped.push({ id: layer.id, reason: 'empty' });
        return out;
      } catch (err) {
        // One broken layer (e.g. a missing optional logo) should not fail the whole poster.
        if (options.strict) throw err;
        skipped.push({ id: layer.id, reason: err.message });
        return [];
      }
    }),
  );

  const background = color(template.canvas.background, '#ffffff');
  const base = sharp({
    create: { width: outW, height: outH, channels: 4, background: background === 'transparent' ? { r: 0, g: 0, b: 0, alpha: 0 } : background },
  }).composite(rendered.flat());

  const format = options.format || 'png';
  const quality = options.quality || 90;
  let img = sharp(await base.png().toBuffer());
  if (format === 'jpeg') img = img.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true });
  else if (format === 'webp') img = img.webp({ quality });
  else img = img.png({ compressionLevel: 8 });
  const { data: buffer, info } = await img.toBuffer({ resolveWithObject: true });

  return {
    buffer,
    info,
    stats: { layers: flat.length, skipped, ms: Number(process.hrtime.bigint() - started) / 1e6 },
  };
}

/**
 * Deterministic cache key for a render. The same template version, data, frame, overrides and
 * output settings always produce the same image, so the result can be stored at
 * creatives/<key>.<format> in object storage and served from the CDN.
 */
function renderCacheKey(template, data, options = {}) {
  const stable = (v) =>
    Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v;
  const payload = JSON.stringify(
    stable({
      t: `${template.id}@${template.version || 1}`,
      data,
      frame: options.frameId || null,
      overrides: options.overrides || null,
      watermark: options.watermark || null,
      width: options.width || null,
      format: options.format || 'png',
      quality: options.quality || null,
    }),
  );
  return crypto.createHash('sha256').update(payload).digest('hex');
}

module.exports = { renderTemplate, renderCacheKey, flatten, expandFrames };
