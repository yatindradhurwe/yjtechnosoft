/**
 * Unified Email / SMS / WhatsApp notification service.
 * All credentials come from the `settings` table (Admin > Settings > Integrations),
 * so nothing needs to be redeployed when providers change.
 */
const nodemailer = require('nodemailer');
const axios = require('axios');
const { query } = require('../config/db');
const { getSettings } = require('../utils/settings');
const { renderTemplate } = require('../utils/helpers');

async function log(channel, recipient, { subject, message, status, error, refType, refId, userId }) {
  try {
    await query(
      `INSERT INTO notification_logs (channel, recipient, subject, message, status, error, ref_type, ref_id, created_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [channel, String(recipient).slice(0, 250), subject || null, message || null, status, error || null, refType || null, refId || null, userId || null]
    );
  } catch (e) {
    console.error('notification log failed', e.message);
  }
}

/** Normalise an Indian / international number to digits with country code */
function normalisePhone(phone, defaultCc = '91') {
  if (!phone) return '';
  let p = String(phone).replace(/[^\d+]/g, '');
  if (p.startsWith('+')) return p.slice(1);
  if (p.startsWith('00')) return p.slice(2);
  p = p.replace(/^0+/, '');
  if (p.length === 10) return `${defaultCc}${p}`;
  return p;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------
function emailLayout(s, bodyHtml) {
  const site = s.site_url || process.env.APP_URL || '';
  const logo = s.logo ? (s.logo.startsWith('http') ? s.logo : `${process.env.API_URL || ''}${s.logo}`) : '';
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0"><tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#0b1b33;padding:20px 28px;border-bottom:4px solid #f7c41a">
      ${logo ? `<img src="${logo}" alt="${s.company_name || ''}" style="height:42px;background:#fff;border-radius:6px;padding:4px">` : ''}
      <div style="color:#fff;font-size:18px;font-weight:700;margin-top:6px">${s.company_name || 'YJTechnosoft'}</div>
    </td></tr>
    <tr><td style="padding:28px;font-size:15px;line-height:1.65">${bodyHtml}</td></tr>
    <tr><td style="background:#f8fafc;padding:18px 28px;font-size:12px;color:#64748b">
      ${s.company_name || ''} · ${s.address || ''}<br>
      ${s.phone || ''} · ${s.email || ''} ${site ? `· <a href="${site}" style="color:#1d6fb8">${site.replace(/^https?:\/\//, '')}</a>` : ''}
    </td></tr>
  </table></td></tr></table></body></html>`;
}

async function sendEmail({ to, subject, html, text, attachments = [], cc, refType, refId, userId, raw = false }) {
  const s = await getSettings();
  if (!to) return { ok: false, error: 'No recipient email' };
  if (!s.smtp_host || !s.smtp_user) {
    const error = 'SMTP is not configured (Admin > Settings > Integrations)';
    await log('email', to, { subject, message: text || html, status: 'skipped', error, refType, refId, userId });
    return { ok: false, error };
  }
  try {
    const port = Number(s.smtp_port || 587);
    const transporter = nodemailer.createTransport({
      host: s.smtp_host,
      port,
      secure: s.smtp_secure === '1' || port === 465,
      auth: { user: s.smtp_user, pass: s.smtp_pass },
    });
    await transporter.sendMail({
      from: `"${s.mail_from_name || s.company_name || 'YJTechnosoft'}" <${s.mail_from_email || s.smtp_user}>`,
      to,
      cc,
      subject,
      text,
      html: raw ? html : emailLayout(s, html || (text || '').replace(/\n/g, '<br>')),
      attachments,
    });
    await log('email', to, { subject, message: text || html, status: 'sent', refType, refId, userId });
    return { ok: true };
  } catch (e) {
    await log('email', to, { subject, message: text || html, status: 'failed', error: e.message, refType, refId, userId });
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// SMS
// ---------------------------------------------------------------------------
async function sendSMS({ to, message, refType, refId, userId }) {
  const s = await getSettings();
  const provider = s.sms_provider || 'none';
  const phone = normalisePhone(to);
  if (!phone) return { ok: false, error: 'No phone number' };
  if (provider === 'none') {
    const error = 'SMS provider is not configured';
    await log('sms', phone, { message, status: 'skipped', error, refType, refId, userId });
    return { ok: false, error };
  }
  try {
    if (provider === 'fast2sms') {
      await axios.post(
        'https://www.fast2sms.com/dev/bulkV2',
        { route: s.sms_route || 'q', message, language: 'english', flash: 0, numbers: phone.slice(-10), sender_id: s.sms_sender_id || undefined },
        { headers: { authorization: s.sms_api_key } }
      );
    } else if (provider === 'msg91') {
      await axios.post(
        'https://control.msg91.com/api/v5/flow/',
        { template_id: s.sms_template_id, short_url: '0', recipients: [{ mobiles: phone, message }] },
        { headers: { authkey: s.sms_api_key, 'content-type': 'application/json' } }
      );
    } else if (provider === 'twilio') {
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${s.twilio_sid}/Messages.json`,
        new URLSearchParams({ To: `+${phone}`, From: s.twilio_from, Body: message }),
        { auth: { username: s.twilio_sid, password: s.twilio_token } }
      );
    } else if (provider === 'custom') {
      // e.g. https://sms.example.com/api?key=XXX&to={{to10}}&sender=YJTECH&text={{message}}
      const url = renderTemplate(s.sms_custom_url, { to: phone, to10: phone.slice(-10), message: encodeURIComponent(message) });
      await axios.get(url);
    }
    await log('sms', phone, { message, status: 'sent', refType, refId, userId });
    return { ok: true };
  } catch (e) {
    const error = e.response ? JSON.stringify(e.response.data).slice(0, 500) : e.message;
    await log('sms', phone, { message, status: 'failed', error, refType, refId, userId });
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------
async function sendWhatsApp({ to, message, documentUrl, filename, refType, refId, userId }) {
  const s = await getSettings();
  const provider = s.whatsapp_provider || 'none';
  const phone = normalisePhone(to);
  if (!phone) return { ok: false, error: 'No WhatsApp number' };
  const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(message + (documentUrl ? `\n\n${documentUrl}` : ''))}`;
  if (provider === 'none') {
    const error = 'WhatsApp API not configured – use the click-to-chat link instead';
    await log('whatsapp', phone, { message, status: 'skipped', error, refType, refId, userId });
    return { ok: false, error, waLink };
  }
  try {
    if (provider === 'meta') {
      const url = `https://graph.facebook.com/v20.0/${s.whatsapp_phone_id}/messages`;
      const headers = { Authorization: `Bearer ${s.whatsapp_token}` };
      if (documentUrl) {
        await axios.post(
          url,
          { messaging_product: 'whatsapp', to: phone, type: 'document', document: { link: documentUrl, filename: filename || 'document.pdf', caption: message } },
          { headers }
        );
      } else {
        await axios.post(url, { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: message } }, { headers });
      }
    } else if (provider === 'twilio') {
      const params = new URLSearchParams({ To: `whatsapp:+${phone}`, From: `whatsapp:${s.twilio_whatsapp_from}`, Body: message });
      if (documentUrl) params.append('MediaUrl', documentUrl);
      await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${s.twilio_sid}/Messages.json`, params, {
        auth: { username: s.twilio_sid, password: s.twilio_token },
      });
    } else if (provider === 'custom') {
      // e.g. https://wa.example.com/send?apikey=XXX&number={{to}}&message={{message}}&media={{file}}
      const url = renderTemplate(s.whatsapp_custom_url, {
        to: phone,
        to10: phone.slice(-10),
        message: encodeURIComponent(message),
        file: encodeURIComponent(documentUrl || ''),
        filename: encodeURIComponent(filename || ''),
      });
      await axios.get(url);
    }
    await log('whatsapp', phone, { message, status: 'sent', refType, refId, userId });
    return { ok: true, waLink };
  } catch (e) {
    const error = e.response ? JSON.stringify(e.response.data).slice(0, 500) : e.message;
    await log('whatsapp', phone, { message, status: 'failed', error, refType, refId, userId });
    return { ok: false, error, waLink };
  }
}

/** Notify company admins (new enquiry, job application, leave request ...) */
async function notifyAdmins(subject, html) {
  const s = await getSettings();
  const list = (s.notify_admin_emails || s.email || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  if (!list.length) return;
  await sendEmail({ to: list.join(','), subject, html, refType: 'admin_alert' });
}

module.exports = { sendEmail, sendSMS, sendWhatsApp, notifyAdmins, normalisePhone };
