const express = require('express');
const resources = require('./resources');
const { query, one } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { slugify, pick } = require('../utils/helpers');

const router = express.Router();
router.use(authenticate);

function getResource(req) {
  const r = resources[req.params.resource];
  if (!r) throw new HttpError(404, 'Unknown resource');
  return r;
}

function can(user, r, mode) {
  if (user.role === 'admin') return true;
  const roles = mode === 'read' ? r.readRoles || r.roles : r.roles;
  if (roles === 'all') return true;
  return roles.includes(user.role);
}

async function uniqueSlug(table, base, id) {
  let slug = slugify(base) || `item-${Date.now()}`;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await one(`SELECT id FROM \`${table}\` WHERE slug = ? AND id <> ?`, [slug, id || 0])) {
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
  return slug;
}

router.get(
  '/:resource',
  asyncHandler(async (req, res) => {
    const r = getResource(req);
    if (!can(req.user, r, 'read')) throw new HttpError(403, 'Not allowed');
    const where = [];
    const params = [];
    const { q, page = 1, limit = 20, all } = req.query;
    if (q && r.search) {
      where.push(`(${r.search.map((f) => `${f.includes('.') ? f : `\`${r.table}\`.\`${f}\``} LIKE ?`).join(' OR ')})`);
      r.search.forEach(() => params.push(`%${q}%`));
    }
    const filterable = ['status', ...(r.filters || [])];
    filterable.forEach((f) => {
      if (req.query[f] !== undefined && req.query[f] !== '' && r.fields.concat(['status']).includes(f)) {
        where.push(`\`${r.table}\`.\`${f}\` = ?`);
        params.push(req.query[f]);
      }
    });
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = `\`${r.table}\` ${r.joins || ''}`;
    const select = r.select || `\`${r.table}\`.*`;
    if (all) {
      const data = await query(`SELECT ${select} FROM ${from} ${whereSql} ORDER BY ${r.order || 'id DESC'}`, params);
      return res.json({ data, total: data.length });
    }
    const lim = Math.min(Number(limit) || 20, 200);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * lim;
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM ${from} ${whereSql}`, params);
    const data = await query(`SELECT ${select} FROM ${from} ${whereSql} ORDER BY ${r.order || 'id DESC'} LIMIT ? OFFSET ?`, [...params, lim, offset]);
    res.json({ data, total, page: Number(page), limit: lim });
  })
);

router.get(
  '/:resource/:id',
  asyncHandler(async (req, res) => {
    const r = getResource(req);
    if (!can(req.user, r, 'read')) throw new HttpError(403, 'Not allowed');
    const row = await one(`SELECT ${r.select || `\`${r.table}\`.*`} FROM \`${r.table}\` ${r.joins || ''} WHERE \`${r.table}\`.id = ?`, [req.params.id]);
    if (!row) throw new HttpError(404, 'Record not found');
    res.json(row);
  })
);

router.post(
  '/:resource',
  asyncHandler(async (req, res) => {
    const r = getResource(req);
    if (!can(req.user, r, 'write')) throw new HttpError(403, 'Not allowed');
    const data = pick(req.body, r.fields);
    if (r.slugFrom) data.slug = await uniqueSlug(r.table, data.slug || data[r.slugFrom]);
    if (!Object.keys(data).length) throw new HttpError(400, 'No data provided');
    const result = await query(`INSERT INTO \`${r.table}\` SET ?`, [data]);
    const row = await one(`SELECT * FROM \`${r.table}\` WHERE id = ?`, [result.insertId]);
    res.status(201).json(row);
  })
);

router.put(
  '/:resource/:id',
  asyncHandler(async (req, res) => {
    const r = getResource(req);
    if (!can(req.user, r, 'write')) throw new HttpError(403, 'Not allowed');
    const data = pick(req.body, r.fields);
    if (r.slugFrom && (data.slug !== undefined || data[r.slugFrom])) {
      data.slug = await uniqueSlug(r.table, data.slug || data[r.slugFrom], req.params.id);
    }
    if (!Object.keys(data).length) throw new HttpError(400, 'No data provided');
    await query(`UPDATE \`${r.table}\` SET ? WHERE id = ?`, [data, req.params.id]);
    const row = await one(`SELECT * FROM \`${r.table}\` WHERE id = ?`, [req.params.id]);
    if (!row) throw new HttpError(404, 'Record not found');
    res.json(row);
  })
);

router.delete(
  '/:resource/:id',
  asyncHandler(async (req, res) => {
    const r = getResource(req);
    if (!can(req.user, r, 'write')) throw new HttpError(403, 'Not allowed');
    await query(`DELETE FROM \`${r.table}\` WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Deleted' });
  })
);

module.exports = router;
