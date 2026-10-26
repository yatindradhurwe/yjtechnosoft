const express = require('express');
const { query, one } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { getSettings, setSettings } = require('../utils/settings');
const { makeUploader, fileUrl } = require('../middleware/upload');
const { sendEmail, sendSMS, sendWhatsApp } = require('../services/notify');
const { notifyUsers } = require('../services/push');
const { deliveryMessage } = require('./notifications');

const router = express.Router();
router.use(authenticate);

router.get(
  '/settings',
  authorize('hr', 'accounts'),
  asyncHandler(async (req, res) => {
    const all = await getSettings(true);
    if (req.user.role !== 'admin') {
      ['smtp_pass', 'sms_api_key', 'twilio_token', 'whatsapp_token', 'fcm_service_account', 'vapid_private_key'].forEach((k) => delete all[k]);
    }
    res.json(all);
  })
);

router.put(
  '/settings',
  authorize(),
  asyncHandler(async (req, res) => {
    if (!req.body || typeof req.body !== 'object') throw new HttpError(400, 'Invalid settings');
    if (req.body.fcm_service_account) {
      let sa;
      try {
        sa = JSON.parse(req.body.fcm_service_account);
      } catch {
        throw new HttpError(400, 'Firebase service account must be the JSON file contents');
      }
      if (!sa.project_id || !sa.client_email || !sa.private_key) throw new HttpError(400, 'Firebase service account JSON is missing project_id, client_email or private_key');
    }
    await setSettings(req.body);
    res.json(await getSettings(true));
  })
);

router.post(
  '/settings/test/:channel',
  authorize(),
  asyncHandler(async (req, res) => {
    const { to } = req.body;
    if (!to) throw new HttpError(400, 'Recipient is required');
    const message = 'This is a test message from your YJTechnosoft admin panel. Integration is working!';
    if (req.params.channel === 'push') {
      const user = await one("SELECT id, name FROM users WHERE (email = ? OR phone = ?) AND status = 'active'", [to, to]);
      if (!user) throw new HttpError(404, 'No active user with that email / phone');
      const out = await deliveryMessage(await notifyUsers([user.id], { title: 'Test notification 🔔', body: message, link: '/admin', type: 'test' }));
      if (!out.ok) throw new HttpError(400, out.message.replace('Saved in-app only.', `Saved in ${user.name}'s in-app notifications only.`));
      return res.json({ message: `${out.message} (${user.name})` });
    }
    let result;
    if (req.params.channel === 'email') result = await sendEmail({ to, subject: 'Test email', html: `<p>${message}</p>`, refType: 'test', userId: req.user.id });
    else if (req.params.channel === 'sms') result = await sendSMS({ to, message, refType: 'test', userId: req.user.id });
    else if (req.params.channel === 'whatsapp') result = await sendWhatsApp({ to, message, refType: 'test', userId: req.user.id });
    else throw new HttpError(400, 'Unknown channel');
    // no WhatsApp API configured: hand back the click-to-chat link so the admin can still test the number
    if (!result.ok && result.waLink && (await getSettings()).whatsapp_provider === 'none') {
      return res.json({ message: 'No WhatsApp API is configured – opening WhatsApp click-to-chat instead', waLink: result.waLink });
    }
    if (!result.ok) throw new HttpError(400, result.error);
    res.json({ message: 'Test message sent successfully' });
  })
);

// ------------------------------------------------------------------ uploads
const FOLDERS = ['general', 'website', 'blog', 'team', 'portfolio', 'clients', 'employees', 'documents', 'receipts', 'settings', 'avatars', 'vault'];
router.post(
  '/upload',
  (req, res, next) => {
    const folder = FOLDERS.includes(req.query.folder) ? req.query.folder : 'general';
    req.uploadFolder = folder;
    makeUploader(folder).single('file')(req, res, next);
  },
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file uploaded');
    res.json({ url: fileUrl(req.uploadFolder, req.file), name: req.file.originalname, size: req.file.size });
  })
);

// ------------------------------------------------------------------ logs
router.get(
  '/notification-logs',
  authorize('hr', 'accounts'),
  asyncHandler(async (req, res) => {
    const { channel, status, page = 1, limit = 30, ref_type, ref_id } = req.query;
    const where = [];
    const params = [];
    if (channel) { where.push('channel = ?'); params.push(channel); }
    if (status) { where.push('status = ?'); params.push(status); }
    if (ref_type) { where.push('ref_type = ?'); params.push(ref_type); }
    if (ref_id) { where.push('ref_id = ?'); params.push(ref_id); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 30, 200);
    const [{ total }] = await query(`SELECT COUNT(*) total FROM notification_logs ${w}`, params);
    const data = await query(`SELECT * FROM notification_logs ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, lim, (Number(page) - 1) * lim]);
    res.json({ data, total, page: Number(page), limit: lim });
  })
);

// Send a free-form message to any recipient (used from client/employee/applicant pages)
router.post(
  '/send-message',
  authorize('hr', 'accounts'),
  asyncHandler(async (req, res) => {
    const { channels = [], email, phone, subject, message, ref_type, ref_id } = req.body;
    if (!message) throw new HttpError(400, 'Message is required');
    const results = {};
    if (channels.includes('email')) results.email = await sendEmail({ to: email, subject: subject || 'Message', html: String(message).replace(/\n/g, '<br>'), refType: ref_type, refId: ref_id, userId: req.user.id });
    if (channels.includes('sms')) results.sms = await sendSMS({ to: phone, message, refType: ref_type, refId: ref_id, userId: req.user.id });
    if (channels.includes('whatsapp')) results.whatsapp = await sendWhatsApp({ to: phone, message, refType: ref_type, refId: ref_id, userId: req.user.id });
    res.json({ results });
  })
);

module.exports = router;
