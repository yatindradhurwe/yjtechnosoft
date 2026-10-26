/**
 * Firebase Cloud Messaging (HTTP v1) for the Flutter employee app.
 * The Firebase service-account JSON is pasted in Admin › Settings › Push notifications
 * (Firebase console › Project settings › Service accounts › Generate new private key).
 * Device tokens come from mobile_sessions.fcm_token (sent by the app at login / PUT /auth/device).
 */
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { getSettings } = require('../utils/settings');

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// notification type → screen the app should open when tapped
const SCREENS = {
  task: 'tasks', leave: 'leaves', report: 'reports', attendance: 'attendance', announcement: 'announcements',
  payslip: 'payslips', letter: 'letters', test: 'notifications',
};

let access = null; // { token, exp, email }

function serviceAccount(s) {
  if (!s.fcm_service_account) return null;
  try {
    const sa = JSON.parse(s.fcm_service_account);
    if (!sa.project_id || !sa.client_email || !sa.private_key) return null;
    return sa;
  } catch {
    return null;
  }
}

async function fcmReady() {
  return !!serviceAccount(await getSettings());
}

async function accessToken(sa) {
  if (access && access.email === sa.client_email && access.exp > Date.now() + 60000) return access.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }, sa.private_key, { algorithm: 'RS256' });
  const { data } = await axios.post(TOKEN_URL, new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }));
  access = { token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000, email: sa.client_email };
  return access.token;
}

// token no longer valid for this app – stop sending to it
function deadToken(e) {
  const err = e.response && e.response.data && e.response.data.error;
  if (!err) return false;
  const codes = (err.details || []).map((d) => d.errorCode);
  return err.status === 'NOT_FOUND' || codes.includes('UNREGISTERED') || codes.includes('SENDER_ID_MISMATCH')
    || (err.status === 'INVALID_ARGUMENT' && /registration token/i.test(err.message || ''));
}

/**
 * Send to every signed-in device of the users.
 * payload: { title, body, link, type, data?, ids?: { [userId]: notificationId }, badges?: { [userId]: unread } }
 * Returns { sent, failed, devices, errors[] }
 */
async function sendFcm(userIds, payload) {
  const result = { sent: 0, failed: 0, devices: 0, errors: [] };
  if (!userIds.length) return result;
  const sa = serviceAccount(await getSettings());
  if (!sa) return result;
  const rows = await query(
    `SELECT id, user_id, fcm_token FROM mobile_sessions
     WHERE user_id IN (?) AND fcm_token IS NOT NULL AND fcm_token <> '' AND revoked_at IS NULL AND expires_at > NOW()`,
    [userIds]
  );
  result.devices = rows.length;
  if (!rows.length) return result;
  let token;
  try {
    token = await accessToken(sa);
  } catch (e) {
    const msg = e.response ? JSON.stringify(e.response.data).slice(0, 300) : e.message;
    console.error('[fcm] auth', msg);
    return { ...result, failed: rows.length, errors: [`Firebase sign-in failed: ${msg}`] };
  }
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  const { title, body = '', link = '', type = 'general', data = {}, ids = {}, badges = {} } = payload;
  const send = async (row) => {
    // FCM data values must be strings
    const extra = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
    const message = {
      token: row.fcm_token,
      notification: { title, body: String(body).slice(0, 500) },
      data: { ...extra, type, link, screen: SCREENS[type] || 'notifications', notification_id: String(ids[row.user_id] || ''), click_action: 'FLUTTER_NOTIFICATION_CLICK' },
      android: { priority: 'HIGH', notification: { channel_id: 'default', sound: 'default', tag: type } },
      apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default', badge: Number(badges[row.user_id]) || 0 } } },
    };
    try {
      await axios.post(url, { message }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
      result.sent += 1;
    } catch (e) {
      result.failed += 1;
      if (deadToken(e)) {
        await query('UPDATE mobile_sessions SET fcm_token = NULL WHERE id = ?', [row.id]);
      } else {
        const msg = e.response ? JSON.stringify(e.response.data).slice(0, 300) : e.message;
        result.errors.push(msg);
        console.error('[fcm]', msg);
      }
    }
  };
  // a few at a time so a big announcement doesn't open hundreds of sockets
  for (let i = 0; i < rows.length; i += 20) await Promise.all(rows.slice(i, i + 20).map(send));
  return result;
}

module.exports = { sendFcm, fcmReady, SCREENS };
