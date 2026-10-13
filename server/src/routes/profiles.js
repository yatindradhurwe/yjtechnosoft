/**
 * Profile builder (SaaS): customers and staff create company / personal
 * profiles, edit them section by section and download them as PDF.
 * Customers see only their own profiles; admins see and manage all.
 */
const express = require('express');
const crypto = require('crypto');
const { query, one } = require('../config/db');
const { authenticateAny } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { makeUploader, fileUrl, IMAGE_EXT } = require('../middleware/upload');
const { getSettings } = require('../utils/settings');
const { slugify } = require('../utils/helpers');
const { renderProfileHtml, THEMES, SECTION_KINDS, themeVars } = require('../services/profileRender');
const { htmlToPdf, isPdfAvailable } = require('../services/profilePdf');
const { TEMPLATES } = require('../services/profileTemplates');

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
    const s = await getSettings();
    res.json({
      themes: Object.entries(THEMES).map(([key, t]) => ({ key, ...t })),
      templates: Object.entries(TEMPLATES)
        .filter(([, t]) => !t.staffOnly || isStaff(req.user))
        .map(([key, t]) => ({ key, type: t.type, label: t.label })),
      kinds: SECTION_KINDS,
      pdf: isPdfAvailable(),
      limit: isStaff(req.user) ? null : Number(s.profile_limit || 10),
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
    const tpl = TEMPLATES[req.body.template] || TEMPLATES.company;
    if (tpl.staffOnly && !isStaff(req.user)) throw new HttpError(403, 'Template not available');
    let ownerId = req.user.id;
    // admins can create a profile directly in a customer's account
    if (isAdmin(req.user) && req.body.owner_email) {
      const owner = await one('SELECT id FROM users WHERE email = ?', [String(req.body.owner_email).trim().toLowerCase()]);
      if (!owner) throw new HttpError(404, 'No user with that email');
      ownerId = owner.id;
    }
    if (!isStaff(req.user)) {
      const limit = Number((await getSettings()).profile_limit || 10);
      const { c } = await one('SELECT COUNT(*) c FROM profiles WHERE user_id = ?', [ownerId]);
      if (c >= limit) throw new HttpError(403, `Your plan allows ${limit} profiles. Delete one to create another.`);
    }
    const title = String(req.body.title || '').trim() || tpl.label;
    const data = tpl.build(req.body.name ? String(req.body.name).trim() : undefined);
    const r = await query('INSERT INTO profiles SET ?', [{ user_id: ownerId, type: tpl.type, title, slug: newSlug(title), data: cleanData(data) }]);
    res.status(201).json(parse(await one('SELECT * FROM profiles WHERE id = ?', [r.insertId])));
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
    if (!isStaff(req.user)) {
      const limit = Number((await getSettings()).profile_limit || 10);
      const { c } = await one('SELECT COUNT(*) c FROM profiles WHERE user_id = ?', [req.user.id]);
      if (c >= limit) throw new HttpError(403, `Your plan allows ${limit} profiles. Delete one to create another.`);
    }
    const title = `${p.title} (copy)`;
    const r = await query('INSERT INTO profiles SET ?', [{ user_id: req.user.id, type: p.type, title, slug: newSlug(title), data: JSON.stringify(p.data) }]);
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
