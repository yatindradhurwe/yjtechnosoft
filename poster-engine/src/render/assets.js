'use strict';

const fs = require('fs/promises');
const path = require('path');

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Default asset loader. Supports:
 *   data:image/...;base64,...          inline (editor previews, tests)
 *   https://cdn.example.com/x.png      only hosts in `allowedHosts` (prevents SSRF from user-supplied URLs)
 *   assets/logo.png                    a path inside `assetRoot` (local dev, bundled template artwork)
 * Production deployments usually swap this for an S3/R2 loader keyed by asset id.
 */
function createAssetLoader({ assetRoot, allowedHosts = [], timeoutMs = 8000, cacheSize = 200 } = {}) {
  const cache = new Map();

  async function fetchRemote(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`asset ${url}: HTTP ${res.status}`);
    if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error(`asset ${url}: too large`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error(`asset ${url}: too large`);
    return buf;
  }

  async function load(src) {
    if (src.startsWith('data:')) {
      const comma = src.indexOf(',');
      return Buffer.from(src.slice(comma + 1), src.slice(0, comma).endsWith(';base64') ? 'base64' : 'utf8');
    }
    if (/^https?:\/\//i.test(src)) {
      const { hostname, protocol } = new URL(src);
      if (protocol !== 'https:' || !allowedHosts.includes(hostname)) throw new Error(`asset host not allowed: ${hostname}`);
      return fetchRemote(src);
    }
    if (!assetRoot) throw new Error(`no assetRoot configured for "${src}"`);
    const root = path.resolve(assetRoot);
    const file = path.resolve(root, src);
    if (file !== root && !file.startsWith(root + path.sep)) throw new Error(`asset path escapes assetRoot: ${src}`);
    return fs.readFile(file);
  }

  return async function loadAsset(src) {
    if (cache.has(src)) {
      const hit = cache.get(src);
      cache.delete(src);
      cache.set(src, hit); // refresh LRU position
      return hit;
    }
    const promise = load(src);
    cache.set(src, promise);
    if (cache.size > cacheSize) cache.delete(cache.keys().next().value);
    promise.catch(() => cache.delete(src));
    return promise;
  };
}

module.exports = { createAssetLoader };
