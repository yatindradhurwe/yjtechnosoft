'use strict';

// {{ business.phone }}  ·  {{ business.whatsapp || business.phone }}  ·  {{ event.name || 'Happy Festival' }}
const BINDING = /\{\{\s*([^}]+?)\s*\}\}/g;

function getPath(ctx, path) {
  let cur = ctx;
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, key)) return undefined;
    cur = cur[key];
  }
  return cur;
}

function evalExpression(expr, ctx) {
  for (const raw of expr.split('||')) {
    const part = raw.trim();
    const literal = part.match(/^(['"])(.*)\1$/);
    const value = literal ? literal[2] : getPath(ctx, part);
    if (value != null && value !== '' && typeof value !== 'object') return String(value);
  }
  return '';
}

/** Replace every {{ ... }} in a string. Missing values become ''. */
function resolveString(str, ctx) {
  if (typeof str !== 'string' || !str.includes('{{')) return str;
  return str.replace(BINDING, (_, expr) => evalExpression(expr, ctx)).trim();
}

/** Resolve bindings in every string of a layer, except nested child layers (resolved when they are rendered). */
function resolveDeep(value, ctx) {
  if (typeof value === 'string') return resolveString(value, ctx);
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, ctx));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = k === 'layers' ? v : resolveDeep(v, ctx);
    return out;
  }
  return value;
}

module.exports = { resolveString, resolveDeep, getPath };
