const express = require('express');
const rateLimit = require('express-rate-limit');
const { query, one } = require('../config/db');
const { asyncHandler, HttpError } = require('../middleware/error');
const { publicSettings, getSettings } = require('../utils/settings');
const { verifyDocToken } = require('../utils/helpers');
const { makeUploader, fileUrl } = require('../middleware/upload');
const { sendEmail, sendWhatsApp, notifyAdmins } = require('../services/notify');
const { buildDocument } = require('../services/documents');

const router = express.Router();
const formLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const active = "status = 'active'";

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

router.get(
  '/site',
  asyncHandler(async (req, res) => {
    const [settings, services, pages] = await Promise.all([
      publicSettings(),
      query(`SELECT id, title, slug, icon FROM services WHERE ${active} ORDER BY sort_order, id`),
      query(`SELECT title, slug FROM pages WHERE ${active} AND show_in_footer = 1 ORDER BY id`),
    ]);
    res.json({ settings, services, pages });
  })
);

router.get(
  '/home',
  asyncHandler(async (req, res) => {
    const [sliders, services, portfolio, testimonials, partners, technologies, stats, pricing, faqs, blog, team] = await Promise.all([
      query(`SELECT * FROM sliders WHERE ${active} ORDER BY sort_order, id`),
      query(`SELECT id, title, slug, icon, short_description, image, starting_price FROM services WHERE ${active} AND is_featured = 1 ORDER BY sort_order, id LIMIT 9`),
      query(`SELECT id, title, slug, category, image, short_description, technologies FROM portfolio WHERE ${active} AND is_featured = 1 ORDER BY sort_order, id DESC LIMIT 6`),
      query(`SELECT * FROM testimonials WHERE ${active} ORDER BY sort_order, id DESC`),
      query(`SELECT * FROM partners WHERE ${active} ORDER BY sort_order, id`),
      query(`SELECT * FROM technologies WHERE ${active} ORDER BY sort_order, id`),
      query(`SELECT * FROM stats WHERE ${active} ORDER BY sort_order, id`),
      query(`SELECT * FROM pricing_plans WHERE ${active} ORDER BY sort_order, id`),
      query(`SELECT * FROM faqs WHERE ${active} ORDER BY sort_order, id LIMIT 8`),
      query("SELECT id, title, slug, excerpt, image, category, author, published_at FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC, id DESC LIMIT 3"),
      query(`SELECT * FROM team_members WHERE ${active} ORDER BY sort_order, id LIMIT 8`),
    ]);
    res.json({ sliders, services, portfolio, testimonials, partners, technologies, stats, pricing, faqs, blog, team });
  })
);

router.get('/about', asyncHandler(async (req, res) => {
  const [team, stats, testimonials, partners] = await Promise.all([
    query(`SELECT * FROM team_members WHERE ${active} ORDER BY sort_order, id`),
    query(`SELECT * FROM stats WHERE ${active} ORDER BY sort_order, id`),
    query(`SELECT * FROM testimonials WHERE ${active} ORDER BY sort_order, id DESC`),
    query(`SELECT * FROM partners WHERE ${active} ORDER BY sort_order, id`),
  ]);
  res.json({ team, stats, testimonials, partners });
}));

router.get('/services', asyncHandler(async (req, res) => res.json(await query(`SELECT * FROM services WHERE ${active} ORDER BY sort_order, id`))));
router.get('/services/:slug', asyncHandler(async (req, res) => {
  const s = await one(`SELECT * FROM services WHERE slug = ? AND ${active}`, [req.params.slug]);
  if (!s) throw new HttpError(404, 'Service not found');
  s.related = await query(`SELECT id, title, slug, icon, short_description FROM services WHERE ${active} AND id <> ? ORDER BY sort_order LIMIT 4`, [s.id]);
  s.faqs = await query(`SELECT * FROM faqs WHERE ${active} ORDER BY sort_order LIMIT 6`);
  res.json(s);
}));

router.get('/portfolio', asyncHandler(async (req, res) => res.json(await query(`SELECT * FROM portfolio WHERE ${active} ORDER BY sort_order, id DESC`))));
router.get('/portfolio/:slug', asyncHandler(async (req, res) => {
  const p = await one(`SELECT * FROM portfolio WHERE slug = ? AND ${active}`, [req.params.slug]);
  if (!p) throw new HttpError(404, 'Project not found');
  p.related = await query(`SELECT id, title, slug, image, category FROM portfolio WHERE ${active} AND id <> ? ORDER BY sort_order LIMIT 3`, [p.id]);
  res.json(p);
}));

router.get('/blog', asyncHandler(async (req, res) => {
  const { category, q, page = 1 } = req.query;
  const where = ["status = 'published'"];
  const params = [];
  if (category) { where.push('category = ?'); params.push(category); }
  if (q) { where.push('(title LIKE ? OR excerpt LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const w = `WHERE ${where.join(' AND ')}`;
  const limit = 9;
  const [{ total }] = await query(`SELECT COUNT(*) total FROM blog_posts ${w}`, params);
  const data = await query(`SELECT id, title, slug, excerpt, image, category, author, published_at FROM blog_posts ${w} ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?`, [...params, limit, (Number(page) - 1) * limit]);
  const categories = await query("SELECT category, COUNT(*) count FROM blog_posts WHERE status = 'published' AND category IS NOT NULL GROUP BY category");
  res.json({ data, total, page: Number(page), limit, categories });
}));
router.get('/blog/:slug', asyncHandler(async (req, res) => {
  const p = await one("SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'", [req.params.slug]);
  if (!p) throw new HttpError(404, 'Post not found');
  await query('UPDATE blog_posts SET views = views + 1 WHERE id = ?', [p.id]);
  p.recent = await query("SELECT id, title, slug, image, published_at FROM blog_posts WHERE status = 'published' AND id <> ? ORDER BY published_at DESC LIMIT 4", [p.id]);
  res.json(p);
}));

router.get('/pages/:slug', asyncHandler(async (req, res) => {
  const p = await one(`SELECT * FROM pages WHERE slug = ? AND ${active}`, [req.params.slug]);
  if (!p) throw new HttpError(404, 'Page not found');
  res.json(p);
}));

router.get('/faqs', asyncHandler(async (req, res) => res.json(await query(`SELECT * FROM faqs WHERE ${active} ORDER BY sort_order, id`))));
router.get('/pricing', asyncHandler(async (req, res) => res.json(await query(`SELECT * FROM pricing_plans WHERE ${active} ORDER BY sort_order, id`))));

router.get('/careers', asyncHandler(async (req, res) => res.json(await query(
  "SELECT id, title, slug, department, location, job_type, experience, salary_range, openings, short_description, last_date, created_at FROM job_openings WHERE status = 'open' AND (last_date IS NULL OR last_date >= CURDATE()) ORDER BY id DESC"
))));
router.get('/careers/:slug', asyncHandler(async (req, res) => {
  const j = await one("SELECT * FROM job_openings WHERE slug = ? AND status = 'open'", [req.params.slug]);
  if (!j) throw new HttpError(404, 'Job not found or closed');
  res.json(j);
}));

// ------------------------------------------------------------------ forms
router.post(
  '/enquiry',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { name, email, phone, company, service, budget, subject, message, source, website } = req.body;
    if (website) return res.json({ message: 'Thank you!' }); // honeypot
    if (!name || (!email && !phone)) throw new HttpError(400, 'Please provide your name and an email or phone number');
    const r = await query('INSERT INTO enquiries SET ?', [{ name, email, phone, company, service, budget, subject, message, source: source || 'contact' }]);
    const s = await getSettings();
    notifyAdmins(
      `New ${source === 'quote' ? 'quote request' : 'enquiry'} from ${esc(name)}`,
      `<h3 style="margin:0 0 10px">New website ${source === 'quote' ? 'quote request' : 'enquiry'}</h3>
       <table cellpadding="6">${[['Name', name], ['Email', email], ['Phone', phone], ['Company', company], ['Service', service], ['Budget', budget], ['Subject', subject], ['Message', message]]
         .filter((x) => x[1])
         .map(([k, v]) => `<tr><td><b>${k}</b></td><td>${esc(v)}</td></tr>`)
         .join('')}</table>`
    ).catch(() => {});
    if (email && s.enquiry_autoreply !== '0') {
      sendEmail({
        to: email,
        subject: `Thank you for contacting ${s.company_name || 'us'}`,
        html: `<p>Dear ${esc(name)},</p><p>${esc(s.enquiry_autoreply_text || 'Thank you for reaching out! We have received your enquiry and our team will get back to you within 24 hours.')}</p><p>Regards,<br>${esc(s.company_name || '')}</p>`,
        refType: 'enquiry',
        refId: r.insertId,
      }).catch(() => {});
    }
    if (s.whatsapp_admin_number && s.enquiry_whatsapp_alert === '1') {
      sendWhatsApp({ to: s.whatsapp_admin_number, message: `New enquiry: ${name} (${phone || email}) – ${service || subject || ''}\n${message || ''}`, refType: 'enquiry', refId: r.insertId }).catch(() => {});
    }
    res.status(201).json({ message: 'Thank you! We will get back to you shortly.' });
  })
);

router.post(
  '/subscribe',
  formLimiter,
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email');
    await query("INSERT INTO subscribers (email) VALUES (?) ON DUPLICATE KEY UPDATE status = 'active'", [email]);
    res.json({ message: 'Subscribed successfully!' });
  })
);

const resumeUpload = makeUploader('resumes', { maxMb: 5, allow: ['.pdf', '.doc', '.docx'] });
router.post(
  '/apply',
  formLimiter,
  resumeUpload.single('resume'),
  asyncHandler(async (req, res) => {
    const b = req.body;
    if (!b.name || !b.email || !b.phone) throw new HttpError(400, 'Name, email and phone are required');
    const job = b.job_id ? await one('SELECT id, title FROM job_openings WHERE id = ?', [b.job_id]) : null;
    const data = {
      job_id: job ? job.id : null,
      name: b.name,
      email: b.email,
      phone: b.phone,
      city: b.city,
      qualification: b.qualification,
      college: b.college,
      experience: b.experience,
      current_ctc: b.current_ctc,
      expected_ctc: b.expected_ctc,
      notice_period: b.notice_period,
      portfolio_url: b.portfolio_url,
      cover_letter: b.cover_letter,
      resume: fileUrl('resumes', req.file),
    };
    const r = await query('INSERT INTO job_applications SET ?', [data]);
    const s = await getSettings();
    notifyAdmins(`New job application – ${esc(b.name)}${job ? ` (${esc(job.title)})` : ''}`, `<p><b>${esc(b.name)}</b> (${esc(b.email)}, ${esc(b.phone)}) applied${job ? ` for <b>${esc(job.title)}</b>` : ''}.</p>`).catch(() => {});
    sendEmail({
      to: b.email,
      subject: `Application received – ${s.company_name || ''}`,
      html: `<p>Dear ${esc(b.name)},</p><p>Thank you for applying${job ? ` for the position of <b>${esc(job.title)}</b>` : ''} at ${esc(s.company_name || 'our company')}. Our HR team will review your profile and get back to you soon.</p>`,
      refType: 'application',
      refId: r.insertId,
    }).catch(() => {});
    res.status(201).json({ message: 'Application submitted successfully! We will contact you soon.' });
  })
);

// ------------------------------------------------------------------ shared documents (signed link)
router.get(
  '/documents/:type/:id/:token',
  asyncHandler(async (req, res) => {
    const { type, id, token } = req.params;
    if (!verifyDocToken(type, id, token)) throw new HttpError(403, 'Invalid or expired link');
    const doc = await buildDocument(type, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.filename}"`);
    res.send(doc.buffer);
  })
);

module.exports = router;
