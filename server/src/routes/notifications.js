const express = require('express');
const { query, one } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { vapidKeys, notifyUsers } = require('../services/push');

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

router.post(
  '/push/test',
  asyncHandler(async (req, res) => {
    const [{ c }] = await query('SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = ?', [req.user.id]);
    await notifyUsers([req.user.id], { title: 'Test notification 🔔', body: 'Push notifications are working on your device.', link: '/admin', type: 'test' });
    res.json({ message: c ? `Test sent to ${c} device(s)` : 'Saved in-app. Enable push on this device to receive it as a notification.' });
  })
);

module.exports = router;
