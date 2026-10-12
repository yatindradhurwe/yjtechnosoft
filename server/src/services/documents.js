/**
 * Builds PDFs for any document type and sends them over Email / WhatsApp / SMS.
 */
const { query, one } = require('../config/db');
const path = require('path');
const fs = require('fs');
const { billingPdf, letterPdf, payslipPdf, receiptPdf, contractPdf } = require('./pdf');
const { UPLOAD_ROOT } = require('../middleware/upload');
const { sendEmail, sendSMS, sendWhatsApp } = require('./notify');
const { getSettings } = require('../utils/settings');
const { docToken, formatDate, formatMoney, renderTemplate } = require('../utils/helpers');
const { HttpError } = require('../middleware/error');

const safeName = (s) => String(s).replace(/[^A-Za-z0-9-_]+/g, '_');

async function loadInvoice(id) {
  const inv = await one('SELECT * FROM invoices WHERE id = ?', [id]);
  if (!inv) throw new HttpError(404, 'Invoice not found');
  inv.client = await one('SELECT * FROM clients WHERE id = ?', [inv.client_id]);
  inv.items = await query('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id', [id]);
  inv.payments = await query('SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date, id', [id]);
  return inv;
}

async function loadQuotation(id) {
  const q = await one('SELECT * FROM quotations WHERE id = ?', [id]);
  if (!q) throw new HttpError(404, 'Quotation not found');
  q.client = await one('SELECT * FROM clients WHERE id = ?', [q.client_id]);
  q.items = await query('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order, id', [id]);
  return q;
}

async function loadPayslip(id) {
  const p = await one(
    `SELECT p.*, e.name, e.emp_code, e.email, e.phone, e.joining_date, e.pan, e.account_no, e.ifsc,
            d.name AS department_name, g.name AS designation_name
     FROM payslips p JOIN employees e ON e.id = p.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN designations g ON g.id = e.designation_id
     WHERE p.id = ?`,
    [id]
  );
  if (!p) throw new HttpError(404, 'Payslip not found');
  return p;
}

async function loadReceipt(id) {
  const r = await one(
    `SELECT p.*, c.name AS client_name, c.email, c.phone, c.whatsapp, i.invoice_no, i.total AS invoice_total, i.amount_paid AS invoice_paid
     FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN clients c ON c.id = p.client_id WHERE p.id = ?`,
    [id]
  );
  if (!r) throw new HttpError(404, 'Payment not found');
  return r;
}

/** Returns { buffer, filename, recipient: {name,email,phone}, context } */
async function buildDocument(type, id) {
  if (type === 'invoice') {
    const inv = await loadInvoice(id);
    const buffer = await billingPdf('invoice', {
      number: inv.invoice_no,
      date: inv.invoice_date,
      due_date: inv.due_date,
      subject: inv.subject,
      client: inv.client,
      items: inv.items,
      subtotal: inv.subtotal,
      discount: inv.discount,
      tax_total: inv.tax_total,
      total: inv.total,
      amount_paid: inv.amount_paid,
      notes: inv.notes,
      terms: inv.terms,
    });
    return {
      buffer,
      filename: `Invoice_${safeName(inv.invoice_no)}.pdf`,
      recipient: { name: inv.client.name, email: inv.client.email, phone: inv.client.whatsapp || inv.client.phone },
      context: {
        client_name: inv.client.contact_person || inv.client.name,
        number: inv.invoice_no,
        date: formatDate(inv.invoice_date),
        due_date: formatDate(inv.due_date),
        amount: formatMoney(inv.total),
        balance: formatMoney(inv.total - inv.amount_paid),
      },
      label: 'Invoice',
    };
  }
  if (type === 'quotation') {
    const q = await loadQuotation(id);
    const buffer = await billingPdf('quotation', {
      number: q.quote_no,
      date: q.quote_date,
      valid_until: q.valid_until,
      subject: q.subject,
      client: q.client,
      items: q.items,
      subtotal: q.subtotal,
      discount: q.discount,
      tax_total: q.tax_total,
      total: q.total,
      notes: q.notes,
      terms: q.terms,
    });
    return {
      buffer,
      filename: `Quotation_${safeName(q.quote_no)}.pdf`,
      recipient: { name: q.client.name, email: q.client.email, phone: q.client.whatsapp || q.client.phone },
      context: {
        client_name: q.client.contact_person || q.client.name,
        number: q.quote_no,
        date: formatDate(q.quote_date),
        valid_until: formatDate(q.valid_until),
        amount: formatMoney(q.total),
      },
      label: 'Quotation',
    };
  }
  if (type === 'letter') {
    const l = await one('SELECT * FROM letters WHERE id = ?', [id]);
    if (!l) throw new HttpError(404, 'Letter not found');
    const data = l.data ? JSON.parse(l.data) : {};
    const buffer = await letterPdf({ ...l, subject: data.subject, acceptance: ['offer', 'internship_offer', 'appointment'].includes(l.type) });
    return {
      buffer,
      filename: `${safeName(l.title)}_${safeName(l.recipient_name)}.pdf`,
      recipient: { name: l.recipient_name, email: l.recipient_email, phone: l.recipient_phone },
      context: { client_name: l.recipient_name, number: l.letter_no, date: formatDate(l.issue_date), title: l.title },
      label: l.title,
    };
  }
  if (type === 'payslip') {
    const p = await loadPayslip(id);
    const buffer = await payslipPdf(p);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return {
      buffer,
      filename: `Payslip_${safeName(p.emp_code)}_${months[p.month - 1]}_${p.year}.pdf`,
      recipient: { name: p.name, email: p.email, phone: p.phone },
      context: { client_name: p.name, number: `${months[p.month - 1]} ${p.year}`, amount: formatMoney(p.net_pay) },
      label: 'Payslip',
    };
  }
  if (type === 'receipt') {
    const r = await loadReceipt(id);
    const buffer = await receiptPdf(r);
    return {
      buffer,
      filename: `Receipt_${safeName(r.receipt_no)}.pdf`,
      recipient: { name: r.client_name, email: r.email, phone: r.whatsapp || r.phone },
      context: { client_name: r.client_name, number: r.receipt_no, amount: formatMoney(r.amount), date: formatDate(r.payment_date) },
      label: 'Payment Receipt',
    };
  }
  if (type === 'contract') {
    const c = await one('SELECT * FROM contracts WHERE id = ?', [id]);
    if (!c) throw new HttpError(404, 'Contract not found');
    const buffer = await contractPdf(c);
    return {
      buffer,
      filename: `Agreement_${safeName(c.contract_no)}.pdf`,
      recipient: { name: c.party_name, email: c.party_email, phone: c.party_phone },
      context: { client_name: c.party_representative || c.party_name, number: c.contract_no, date: formatDate(c.agreement_date), title: c.title, amount: formatMoney(c.contract_value) },
      label: c.title,
    };
  }
  if (type === 'vault') {
    const d = await one('SELECT v.*, c.name AS client_name, c.email, c.phone, c.whatsapp, c.contact_person FROM vault_documents v LEFT JOIN clients c ON c.id = v.client_id WHERE v.id = ?', [id]);
    if (!d) throw new HttpError(404, 'Document not found');
    const abs = path.join(UPLOAD_ROOT, String(d.file).replace(/^\/uploads\//, ''));
    if (!abs.startsWith(UPLOAD_ROOT) || !fs.existsSync(abs)) throw new HttpError(404, 'File is missing on the server');
    const ext = path.extname(abs).toLowerCase();
    return {
      buffer: fs.readFileSync(abs),
      filename: d.file_name || `${safeName(d.title)}${ext}`,
      contentType: CONTENT_TYPES[ext] || 'application/octet-stream',
      recipient: { name: d.client_name, email: d.email, phone: d.whatsapp || d.phone },
      context: { client_name: d.contact_person || d.client_name || '', number: d.title, title: d.title, date: formatDate(d.document_date) },
      label: d.title,
    };
  }
  throw new HttpError(400, 'Unknown document type');
}

const CONTENT_TYPES = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.txt': 'text/plain', '.zip': 'application/zip',
};

/** Direct (signed) file link – used for WhatsApp document attachments */
async function publicLink(type, id) {
  const s = await getSettings();
  const base = (s.api_public_url || process.env.API_URL || '').replace(/\/+$/, '');
  return `${base}/api/public/documents/${type}/${id}/${docToken(type, id)}`;
}

/** Branded online page (view, download, accept quotation / agreement, chat) */
async function shareLink(type, id) {
  const s = await getSettings();
  const base = (s.site_url || process.env.APP_URL || '').replace(/\/+$/, '');
  return `${base}/d/${type}/${id}/${docToken(type, id)}`;
}

const DEFAULT_MESSAGES = {
  invoice: 'Dear {{client_name}}, please find invoice {{number}} dated {{date}} for Rs. {{amount}}. Balance due: Rs. {{balance}}. Thank you for your business! – {{company}}',
  quotation: 'Dear {{client_name}}, please find our quotation {{number}} for Rs. {{amount}} (valid till {{valid_until}}). We look forward to working with you. – {{company}}',
  letter: 'Dear {{client_name}}, please find your {{title}} (Ref: {{number}}) from {{company}}.',
  payslip: 'Dear {{client_name}}, your payslip for {{number}} is ready. Net pay: Rs. {{amount}}. – {{company}}',
  receipt: 'Dear {{client_name}}, we have received your payment of Rs. {{amount}} on {{date}} (Receipt {{number}}). Thank you! – {{company}}',
  contract: 'Dear {{client_name}}, please review the {{title}} (Agreement No. {{number}}). You can read and accept it online using the link below. – {{company}}',
  vault: 'Dear {{client_name}}, please find the document "{{title}}" shared by {{company}}.',
};

/**
 * channels: ['email','whatsapp','sms']
 * overrides: { email, phone, subject, message }
 */
async function sendDocument(type, id, channels, overrides = {}, userId) {
  const s = await getSettings();
  const doc = await buildDocument(type, id);
  const fileLink = await publicLink(type, id);
  const link = await shareLink(type, id);
  const ctx = { ...doc.context, company: s.company_name || 'YJTechnosoft', link };
  const message = overrides.message || renderTemplate(s[`msg_${type}`] || DEFAULT_MESSAGES[type], ctx);
  const subject = overrides.subject || `${doc.label} ${doc.context.number} – ${s.company_name || 'YJTechnosoft'}`;
  const email = overrides.email || doc.recipient.email;
  const phone = overrides.phone || doc.recipient.phone;
  const results = {};

  if (channels.includes('email')) {
    results.email = await sendEmail({
      to: email,
      subject,
      html: `<p>${message.replace(/\n/g, '<br>')}</p><p>The document is attached with this email.</p>
        <p><a href="${link}" style="display:inline-block;background:#1d6fb8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${['quotation', 'contract'].includes(type) ? 'View & accept online' : 'View online'}</a></p>`,
      attachments: [{ filename: doc.filename, content: doc.buffer, contentType: doc.contentType || 'application/pdf' }],
      refType: type,
      refId: id,
      userId,
    });
  }
  if (channels.includes('whatsapp')) {
    results.whatsapp = await sendWhatsApp({ to: phone, message: message.includes(link) ? message : `${message}\n${link}`, documentUrl: fileLink, filename: doc.filename, refType: type, refId: id, userId });
  }
  if (channels.includes('sms')) {
    results.sms = await sendSMS({ to: phone, message: `${message} View: ${link}`, refType: type, refId: id, userId });
  }
  return { results, link };
}

/** Data for the quick-share buttons (WhatsApp / email / copy link) */
async function shareInfo(type, id) {
  const s = await getSettings();
  const doc = await buildDocument(type, id);
  const link = await shareLink(type, id);
  const ctx = { ...doc.context, company: s.company_name || 'YJTechnosoft', link };
  const message = renderTemplate(s[`msg_${type}`] || DEFAULT_MESSAGES[type], ctx);
  return {
    link,
    file_link: await publicLink(type, id),
    message,
    whatsapp_text: message.includes(link) ? message : `${message}\n\n${link}`,
    subject: `${doc.label} ${doc.context.number} – ${s.company_name || 'YJTechnosoft'}`,
    email: doc.recipient.email || '',
    phone: doc.recipient.phone || '',
    filename: doc.filename,
  };
}

module.exports = { buildDocument, sendDocument, publicLink, shareLink, shareInfo, loadInvoice, loadQuotation, DEFAULT_MESSAGES };
