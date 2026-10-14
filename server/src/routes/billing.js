const express = require('express');
const { query, one, transaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { round2, toDateStr, pick } = require('../utils/helpers');
const { nextNumber } = require('../utils/numbering');
const { getSettings } = require('../utils/settings');
const { loadInvoice, loadQuotation } = require('../services/documents');
const { notifyRoles, fire } = require('../services/push');
const { formatMoney } = require('../utils/helpers');

const router = express.Router();
router.use(authenticate, authorize('accounts'));

function computeTotals(items = [], discount = 0) {
  const clean = items
    .filter((i) => i && String(i.description || '').trim())
    .map((i, idx) => {
      const quantity = Number(i.quantity) || 0;
      const rate = Number(i.rate) || 0;
      const tax_rate = Number(i.tax_rate) || 0;
      return {
        description: String(i.description).trim(),
        hsn_sac: i.hsn_sac || null,
        unit: i.unit || null,
        quantity,
        rate,
        tax_rate,
        amount: round2(quantity * rate),
        sort_order: idx,
      };
    });
  if (!clean.length) throw new HttpError(400, 'Add at least one line item');
  const subtotal = round2(clean.reduce((a, i) => a + i.amount, 0));
  const disc = Math.min(round2(discount), subtotal);
  // Discount is distributed proportionally before tax
  const ratio = subtotal ? (subtotal - disc) / subtotal : 1;
  const tax_total = round2(clean.reduce((a, i) => a + i.amount * ratio * (i.tax_rate / 100), 0));
  const total = round2(subtotal - disc + tax_total);
  return { items: clean, subtotal, discount: disc, tax_total, total };
}

function invoiceStatus(total, paid, due, current) {
  if (current === 'cancelled' || current === 'draft') return current;
  if (paid >= total && total > 0) return 'paid';
  if (paid > 0) return 'partial';
  if (due && due < toDateStr()) return 'overdue';
  return 'unpaid';
}

async function refreshInvoice(q, id) {
  const inv = (await q('SELECT * FROM invoices WHERE id = ?', [id]))[0];
  if (!inv) return;
  const [{ paid }] = await q('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE invoice_id = ?', [id]);
  const status = invoiceStatus(Number(inv.total), Number(paid), inv.due_date, inv.status);
  await q('UPDATE invoices SET amount_paid = ?, status = ? WHERE id = ?', [paid, status, id]);
}

// ============================================================ QUOTATIONS
router.get(
  '/quotations',
  asyncHandler(async (req, res) => {
    const { q, status, client_id, page = 1, limit = 20 } = req.query;
    const where = [];
    const params = [];
    if (q) { where.push('(qt.quote_no LIKE ? OR c.name LIKE ? OR qt.subject LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (status) { where.push('qt.status = ?'); params.push(status); }
    if (client_id) { where.push('qt.client_id = ?'); params.push(client_id); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 20, 200);
    const [{ total }] = await query(`SELECT COUNT(*) total FROM quotations qt JOIN clients c ON c.id = qt.client_id ${w}`, params);
    const data = await query(
      `SELECT qt.*, c.name AS client_name, c.phone AS client_phone, c.email AS client_email
       FROM quotations qt JOIN clients c ON c.id = qt.client_id ${w} ORDER BY qt.id DESC LIMIT ? OFFSET ?`,
      [...params, lim, (Number(page) - 1) * lim]
    );
    res.json({ data, total, page: Number(page), limit: lim });
  })
);

router.get('/quotations/next-number', asyncHandler(async (req, res) => res.json({ number: await nextNumber('quotation', req.query.date ? new Date(req.query.date) : new Date()) })));

router.get('/quotations/:id', asyncHandler(async (req, res) => res.json(await loadQuotation(req.params.id))));

async function saveQuotation(req, id) {
  const s = await getSettings();
  const b = req.body;
  if (!b.client_id) throw new HttpError(400, 'Select a client');
  const t = computeTotals(b.items, b.discount);
  const head = {
    client_id: b.client_id,
    quote_date: b.quote_date || toDateStr(),
    valid_until: b.valid_until || null,
    subject: b.subject || null,
    project_id: b.project_id || null,
    notes: b.notes || null,
    terms: b.terms ?? s.quotation_terms ?? null,
    subtotal: t.subtotal,
    discount: t.discount,
    tax_total: t.tax_total,
    total: t.total,
  };
  if (b.status && ['draft', 'sent', 'accepted', 'rejected'].includes(b.status)) head.status = b.status;
  return transaction(async (q) => {
    let qid = id;
    if (id) {
      if (b.quote_no) head.quote_no = b.quote_no;
      await q('UPDATE quotations SET ? WHERE id = ?', [head, id]);
      await q('DELETE FROM quotation_items WHERE quotation_id = ?', [id]);
    } else {
      head.quote_no = b.quote_no || (await nextNumber('quotation', new Date(head.quote_date), q));
      head.created_by = req.user.id;
      head.status = head.status || 'draft';
      qid = (await q('INSERT INTO quotations SET ?', [head])).insertId;
    }
    for (const it of t.items) await q('INSERT INTO quotation_items SET ?', [{ ...it, quotation_id: qid }]);
    return qid;
  });
}

router.post('/quotations', asyncHandler(async (req, res) => res.status(201).json(await loadQuotation(await saveQuotation(req)))));
router.put('/quotations/:id', asyncHandler(async (req, res) => res.json(await loadQuotation(await saveQuotation(req, req.params.id)))));

router.patch(
  '/quotations/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!['draft', 'sent', 'accepted', 'rejected'].includes(status)) throw new HttpError(400, 'Invalid status');
    await query('UPDATE quotations SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Status updated' });
  })
);

router.delete(
  '/quotations/:id',
  asyncHandler(async (req, res) => {
    await query('DELETE FROM quotations WHERE id = ?', [req.params.id]);
    res.json({ message: 'Quotation deleted' });
  })
);

router.post(
  '/quotations/:id/convert',
  asyncHandler(async (req, res) => {
    const qt = await loadQuotation(req.params.id);
    if (qt.invoice_id) throw new HttpError(400, 'Quotation already converted to an invoice');
    const s = await getSettings();
    const today = toDateStr();
    const due = new Date();
    due.setDate(due.getDate() + Number(s.invoice_due_days || 15));
    const invId = await transaction(async (q) => {
      const invoice_no = await nextNumber('invoice', new Date(), q);
      const r = await q('INSERT INTO invoices SET ?', [
        {
          invoice_no,
          client_id: qt.client_id,
          quotation_id: qt.id,
          project_id: qt.project_id || null,
          invoice_date: today,
          due_date: toDateStr(due),
          subject: qt.subject,
          subtotal: qt.subtotal,
          discount: qt.discount,
          tax_total: qt.tax_total,
          total: qt.total,
          notes: qt.notes,
          terms: s.invoice_terms || null,
          status: 'unpaid',
          created_by: req.user.id,
        },
      ]);
      for (const it of qt.items) {
        const { id, quotation_id, ...rest } = it;
        await q('INSERT INTO invoice_items SET ?', [{ ...rest, invoice_id: r.insertId }]);
      }
      await q("UPDATE quotations SET status = 'converted', invoice_id = ? WHERE id = ?", [r.insertId, qt.id]);
      return r.insertId;
    });
    res.json(await loadInvoice(invId));
  })
);

// ============================================================ INVOICES
router.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    // keep overdue status fresh
    await query("UPDATE invoices SET status = 'overdue' WHERE status IN ('unpaid') AND due_date < CURDATE()");
    const { q, status, client_id, from, to, page = 1, limit = 20 } = req.query;
    const where = [];
    const params = [];
    if (q) { where.push('(i.invoice_no LIKE ? OR c.name LIKE ? OR i.subject LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (status) { where.push('i.status = ?'); params.push(status); }
    if (client_id) { where.push('i.client_id = ?'); params.push(client_id); }
    if (from) { where.push('i.invoice_date >= ?'); params.push(from); }
    if (to) { where.push('i.invoice_date <= ?'); params.push(to); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 20, 500);
    const [summary] = await query(
      `SELECT COUNT(*) total, COALESCE(SUM(i.total),0) amount, COALESCE(SUM(i.amount_paid),0) paid
       FROM invoices i JOIN clients c ON c.id = i.client_id ${w}`,
      params
    );
    const data = await query(
      `SELECT i.*, c.name AS client_name, c.phone AS client_phone, c.email AS client_email
       FROM invoices i JOIN clients c ON c.id = i.client_id ${w} ORDER BY i.id DESC LIMIT ? OFFSET ?`,
      [...params, lim, (Number(page) - 1) * lim]
    );
    res.json({ data, total: summary.total, summary, page: Number(page), limit: lim });
  })
);

router.get('/invoices/next-number', asyncHandler(async (req, res) => res.json({ number: await nextNumber('invoice', req.query.date ? new Date(req.query.date) : new Date()) })));

router.get('/invoices/:id', asyncHandler(async (req, res) => res.json(await loadInvoice(req.params.id))));

async function saveInvoice(req, id) {
  const s = await getSettings();
  const b = req.body;
  if (!b.client_id) throw new HttpError(400, 'Select a client');
  const t = computeTotals(b.items, b.discount);
  const head = {
    client_id: b.client_id,
    invoice_date: b.invoice_date || toDateStr(),
    due_date: b.due_date || null,
    subject: b.subject || null,
    project_id: b.project_id || null,
    notes: b.notes || null,
    terms: b.terms ?? s.invoice_terms ?? null,
    server_id: b.server_id || null,
    subtotal: t.subtotal,
    discount: t.discount,
    tax_total: t.tax_total,
    total: t.total,
  };
  if (b.status && ['draft', 'cancelled', 'unpaid'].includes(b.status)) head.status = b.status;
  return transaction(async (q) => {
    let iid = id;
    if (id) {
      if (b.invoice_no) head.invoice_no = b.invoice_no;
      await q('UPDATE invoices SET ? WHERE id = ?', [head, id]);
      await q('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);
    } else {
      head.invoice_no = b.invoice_no || (await nextNumber('invoice', new Date(head.invoice_date), q));
      head.created_by = req.user.id;
      head.status = head.status || 'unpaid';
      iid = (await q('INSERT INTO invoices SET ?', [head])).insertId;
    }
    for (const it of t.items) await q('INSERT INTO invoice_items SET ?', [{ ...it, invoice_id: iid }]);
    await refreshInvoice(q, iid);
    return iid;
  });
}

router.post('/invoices', asyncHandler(async (req, res) => res.status(201).json(await loadInvoice(await saveInvoice(req)))));
router.put('/invoices/:id', asyncHandler(async (req, res) => res.json(await loadInvoice(await saveInvoice(req, req.params.id)))));

router.patch(
  '/invoices/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!['draft', 'unpaid', 'cancelled'].includes(status)) throw new HttpError(400, 'Invalid status');
    await transaction(async (q) => {
      await q('UPDATE invoices SET status = ? WHERE id = ?', [status, req.params.id]);
      await refreshInvoice(q, req.params.id);
    });
    res.json(await loadInvoice(req.params.id));
  })
);

router.delete(
  '/invoices/:id',
  asyncHandler(async (req, res) => {
    await query("UPDATE quotations SET invoice_id = NULL, status = 'accepted' WHERE invoice_id = ?", [req.params.id]);
    await query('DELETE FROM invoices WHERE id = ?', [req.params.id]);
    res.json({ message: 'Invoice deleted' });
  })
);

// ============================================================ PAYMENTS
router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const { q, from, to, mode, page = 1, limit = 20 } = req.query;
    const where = [];
    const params = [];
    if (q) { where.push('(p.receipt_no LIKE ? OR i.invoice_no LIKE ? OR c.name LIKE ? OR p.reference LIKE ?)'); params.push(...Array(4).fill(`%${q}%`)); }
    if (from) { where.push('p.payment_date >= ?'); params.push(from); }
    if (to) { where.push('p.payment_date <= ?'); params.push(to); }
    if (mode) { where.push('p.mode = ?'); params.push(mode); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 20, 500);
    const [summary] = await query(
      `SELECT COUNT(*) total, COALESCE(SUM(p.amount),0) amount FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN clients c ON c.id = p.client_id ${w}`,
      params
    );
    const data = await query(
      `SELECT p.*, i.invoice_no, c.name AS client_name FROM payments p
       JOIN invoices i ON i.id = p.invoice_id JOIN clients c ON c.id = p.client_id ${w}
       ORDER BY p.payment_date DESC, p.id DESC LIMIT ? OFFSET ?`,
      [...params, lim, (Number(page) - 1) * lim]
    );
    res.json({ data, total: summary.total, summary, page: Number(page), limit: lim });
  })
);

router.post(
  '/invoices/:id/payments',
  asyncHandler(async (req, res) => {
    const inv = await one('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!inv) throw new HttpError(404, 'Invoice not found');
    const amount = round2(req.body.amount);
    if (amount <= 0) throw new HttpError(400, 'Enter a valid amount');
    const data = pick(req.body, ['payment_date', 'mode', 'reference', 'notes']);
    const pid = await transaction(async (q) => {
      const receipt_no = await nextNumber('receipt', new Date(data.payment_date || Date.now()), q);
      const r = await q('INSERT INTO payments SET ?', [
        { ...data, receipt_no, amount, payment_date: data.payment_date || toDateStr(), invoice_id: inv.id, client_id: inv.client_id, created_by: req.user.id },
      ]);
      await refreshInvoice(q, inv.id);
      return r.insertId;
    });
    const updated = await loadInvoice(inv.id);
    fire(notifyRoles(['accounts'], {
      title: `💰 Payment received – Rs. ${formatMoney(amount)}`,
      body: `${updated.client.name} · ${updated.invoice_no} (${updated.status})`,
      link: `/admin/invoices/${inv.id}`,
      type: 'payment',
    }, { excludeUserId: req.user.id }));
    res.status(201).json({ id: pid, invoice: updated });
  })
);

router.delete(
  '/payments/:id',
  asyncHandler(async (req, res) => {
    const p = await one('SELECT * FROM payments WHERE id = ?', [req.params.id]);
    if (!p) throw new HttpError(404, 'Payment not found');
    await transaction(async (q) => {
      await q('DELETE FROM payments WHERE id = ?', [p.id]);
      await refreshInvoice(q, p.invoice_id);
    });
    res.json({ message: 'Payment deleted' });
  })
);

// ============================================================ SERVER RENEWALS
router.post(
  '/servers/:id/renew-invoice',
  asyncHandler(async (req, res) => {
    const sv = await one('SELECT * FROM client_servers WHERE id = ?', [req.params.id]);
    if (!sv) throw new HttpError(404, 'Server not found');
    const s = await getSettings();
    const typeLabel = String(sv.type).replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const cycle = String(sv.billing_cycle).replace('_', ' ');
    const due = sv.expiry_date || toDateStr();
    const body = {
      client_id: sv.client_id,
      invoice_date: toDateStr(),
      due_date: due,
      subject: `Renewal – ${sv.name}${sv.domain ? ` (${sv.domain})` : ''}`,
      server_id: sv.id,
      items: [
        {
          description: `${typeLabel} renewal – ${sv.name}${sv.domain ? ` (${sv.domain})` : ''}${sv.plan ? `, Plan: ${sv.plan}` : ''} – ${cycle}`,
          hsn_sac: '998315',
          quantity: 1,
          rate: sv.renewal_amount,
          tax_rate: sv.tax_rate,
        },
      ],
      terms: s.invoice_terms,
    };
    const id = await saveInvoice({ body, user: req.user });
    res.status(201).json(await loadInvoice(id));
  })
);

router.post(
  '/servers/:id/mark-renewed',
  asyncHandler(async (req, res) => {
    const sv = await one('SELECT * FROM client_servers WHERE id = ?', [req.params.id]);
    if (!sv) throw new HttpError(404, 'Server not found');
    const months = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12, biennial: 24, one_time: 0 }[sv.billing_cycle] || 12;
    await query(
      "UPDATE client_servers SET expiry_date = DATE_ADD(COALESCE(expiry_date, CURDATE()), INTERVAL ? MONTH), status = 'active', last_reminder_on = NULL WHERE id = ?",
      [months, sv.id]
    );
    res.json(await one('SELECT * FROM client_servers WHERE id = ?', [sv.id]));
  })
);

module.exports = router;
module.exports.computeTotals = computeTotals;
