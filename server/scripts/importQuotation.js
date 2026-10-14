/**
 * Create a client (if missing) and a quotation from a JSON file, directly in
 * the database – no admin login needed. Run on the server:
 *
 *   npm run import-quotation -- path/to/quotation.json
 *
 * JSON shape (see scripts/quotation-example.json):
 *   { "client": { "name": "...", "email": "...", "phone": "...", "address": "..." },
 *     "quotation": { "quote_date": "2026-10-14", "valid_until": "2026-11-13", "subject": "...",
 *                    "items": [["Description", 50000], …] or [{ description, rate, quantity, tax_rate, hsn_sac, unit }],
 *                    "tax_rate": 18, "hsn_sac": "998314", "unit": "Lot", "notes": "...", "terms": "..." } }
 *
 * The quotation number is generated as in the admin panel. Running it twice creates two quotations.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { transaction, pool } = require('../src/config/db');
const { nextNumber } = require('../src/utils/numbering');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

(async () => {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npm run import-quotation -- path/to/quotation.json');
  const { client, quotation: q } = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (!client?.name || !q?.items?.length) throw new Error('The file needs client.name and quotation.items');

  const items = q.items.map((it, i) => {
    const o = Array.isArray(it) ? { description: it[0], rate: it[1] } : it;
    const quantity = Number(o.quantity ?? 1);
    const rate = round2(o.rate);
    return {
      description: String(o.description),
      hsn_sac: o.hsn_sac ?? q.hsn_sac ?? null,
      quantity,
      unit: o.unit ?? q.unit ?? null,
      rate,
      tax_rate: Number(o.tax_rate ?? q.tax_rate ?? 18),
      amount: round2(quantity * rate),
      sort_order: i,
    };
  });
  const subtotal = round2(items.reduce((a, i) => a + i.amount, 0));
  const tax_total = round2(items.reduce((a, i) => a + i.amount * (i.tax_rate / 100), 0));

  const result = await transaction(async (tx) => {
    let c = (await tx('SELECT id FROM clients WHERE name = ?', [client.name]))[0];
    if (!c) c = { id: (await tx('INSERT INTO clients SET ?', [{ status: 'active', ...client }])).insertId };
    const quoteDate = q.quote_date || new Date().toISOString().slice(0, 10);
    const head = {
      quote_no: q.quote_no || (await nextNumber('quotation', new Date(quoteDate), tx)),
      client_id: c.id,
      quote_date: quoteDate,
      valid_until: q.valid_until || null,
      subject: q.subject || null,
      notes: q.notes || null,
      terms: q.terms || null,
      status: q.status || 'draft',
      subtotal,
      discount: 0,
      tax_total,
      total: round2(subtotal + tax_total),
    };
    const id = (await tx('INSERT INTO quotations SET ?', [head])).insertId;
    for (const it of items) await tx('INSERT INTO quotation_items SET ?', [{ ...it, quotation_id: id }]);
    return { id, ...head };
  });
  console.log(`✔ ${result.quote_no} for ${client.name}: subtotal ${result.subtotal}, GST ${result.tax_total}, total ${result.total}`);
  console.log('  Open it in Admin › Quotations.');
  await pool.end();
})().catch(async (e) => {
  console.error(`✖ ${e.message}`);
  await pool.end().catch(() => {});
  process.exit(1);
});
