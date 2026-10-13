/**
 * Profile builder (SaaS): customers and staff create company / personal
 * profiles, edit them section by section and download them as PDF.
 * Customers see only their own profiles; admins see and manage all.
 */
const express = require('express');
const crypto = require('crypto');
const { query, one } = require('../config/db');
const bcrypt = require('bcryptjs');
const { authenticateAny, authorize } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { makeUploader, fileUrl, IMAGE_EXT } = require('../middleware/upload');
const { getSettings } = require('../utils/settings');
const { slugify, pick } = require('../utils/helpers');
const { renderProfileHtml, THEMES, SECTION_KINDS, themeVars } = require('../services/profileRender');
const { htmlToPdf, isPdfAvailable } = require('../services/profilePdf');
const { seedTemplates } = require('../services/profileTemplateLibrary');

const router = express.Router();
const MAX_DATA = 1024 * 1024; // 1 MB of profile JSON is far more than any real profile needs
const isStaff = (u) => u.role !== 'customer';
const isAdmin = (u) => u.role === 'admin';
const SELF = () => `http://127.0.0.1:${Number(process.env.PORT || 5000)}`;

const parse = (row) => {
  if (!row) return row;
  let data = {};
  try {
    data = JSON.parse(row.data || '{}');
  } catch (e) {
    /* keep empty */
  }
  return { ...row, data, is_public: !!row.is_public };
};

const newSlug = (title) => `${slugify(title || 'profile').slice(0, 40) || 'profile'}-${crypto.randomBytes(4).toString('hex')}`;

/** Basic shape check so a broken client cannot store something the renderer chokes on */
function cleanData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Profile data is invalid');
  const out = {
    theme: THEMES[data.theme] ? data.theme : 'navy-gold',
    colors: data.colors && typeof data.colors === 'object' ? data.colors : {},
    basics: data.basics && typeof data.basics === 'object' ? data.basics : {},
    sections: Array.isArray(data.sections) ? data.sections.filter((s) => s && SECTION_KINDS.includes(s.kind)).slice(0, 60) : [],
  };
  const json = JSON.stringify(out);
  if (json.length > MAX_DATA) throw new HttpError(413, 'Profile is too large');
  return json;
}

/** Profiles a customer may keep: their own override, else the site-wide setting */
async function limitFor(userId) {
  const u = await one('SELECT profile_limit FROM users WHERE id = ?', [userId]);
  if (u && u.profile_limit != null) return Number(u.profile_limit);
  return Number((await getSettings()).profile_limit || 10);
}

async function assertBelowLimit(userId) {
  const owner = await one('SELECT role FROM users WHERE id = ?', [userId]);
  if (!owner || owner.role !== 'customer') return;
  const limit = await limitFor(userId);
  const { c } = await one('SELECT COUNT(*) c FROM profiles WHERE user_id = ?', [userId]);
  if (c >= limit) throw new HttpError(403, `Your plan allows ${limit} profiles. Delete one to create another.`);
}

// ------------------------------------------------------------------ templates
const TEMPLATE_LIST = `SELECT id, code, name, category, type, description, is_active, staff_only, sort_order, updated_at,
  JSON_UNQUOTE(JSON_EXTRACT(data, '$.theme')) theme, JSON_UNQUOTE(JSON_EXTRACT(data, '$.colors.primary')) primary_color,
  JSON_UNQUOTE(JSON_EXTRACT(data, '$.colors.accent')) accent_color FROM profile_templates`;

/** Adds the colours used to draw the template thumbnail */
function withSwatch(t) {
  const theme = THEMES[t.theme] || THEMES['navy-gold'];
  const ok = (v) => /^#[0-9a-f]{6}$/i.test(v || '');
  return {
    ...t,
    is_active: !!t.is_active,
    staff_only: !!t.staff_only,
    primary: ok(t.primary_color) ? t.primary_color : theme.primary,
    accent: ok(t.accent_color) ? t.accent_color : theme.accent,
  };
}

async function loadTemplate(req, id) {
  const t = parse(await one('SELECT * FROM profile_templates WHERE id = ?', [id]));
  if (!t || (!isAdmin(req.user) && (!t.is_active || (t.staff_only && !isStaff(req.user))))) throw new HttpError(404, 'Template not found');
  return t;
}

/** Template content with "[Company Name]" / "[Your Full Name]" replaced by the given name */
function fillName(data, name) {
  if (!name) return data;
  const safe = JSON.stringify(String(name).trim().slice(0, 150)).slice(1, -1);
  return JSON.parse(JSON.stringify(data).split('[Company Name]').join(safe).split('[Your Full Name]').join(safe));
}

async function loadOwned(req, id) {
  const row = parse(await one('SELECT * FROM profiles WHERE id = ?', [id]));
  if (!row || (!isAdmin(req.user) && row.user_id !== req.user.id)) throw new HttpError(404, 'Profile not found');
  return row;
}

function decor(profile) {
  const v = themeVars(profile.data);
  const b = profile.data.basics || {};
  return {
    primary: v.primary,
    accent: v.accent,
    footerLeft: [b.name, profile.type === 'company' ? b.subtitle : ''].filter(Boolean).join(' '),
    footerRight: b.docLabel || profile.title,
    skipFirst: profile.type !== 'personal',
  };
}

async function sendPdf(res, profile, download) {
  const html = renderProfileHtml(profile, { base: SELF() });
  const pdf = await htmlToPdf(html, SELF(), decor(profile));
  await query('UPDATE profiles SET download_count = download_count + 1 WHERE id = ?', [profile.id]);
  const name = `${slugify(profile.title || 'profile') || 'profile'}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${name}"`);
  res.send(pdf);
}

/** The API origin as the visitor's browser sees it (for images and fonts in HTML) */
const publicBase = (req) => `${req.protocol}://${req.get('host')}`;

// ------------------------------------------------------------------ public
router.get(
  '/public/:slug',
  asyncHandler(async (req, res) => {
    const p = parse(await one('SELECT * FROM profiles WHERE slug = ? AND is_public = 1', [req.params.slug]));
    if (!p) throw new HttpError(404, 'This profile is not available');
    res.type('html').send(renderProfileHtml(p, { base: publicBase(req), print: req.query.print === '1' }));
  })
);

router.get(
  '/public/:slug/pdf',
  asyncHandler(async (req, res) => {
    const p = parse(await one('SELECT * FROM profiles WHERE slug = ? AND is_public = 1', [req.params.slug]));
    if (!p) throw new HttpError(404, 'This profile is not available');
    await sendPdf(res, p, req.query.download === '1');
  })
);

// ------------------------------------------------------------------ signed in
router.use(authenticateAny);

router.get(
  '/meta',
  asyncHandler(async (req, res) => {
    res.json({
      themes: Object.entries(THEMES).map(([key, t]) => ({ key, ...t })),
      kinds: SECTION_KINDS,
      pdf: isPdfAvailable(),
      limit: isStaff(req.user) ? null : await limitFor(req.user.id),
    });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const all = isAdmin(req.user) && req.query.all === '1';
    const rows = await query(
      `SELECT p.id, p.user_id, p.type, p.title, p.slug, p.is_public, p.download_count, p.created_at, p.updated_at,
              u.name AS owner_name, u.email AS owner_email, u.role AS owner_role
       FROM profiles p JOIN users u ON u.id = p.user_id
       ${all ? '' : 'WHERE p.user_id = ?'} ORDER BY p.updated_at DESC`,
      all ? [] : [req.user.id]
    );
    res.json({ data: rows.map((r) => ({ ...r, is_public: !!r.is_public })) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    let row = null;
    if (req.body.template_id) row = await one('SELECT id FROM profile_templates WHERE id = ?', [req.body.template_id]);
    else row = await one('SELECT id FROM profile_templates WHERE code = ?', [String(req.body.template || 'company')]);
    if (!row) throw new HttpError(404, 'Template not found');
    const tpl = await loadTemplate(req, row.id);
    let ownerId = req.user.id;
    // admins can create a profile directly in a customer's account
    if (isAdmin(req.user) && req.body.owner_id) {
      const owner = await one('SELECT id FROM users WHERE id = ?', [req.body.owner_id]);
      if (!owner) throw new HttpError(404, 'User not found');
      ownerId = owner.id;
    } else if (isAdmin(req.user) && req.body.owner_email) {
      const owner = await one('SELECT id FROM users WHERE email = ?', [String(req.body.owner_email).trim().toLowerCase()]);
      if (!owner) throw new HttpError(404, 'No user with that email');
      ownerId = owner.id;
    }
    if (!isStaff(req.user)) await assertBelowLimit(ownerId);
    const title = String(req.body.title || '').trim() || (req.body.name ? `${String(req.body.name).trim()} – ${tpl.name}` : tpl.name);
    const data = fillName(tpl.data, req.body.name);
    const r = await query('INSERT INTO profiles SET ?', [{ user_id: ownerId, type: tpl.type, template_id: tpl.id, title, slug: newSlug(title), data: cleanData(data) }]);
    res.status(201).json(parse(await one('SELECT * FROM profiles WHERE id = ?', [r.insertId])));
  })
);

router.get(
  '/templates',
  asyncHandler(async (req, res) => {
    const rows = await query(`${TEMPLATE_LIST} WHERE is_active = 1 ${isStaff(req.user) ? '' : 'AND staff_only = 0'} ORDER BY sort_order, name`);
    res.json({ data: rows.map(withSwatch) });
  })
);

router.get(
  '/templates/:id/preview',
  asyncHandler(async (req, res) => {
    const t = await loadTemplate(req, req.params.id);
    res.type('html').send(renderProfileHtml({ type: t.type, title: t.name, data: t.data }, { base: publicBase(req) }));
  })
);

const upload = makeUploader('profiles', { maxMb: 5, allow: IMAGE_EXT.filter((e) => e !== '.ico') });
router.post(
  '/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file uploaded');
    res.json({ url: fileUrl('profiles', req.file) });
  })
);

router.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const base = /^https?:\/\/[A-Za-z0-9.:[\]-]+$/.test(req.body.base || '') ? req.body.base : publicBase(req);
    const profile = { type: req.body.type === 'personal' ? 'personal' : 'company', title: req.body.title, data: JSON.parse(cleanData(req.body.data)) };
    res.type('html').send(renderProfileHtml(profile, { base }));
  })
);

// ------------------------------------------------------------------ admin: customers & firms
const admin = express.Router();
admin.use(authorize());

const CUSTOMER_FIELDS = ['name', 'email', 'phone', 'company_name', 'status', 'notes', 'profile_limit'];
function customerData(body) {
  const d = pick(body, CUSTOMER_FIELDS);
  if (d.email !== undefined) d.email = String(d.email).trim().toLowerCase();
  if (d.name !== undefined) d.name = String(d.name).trim().slice(0, 150);
  if (d.company_name !== undefined) d.company_name = String(d.company_name || '').trim().slice(0, 200) || null;
  if (d.status !== undefined && !['active', 'inactive'].includes(d.status)) delete d.status;
  if (d.profile_limit !== undefined) d.profile_limit = d.profile_limit === '' || d.profile_limit === null ? null : Math.max(0, parseInt(d.profile_limit, 10) || 0);
  return d;
}

admin.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const c = await one(
      `SELECT COUNT(*) total, SUM(status = 'active') active,
              SUM(created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')) this_month
       FROM users WHERE role = 'customer'`
    );
    const p = await one(
      `SELECT COUNT(*) total, COALESCE(SUM(is_public), 0) public_count, COALESCE(SUM(download_count), 0) downloads,
              SUM(type = 'company') company, SUM(type = 'personal') personal
       FROM profiles`
    );
    const recent = await query(
      `SELECT id, name, email, company_name, created_at FROM users WHERE role = 'customer' ORDER BY id DESC LIMIT 5`
    );
    res.json({
      customers: { total: Number(c.total), active: Number(c.active || 0), this_month: Number(c.this_month || 0) },
      profiles: { total: Number(p.total), public: Number(p.public_count), downloads: Number(p.downloads), company: Number(p.company || 0), personal: Number(p.personal || 0) },
      default_limit: Number((await getSettings()).profile_limit || 10),
      recent,
    });
  })
);

admin.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const where = ["u.role = 'customer'"];
    const params = [];
    if (req.query.search) {
      where.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.company_name LIKE ?)');
      const q = `%${req.query.search}%`;
      params.push(q, q, q, q);
    }
    if (['active', 'inactive'].includes(req.query.status)) {
      where.push('u.status = ?');
      params.push(req.query.status);
    }
    const rows = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.company_name, u.status, u.profile_limit, u.notes, u.last_login, u.created_at,
              COUNT(p.id) profile_count, COALESCE(SUM(p.download_count), 0) downloads, MAX(p.updated_at) last_activity
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
       WHERE ${where.join(' AND ')}
       GROUP BY u.id ORDER BY u.id DESC`,
      params
    );
    res.json({ data: rows, default_limit: Number((await getSettings()).profile_limit || 10) });
  })
);

admin.get(
  '/customers/:id',
  asyncHandler(async (req, res) => {
    const u = await one(
      `SELECT id, name, email, phone, company_name, status, profile_limit, notes, last_login, created_at
       FROM users WHERE id = ? AND role = 'customer'`,
      [req.params.id]
    );
    if (!u) throw new HttpError(404, 'Customer not found');
    const profiles = await query(
      'SELECT id, type, title, slug, is_public, download_count, created_at, updated_at FROM profiles WHERE user_id = ? ORDER BY updated_at DESC',
      [u.id]
    );
    res.json({ ...u, effective_limit: await limitFor(u.id), profiles: profiles.map((r) => ({ ...r, is_public: !!r.is_public })) });
  })
);

admin.post(
  '/customers',
  asyncHandler(async (req, res) => {
    const d = customerData(req.body);
    if (!d.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email || '')) throw new HttpError(400, 'Name and a valid email are required');
    if (String(req.body.password || '').length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    if (await one('SELECT id FROM users WHERE email = ?', [d.email])) throw new HttpError(409, 'A user with this email already exists');
    const r = await query('INSERT INTO users SET ?', [{ ...d, role: 'customer', password_hash: await bcrypt.hash(req.body.password, 10) }]);
    res.status(201).json({ id: r.insertId });
  })
);

admin.put(
  '/customers/:id',
  asyncHandler(async (req, res) => {
    const u = await one("SELECT id FROM users WHERE id = ? AND role = 'customer'", [req.params.id]);
    if (!u) throw new HttpError(404, 'Customer not found');
    const d = customerData(req.body);
    if (d.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) throw new HttpError(400, 'Enter a valid email');
    if (req.body.password) {
      if (String(req.body.password).length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
      d.password_hash = await bcrypt.hash(req.body.password, 10);
    }
    if (Object.keys(d).length) await query('UPDATE users SET ? WHERE id = ?', [d, u.id]);
    res.json({ message: 'Customer updated' });
  })
);

admin.delete(
  '/customers/:id',
  asyncHandler(async (req, res) => {
    const u = await one("SELECT id FROM users WHERE id = ? AND role = 'customer'", [req.params.id]);
    if (!u) throw new HttpError(404, 'Customer not found');
    await query('DELETE FROM users WHERE id = ?', [u.id]); // profiles are removed by the foreign key
    res.json({ message: 'Customer and their profiles deleted' });
  })
);

admin.get(
  '/profiles',
  asyncHandler(async (req, res) => {
    const where = ['1=1'];
    const params = [];
    if (req.query.search) {
      where.push('(p.title LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR u.company_name LIKE ?)');
      const q = `%${req.query.search}%`;
      params.push(q, q, q, q);
    }
    if (['company', 'personal'].includes(req.query.type)) {
      where.push('p.type = ?');
      params.push(req.query.type);
    }
    if (req.query.visibility === 'public') where.push('p.is_public = 1');
    if (req.query.visibility === 'private') where.push('p.is_public = 0');
    if (req.query.owner === 'customers') where.push("u.role = 'customer'");
    if (req.query.owner === 'staff') where.push("u.role <> 'customer'");
    const rows = await query(
      `SELECT p.id, p.user_id, p.type, p.title, p.slug, p.is_public, p.download_count, p.created_at, p.updated_at,
              u.name owner_name, u.email owner_email, u.company_name owner_company, u.role owner_role
       FROM profiles p JOIN users u ON u.id = p.user_id
       WHERE ${where.join(' AND ')} ORDER BY p.updated_at DESC`,
      params
    );
    res.json({ data: rows.map((r) => ({ ...r, is_public: !!r.is_public })) });
  })
);

// move a profile to another account, e.g. hand a finished profile over to the client
admin.put(
  '/profiles/:id/owner',
  asyncHandler(async (req, res) => {
    const p = await one('SELECT id FROM profiles WHERE id = ?', [req.params.id]);
    if (!p) throw new HttpError(404, 'Profile not found');
    const email = String(req.body.email || '').trim().toLowerCase();
    const owner = await one('SELECT id, name FROM users WHERE email = ?', [email]);
    if (!owner) throw new HttpError(404, 'No user with that email');
    await query('UPDATE profiles SET user_id = ? WHERE id = ?', [owner.id, p.id]);
    res.json({ message: `Profile moved to ${owner.name}` });
  })
);

// ------------------------------------------------------------------ admin: template library
const TEMPLATE_FIELDS = ['name', 'category', 'type', 'description', 'is_active', 'staff_only', 'sort_order'];
function templateData(body) {
  const d = pick(body, TEMPLATE_FIELDS);
  if (d.name !== undefined) d.name = String(d.name).trim().slice(0, 150);
  if (d.category !== undefined) d.category = String(d.category).trim().slice(0, 100) || 'General';
  if (d.type !== undefined && !['company', 'personal'].includes(d.type)) delete d.type;
  if (d.description !== undefined) d.description = String(d.description || '').slice(0, 300);
  ['is_active', 'staff_only'].forEach((k) => d[k] !== undefined && (d[k] = d[k] ? 1 : 0));
  if (d.sort_order !== undefined) d.sort_order = parseInt(d.sort_order, 10) || 0;
  if (body.data !== undefined) d.data = cleanData(body.data);
  return d;
}

admin.get(
  '/templates',
  asyncHandler(async (req, res) => {
    const rows = await query(`${TEMPLATE_LIST} ORDER BY sort_order, name`);
    const usage = await query('SELECT template_id, COUNT(*) c FROM profiles WHERE template_id IS NOT NULL GROUP BY template_id');
    const used = Object.fromEntries(usage.map((u) => [u.template_id, Number(u.c)]));
    res.json({ data: rows.map((t) => ({ ...withSwatch(t), used: used[t.id] || 0 })) });
  })
);

admin.get('/templates/:id', asyncHandler(async (req, res) => res.json(await loadTemplate(req, req.params.id))));

// new template: blank (company / personal), copy of another template, or copy of a profile
admin.post(
  '/templates',
  asyncHandler(async (req, res) => {
    const d = templateData(req.body);
    let source = null;
    if (req.body.from_template_id) source = await loadTemplate(req, req.body.from_template_id);
    else if (req.body.from_profile_id) source = await loadOwned(req, req.body.from_profile_id);
    const type = source ? source.type : d.type || 'company';
    const blank = await one('SELECT data FROM profile_templates WHERE code = ?', [type === 'personal' ? 'personal' : 'company']);
    const data = source ? source.data : blank ? JSON.parse(blank.data) : { sections: [] };
    const row = {
      name: d.name || (source ? `${source.name || source.title} (copy)` : 'New template'),
      category: d.category || (source && source.category) || 'General',
      type,
      description: d.description ?? (source && source.description) ?? '',
      data: cleanData(data),
      is_active: d.is_active ?? 1,
      staff_only: d.staff_only ?? 0,
      sort_order: d.sort_order ?? 999,
    };
    const r = await query('INSERT INTO profile_templates SET ?', [row]);
    res.status(201).json({ id: r.insertId });
  })
);

admin.put(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const t = await loadTemplate(req, req.params.id);
    const d = templateData(req.body);
    if (Object.keys(d).length) await query('UPDATE profile_templates SET ? WHERE id = ?', [d, t.id]);
    res.json(parse(await one('SELECT * FROM profile_templates WHERE id = ?', [t.id])));
  })
);

admin.delete(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const t = await loadTemplate(req, req.params.id);
    await query('DELETE FROM profile_templates WHERE id = ?', [t.id]); // profiles keep their own copy
    res.json({ message: 'Template deleted' });
  })
);

// bring back built-in templates that were deleted
admin.post(
  '/templates/restore',
  asyncHandler(async (req, res) => {
    const added = await seedTemplates(query, { onlyMissing: true });
    res.json({ message: added ? `${added} built-in template(s) restored` : 'All built-in templates are already present' });
  })
);

router.use('/admin', admin);

router.get('/:id', asyncHandler(async (req, res) => res.json(await loadOwned(req, req.params.id))));

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const p = await loadOwned(req, req.params.id);
    const patch = {};
    if (req.body.title !== undefined) patch.title = String(req.body.title).trim().slice(0, 200) || p.title;
    if (req.body.type && ['company', 'personal'].includes(req.body.type)) patch.type = req.body.type;
    if (req.body.is_public !== undefined) patch.is_public = req.body.is_public ? 1 : 0;
    if (req.body.data !== undefined) patch.data = cleanData(req.body.data);
    if (Object.keys(patch).length) await query('UPDATE profiles SET ? WHERE id = ?', [patch, p.id]);
    res.json(parse(await one('SELECT * FROM profiles WHERE id = ?', [p.id])));
  })
);

router.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const p = await loadOwned(req, req.params.id);
    if (!isStaff(req.user)) await assertBelowLimit(req.user.id);
    const title = `${p.title} (copy)`;
    const r = await query('INSERT INTO profiles SET ?', [{ user_id: req.user.id, type: p.type, template_id: p.template_id, title, slug: newSlug(title), data: JSON.stringify(p.data) }]);
    res.status(201).json({ id: r.insertId });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const p = await loadOwned(req, req.params.id);
    await query('DELETE FROM profiles WHERE id = ?', [p.id]);
    res.json({ message: 'Profile deleted' });
  })
);

// Browser print fallback when the server has no Chromium
router.get(
  '/:id/html',
  asyncHandler(async (req, res) => {
    const p = await loadOwned(req, req.params.id);
    res.type('html').send(renderProfileHtml(p, { base: publicBase(req), print: req.query.print === '1' }));
  })
);

router.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const p = await loadOwned(req, req.params.id);
    await sendPdf(res, p, req.query.download === '1');
  })
);

module.exports = router;
