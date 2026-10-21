'use strict';

/**
 * Minimal render worker HTTP API. In production it sits behind the main API (which handles auth,
 * tenancy and quotas) and is never exposed publicly.
 *
 *   POST /v1/render   { templateId | template, data, frameId?, overrides?, width?, format?, quality? }
 *                      → image bytes, with X-Render-Key (cache key) and X-Render-Ms headers
 *   GET  /healthz
 */
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { renderTemplate, renderCacheKey, createAssetLoader, TemplateValidationError } = require('./index');

const PORT = Number(process.env.PORT || 7070);
const ROOT = path.join(__dirname, '..');
const TEMPLATE_DIR = process.env.TEMPLATE_DIR || path.join(ROOT, 'templates');
const FRAME_DIR = process.env.FRAME_DIR || path.join(ROOT, 'frames');
const MAX_BODY = 1024 * 1024;
const MAX_CONCURRENT = Number(process.env.RENDER_CONCURRENCY || 4);
const RENDER_TOKEN = process.env.RENDER_TOKEN || '';

const loadAsset = createAssetLoader({
  assetRoot: process.env.ASSET_ROOT || path.join(TEMPLATE_DIR, 'assets'),
  allowedHosts: (process.env.ASSET_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean),
});
const readJson = async (dir, id) => {
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(id)) throw Object.assign(new Error('bad id'), { status: 400 });
  try {
    return JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') throw Object.assign(new Error(`not found: ${id}`), { status: 404 });
    throw err;
  }
};
const loadFrame = (id) => readJson(FRAME_DIR, id);

// Image composition is CPU bound. Queue requests beyond MAX_CONCURRENT instead of thrashing.
let active = 0;
const waiting = [];
async function withSlot(fn) {
  if (active >= MAX_CONCURRENT) await new Promise((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

async function handleRender(req, res) {
  const body = await readBody(req);
  const template = body.template || (await readJson(TEMPLATE_DIR, String(body.templateId || '')));
  const format = ['png', 'webp', 'jpeg'].includes(body.format) ? body.format : 'png';
  const width = body.width ? Math.min(4096, Math.max(64, Number(body.width) || 0)) : undefined;
  const options = { loadAsset, loadFrame, frameId: body.frameId, overrides: body.overrides, width, format, quality: body.quality };
  const result = await withSlot(() => renderTemplate(template, body.data || {}, options));
  res.writeHead(200, {
    'Content-Type': `image/${format}`,
    'Content-Length': result.buffer.length,
    'Cache-Control': 'private, max-age=0',
    'X-Render-Key': renderCacheKey(template, body.data || {}, options),
    'X-Render-Ms': result.stats.ms.toFixed(1),
    'X-Render-Skipped': result.stats.skipped.map((s) => s.id).join(','),
  });
  res.end(result.buffer);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/healthz') return sendJson(res, 200, { ok: true, active, queued: waiting.length });
    if (RENDER_TOKEN && req.headers.authorization !== `Bearer ${RENDER_TOKEN}`) return sendJson(res, 401, { error: 'unauthorized' });
    if (req.method === 'POST' && req.url === '/v1/render') return await handleRender(req, res);
    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    const status = err instanceof TemplateValidationError ? 422 : err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) sendJson(res, status, { error: err.message, details: err.errors?.slice(0, 10) });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`poster-engine render worker on :${PORT}`));
}

module.exports = { server };
