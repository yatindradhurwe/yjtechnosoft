/**
 * Reset (or create) an administrator login.
 *   npm run reset-admin                              -> uses ADMIN_EMAIL / ADMIN_PASSWORD from server/.env
 *   npm run reset-admin -- you@example.com NewPass123
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const { dbSettings } = require('../src/config/dbSettings');
const { resetAdmin } = require('./seed');

(async () => {
  const [email, password] = process.argv.slice(2);
  if (password && password.length < 8) throw new Error('Password must be at least 8 characters');
  const conn = await mysql.createConnection(dbSettings());
  try {
    const q = async (sql, params) => (await conn.query(sql, params))[0];
    const r = await resetAdmin(q, { email, password });
    console.log(`✔ Admin ${r.created ? 'created' : 'updated'} – login with ${r.email} / ${r.password}`);
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error(`✖ ${e.message}`);
  process.exit(1);
});
