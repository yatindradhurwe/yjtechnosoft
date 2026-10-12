const express = require('express');
const { one, query } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { buildDocument, sendDocument, publicLink } = require('../services/documents');

const router = express.Router();
router.use(authenticate);

const TYPE_ROLES = {
  invoice: ['accounts'],
  quotation: ['accounts'],
  receipt: ['accounts'],
  letter: ['hr'],
  payslip: ['hr', 'accounts'],
};

async function checkAccess(user, type, id, mode = 'view') {
  if (!TYPE_ROLES[type]) throw new HttpError(400, 'Unknown document type');
  if (user.role === 'admin' || TYPE_ROLES[type].includes(user.role)) return;
  if (mode === 'view' && user.employee_id) {
    if (type === 'payslip' && (await one('SELECT id FROM payslips WHERE id = ? AND employee_id = ?', [id, user.employee_id]))) return;
    if (type === 'letter' && (await one("SELECT id FROM letters WHERE id = ? AND employee_id = ? AND status <> 'draft'", [id, user.employee_id]))) return;
  }
  throw new HttpError(403, 'You do not have access to this document');
}

router.get(
  '/:type/:id/pdf',
  asyncHandler(async (req, res) => {
    const { type, id } = req.params;
    await checkAccess(req.user, type, id);
    const doc = await buildDocument(type, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${doc.filename}"`);
    res.send(doc.buffer);
  })
);

router.get(
  '/:type/:id/link',
  asyncHandler(async (req, res) => {
    const { type, id } = req.params;
    await checkAccess(req.user, type, id, 'send');
    res.json({ link: await publicLink(type, id) });
  })
);

router.post(
  '/:type/:id/send',
  asyncHandler(async (req, res) => {
    const { type, id } = req.params;
    await checkAccess(req.user, type, id, 'send');
    const channels = Array.isArray(req.body.channels) ? req.body.channels : ['email'];
    if (!channels.length) throw new HttpError(400, 'Choose at least one channel');
    const out = await sendDocument(type, id, channels, req.body, req.user.id);
    const anyOk = Object.values(out.results).some((r) => r.ok);
    if (anyOk) {
      if (type === 'invoice') await query("UPDATE invoices SET status = IF(status = 'draft', 'unpaid', status) WHERE id = ?", [id]);
      if (type === 'quotation') await query("UPDATE quotations SET status = IF(status = 'draft', 'sent', status) WHERE id = ?", [id]);
      if (type === 'letter') await query("UPDATE letters SET status = IF(status IN ('draft','issued'), 'sent', status) WHERE id = ?", [id]);
    }
    res.json(out);
  })
);

module.exports = router;
