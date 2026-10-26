const express = require('express');
const { query, one } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { vapidKeys, notifyUsers } = require('../services/push');
const { fcmReady } = require('../services/fcm');

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const data = await query('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?', [req.user.id, limit]);
    const [{ unread }] = await query('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
    res.json({ data, unread });
  })
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ ok: true });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ ok: true });
  })
);

router.delete(
  '/clear',
  asyncHandler(async (req, res) => {
    await query('DELETE FROM notifications WHERE user_id = ? AND is_read = 1', [req.user.id]);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------- Web push
router.get('/push/public-key', asyncHandler(async (req, res) => res.json({ publicKey: (await vapidKeys()).publicKey })));

router.post(
  '/push/subscribe',
  asyncHandler(async (req, res) => {
    const { endpoint, keys } = req.body.subscription || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) throw new HttpError(400, 'Invalid subscription');
    const existing = await one('SELECT id FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
    if (existing) await query('UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ? WHERE id = ?', [req.user.id, keys.p256dh, keys.auth, existing.id]);
    else
      await query('INSERT INTO push_subscriptions SET ?', [
        { user_id: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: String(req.headers['user-agent'] || '').slice(0, 250) },
      ]);
    res.json({ message: 'Push notifications enabled on this device' });
  })
);

router.post(
  '/push/unsubscribe',
  asyncHandler(async (req, res) => {
    await query('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [req.body.endpoint || '', req.user.id]);
    res.json({ message: 'Push notifications disabled on this device' });
  })
);

/** Summarise where a notification went, e.g. "Sent to 1 browser and 2 phones" */
async function deliveryMessage(result) {
  const web = (result && result.web) || { sent: 0, devices: 0 };
  const mobile = (result && result.mobile) || { sent: 0, devices: 0, errors: [] };
  const parts = [];
  if (web.sent) parts.push(`${web.sent} browser${web.sent > 1 ? 's' : ''}`);
  if (mobile.sent) parts.push(`${mobile.sent} phone${mobile.sent > 1 ? 's' : ''}`);
  if (parts.length) return { ok: true, message: `Test sent to ${parts.join(' and ')}` };
  if (mobile.errors && mobile.errors.length) return { ok: false, message: `Mobile push failed: ${mobile.errors[0]}` };
  const hints = [];
  if (!web.devices) hints.push('enable push in the bell menu on a browser');
  if (!(await fcmReady())) hints.push('add the Firebase service account in Settings › Push notifications for the mobile app');
  else if (!mobile.devices) hints.push('sign in to the mobile app with notifications allowed');
  return { ok: false, message: `Saved in-app only. To get it as a push notification, ${hints.join(', or ')}.` };
}

router.post(
  '/push/test',
  asyncHandler(async (req, res) => {
    const result = await notifyUsers([req.user.id], { title: 'Test notification 🔔', body: 'Push notifications are working on your device.', link: '/admin', type: 'test' });
    res.json(await deliveryMessage(result));
  })
);

module.exports = router;
module.exports.deliveryMessage = deliveryMessage;
