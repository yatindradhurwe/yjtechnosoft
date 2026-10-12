/**
 * Tolerate common typos in configured URLs:
 *   "https:/site.com/" → "https://site.com", "yjtechnosoft.com" → "https://yjtechnosoft.com"
 */
function fixUrl(value) {
  if (!value) return value;
  let v = String(value).trim().replace(/\/+$/, '');
  v = v.replace(/^(https?):\/*/i, (m, p) => `${p.toLowerCase()}://`);
  if (!/^https?:\/\//i.test(v) && /^[\w.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(v)) v = `https://${v}`;
  return v;
}

/** Normalise URL environment variables once at startup */
function normaliseEnvUrls() {
  ['APP_URL', 'API_URL'].forEach((k) => {
    if (process.env[k]) process.env[k] = fixUrl(process.env[k]);
  });
  if (process.env.CORS_ORIGIN) {
    process.env.CORS_ORIGIN = process.env.CORS_ORIGIN.split(',').map((o) => (o.trim() === '*' ? '*' : fixUrl(o))).join(',');
  }
}

module.exports = { fixUrl, normaliseEnvUrls };
