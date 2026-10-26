/**
 * Bulk email campaigns: audience building, per-recipient rendering (placeholders,
 * open/click tracking, unsubscribe link + RFC 8058 one-click header) and a
 * rate-limited sender that runs every minute from cron.js.
 */
const crypto = require('crypto');
const { query } = require('../config/db');
const { getSettings } = require('../utils/settings');
const { renderTemplate, stripHtml } = require('../utils/helpers');
const { emailLayout, createMailTransport, mailFrom, smtpReady, notifyAdmins } = require('./notify');
const { notifyRoles } = require('./push');

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;
const SOURCES = {
  subscribers: { label: 'Newsletter subscribers', sql: "SELECT email, NULL AS name, NULL AS company, NULL AS phone FROM subscribers WHERE status = 'active'" },
  clients: { label: 'Clients', sql: "SELECT email, COALESCE(NULLIF(contact_person, ''), name) AS name, name AS company, COALESCE(whatsapp, phone) AS phone FROM clients WHERE status = 'active' AND email <> ''" },
  leads: { label: 'Leads / enquiries', sql: "SELECT email, name, company, phone FROM enquiries WHERE email <> ''" },
  employees: { label: 'Employees', sql: "SELECT email, name, NULL AS company, phone FROM employees WHERE status = 'active' AND email <> ''" },
  applicants: { label: 'Job applicants', sql: "SELECT email, name, NULL AS company, phone FROM job_applications WHERE email <> ''" },
};

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** "Rahul Sharma <rahul@x.com>", "rahul@x.com, Rahul", "Rahul,rahul@x.com" or just an email – one per line */
function parseCustomList(text = '') {
  return String(text)
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/[^\s@<>(),;:"']+@[^\s@<>(),;:"']+\.[a-z]{2,}/i);
      if (!m) return null;
      const name = line.replace(m[0], '').replace(/[<>"',;|\t]+/g, ' ').replace(/\s+/g, ' ').trim();
      return { email: m[0], name: name || null, company: null, phone: null };
    })
    .filter(Boolean);
}

/** Resolve an audience spec to a de-duplicated recipient list, minus unsubscribed addresses */
async function buildAudience(audience = {}) {
  const sources = (audience.sources || []).filter((k) => SOURCES[k] || k === 'custom');
  const bySource = {};
  const seen = new Map();
  for (const key of sources) {
    let rows;
    if (key === 'custom') rows = parseCustomList(audience.custom);
    else if (key === 'leads' && audience.lead_status?.length) rows = await query(`${SOURCES.leads.sql} AND status IN (?)`, [audience.lead_status]);
    else rows = await query(SOURCES[key].sql);
    bySource[key] = 0;
    for (const r of rows) {
      const email = String(r.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email) || seen.has(email)) continue;
      seen.set(email, { email, name: r.name || null, company: r.company || null, phone: r.phone || null, source: key });
      bySource[key] += 1;
    }
  }
  const all = [...seen.values()];
  const blocked = new Set();
  if (all.length) {
    const rows = await query(
      "SELECT email FROM email_unsubscribes UNION SELECT email FROM subscribers WHERE status = 'unsubscribed'"
    );
    rows.forEach((r) => blocked.add(String(r.email).toLowerCase()));
  }
  const recipients = all.filter((r) => !blocked.has(r.email));
  return { recipients, bySource, excluded: all.length - recipients.length };
}

// ---------------------------------------------------------------------------- rendering
async function publicBase() {
  const s = await getSettings();
  return (s.api_public_url || process.env.API_URL || s.site_url || '').replace(/\/+$/, '');
}

const linkSig = (token, url) => crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-secret-change-me').update(`${token}|${url}`).digest('hex').slice(0, 16);
const verifyLink = (token, url, sig) => {
  const expected = linkSig(token, url);
  return typeof sig === 'string' && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
};

function variables(s, r, unsubscribeUrl) {
  const name = r.name || '';
  return {
    name: name || 'there',
    first_name: name.split(' ')[0] || 'there',
    email: r.email,
    company: r.company || '',
    phone: r.phone || '',
    company_name: s.company_name || '',
    site_name: s.site_name || s.company_name || '',
    site_url: s.site_url || '',
    our_phone: s.phone || '',
    our_email: s.email || '',
    year: new Date().getFullYear(),
    unsubscribe_url: unsubscribeUrl,
  };
}

/**
 * Render one email. `tracking` = { base, token, opens, clicks } for real sends;
 * omit it for previews and test sends.
 */
function renderEmail(s, content, recipient, tracking) {
  const unsubscribeUrl = tracking ? `${tracking.base}/api/public/mail/u/${tracking.token}` : '#unsubscribe';
  const vars = variables(s, recipient, unsubscribeUrl);
  const safe = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, k.endsWith('_url') ? v : escapeHtml(v)]));
  const subject = renderTemplate(content.subject, vars);
  const preheader = escapeHtml(renderTemplate(content.preheader || '', vars));
  let body = renderTemplate(content.body, safe);

  if (tracking?.clicks) {
    body = body.replace(/href=(["'])(https?:\/\/[^"']+)\1/gi, (m, q, url) => {
      const plain = url.replace(/&amp;/g, '&');
      if (plain === unsubscribeUrl) return m;
      return `href=${q}${tracking.base}/api/public/mail/c/${tracking.token}?u=${encodeURIComponent(plain)}&amp;s=${linkSig(tracking.token, plain)}${q}`;
    });
  }

  const unsubLine = `<br><span style="font-size:11px;color:#94a3b8">You received this email from ${escapeHtml(s.company_name || '')}. <a href="${unsubscribeUrl}" style="color:#64748b">Unsubscribe</a></span>`;
  let html;
  if (content.format === 'html') {
    html = /<html[\s>]/i.test(body) ? body : `<!doctype html><html><body>${body}</body></html>`;
    if (preheader) html = html.replace(/<body([^>]*)>/i, `<body$1><div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>`);
    // every campaign email must carry an unsubscribe link
    if (!html.includes(unsubscribeUrl)) html = html.replace(/<\/body>/i, `<div style="text-align:center;padding:12px;font-family:Arial,sans-serif">${unsubLine}</div></body>`);
  } else {
    html = emailLayout(s, body, { preheader, footerHtml: unsubLine });
  }
  if (tracking?.opens) html = html.replace(/<\/body>/i, `<img src="${tracking.base}/api/public/mail/o/${tracking.token}.gif" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px"></body>`);

  const text = `${stripHtml(body.replace(/<style[\s\S]*?<\/style>/gi, ''))}\n\n—\nUnsubscribe: ${unsubscribeUrl}`;
  return { subject, html, text, unsubscribeUrl };
}

const SAMPLE = { email: 'rahul.sharma@example.com', name: 'Rahul Sharma', company: 'Sharma Traders', phone: '9876543210' };

// ---------------------------------------------------------------------------- launching
async function launchCampaign(campaign, scheduledAt) {
  const audience = JSON.parse(campaign.audience || '{}');
  const { recipients } = await buildAudience(audience);
  if (!recipients.length) return 0;
  await query('DELETE FROM email_campaign_recipients WHERE campaign_id = ?', [campaign.id]);
  for (let i = 0; i < recipients.length; i += 500) {
    const chunk = recipients.slice(i, i + 500).map((r) => [
      campaign.id, r.email, r.name, r.source, JSON.stringify({ company: r.company, phone: r.phone }), crypto.randomBytes(16).toString('hex'),
    ]);
    await query('INSERT IGNORE INTO email_campaign_recipients (campaign_id, email, name, source, data, token) VALUES ?', [chunk]);
  }
  await query("UPDATE email_campaigns SET status = 'scheduled', scheduled_at = ?, last_error = NULL WHERE id = ?", [scheduledAt || new Date(), campaign.id]);
  setImmediate(() => processCampaigns().catch((e) => console.error('[campaigns]', e.message)));
  return recipients.length;
}

async function campaignStats(ids) {
  if (!ids.length) return {};
  const rows = await query(
    `SELECT campaign_id, COUNT(*) total, SUM(status = 'sent') sent, SUM(status = 'failed') failed, SUM(status IN ('pending','sending')) pending,
       SUM(status = 'skipped') skipped, SUM(opened_at IS NOT NULL) opened, SUM(clicked_at IS NOT NULL) clicked, SUM(unsubscribed_at IS NOT NULL) unsubscribed
     FROM email_campaign_recipients WHERE campaign_id IN (?) GROUP BY campaign_id`,
    [ids]
  );
  const out = {};
  rows.forEach((r) => {
    out[r.campaign_id] = Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'campaign_id').map(([k, v]) => [k, Number(v) || 0]));
  });
  return out;
}

// ---------------------------------------------------------------------------- sender
// Connection / login problems stop the whole campaign instead of failing every recipient
const TRANSPORT_ERRORS = ['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED'];
let busy = false;

async function finishIfDone(c) {
  const [{ remaining }] = await query("SELECT COUNT(*) remaining FROM email_campaign_recipients WHERE campaign_id = ? AND status IN ('pending','sending')", [c.id]);
  if (Number(remaining)) return;
  const r = await query("UPDATE email_campaigns SET status = 'sent', completed_at = NOW() WHERE id = ? AND status = 'sending'", [c.id]);
  if (!r.affectedRows) return;
  const st = (await campaignStats([c.id]))[c.id] || {};
  await notifyRoles(['accounts'], { title: `📧 Campaign sent: ${c.name}`, body: `${st.sent || 0} delivered, ${st.failed || 0} failed`, link: `/admin/campaigns/${c.id}`, type: 'campaign' }).catch(() => {});
}

async function processCampaigns() {
  if (busy) return;
  busy = true;
  let transport;
  try {
    // rows claimed by a crashed/restarted process go back in the queue
    await query("UPDATE email_campaign_recipients SET status = 'pending', claimed_at = NULL WHERE status = 'sending' AND claimed_at < NOW() - INTERVAL 10 MINUTE");
    const due = await query("SELECT * FROM email_campaigns WHERE status IN ('scheduled','sending') AND (scheduled_at IS NULL OR scheduled_at <= NOW()) ORDER BY id");
    if (!due.length) return;
    const s = await getSettings(true);
    if (!smtpReady(s)) return;
    let budget = Math.max(1, Math.min(Number(s.campaign_rate_per_minute) || 20, 500));
    const base = await publicBase();
    transport = createMailTransport(s, { pool: true, maxConnections: 2 });
    const fromEmail = s.mail_from_email || s.smtp_user;

    for (const c of due) {
      if (budget <= 0) break;
      if (c.status === 'scheduled') await query("UPDATE email_campaigns SET status = 'sending', started_at = COALESCE(started_at, NOW()) WHERE id = ?", [c.id]);
      const blocked = new Set((await query('SELECT email FROM email_unsubscribes')).map((r) => r.email.toLowerCase()));
      const rows = await query("SELECT * FROM email_campaign_recipients WHERE campaign_id = ? AND status = 'pending' ORDER BY id LIMIT ?", [c.id, budget]);
      let stopped = false;
      for (const [i, r] of rows.entries()) {
        // honour a pause/cancel made while this batch is going out
        if (i && i % 10 === 0) {
          const [cur] = await query('SELECT status FROM email_campaigns WHERE id = ?', [c.id]);
          if (cur?.status !== 'sending') break;
        }
        const claim = await query("UPDATE email_campaign_recipients SET status = 'sending', claimed_at = NOW() WHERE id = ? AND status = 'pending'", [r.id]);
        if (!claim.affectedRows) continue;
        if (blocked.has(r.email.toLowerCase())) {
          await query("UPDATE email_campaign_recipients SET status = 'skipped', error = 'Unsubscribed' WHERE id = ?", [r.id]);
          continue;
        }
        budget -= 1;
        const data = { ...JSON.parse(r.data || '{}'), email: r.email, name: r.name };
        const mail = renderEmail(s, c, data, { base, token: r.token, opens: !!c.track_opens, clicks: !!c.track_clicks });
        try {
          await transport.sendMail({
            from: mailFrom(s),
            to: r.name ? { name: r.name, address: r.email } : r.email,
            replyTo: c.reply_to || s.campaign_reply_to || s.email || undefined,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            headers: {
              'List-Unsubscribe': `<${mail.unsubscribeUrl}>, <mailto:${fromEmail}?subject=unsubscribe>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              'X-Campaign-ID': String(c.id),
            },
          });
          await query("UPDATE email_campaign_recipients SET status = 'sent', sent_at = NOW(), error = NULL WHERE id = ?", [r.id]);
        } catch (e) {
          if (TRANSPORT_ERRORS.includes(e.code)) {
            await query("UPDATE email_campaign_recipients SET status = 'pending', claimed_at = NULL WHERE id = ?", [r.id]);
            await query("UPDATE email_campaigns SET status = 'paused', last_error = ? WHERE id = ?", [String(e.message).slice(0, 500), c.id]);
            await notifyAdmins(`Campaign paused: ${c.name}`, `<p>The campaign <b>${escapeHtml(c.name)}</b> was paused because the mail server returned an error:</p><p><code>${escapeHtml(e.message)}</code></p><p>Check Settings › Email / SMS / WhatsApp, then resume the campaign.</p>`).catch(() => {});
            stopped = true;
            break;
          }
          await query("UPDATE email_campaign_recipients SET status = 'failed', error = ? WHERE id = ?", [String(e.message).slice(0, 500), r.id]);
        }
      }
      if (stopped) break;
      await finishIfDone(c);
    }
  } finally {
    if (transport) transport.close();
    busy = false;
  }
}

// ---------------------------------------------------------------------------- tracking
async function recipientByToken(token) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  return (await query('SELECT * FROM email_campaign_recipients WHERE token = ?', [token]))[0] || null;
}

async function trackOpen(token) {
  await query('UPDATE email_campaign_recipients SET opened_at = COALESCE(opened_at, NOW()), open_count = open_count + 1 WHERE token = ?', [token]);
}

async function trackClick(token) {
  // a click proves the email was opened even when images are blocked
  await query('UPDATE email_campaign_recipients SET clicked_at = COALESCE(clicked_at, NOW()), click_count = click_count + 1, opened_at = COALESCE(opened_at, NOW()) WHERE token = ?', [token]);
}

async function unsubscribe(r) {
  await query('INSERT IGNORE INTO email_unsubscribes (email, campaign_id) VALUES (?, ?)', [r.email.toLowerCase(), r.campaign_id]);
  await query("UPDATE subscribers SET status = 'unsubscribed' WHERE email = ?", [r.email]);
  await query('UPDATE email_campaign_recipients SET unsubscribed_at = COALESCE(unsubscribed_at, NOW()) WHERE id = ?', [r.id]);
}

module.exports = {
  SOURCES, SAMPLE, buildAudience, renderEmail, launchCampaign, campaignStats, processCampaigns,
  recipientByToken, trackOpen, trackClick, unsubscribe, verifyLink, escapeHtml,
};
