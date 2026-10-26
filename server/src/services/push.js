/**
 * In-app notifications + Web Push (works on Chrome, Edge, Firefox, Android and
 * installed iOS web apps) + FCM for the Flutter employee app.
 * VAPID keys are generated once and kept in settings.
 */
const webpush = require('web-push');
const { query } = require('../config/db');
const { getSettings, setSettings } = require('../utils/settings');
const { sendFcm } = require('./fcm');

let configuredKey = null;

async function vapidKeys() {
  const s = await getSettings();
  if (s.vapid_public_key && s.vapid_private_key) return { publicKey: s.vapid_public_key, privateKey: s.vapid_private_key };
  const keys = webpush.generateVAPIDKeys();
  await setSettings({ vapid_public_key: keys.publicKey, vapid_private_key: keys.privateKey });
  return keys;
}

async function ensureConfigured() {
  const keys = await vapidKeys();
  if (configuredKey !== keys.publicKey) {
    const s = await getSettings();
    webpush.setVapidDetails(`mailto:${s.email || 'admin@example.com'}`, keys.publicKey, keys.privateKey);
    configuredKey = keys.publicKey;
  }
  return keys;
}

async function sendPush(userIds, payload) {
  const result = { sent: 0, failed: 0, devices: 0 };
  if (!userIds.length) return result;
  await ensureConfigured();
  const subs = await query('SELECT * FROM push_subscriptions WHERE user_id IN (?)', [userIds]);
  result.devices = subs.length;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
        result.sent += 1;
      } catch (e) {
        result.failed += 1;
        // subscription expired or revoked
        if (e.statusCode === 404 || e.statusCode === 410) await query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
        else console.error('[push]', e.statusCode || '', e.message);
      }
    })
  );
  return result;
}

/**
 * Notify users in-app + by web push + on the mobile app.
 * notification: { title, body, link, type, data? }  (data: extra string fields for the app, e.g. { task_id })
 * Returns { web, mobile } delivery counts.
 */
async function notifyUsers(userIds, notification) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(Number))];
  if (!ids.length) return null;
  const { title, body = '', link = '/admin', type = 'general', data = {} } = notification;
  try {
    const r = await query('INSERT INTO notifications (user_id, type, title, body, link) VALUES ?', [ids.map((id) => [id, type, title, String(body).slice(0, 495), link])]);
    // a multi-row insert gets consecutive ids, in the order of the rows
    const notificationIds = Object.fromEntries(ids.map((id, i) => [id, r.insertId + i]));
    const unread = await query('SELECT user_id, COUNT(*) AS c FROM notifications WHERE user_id IN (?) AND is_read = 0 GROUP BY user_id', [ids]);
    const badges = Object.fromEntries(unread.map((u) => [u.user_id, u.c]));
    const [web, mobile] = await Promise.all([
      sendPush(ids, { title, body, link, type, tag: `${type}-${Date.now()}` }).catch((e) => (console.error('[push]', e.message), null)),
      sendFcm(ids, { title, body, link, type, data, ids: notificationIds, badges }).catch((e) => (console.error('[fcm]', e.message), null)),
    ]);
    return { web, mobile };
  } catch (e) {
    console.error('[notify]', e.message);
    return null;
  }
}

/** Notify every active user having one of the roles (admin always included) */
async function notifyRoles(roles, notification, { excludeUserId } = {}) {
  const rows = await query("SELECT id FROM users WHERE status = 'active' AND role IN (?)", [[...new Set(['admin', ...roles])]]);
  return notifyUsers(rows.map((r) => r.id).filter((id) => id !== excludeUserId), notification);
}

/** Notify the login linked to an employee */
async function notifyEmployee(employeeId, notification) {
  if (!employeeId) return;
  const rows = await query("SELECT id FROM users WHERE employee_id = ? AND status = 'active'", [employeeId]);
  return notifyUsers(rows.map((r) => r.id), notification);
}

/** Notify the logins linked to several employees (one batch) */
async function notifyEmployees(employeeIds, notification) {
  const ids = [...new Set((employeeIds || []).filter(Boolean).map(Number))];
  if (!ids.length) return null;
  const rows = await query("SELECT id FROM users WHERE employee_id IN (?) AND status = 'active'", [ids]);
  return notifyUsers(rows.map((r) => r.id), notification);
}

async function notifyAll(notification, { excludeUserId } = {}) {
  const rows = await query("SELECT id FROM users WHERE status = 'active'");
  return notifyUsers(rows.map((r) => r.id).filter((id) => id !== excludeUserId), notification);
}

// fire-and-forget helpers so a push failure never breaks a request
const fire = (p) => Promise.resolve(p).catch((e) => console.error('[notify]', e.message));

module.exports = { vapidKeys, ensureConfigured, notifyUsers, notifyRoles, notifyEmployee, notifyEmployees, notifyAll, fire };
