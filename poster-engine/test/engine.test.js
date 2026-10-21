'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { renderTemplate, renderCacheKey, validateTemplate, TemplateValidationError, resolveString, createAssetLoader } = require('../src');
const { flatten } = require('../src/render/composer');

const ROOT = path.join(__dirname, '..');
const json = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const loadAsset = createAssetLoader({ assetRoot: path.join(ROOT, 'templates/assets') });
const loadFrame = async (id) => json(`frames/${id}.json`);

const base = (layers, canvas = { width: 400, height: 200, background: 'transparent' }) => ({
  schemaVersion: 1,
  kind: 'template',
  id: 'test',
  canvas,
  layers,
});

/** Bounding box of pixels with alpha > 0. */
async function inkBox(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

test('bindings: paths, fallbacks and literals', () => {
  const ctx = { business: { name: 'Acme', phone: '', whatsapp: '999' } };
  assert.equal(resolveString('{{ business.name }}', ctx), 'Acme');
  assert.equal(resolveString('{{ business.phone || business.whatsapp }}', ctx), '999');
  assert.equal(resolveString("{{ business.city || 'India' }}", ctx), 'India');
  assert.equal(resolveString('Call {{ business.missing }}', ctx), 'Call');
  assert.equal(resolveString('{{ __proto__.constructor }}', ctx), '');
});

test('sample templates and frames are valid', () => {
  for (const dir of ['templates', 'frames']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.json'))) {
      assert.doesNotThrow(() => validateTemplate(json(`${dir}/${f}`)), `${dir}/${f}`);
    }
  }
});

test('validation rejects bad layers and duplicate ids', () => {
  assert.throws(() => validateTemplate(base([{ id: 'a', type: 'text', text: 'x' }])), TemplateValidationError); // no box
  assert.throws(() => validateTemplate(base([{ id: 'a', type: 'video', box: { x: 0, y: 0, w: 1, h: 1 } }])), TemplateValidationError);
  const box = { x: 0, y: 0, w: 10, h: 10 };
  assert.throws(
    () => validateTemplate(base([{ id: 'a', type: 'shape', shape: 'rect', box }, { id: 'a', type: 'shape', shape: 'rect', box }])),
    /duplicate layer id/,
  );
});

test('long text shrinks to stay inside its bounding box', async () => {
  const box = { x: 50, y: 40, w: 300, h: 60 };
  const t = base([
    { id: 't', type: 'text', text: '{{ business.name }}', box, maxLines: 1, style: { fontSize: 80, color: '#000000', align: 'center' } },
  ]);
  const { buffer } = await renderTemplate(t, { business: { name: 'An Extremely Long Business Name Private Limited' } });
  const ink = await inkBox(buffer);
  assert.ok(ink, 'text was drawn');
  assert.ok(ink.x0 >= box.x && ink.x1 < box.x + box.w, `x within box: ${JSON.stringify(ink)}`);
  assert.ok(ink.y0 >= box.y && ink.y1 < box.y + box.h, `y within box: ${JSON.stringify(ink)}`);
});

test('empty bindings hide the layer instead of drawing an empty pill', async () => {
  const t = base([{ id: 'p', type: 'badge', icon: 'phone', text: '{{ business.phone }}', box: { x: 0, y: 0, w: 300, h: 50 } }]);
  const { buffer, stats } = await renderTemplate(t, { business: {} });
  assert.equal(await inkBox(buffer), null);
  assert.deepEqual(stats.skipped, [{ id: 'p', reason: 'empty' }]);
});

test('frames are scaled into the slot and their children can be overridden', async () => {
  const frame = { id: 'f', type: 'frame', slot: 'footer', defaultFrameId: 'footer-classic', box: { x: 0, y: 150, w: 540, h: 110 } };
  const flat = flatten(
    [{ id: 'f', type: 'group', box: frame.box, designSize: { width: 1080, height: 220 }, layers: json('frames/footer-classic.json').layers }],
    { x: 0, y: 0, sx: 1, sy: 1, s: 1 },
    { 'f/website': { hidden: true }, 'f/name': { text: 'Edited' } },
  );
  const name = flat.find((l) => l.id === 'f/name');
  assert.deepEqual(name.box, { x: 125, y: 167, w: 400, h: 30 });
  assert.equal(name._s, 0.5);
  assert.equal(name.text, 'Edited');
  assert.equal(flat.some((l) => l.id === 'f/website'), false);
});

test('renders a full template at a scaled output size', async () => {
  const t = json('templates/realestate-2bhk-promo.json');
  const data = { business: { name: 'Acme Realty', phone: '+91 90000 00000' }, brand: { logo: { primary: 'sample-logo.svg' } } };
  const { buffer, info, stats } = await renderTemplate(t, data, { loadAsset, loadFrame, width: 540, format: 'webp', strict: true });
  assert.equal(info.format, 'webp');
  assert.equal(info.width, 540);
  assert.equal(info.height, 675);
  assert.ok(buffer.length > 1000);
  assert.ok(stats.skipped.every((s) => s.reason === 'empty'), JSON.stringify(stats.skipped));
});

test('every layer renders at a fractional scale', async () => {
  const data = {
    business: { name: 'Acme', tagline: 'Since 1999', phone: '+91 90000 00000', website: 'acme.in', city: 'Pune' },
    brand: { logo: { primary: 'sample-logo.svg' } },
    post: { price: 'Rs 50 Lakh' },
  };
  for (const [file, frameId] of [['festival-diwali-square', 'footer-classic'], ['festival-diwali-square', 'footer-wave'], ['realestate-2bhk-promo', undefined]]) {
    for (const width of [333, 720, 1366]) {
      const { stats } = await renderTemplate(json(`templates/${file}.json`), data, { loadAsset, loadFrame, frameId, width, strict: true });
      assert.deepEqual(stats.skipped, [], `${file} @${width}px`);
    }
  }
});

test('a missing asset skips the layer unless strict', async () => {
  const t = base([{ id: 'logo', type: 'logo', src: 'nope.png', box: { x: 0, y: 0, w: 100, h: 100 } }]);
  const { stats } = await renderTemplate(t, {}, { loadAsset });
  assert.equal(stats.skipped[0].id, 'logo');
  await assert.rejects(renderTemplate(t, {}, { loadAsset, strict: true }));
});

test('asset loader refuses path traversal and unlisted hosts', async () => {
  await assert.rejects(loadAsset('../../package.json'), /escapes assetRoot/);
  await assert.rejects(loadAsset('https://169.254.169.254/latest/meta-data'), /not allowed/);
});

test('cache key is stable regardless of key order', () => {
  const t = { id: 'x', version: 2 };
  assert.equal(renderCacheKey(t, { a: 1, b: { c: 2, d: 3 } }), renderCacheKey(t, { b: { d: 3, c: 2 }, a: 1 }));
  assert.notEqual(renderCacheKey(t, { a: 1 }), renderCacheKey({ id: 'x', version: 3 }, { a: 1 }));
  assert.notEqual(renderCacheKey(t, { a: 1 }), renderCacheKey(t, { a: 1 }, { watermark: { text: 'Free' } }));
});

test('watermark is drawn over the poster', async () => {
  const t = base([], { width: 400, height: 400, background: 'transparent' });
  const { buffer } = await renderTemplate(t, {}, { watermark: { text: 'FREE PLAN' } });
  const ink = await inkBox(buffer);
  assert.ok(ink && ink.x0 > 0 && ink.x1 < 400, JSON.stringify(ink));
});
