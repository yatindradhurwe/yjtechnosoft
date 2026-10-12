const express = require('express');
const { query, one } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { toDateStr, formatDate, formatMoney, amountInWords, renderTemplate, pick } = require('../utils/helpers');
const { nextNumber } = require('../utils/numbering');
const { getSettings } = require('../utils/settings');

const router = express.Router();
router.use(authenticate, authorize('accounts'));

const LIST_SELECT = `k.id, k.contract_no, k.type, k.title, k.client_id, k.project_id, k.party_name, k.party_email, k.party_phone,
  k.agreement_date, k.start_date, k.end_date, k.contract_value, k.status, k.accepted_by, k.accepted_at, k.signed_file, k.created_at,
  c.name AS client_name, p.name AS project_name, DATEDIFF(k.end_date, CURDATE()) AS days_left`;

/** Values available as {{placeholders}} in contract templates */
async function placeholderData({ client_id, project_id }) {
  const s = await getSettings();
  const data = {
    company: s.company_name || 'YJTECHNOSOFT PRIVATE LIMITED',
    company_address: s.address || '',
    company_phone: s.phone || '',
    company_email: s.email || '',
    company_gstin: s.gstin || '',
    company_cin: s.cin || '',
    signatory: s.signatory_name || 'Authorised Signatory',
    signatory_designation: s.signatory_designation || 'Director',
    jurisdiction: s.city || 'Kawardha, Chhattisgarh',
    agreement_date: formatDate(toDateStr(), 'long'),
  };
  let client = null;
  if (project_id) {
    const p = await one('SELECT * FROM projects WHERE id = ?', [project_id]);
    if (p) {
      Object.assign(data, {
        project_name: p.name,
        project_description: p.description || '',
        start_date: formatDate(p.start_date, 'long'),
        end_date: formatDate(p.deadline, 'long'),
        contract_value: p.budget ? formatMoney(p.budget, 0) : '',
        contract_value_words: p.budget ? amountInWords(p.budget) : '',
      });
      if (!client_id && p.client_id) client_id = p.client_id;
    }
  }
  if (client_id) client = await one('SELECT * FROM clients WHERE id = ?', [client_id]);
  if (client) {
    Object.assign(data, {
      client_name: client.name,
      contact_person: client.contact_person || '',
      client_address: [client.address, client.city, client.state, client.pincode].filter(Boolean).join(', '),
      client_email: client.email || '',
      client_phone: client.phone || '',
      client_gstin: client.gstin || '',
    });
  }
  return { data, client };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, status, client_id, project_id, type } = req.query;
    const where = [];
    const params = [];
    if (q) { where.push('(k.contract_no LIKE ? OR k.title LIKE ? OR k.party_name LIKE ?)'); params.push(...Array(3).fill(`%${q}%`)); }
    if (status) { where.push('k.status = ?'); params.push(status); }
    if (client_id) { where.push('k.client_id = ?'); params.push(client_id); }
    if (project_id) { where.push('k.project_id = ?'); params.push(project_id); }
    if (type) { where.push('k.type = ?'); params.push(type); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    // auto-expire finished agreements
    await query("UPDATE contracts SET status = 'expired' WHERE status IN ('signed','active','accepted') AND end_date IS NOT NULL AND end_date < CURDATE()");
    const data = await query(`SELECT ${LIST_SELECT} FROM contracts k LEFT JOIN clients c ON c.id = k.client_id LEFT JOIN projects p ON p.id = k.project_id ${w} ORDER BY k.id DESC LIMIT 500`, params);
    res.json({ data, total: data.length });
  })
);

router.get('/placeholders', asyncHandler(async (req, res) => res.json((await placeholderData(req.query)).data)));

router.post(
  '/render',
  asyncHandler(async (req, res) => {
    const tpl = req.body.template_id ? await one('SELECT * FROM contract_templates WHERE id = ?', [req.body.template_id]) : null;
    const { data: base } = await placeholderData(req.body);
    const extra = { ...(req.body.data || {}) };
    if (req.body.contract_value) {
      extra.contract_value = extra.contract_value || formatMoney(req.body.contract_value, 0);
      extra.contract_value_words = extra.contract_value_words || amountInWords(req.body.contract_value);
    }
    ['start_date', 'end_date', 'agreement_date'].forEach((k) => {
      if (req.body[k]) extra[k] = formatDate(req.body[k], 'long');
    });
    if (req.body.party_name) extra.client_name = req.body.party_name;
    const data = { ...base, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== '' && v !== null && v !== undefined)) };
    // anything still unknown becomes a blank line to fill in by hand
    const src = `${req.body.title || (tpl && tpl.title) || ''} ${req.body.body || (tpl && tpl.body) || ''}`;
    src.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => {
      if (data[k] === undefined || data[k] === null || data[k] === '') data[k] = '__________';
      return m;
    });
    res.json({
      title: renderTemplate(req.body.title || (tpl && tpl.title) || '', data),
      body: renderTemplate(req.body.body || (tpl && tpl.body) || '', data),
      data,
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const k = await one('SELECT k.*, c.name AS client_name, p.name AS project_name FROM contracts k LEFT JOIN clients c ON c.id = k.client_id LEFT JOIN projects p ON p.id = k.project_id WHERE k.id = ?', [req.params.id]);
    if (!k) throw new HttpError(404, 'Contract not found');
    k.data = k.data ? JSON.parse(k.data) : {};
    k.documents = await query('SELECT * FROM vault_documents WHERE contract_id = ? ORDER BY id DESC', [k.id]);
    res.json(k);
  })
);

const FIELDS = ['template_id', 'type', 'title', 'client_id', 'project_id', 'party_name', 'party_representative', 'party_address', 'party_email', 'party_phone',
  'agreement_date', 'start_date', 'end_date', 'contract_value', 'body', 'status', 'signed_file', 'notes'];

async function save(req, id) {
  const row = pick(req.body, FIELDS);
  if (!row.title || !row.party_name || !row.body) throw new HttpError(400, 'Title, party name and agreement text are required');
  row.agreement_date = row.agreement_date || toDateStr();
  row.contract_value = row.contract_value || 0;
  row.data = JSON.stringify(req.body.data || {});
  if (row.signed_file && (!row.status || ['draft', 'sent', 'accepted'].includes(row.status))) row.status = 'signed';
  if (id) {
    if (req.body.contract_no) row.contract_no = req.body.contract_no;
    await query('UPDATE contracts SET ? WHERE id = ?', [row, id]);
    return id;
  }
  row.contract_no = req.body.contract_no || (await nextNumber('contract', new Date(row.agreement_date)));
  row.created_by = req.user.id;
  row.status = row.status || 'draft';
  return (await query('INSERT INTO contracts SET ?', [row])).insertId;
}

router.post('/', asyncHandler(async (req, res) => res.status(201).json({ id: await save(req) })));
router.put('/:id', asyncHandler(async (req, res) => res.json({ id: await save(req, req.params.id) })));

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    if (!['draft', 'sent', 'accepted', 'signed', 'active', 'expired', 'terminated'].includes(req.body.status)) throw new HttpError(400, 'Invalid status');
    await query('UPDATE contracts SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    res.json({ message: 'Status updated' });
  })
);

// Renew: copy the agreement with a new period
router.post(
  '/:id/renew',
  asyncHandler(async (req, res) => {
    const k = await one('SELECT * FROM contracts WHERE id = ?', [req.params.id]);
    if (!k) throw new HttpError(404, 'Contract not found');
    const shift = (d, m) => {
      if (!d) return null;
      const x = new Date(`${String(d).slice(0, 10)}T00:00:00`);
      x.setMonth(x.getMonth() + m);
      return toDateStr(x);
    };
    const months = k.start_date && k.end_date
      ? Math.max(1, Math.round((new Date(k.end_date) - new Date(k.start_date)) / (30.44 * 86400000)))
      : 12;
    const start = k.end_date ? shift(k.end_date, 0) : toDateStr();
    const startDate = new Date(`${start}T00:00:00`);
    startDate.setDate(startDate.getDate() + 1);
    const newStart = toDateStr(startDate);
    const copy = {
      template_id: k.template_id, type: k.type, title: k.title, client_id: k.client_id, project_id: k.project_id, party_name: k.party_name,
      party_representative: k.party_representative, party_address: k.party_address, party_email: k.party_email, party_phone: k.party_phone,
      agreement_date: toDateStr(), start_date: newStart, end_date: shift(newStart, months), contract_value: k.contract_value,
      data: k.data, body: k.body, status: 'draft', notes: `Renewal of ${k.contract_no}`, created_by: req.user.id,
      contract_no: await nextNumber('contract', new Date()),
    };
    const r = await query('INSERT INTO contracts SET ?', [copy]);
    res.status(201).json({ id: r.insertId, message: `Renewal ${copy.contract_no} created as draft` });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await query('UPDATE vault_documents SET contract_id = NULL WHERE contract_id = ?', [req.params.id]);
    await query('DELETE FROM contracts WHERE id = ?', [req.params.id]);
    res.json({ message: 'Contract deleted' });
  })
);

module.exports = router;
