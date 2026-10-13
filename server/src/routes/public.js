const express = require('express');
const rateLimit = require('express-rate-limit');
const { query, one } = require('../config/db');
const { asyncHandler, HttpError } = require('../middleware/error');
const { publicSettings, getSettings } = require('../utils/settings');
const { verifyDocToken } = require('../utils/helpers');
const { makeUploader, fileUrl } = require('../middleware/upload');
const { sendEmail, sendWhatsApp, notifyAdmins } = require('../services/notify');
const { buildDocument } = require('../services/documents');
const { notifyRoles, fire } = require('../services/push');

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
    const [sliders, services, portfolio, testimonials, partners, technologies, stats, pricing, faqs, blog, team, products] = await Promise.all([
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
      query(`SELECT id, name, slug, tagline, stage, logo, image, short_description, features, website_url, cta_text FROM products WHERE ${active} AND is_featured = 1 ORDER BY sort_order, id LIMIT 6`),
    ]);
    res.json({ sliders, services, portfolio, testimonials, partners, technologies, stats, pricing, faqs, blog, team, products });
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

router.get('/products', asyncHandler(async (req, res) => res.json(await query(`SELECT * FROM products WHERE ${active} ORDER BY sort_order, id DESC`))));
router.get('/products/:slug', asyncHandler(async (req, res) => {
  const p = await one(`SELECT * FROM products WHERE slug = ? AND ${active}`, [req.params.slug]);
  if (!p) throw new HttpError(404, 'Product not found');
  p.related = await query(`SELECT id, name, slug, tagline, stage, logo, image FROM products WHERE ${active} AND id <> ? ORDER BY sort_order LIMIT 3`, [p.id]);
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
    fire(notifyRoles(['accounts'], { title: `📩 New ${source === 'quote' ? 'quote request' : 'enquiry'} – ${name}`, body: [service, phone || email].filter(Boolean).join(' · '), link: '/admin/enquiries', type: 'enquiry' }));
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
    fire(notifyRoles(['hr'], { title: `🧑‍💼 New application – ${b.name}`, body: job ? job.title : 'General application', link: '/admin/applications', type: 'application' }));
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

// ------------------------------------------------------------------ online share page
const SHARE_TYPES = ['invoice', 'quotation', 'contract', 'letter', 'payslip', 'receipt', 'vault'];
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

async function shareMeta(type, id) {
  if (type === 'invoice') {
    const i = await one('SELECT i.*, c.name AS client_name FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.id = ?', [id]);
    if (!i) return null;
    const items = await query('SELECT description, quantity, amount FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id', [id]);
    return { label: 'Invoice', number: i.invoice_no, title: i.subject, party: i.client_name, date: i.invoice_date, due_date: i.due_date, total: i.total, paid: i.amount_paid, balance: Number(i.total) - Number(i.amount_paid), status: i.status, items, payable: !['paid', 'cancelled', 'draft'].includes(i.status), viewed_at: i.viewed_at };
  }
  if (type === 'quotation') {
    const q = await one('SELECT q.*, c.name AS client_name FROM quotations q JOIN clients c ON c.id = q.client_id WHERE q.id = ?', [id]);
    if (!q) return null;
    const items = await query('SELECT description, quantity, amount FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order, id', [id]);
    return { label: 'Quotation', number: q.quote_no, title: q.subject, party: q.client_name, date: q.quote_date, valid_until: q.valid_until, total: q.total, status: q.status, items, can_accept: ['draft', 'sent'].includes(q.status), accepted_by: q.accepted_by, accepted_at: q.accepted_at, viewed_at: q.viewed_at };
  }
  if (type === 'contract') {
    const k = await one('SELECT * FROM contracts WHERE id = ?', [id]);
    if (!k) return null;
    return { label: 'Agreement', number: k.contract_no, title: k.title, party: k.party_name, date: k.agreement_date, start_date: k.start_date, end_date: k.end_date, total: k.contract_value, status: k.status, body: k.body, can_accept: ['draft', 'sent'].includes(k.status), accepted_by: k.accepted_by, accepted_at: k.accepted_at, viewed_at: k.viewed_at };
  }
  if (type === 'letter') {
    const l = await one('SELECT letter_no, title, recipient_name, issue_date, status FROM letters WHERE id = ?', [id]);
    return l && { label: 'Letter', number: l.letter_no, title: l.title, party: l.recipient_name, date: l.issue_date, status: l.status };
  }
  if (type === 'receipt') {
    const r = await one('SELECT p.receipt_no, p.amount, p.payment_date, c.name FROM payments p JOIN clients c ON c.id = p.client_id WHERE p.id = ?', [id]);
    return r && { label: 'Payment Receipt', number: r.receipt_no, party: r.name, date: r.payment_date, total: r.amount, status: 'paid' };
  }
  if (type === 'payslip') {
    const p = await one('SELECT p.month, p.year, p.net_pay, p.status, e.name FROM payslips p JOIN employees e ON e.id = p.employee_id WHERE p.id = ?', [id]);
    return p && { label: 'Payslip', number: `${p.month}/${p.year}`, party: p.name, total: p.net_pay, status: p.status };
  }
  if (type === 'vault') {
    const d = await one('SELECT v.title, v.category, v.file, v.document_date, c.name FROM vault_documents v LEFT JOIN clients c ON c.id = v.client_id WHERE v.id = ?', [id]);
    return d && { label: 'Document', number: d.title, title: d.title, party: d.name, date: d.document_date, is_pdf: /\.pdf$/i.test(d.file) };
  }
  return null;
}

function checkShare(req) {
  const { type, id, token } = req.params;
  if (!SHARE_TYPES.includes(type) || !verifyDocToken(type, id, token)) throw new HttpError(403, 'This link is invalid or has expired');
}

router.get(
  '/share/:type/:id/:token',
  asyncHandler(async (req, res) => {
    checkShare(req);
    const { type, id, token } = req.params;
    const meta = await shareMeta(type, id);
    if (!meta) throw new HttpError(404, 'Document not found');
    const s = await getSettings();
    // first view → let the team know (staff previews are logged in and use other routes)
    if (['invoice', 'quotation', 'contract'].includes(type) && !meta.viewed_at && !req.query.preview) {
      const table = { invoice: 'invoices', quotation: 'quotations', contract: 'contracts' }[type];
      await query(`UPDATE ${table} SET viewed_at = NOW() WHERE id = ? AND viewed_at IS NULL`, [id]);
      fire(notifyRoles(['accounts'], { title: `👀 ${meta.party} opened ${meta.label} ${meta.number}`, body: 'The client viewed the shared link.', link: `/admin/${type === 'contract' ? 'contracts' : `${type}s`}/${id}`, type: 'viewed' }));
    }
    delete meta.viewed_at;
    res.json({
      ...meta,
      type,
      pdf_url: `/api/public/documents/${type}/${id}/${token}`,
      company: {
        name: s.company_name, logo: s.logo, phone: s.phone, email: s.email, whatsapp: s.whatsapp_number, address: s.address, site_url: s.site_url,
        // payment details only on invoices
        ...(type === 'invoice' ? { upi_id: s.upi_id, bank_account_holder: s.bank_account_holder, bank_name: s.bank_name, bank_account_number: s.bank_account_number, bank_ifsc: s.bank_ifsc, bank_branch: s.bank_branch } : {}),
      },
    });
  })
);

router.post(
  '/share/:type/:id/:token/accept',
  formLimiter,
  asyncHandler(async (req, res) => {
    checkShare(req);
    const { type, id } = req.params;
    const name = String(req.body.name || '').trim();
    if (!['quotation', 'contract'].includes(type)) throw new HttpError(400, 'This document cannot be accepted online');
    if (name.length < 3) throw new HttpError(400, 'Please type your full name to accept');
    if (!req.body.agree) throw new HttpError(400, 'Please confirm that you agree to the terms');
    const table = type === 'quotation' ? 'quotations' : 'contracts';
    const r = await query(
      `UPDATE ${table} SET status = 'accepted', accepted_by = ?, accepted_at = NOW(), accepted_ip = ? WHERE id = ? AND status IN ('draft','sent')`,
      [name.slice(0, 150), clientIp(req), id]
    );
    if (!r.affectedRows) throw new HttpError(400, 'This document has already been accepted or is no longer open');
    const meta = await shareMeta(type, id);
    fire(notifyRoles(['accounts'], { title: `🎉 ${meta.label} ${meta.number} accepted`, body: `Accepted online by ${name} (${meta.party})`, link: `/admin/${type === 'contract' ? 'contracts' : 'quotations'}/${id}`, type: 'accepted' }));
    notifyAdmins(`${meta.label} ${meta.number} accepted by ${esc(name)}`, `<p><b>${esc(meta.party)}</b> accepted ${meta.label.toLowerCase()} <b>${esc(meta.number)}</b> online.</p><p>Accepted by: ${esc(name)}<br>IP: ${esc(clientIp(req))}</p>`).catch(() => {});
    res.json({ message: `Thank you! The ${meta.label.toLowerCase()} has been accepted.` });
  })
);

// ------------------------------------------------------------------ shared documents (signed link)
router.get(
  '/documents/:type/:id/:token',
  asyncHandler(async (req, res) => {
    const { type, id, token } = req.params;
    if (!verifyDocToken(type, id, token)) throw new HttpError(403, 'Invalid or expired link');
    const doc = await buildDocument(type, id);
    res.setHeader('Content-Type', doc.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${doc.filename}"`);
    res.send(doc.buffer);
  })
);

module.exports = router;
