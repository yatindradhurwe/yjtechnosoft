const mysql = require('mysql2/promise');

const { dbSettings } = require('./dbSettings');

const pool = mysql.createPool({
  ...dbSettings(),
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  decimalNumbers: true,
  charset: 'utf8mb4',
});

// Keep MySQL date functions (CURDATE, NOW) in the same timezone as the app
const DB_TZ = process.env.DB_TIMEZONE || '+05:30';
pool.on('connection', (conn) => {
  conn.query(`SET time_zone = '${DB_TZ.replace(/[^0-9:+-]/g, '')}'`);
});

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const q = async (sql, params = []) => (await conn.query(sql, params))[0];
    const result = await fn(q);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, one, transaction };
