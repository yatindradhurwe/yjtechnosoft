const { one } = require('../config/db');
const { getSettings } = require('./settings');
const { financialYear } = require('./helpers');

/**
 * Generates the next document number, e.g. YJ/INV/2024-25/0011
 * kind: invoice | quotation | receipt | letter
 */
const CONFIG = {
  invoice: { table: 'invoices', column: 'invoice_no', key: 'invoice_prefix', def: 'YJ/INV' },
  quotation: { table: 'quotations', column: 'quote_no', key: 'quotation_prefix', def: 'YJ/QT' },
  receipt: { table: 'payments', column: 'receipt_no', key: 'receipt_prefix', def: 'YJ/RCPT' },
  letter: { table: 'letters', column: 'letter_no', key: 'letter_prefix', def: 'YJ/HR' },
  contract: { table: 'contracts', column: 'contract_no', key: 'contract_prefix', def: 'YJ/AGR' },
};

async function nextNumber(kind, date = new Date(), q = null) {
  const c = CONFIG[kind];
  const s = await getSettings();
  const prefix = `${(s[c.key] || c.def).replace(/\/+$/, '')}/${financialYear(date)}/`;
  const sql = `SELECT ${c.column} AS no FROM ${c.table} WHERE ${c.column} LIKE ? ORDER BY LENGTH(${c.column}) DESC, ${c.column} DESC LIMIT 1`;
  const row = q ? (await q(sql, [`${prefix}%`]))[0] : await one(sql, [`${prefix}%`]);
  let seq = 1;
  if (row && row.no) seq = (parseInt(String(row.no).slice(prefix.length), 10) || 0) + 1;
  const start = Number(s[`${kind}_start_number`] || 1);
  if (seq < start) seq = start;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

module.exports = { nextNumber };
