/**
 * Scheduled jobs: server/domain renewal reminders, overdue invoice reminders,
 * birthday wishes. Runs daily at 09:30 server time.
 */
const cron = require('node-cron');
const { query } = require('../config/db');
const { getSettings } = require('../utils/settings');
const { sendEmail, sendWhatsApp, notifyAdmins } = require('./notify');
const { formatDate, formatMoney } = require('../utils/helpers');
const { sendDocument } = require('./documents');

async function serverReminders() {
  const s = await getSettings();
  if (s.server_reminders === '0') return;
  const days = String(s.server_reminder_days || '30,15,7,3,1,0').split(',').map((d) => Number(d.trim())).filter((d) => !Number.isNaN(d));
  const rows = await query(`SELECT sv.*, c.name AS client_name, c.email, c.phone, c.whatsapp, c.contact_person, DATEDIFF(sv.expiry_date, CURDATE()) AS days_left
    FROM client_servers sv JOIN clients c ON c.id = sv.client_id
    WHERE sv.status = 'active' AND sv.auto_reminder = 1 AND sv.expiry_date IS NOT NULL
      AND (sv.last_reminder_on IS NULL OR sv.last_reminder_on < CURDATE())`);
  const due = rows.filter((r) => days.includes(Number(r.days_left)));
  for (const r of due) {
    const what = `${r.name}${r.domain ? ` (${r.domain})` : ''}`;
    const msg = `Dear ${r.contact_person || r.client_name}, your ${String(r.type).replace('_', ' ')} service ${what} ${r.days_left > 0 ? `will expire in ${r.days_left} day(s) on ${formatDate(r.expiry_date)}` : 'expires today'}. Renewal amount: Rs. ${formatMoney(r.renewal_amount)}. Please renew to avoid service interruption. – ${s.company_name || ''}`;
    if (r.email) await sendEmail({ to: r.email, subject: `Renewal reminder: ${what}`, html: `<p>${msg}</p>`, refType: 'server', refId: r.id });
    if (s.server_reminder_whatsapp === '1' && (r.whatsapp || r.phone)) await sendWhatsApp({ to: r.whatsapp || r.phone, message: msg, refType: 'server', refId: r.id });
    await query('UPDATE client_servers SET last_reminder_on = CURDATE() WHERE id = ?', [r.id]);
  }
  if (due.length) {
    await notifyAdmins(
      `${due.length} service(s) expiring soon`,
      `<p>Renewal reminders were sent for:</p><ul>${due.map((r) => `<li>${r.client_name} – ${r.name} ${r.domain || ''} – ${formatDate(r.expiry_date)} (${r.days_left} days)</li>`).join('')}</ul>`
    );
  }
  await query("UPDATE client_servers SET status = 'expired' WHERE status = 'active' AND expiry_date < DATE_SUB(CURDATE(), INTERVAL 7 DAY)");
}

async function invoiceReminders() {
  await query("UPDATE invoices SET status = 'overdue' WHERE status = 'unpaid' AND due_date < CURDATE()");
  const s = await getSettings();
  if (s.invoice_reminders !== '1') return;
  const rows = await query("SELECT id FROM invoices WHERE status IN ('overdue','partial') AND due_date IS NOT NULL AND DATEDIFF(CURDATE(), due_date) IN (1, 7, 15, 30)");
  for (const r of rows) await sendDocument('invoice', r.id, ['email'], { subject: 'Payment reminder' });
}

async function birthdays() {
  const s = await getSettings();
  if (s.birthday_wishes === '0') return;
  const rows = await query("SELECT name, email FROM employees WHERE status = 'active' AND email IS NOT NULL AND DATE_FORMAT(dob,'%m-%d') = DATE_FORMAT(CURDATE(),'%m-%d')");
  for (const e of rows) {
    await sendEmail({ to: e.email, subject: `Happy Birthday, ${e.name.split(' ')[0]}! 🎉`, html: `<p>Dear ${e.name},</p><p>Wishing you a very happy birthday and a wonderful year ahead!</p><p>– Team ${s.company_name || ''}</p>`, refType: 'birthday' });
  }
}

async function runDaily() {
  for (const job of [serverReminders, invoiceReminders, birthdays]) {
    try {
      await job();
    } catch (e) {
      console.error(`[cron] ${job.name} failed:`, e.message);
    }
  }
}

function startCron() {
  cron.schedule('30 9 * * *', runDaily, { timezone: process.env.TZ || 'Asia/Kolkata' });
}

module.exports = { startCron, runDaily };
