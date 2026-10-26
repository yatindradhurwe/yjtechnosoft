/**
 * Email marketing: bulk campaigns, audience preview, template preview / test sends,
 * and the public open-pixel, click-redirect and unsubscribe endpoints.
 * Templates themselves use the generic CRUD resource `email_templates`.
 */
const express = require('express');
const { query, one } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { getSettings } = require('../utils/settings');
const { sendEmail } = require('../services/notify');
const C = require('../services/campaigns');

const router = express.Router();
router.use(authenticate, authorize('accounts'));

const CONTENT_FIELDS = ['name', 'subject', 'preheader', 'format', 'body', 'template_id', 'reply_to', 'track_opens', 'track_clicks'];

function contentFrom(body) {
  const out = {};
  CONTENT_FIELDS.forEach((k) => body[k] !== undefined && (out[k] = body[k] === '' ? null : body[k]));
  if (body.audience !== undefined) out.audience = JSON.stringify(body.audience || {});
  if (out.format && !['layout', 'html'].includes(out.format)) out.format = 'layout';
  ['track_opens', 'track_clicks'].forEach((k) => out[k] !== undefined && (out[k] = out[k] && out[k] !== '0' ? 1 : 0));
  return out;
}

async function getCampaign(id) {
  const c = await one('SELECT * FROM email_campaigns WHERE id = ?', [id]);
  if (!c) throw new HttpError(404, 'Campaign not found');
  return c;
}

const withAudience = (c) => ({ ...c, audience: JSON.parse(c.audience || '{}') });

// ------------------------------------------------------------------ audience & preview
router.get('/sources', (req, res) => res.json(Object.entries(C.SOURCES).map(([value, s]) => ({ value, label: s.label })).concat([{ value: 'custom', label: 'Paste a list' }])));

router.post(
  '/audience/preview',
  asyncHandler(async (req, res) => {
    const { recipients, bySource, excluded } = await C.buildAudience(req.body.audience || {});
    res.json({ total: recipients.length, by_source: bySource, excluded, sample: recipients.slice(0, 25) });
  })
);

router.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const s = await getSettings();
    const { subject = '', preheader = '', body = '', format = 'layout' } = req.body;
    const out = C.renderEmail(s, { subject, preheader, body, format }, C.SAMPLE);
    res.json({ subject: out.subject, html: out.html });
  })
);

router.post(
  '/test',
  asyncHandler(async (req, res) => {
    const s = await getSettings();
    const to = String(req.body.to || '').split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
    if (!to.length) throw new HttpError(400, 'Enter at least one email address');
    if (to.length > 5) throw new HttpError(400, 'Send a test to at most 5 addresses');
    const { subject = '', preheader = '', body = '', format = 'layout' } = req.body;
    if (!subject || !body) throw new HttpError(400, 'Subject and content are required');
    const errors = [];
    for (const email of to) {
      const mail = C.renderEmail(s, { subject, preheader, body, format }, { ...C.SAMPLE, email, name: req.user.name });
      const r = await sendEmail({ to: email, subject: `[Test] ${mail.subject}`, html: mail.html, text: mail.text, raw: true, refType: 'campaign_test', userId: req.user.id });
      if (!r.ok) errors.push(`${email}: ${r.error}`);
    }
    if (errors.length) throw new HttpError(400, errors.join('; '));
    res.json({ message: `Test email sent to ${to.join(', ')}` });
  })
);

// ------------------------------------------------------------------ campaigns
router.get(
  '/campaigns',
  asyncHandler(async (req, res) => {
    const { status, q } = req.query;
    const where = [];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (q) { where.push('(name LIKE ? OR subject LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    const rows = await query(`SELECT id, name, subject, status, scheduled_at, started_at, completed_at, last_error, created_at FROM email_campaigns ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT 200`, params);
    const stats = await C.campaignStats(rows.map((r) => r.id));
    res.json({ data: rows.map((r) => ({ ...r, stats: stats[r.id] || null })) });
  })
);

router.get(
  '/campaigns/:id',
  asyncHandler(async (req, res) => {
    const c = await getCampaign(req.params.id);
    const stats = (await C.campaignStats([c.id]))[c.id] || null;
    const s = await getSettings();
    res.json({ ...withAudience(c), stats, rate_per_minute: Number(s.campaign_rate_per_minute) || 20 });
  })
);

router.post(
  '/campaigns',
  asyncHandler(async (req, res) => {
    const data = contentFrom(req.body);
    if (!data.name || !data.subject || !data.body) throw new HttpError(400, 'Name, subject and content are required');
    const r = await query('INSERT INTO email_campaigns SET ?', [{ format: 'layout', audience: '{}', ...data, status: 'draft', created_by: req.user.id }]);
    res.status(201).json(withAudience(await getCampaign(r.insertId)));
  })
);

router.put(
  '/campaigns/:id',
  asyncHandler(async (req, res) => {
    const c = await getCampaign(req.params.id);
    if (!['draft', 'paused'].includes(c.status)) throw new HttpError(400, `A ${c.status} campaign cannot be edited. Pause or unschedule it first.`);
    const data = contentFrom(req.body);
    // recipients are fixed once a campaign has been launched
    if (c.status !== 'draft') delete data.audience;
    if (Object.keys(data).length) await query('UPDATE email_campaigns SET ? WHERE id = ?', [data, c.id]);
    res.json(withAudience(await getCampaign(c.id)));
  })
);

router.delete(
  '/campaigns/:id',
  asyncHandler(async (req, res) => {
    const c = await getCampaign(req.params.id);
    if (['sending', 'scheduled'].includes(c.status)) throw new HttpError(400, 'Pause or cancel the campaign before deleting it');
    await query('DELETE FROM email_campaigns WHERE id = ?', [c.id]);
    res.json({ message: 'Campaign deleted' });
  })
);

router.post(
  '/campaigns/:id/launch',
  asyncHandler(async (req, res) => {
    const c = await getCampaign(req.params.id);
    if (c.status !== 'draft') throw new HttpError(400, 'Only a draft campaign can be launched');
    const s = await getSettings(true);
    if (!s.smtp_host || !s.smtp_user) throw new HttpError(400, 'Email (SMTP) is not configured. Set it up in Settings › Email / SMS / WhatsApp.');
    let when = null;
    if (req.body.scheduled_at) {
      when = new Date(req.body.scheduled_at);
      if (Number.isNaN(when.getTime())) throw new HttpError(400, 'Invalid schedule time');
    }
    const count = await C.launchCampaign(c, when);
    if (!count) throw new HttpError(400, 'No recipients in this audience (after removing invalid, duplicate and unsubscribed addresses)');
    res.json({ message: when && when > new Date() ? `Scheduled for ${count} recipients` : `Sending to ${count} recipients`, count });
  })
);

router.post(
  '/campaigns/:id/pause',
  asyncHandler(async (req, res) => {
    const c = await getCampaign(req.params.id);
    if (!['scheduled', 'sending'].includes(c.status)) throw new HttpError(400, `Not possible while the campaign is ${c.status}`);
    await query("UPDATE email_campaigns SET status = 'paused' WHERE id = ?", [c.id]);
    res.json(withAudience(await getCampaign(c.id)));
  })
);

router.post(
  '/campaigns/:id/resume',
  asyncHandler(async (req, res) => {
    const c = await getCampaign(req.params.id);
    if (c.status !== 'paused') throw new HttpError(400, `Not possible while the campaign is ${c.status}`);
    // a campaign paused before its scheduled time goes back to waiting for it
    await query("UPDATE email_campaigns SET status = IF(started_at IS NULL, 'scheduled', 'sending'), last_error = NULL WHERE id = ?", [c.id]);
    setImmediate(() => C.processCampaigns().catch((e) => console.error('[campaigns]', e.message)));
    res.json(withAudience(await getCampaign(c.id)));
  })
);

router.post(
  '/campaigns/:id/unschedule',
  asyncHandler(async (req, res) => {
    const c = await getCampaign(req.params.id);
    if (c.status !== 'scheduled' || c.started_at) throw new HttpError(400, 'Only a scheduled campaign that has not started can be moved back to draft');
    await query('DELETE FROM email_campaign_recipients WHERE campaign_id = ?', [c.id]);
    await query("UPDATE email_campaigns SET status = 'draft', scheduled_at = NULL WHERE id = ?", [c.id]);
    res.json(withAudience(await getCampaign(c.id)));
  })
);

router.post(
  '/campaigns/:id/cancel',
  asyncHandler(async (req, res) => {
    const c = await getCampaign(req.params.id);
    if (!['scheduled', 'sending', 'paused'].includes(c.status)) throw new HttpError(400, `Not possible while the campaign is ${c.status}`);
    await query("UPDATE email_campaign_recipients SET status = 'skipped', error = 'Campaign cancelled' WHERE campaign_id = ? AND status = 'pending'", [c.id]);
    await query("UPDATE email_campaigns SET status = 'cancelled', completed_at = NOW() WHERE id = ?", [c.id]);
    res.json(withAudience(await getCampaign(c.id)));
  })
);

router.post(
  '/campaigns/:id/retry-failed',
  asyncHandler(async (req, res) => {
    const c = await getCampaign(req.params.id);
    if (!['sent', 'paused', 'sending'].includes(c.status)) throw new HttpError(400, `Not possible while the campaign is ${c.status}`);
    const r = await query("UPDATE email_campaign_recipients SET status = 'pending', error = NULL WHERE campaign_id = ? AND status = 'failed'", [c.id]);
    if (!r.affectedRows) throw new HttpError(400, 'No failed recipients to retry');
    await query("UPDATE email_campaigns SET status = 'sending', completed_at = NULL, last_error = NULL WHERE id = ?", [c.id]);
    setImmediate(() => C.processCampaigns().catch((e) => console.error('[campaigns]', e.message)));
    res.json({ message: `Retrying ${r.affectedRows} recipient(s)` });
  })
);

router.post(
  '/campaigns/:id/duplicate',
  asyncHandler(async (req, res) => {
    const c = await getCampaign(req.params.id);
    const r = await query('INSERT INTO email_campaigns SET ?', [{
      name: `${c.name} (copy)`, subject: c.subject, preheader: c.preheader, format: c.format, body: c.body, template_id: c.template_id,
      audience: c.audience, reply_to: c.reply_to, track_opens: c.track_opens, track_clicks: c.track_clicks, status: 'draft', created_by: req.user.id,
    }]);
    res.status(201).json(withAudience(await getCampaign(r.insertId)));
  })
);

router.get(
  '/campaigns/:id/recipients',
  asyncHandler(async (req, res) => {
    const { status, q, page = 1 } = req.query;
    const lim = Math.min(Number(req.query.limit) || 50, 200);
    const where = ['campaign_id = ?'];
    const params = [req.params.id];
    if (status === 'opened') where.push('opened_at IS NOT NULL');
    else if (status === 'clicked') where.push('clicked_at IS NOT NULL');
    else if (status === 'unsubscribed') where.push('unsubscribed_at IS NOT NULL');
    else if (status) { where.push('status = ?'); params.push(status); }
    if (q) { where.push('(email LIKE ? OR name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    const w = where.join(' AND ');
    const [{ total }] = await query(`SELECT COUNT(*) total FROM email_campaign_recipients WHERE ${w}`, params);
    const data = await query(
      `SELECT id, email, name, source, status, error, sent_at, opened_at, open_count, clicked_at, click_count, unsubscribed_at FROM email_campaign_recipients WHERE ${w} ORDER BY id LIMIT ? OFFSET ?`,
      [...params, lim, (Number(page) - 1) * lim]
    );
    res.json({ data, total, page: Number(page), limit: lim });
  })
);

// ------------------------------------------------------------------ unsubscribes
router.get(
  '/unsubscribes',
  asyncHandler(async (req, res) => {
    const q = req.query.q ? `%${req.query.q}%` : '%';
    const data = await query('SELECT u.*, c.name AS campaign_name FROM email_unsubscribes u LEFT JOIN email_campaigns c ON c.id = u.campaign_id WHERE u.email LIKE ? ORDER BY u.created_at DESC LIMIT 500', [q]);
    res.json({ data });
  })
);

router.post(
  '/unsubscribes',
  asyncHandler(async (req, res) => {
    const list = String(req.body.emails || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^\S+@\S+\.\S+$/.test(e));
    if (!list.length) throw new HttpError(400, 'Enter at least one email address');
    await query('INSERT IGNORE INTO email_unsubscribes (email) VALUES ?', [list.map((e) => [e])]);
    res.json({ message: `${list.length} address(es) added to the do-not-email list` });
  })
);

router.delete(
  '/unsubscribes/:email',
  asyncHandler(async (req, res) => {
    await query('DELETE FROM email_unsubscribes WHERE email = ?', [req.params.email.toLowerCase()]);
    res.json({ message: 'Removed from the do-not-email list' });
  })
);

// ====================================================================== public endpoints
const publicRouter = express.Router();
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

publicRouter.get('/o/:token.gif', (req, res) => {
  C.trackOpen(req.params.token).catch(() => {});
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' }).send(PIXEL);
});

publicRouter.get(
  '/c/:token',
  asyncHandler(async (req, res) => {
    const url = String(req.query.u || '');
    // only follow links we signed – never act as an open redirect
    if (!/^https?:\/\//i.test(url) || !C.verifyLink(req.params.token, url, req.query.s)) throw new HttpError(400, 'Invalid link');
    C.trackClick(req.params.token).catch(() => {});
    res.redirect(302, url);
  })
);

async function unsubscribePage(res, title, message, form = '') {
  const s = await getSettings();
  const e = C.escapeHtml;
  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><meta name="robots" content="noindex"></head>
<body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<div style="max-width:460px;margin:60px auto;padding:0 16px"><div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.08)">
<div style="background:#0b1b33;color:#fff;padding:18px 24px;border-bottom:4px solid #f7c41a;font-weight:700">${e(s.company_name || s.site_name || '')}</div>
<div style="padding:26px 24px"><h1 style="font-size:20px;margin:0 0 10px">${e(title)}</h1><p style="margin:0 0 18px;line-height:1.6;color:#475569">${message}</p>${form}</div></div>
${s.site_url ? `<p style="text-align:center;font-size:13px"><a href="${e(s.site_url)}" style="color:#1d6fb8">${e(s.site_url.replace(/^https?:\/\//, ''))}</a></p>` : ''}</div></body></html>`);
}

publicRouter.get(
  '/u/:token',
  asyncHandler(async (req, res) => {
    const r = await C.recipientByToken(req.params.token);
    if (!r) return unsubscribePage(res.status(404), 'Link not valid', 'This unsubscribe link is invalid or has expired.');
    const done = await one('SELECT 1 FROM email_unsubscribes WHERE email = ?', [r.email.toLowerCase()]);
    if (done) return unsubscribePage(res, 'You are unsubscribed', `<b>${C.escapeHtml(r.email)}</b> will not receive marketing emails from us.`);
    // confirmation button so mail scanners that pre-fetch links don't unsubscribe people
    return unsubscribePage(res, 'Unsubscribe', `Stop marketing emails to <b>${C.escapeHtml(r.email)}</b>?`,
      '<form method="post"><button style="background:#1d6fb8;color:#fff;border:0;border-radius:8px;padding:11px 20px;font-size:15px;cursor:pointer">Unsubscribe</button></form>');
  })
);

// Form button and RFC 8058 one-click (List-Unsubscribe-Post) both land here
publicRouter.post(
  '/u/:token',
  asyncHandler(async (req, res) => {
    const r = await C.recipientByToken(req.params.token);
    if (!r) return unsubscribePage(res.status(404), 'Link not valid', 'This unsubscribe link is invalid or has expired.');
    await C.unsubscribe(r);
    return unsubscribePage(res, 'You are unsubscribed', `<b>${C.escapeHtml(r.email)}</b> has been removed from our mailing list. Sorry to see you go!`);
  })
);

module.exports = { router, publicRouter };
