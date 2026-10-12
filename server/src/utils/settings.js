const { query } = require('../config/db');
const { fixUrl } = require('../config/urls');

let cache = null;
let cacheAt = 0;
const TTL = 30 * 1000;

/** Keys that must never be sent to the public website */
const PRIVATE_KEYS = [
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure',
  'sms_provider', 'sms_api_key', 'sms_sender_id', 'sms_route', 'sms_custom_url', 'sms_template_id',
  'twilio_sid', 'twilio_token', 'twilio_from', 'twilio_whatsapp_from',
  'whatsapp_provider', 'whatsapp_token', 'whatsapp_phone_id', 'whatsapp_custom_url', 'whatsapp_template',
  'bank_account_holder', 'bank_account_number', 'bank_ifsc', 'bank_branch', 'bank_account_type', 'bank_name', 'upi_id',
  'office_ip_whitelist', 'notify_admin_emails', 'vapid_private_key',
];

async function getSettings(force = false) {
  if (!force && cache && Date.now() - cacheAt < TTL) return cache;
  const rows = await query('SELECT `key`, `value` FROM settings');
  const out = {};
  rows.forEach((r) => (out[r.key] = r.value));
  ['site_url', 'api_public_url'].forEach((k) => out[k] && (out[k] = fixUrl(out[k])));
  cache = out;
  cacheAt = Date.now();
  return out;
}

async function setSettings(obj) {
  const entries = Object.entries(obj);
  for (const [key, value] of entries) {
    await query(
      'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
      [key, value === null || value === undefined ? '' : String(value)]
    );
  }
  cache = null;
}

async function publicSettings() {
  const all = await getSettings();
  const out = {};
  Object.keys(all).forEach((k) => {
    if (!PRIVATE_KEYS.includes(k)) out[k] = all[k];
  });
  return out;
}

module.exports = { getSettings, setSettings, publicSettings, PRIVATE_KEYS };
