/**
 * PDF generation on the company letterhead (same template as the existing
 * YJTECHNOSOFT invoices): blue/yellow header with logo, watermark, CIN footer.
 *
 * The letterhead artwork lives in server/assets/letterhead.jpg and can be
 * replaced from Admin > Settings > Documents (letterhead_image).
 */
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { getSettings } = require('../utils/settings');
const { formatDate, formatMoney, amountInWords } = require('../utils/helpers');
const { UPLOAD_ROOT } = require('../middleware/upload');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const FONT = {
  regular: path.join(ASSETS, 'fonts', 'poppins-latin-400-normal.woff'),
  medium: path.join(ASSETS, 'fonts', 'poppins-latin-500-normal.woff'),
  semibold: path.join(ASSETS, 'fonts', 'poppins-latin-600-normal.woff'),
  bold: path.join(ASSETS, 'fonts', 'poppins-latin-700-normal.woff'),
};

const COLOR = {
  text: '#1f2937',
  muted: '#6b7280',
  blue: '#1d6fb8',
  navy: '#0b1b33',
  yellow: '#f7c41a',
  gray: '#eef1f5',
  border: '#d9dee6',
};

// A4 in points; content box measured from the letterhead artwork
const PAGE = { width: 595.28, height: 841.89 };
const BOX = { left: 42, right: 553, top: 162, bottom: 762 };
const WIDTH = BOX.right - BOX.left;

function resolveUpload(p) {
  if (!p) return null;
  if (p.startsWith('/uploads/')) {
    const abs = path.join(UPLOAD_ROOT, p.replace('/uploads/', ''));
    if (abs.startsWith(UPLOAD_ROOT) && fs.existsSync(abs)) return abs;
  }
  return null;
}

async function createDoc(meta = {}) {
  const s = await getSettings();
  const letterhead = resolveUpload(s.letterhead_image) || path.join(ASSETS, 'letterhead.jpg');
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: BOX.top, bottom: PAGE.height - BOX.bottom, left: BOX.left, right: PAGE.width - BOX.right },
    info: { Title: meta.title || 'Document', Author: s.company_name || 'YJTECHNOSOFT PRIVATE LIMITED' },
    bufferPages: true,
  });
  doc.registerFont('regular', FONT.regular);
  doc.registerFont('medium', FONT.medium);
  doc.registerFont('semibold', FONT.semibold);
  doc.registerFont('bold', FONT.bold);
  // The bundled Poppins font has no ₹ glyph – print "Rs." instead of a broken box
  const drawText = doc.text.bind(doc);
  doc.text = (text, ...rest) => drawText(typeof text === 'string' ? text.replace(/₹\s?/g, 'Rs. ') : text, ...rest);

  const paintBackground = () => {
    doc.save();
    doc.image(letterhead, 0, 0, { width: PAGE.width, height: PAGE.height });
    doc.restore();
  };
  paintBackground();
  doc.on('pageAdded', () => {
    const { x, y } = doc;
    paintBackground();
    doc.x = x;
    doc.y = BOX.top;
    void y;
  });
  doc.font('regular').fontSize(10).fillColor(COLOR.text);
  return { doc, settings: s };
}

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > BOX.bottom) {
    doc.addPage();
    doc.y = BOX.top;
  }
}

function title(doc, text) {
  doc.font('bold').fontSize(16).fillColor(COLOR.text);
  const w = doc.widthOfString(text);
  const x = BOX.left + (WIDTH - w) / 2;
  doc.text(text, x, doc.y, { lineBreak: false });
  const lineY = doc.y + 19;
  doc.moveTo(x, lineY).lineTo(x + w, lineY).lineWidth(1.2).strokeColor(COLOR.text).stroke();
  doc.x = BOX.left;
  doc.y = lineY + 12;
}

function sectionHeading(doc, text) {
  ensureSpace(doc, 40);
  doc.font('bold').fontSize(10.5).fillColor(COLOR.text);
  const y = doc.y;
  doc.text(text, BOX.left, y, { underline: true });
  doc.moveDown(0.25);
}

function yellowRule(doc, width = WIDTH - 12) {
  const y = doc.y + 4;
  doc.moveTo(BOX.left, y).lineTo(BOX.left + width, y).lineWidth(2).strokeColor(COLOR.yellow).stroke();
  doc.y = y + 10;
}

function labelValue(doc, label, value, x, y, { labelWidth = 70, width = 200, size = 9.5 } = {}) {
  doc.font('medium').fontSize(size).fillColor(COLOR.muted).text(label, x, y, { width: labelWidth });
  doc.font('semibold').fontSize(size).fillColor(COLOR.text).text(`: ${value || '-'}`, x + labelWidth, y, { width: width - labelWidth });
}

function signatureBlock(doc, s, x = BOX.right - 190, { noBreak = false } = {}) {
  if (!noBreak) ensureSpace(doc, 90);
  const y = doc.y + 10;
  doc.font('semibold').fontSize(9.5).fillColor(COLOR.text).text(`For ${s.company_name || 'YJTECHNOSOFT PRIVATE LIMITED'}`, x, y, { width: 190, align: 'center' });
  const sig = resolveUpload(s.signature_image);
  const stamp = resolveUpload(s.stamp_image);
  if (stamp) doc.image(stamp, x + 105, y + 14, { fit: [70, 52] });
  if (sig) doc.image(sig, x + 45, y + 18, { fit: [100, 40] });
  doc.font('medium').fontSize(9).fillColor(COLOR.text).text(s.signatory_name || 'Authorised Signatory', x, y + 62, { width: 190, align: 'center' });
  if (s.signatory_designation)
    doc.font('regular').fontSize(8.5).fillColor(COLOR.muted).text(s.signatory_designation, x, y + 74, { width: 190, align: 'center' });
  doc.x = BOX.left;
  doc.y = y + 90;
}

// ---------------------------------------------------------------------------
// Invoice / Quotation
// ---------------------------------------------------------------------------
function itemsTable(doc, items) {
  const showHsn = items.some((i) => i.hsn_sac);
  const showTax = items.some((i) => Number(i.tax_rate) > 0);
  // fixed-price lines (every quantity 1, no unit): Qty and Rate would only repeat the amount, so leave them out
  const showQty = items.some((i) => Number(i.quantity) !== 1 || (i.unit && i.unit !== 'Nos'));
  const cols = [
    { key: 'sn', label: '#', width: 24, align: 'center' },
    { key: 'description', label: 'Description', width: 0, align: 'left' },
    showHsn && { key: 'hsn_sac', label: 'HSN/SAC', width: 54, align: 'center' },
    showQty && { key: 'quantity', label: 'Qty', width: 38, align: 'center' },
    showQty && { key: 'rate', label: 'Rate', width: 70, align: 'right' },
    showTax && { key: 'tax_rate', label: 'GST', width: 38, align: 'center' },
    { key: 'amount', label: 'Amount', width: 80, align: 'right' },
  ].filter(Boolean);
  const fixed = cols.reduce((a, c) => a + c.width, 0);
  cols.find((c) => c.key === 'description').width = WIDTH - fixed;

  const drawHeader = () => {
    const y = doc.y;
    doc.roundedRect(BOX.left, y, WIDTH, 22, 6).fill(COLOR.navy);
    let x = BOX.left;
    doc.font('semibold').fontSize(9).fillColor('#ffffff');
    cols.forEach((c) => {
      doc.text(c.label, x + 6, y + 6.5, { width: c.width - 12, align: c.align, lineBreak: false });
      x += c.width;
    });
    doc.y = y + 26;
  };

  drawHeader();
  items.forEach((it, idx) => {
    const row = {
      sn: String(idx + 1),
      description: it.description,
      hsn_sac: it.hsn_sac || '',
      quantity: `${Number(it.quantity)}${it.unit && it.unit !== 'Nos' ? ' ' + it.unit : ''}`,
      rate: formatMoney(it.rate),
      tax_rate: Number(it.tax_rate) ? `${Number(it.tax_rate)}%` : '-',
      amount: formatMoney(it.amount),
    };
    doc.font('regular').fontSize(9.5);
    const descCol = cols.find((c) => c.key === 'description');
    const h = Math.max(18, doc.heightOfString(row.description, { width: descCol.width - 12 }) + 9);
    if (doc.y + h > BOX.bottom) {
      doc.addPage();
      doc.y = BOX.top;
      drawHeader();
    }
    const y = doc.y;
    if (idx % 2 === 1) doc.rect(BOX.left, y, WIDTH, h).fill(COLOR.gray);
    let x = BOX.left;
    cols.forEach((c) => {
      doc.font(c.key === 'description' ? 'medium' : 'regular').fontSize(9.5).fillColor(COLOR.text);
      doc.text(row[c.key], x + 6, y + 4.5, { width: c.width - 12, align: c.align });
      x += c.width;
    });
    doc.moveTo(BOX.left, y + h).lineTo(BOX.right, y + h).lineWidth(0.5).strokeColor(COLOR.border).stroke();
    doc.y = y + h;
  });
  doc.x = BOX.left;
  doc.y += 8;
}

function totalsBlock(doc, d, { showPaid }) {
  const lines = [['Sub Total', formatMoney(d.subtotal)]];
  if (Number(d.discount)) lines.push(['Discount', `- ${formatMoney(d.discount)}`]);
  if (Number(d.tax_total)) {
    if (d.gst_split) {
      lines.push(['CGST', formatMoney(d.tax_total / 2)]);
      lines.push(['SGST', formatMoney(d.tax_total / 2)]);
    } else lines.push(['GST', formatMoney(d.tax_total)]);
  }
  ensureSpace(doc, lines.length * 16 + 70);
  const x = BOX.right - 220;
  const yTop = doc.y;
  let y = yTop;
  lines.forEach(([l, v]) => {
    doc.font('medium').fontSize(9.5).fillColor(COLOR.muted).text(l, x, y, { width: 110 });
    doc.font('semibold').fillColor(COLOR.text).text(v, x + 110, y, { width: 110, align: 'right' });
    y += 16;
  });
  doc.roundedRect(x - 6, y, 226, 26, 6).fill(COLOR.blue);
  doc.font('bold').fontSize(11).fillColor('#ffffff').text('Total', x + 2, y + 7, { width: 100 });
  doc.text(`Rs. ${formatMoney(d.total)} /-`, x + 90, y + 7, { width: 122, align: 'right' });
  y += 32;
  if (showPaid && Number(d.amount_paid)) {
    doc.font('medium').fontSize(9.5).fillColor(COLOR.muted).text('Amount Paid', x, y, { width: 110 });
    doc.font('semibold').fillColor('#15803d').text(formatMoney(d.amount_paid), x + 110, y, { width: 110, align: 'right' });
    y += 16;
    doc.font('medium').fillColor(COLOR.muted).text('Balance Due', x, y, { width: 110 });
    doc.font('bold').fillColor('#b91c1c').text(formatMoney(Number(d.total) - Number(d.amount_paid)), x + 110, y, { width: 110, align: 'right' });
    y += 16;
  }
  // amount in words, left side
  doc.font('medium').fontSize(8.5).fillColor(COLOR.muted).text('Amount in words', BOX.left, yTop, { width: 250 });
  doc.font('semibold').fontSize(9.5).fillColor(COLOR.text).text(amountInWords(d.total), BOX.left, doc.y + 1, { width: 250 });
  doc.x = BOX.left;
  doc.y = Math.max(y, doc.y) + 10;
}

function paymentDetails(doc, s) {
  const rows = [
    ['Account Holder', s.bank_account_holder],
    ['Bank', s.bank_name],
    ['Account Number', s.bank_account_number],
    ['IFSC', s.bank_ifsc],
    ['Branch', s.bank_branch],
    ['Account Type', s.bank_account_type],
    ['Virtual Payment Address', s.upi_id],
  ].filter((r) => r[1]);
  ensureSpace(doc, Math.max(rows.length * 14 + 30, 100));
  const y0 = doc.y;
  const leftW = WIDTH - 200;
  if (rows.length) {
    doc.roundedRect(BOX.left, y0, leftW, 16, 6).fill(COLOR.gray);
    doc.y = y0 + 2;
    sectionHeading(doc, 'Payment Details');
    rows.forEach(([l, v]) => {
      doc.font('regular').fontSize(9.5).fillColor(COLOR.text).text(`${l}: ${v}`, BOX.left, doc.y, { width: leftW });
    });
  }
  const leftBottom = doc.y;
  // signature on the right of the payment block
  doc.y = y0;
  signatureBlock(doc, s, BOX.right - 190, { noBreak: true });
  doc.x = BOX.left;
  doc.y = Math.max(leftBottom, doc.y) + 6;
}

function notesBlock(doc, label, text) {
  if (!text) return;
  ensureSpace(doc, 50);
  sectionHeading(doc, label);
  doc.font('regular').fontSize(8.5).fillColor(COLOR.text).text(text, BOX.left, doc.y, { width: WIDTH, lineGap: 1 });
  doc.moveDown(0.6);
}

async function billingPdf(kind, d) {
  const isInvoice = kind === 'invoice';
  const { doc, settings: s } = await createDoc({ title: `${isInvoice ? 'Invoice' : 'Quotation'} ${d.number}` });
  doc.y = BOX.top + 8;
  title(doc, isInvoice ? (Number(d.tax_total) && s.gstin ? 'Tax Invoice' : 'Invoice') : 'Quotation');

  // Bill-to (left) and meta (right)
  const top = doc.y;
  doc.font('regular').fontSize(10).fillColor(COLOR.text).text('To,', BOX.left, top);
  doc.font('bold').fontSize(11).text(d.client.name, BOX.left + 18, doc.y + 2, { width: 280 });
  const addr = [d.client.contact_person && `Kind Attn: ${d.client.contact_person}`, d.client.address, [d.client.city, d.client.state, d.client.pincode].filter(Boolean).join(', '), d.client.phone && `Phone: ${d.client.phone}`, d.client.email && `Email: ${d.client.email}`, d.client.gstin && `GSTIN: ${d.client.gstin}`]
    .filter(Boolean)
    .join('\n');
  if (addr) doc.font('regular').fontSize(9).fillColor(COLOR.muted).text(addr, BOX.left + 18, doc.y + 1, { width: 280, lineGap: 1 });
  const leftBottom = doc.y;

  const mx = BOX.right - 205;
  let my = top;
  const meta = isInvoice
    ? [['Invoice No', d.number], ['Date', formatDate(d.date)], d.due_date && ['Due Date', formatDate(d.due_date)], s.gstin && ['GSTIN', s.gstin]]
    : [['Quote No', d.number], ['Date', formatDate(d.date)], d.valid_until && ['Valid Till', formatDate(d.valid_until)], s.gstin && ['GSTIN', s.gstin]];
  meta.filter(Boolean).forEach(([l, v]) => {
    labelValue(doc, l, v, mx, my, { labelWidth: 62, width: 205 });
    my += 15;
  });
  doc.x = BOX.left;
  doc.y = Math.max(leftBottom, my) + 2;
  yellowRule(doc);

  if (d.subject) {
    doc.font('semibold').fontSize(10).fillColor(COLOR.text).text(`Subject: ${d.subject}`, BOX.left, doc.y, { width: WIDTH });
    doc.moveDown(0.5);
  }

  sectionHeading(doc, 'Service Description');
  doc.moveDown(0.2);
  itemsTable(doc, d.items);
  totalsBlock(doc, { ...d, gst_split: s.gst_split !== '0' }, { showPaid: isInvoice });
  paymentDetails(doc, s);
  notesBlock(doc, 'Notes', d.notes);
  notesBlock(doc, 'Terms & Conditions', d.terms);
  return toBuffer(doc);
}

// ---------------------------------------------------------------------------
// HTML (rich-text) to PDF – used by letters
// ---------------------------------------------------------------------------
function decodeEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)));
}

function parseHtml(html) {
  const blocks = [];
  let cur = null;
  const style = { bold: 0, italic: 0, underline: 0 };
  const lists = [];
  const newBlock = (type, attrs = '') => {
    const align = (attrs.match(/ql-align-(center|right|justify)/) || [])[1] || (attrs.match(/text-align:\s*(center|right|justify)/) || [])[1];
    cur = { type, runs: [], align };
    blocks.push(cur);
    return cur;
  };
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let m;
  const src = String(html || '').replace(/\r?\n/g, '');
  while ((m = re.exec(src))) {
    const [, closing, tagRaw, attrs, text] = m;
    if (text !== undefined) {
      const t = decodeEntities(text);
      if (!t) continue;
      if (!cur) newBlock('p');
      cur.runs.push({ text: t, bold: style.bold > 0, italic: style.italic > 0, underline: style.underline > 0 });
      continue;
    }
    const tag = tagRaw.toLowerCase();
    if (['strong', 'b'].includes(tag)) style.bold += closing ? -1 : 1;
    else if (['em', 'i'].includes(tag)) style.italic += closing ? -1 : 1;
    else if (tag === 'u') style.underline += closing ? -1 : 1;
    else if (tag === 'br') {
      if (!cur) newBlock('p');
      cur.runs.push({ text: '\n' });
    } else if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'blockquote'].includes(tag)) {
      if (closing) cur = null;
      else newBlock(tag, attrs);
    } else if (tag === 'ul' || tag === 'ol') {
      if (closing) lists.pop();
      else lists.push({ ordered: tag === 'ol', n: 0 });
      cur = null;
    } else if (tag === 'li') {
      if (closing) cur = null;
      else {
        const list = lists[lists.length - 1] || { ordered: false, n: 0 };
        const bullet = /data-list="bullet"/.test(attrs) ? false : /data-list="ordered"/.test(attrs) ? true : list.ordered;
        list.n += 1;
        const b = newBlock('li', attrs);
        b.marker = bullet ? `${list.n}.` : '•';
        b.depth = Math.max(lists.length, 1);
      }
    }
    style.bold = Math.max(0, style.bold);
    style.italic = Math.max(0, style.italic);
    style.underline = Math.max(0, style.underline);
  }
  return blocks.filter((b) => b.runs.some((r) => r.text.trim()) || b.runs.length === 0);
}

function renderHtml(doc, html, { size = 10.5 } = {}) {
  const blocks = parseHtml(html);
  blocks.forEach((b) => {
    const isHeading = /^h[1-4]$/.test(b.type);
    const fs = isHeading ? { h1: 15, h2: 13, h3: 12, h4: 11 }[b.type] : size;
    const indent = b.type === 'li' ? 14 * b.depth : 0;
    const x = BOX.left + indent;
    const width = WIDTH - indent;
    if (!b.runs.length) {
      doc.moveDown(0.5);
      return;
    }
    ensureSpace(doc, fs * 2);
    if (b.type === 'li') {
      const y = doc.y;
      doc.font('regular').fontSize(fs).fillColor(COLOR.text).text(b.marker, x - 12, y, { width: 12, lineBreak: false });
      doc.y = y;
    }
    // pdfkit drops leading spaces of continued runs – move them to the previous run
    const runs = b.runs.map((r) => ({ ...r }));
    for (let i = 1; i < runs.length; i++) {
      if (/^\s/.test(runs[i].text) && runs[i - 1].text !== '\n') {
        runs[i].text = runs[i].text.replace(/^\s+/, '');
        runs[i - 1].text = runs[i - 1].text.replace(/\s*$/, ' ');
      }
    }
    const defaultAlign = b.type === 'p' && !isHeading && runs.length === 1 ? 'justify' : 'left';
    runs.forEach((r, i) => {
      const font = isHeading || r.bold ? 'semibold' : r.italic ? 'medium' : 'regular';
      doc.font(font).fontSize(fs).fillColor(isHeading ? COLOR.navy : COLOR.text);
      const opts = {
        continued: i < runs.length - 1,
        underline: !!r.underline,
        align: b.align || defaultAlign,
        lineGap: 2.5,
      };
      if (i === 0) doc.text(r.text, x, doc.y, { ...opts, width });
      else doc.text(r.text, opts);
    });
    doc.moveDown(isHeading ? 0.35 : b.type === 'li' ? 0.2 : 0.55);
  });
}

async function letterPdf(letter) {
  const { doc, settings: s } = await createDoc({ title: letter.title });
  doc.y = BOX.top + 6;
  // Ref & date
  doc.font('medium').fontSize(9.5).fillColor(COLOR.text).text(`Ref: ${letter.letter_no}`, BOX.left, doc.y, { width: WIDTH / 2 });
  doc.text(`Date: ${formatDate(letter.issue_date)}`, BOX.left + WIDTH / 2, doc.y - 13.5, { width: WIDTH / 2, align: 'right' });
  doc.x = BOX.left;
  doc.moveDown(0.8);
  title(doc, letter.title);

  if (letter.show_recipient !== false) {
    doc.font('regular').fontSize(10).fillColor(COLOR.text).text('To,', BOX.left, doc.y);
    doc.font('bold').fontSize(10.5).text(letter.recipient_name, BOX.left, doc.y + 1);
    const extra = [letter.recipient_address, letter.recipient_email, letter.recipient_phone].filter(Boolean).join('\n');
    if (extra) doc.font('regular').fontSize(9.5).fillColor(COLOR.muted).text(extra, BOX.left, doc.y + 1, { width: 300 });
    doc.moveDown(0.4);
    yellowRule(doc, 220);
  }
  if (letter.subject) {
    doc.font('semibold').fontSize(10.5).fillColor(COLOR.text).text(`Subject: ${letter.subject}`, BOX.left, doc.y, { width: WIDTH });
    doc.moveDown(0.6);
  }
  renderHtml(doc, letter.body);
  doc.moveDown(0.5);
  signatureBlock(doc, s, BOX.left);
  if (letter.acceptance) {
    ensureSpace(doc, 70);
    doc.moveDown(0.5);
    doc.font('semibold').fontSize(10).fillColor(COLOR.text).text('Acceptance by Candidate', BOX.left, doc.y, { underline: true });
    doc.font('regular').fontSize(9.5).text('I accept the terms and conditions mentioned above.', BOX.left, doc.y + 2);
    const y = doc.y + 28;
    doc.text('Signature: ____________________', BOX.left, y);
    doc.text('Date: ________________', BOX.right - 160, y);
  }
  return toBuffer(doc);
}

// ---------------------------------------------------------------------------
// Payslip
// ---------------------------------------------------------------------------
async function payslipPdf(p) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const { doc } = await createDoc({ title: `Payslip ${months[p.month - 1]} ${p.year}` });
  doc.y = BOX.top + 8;
  title(doc, `Salary Slip – ${months[p.month - 1]} ${p.year}`);

  const rows = [
    ['Employee Name', p.name, 'Employee Code', p.emp_code],
    ['Designation', p.designation_name, 'Department', p.department_name],
    ['Date of Joining', formatDate(p.joining_date), 'PAN', p.pan],
    ['Bank A/c', p.account_no, 'IFSC', p.ifsc],
    ['Working Days', String(p.working_days), 'Paid Days', String(p.paid_days)],
    ['LOP Days', String(p.lop_days), 'Status', p.status === 'paid' ? `Paid on ${formatDate(p.paid_on)}` : 'Generated'],
  ];
  let y = doc.y;
  rows.forEach((r) => {
    labelValue(doc, r[0], r[1], BOX.left, y, { labelWidth: 95, width: 255 });
    labelValue(doc, r[2], r[3], BOX.left + 265, y, { labelWidth: 90, width: 245 });
    y += 16;
  });
  doc.y = y + 4;
  yellowRule(doc);

  const earnings = [['Basic', p.basic], ['HRA', p.hra], ['Other Allowances', p.allowances], ['Bonus / Incentive', p.bonus]];
  const deductions = [['Loss of Pay', p.lop_amount], ['Other Deductions', p.deductions]];
  const half = WIDTH / 2 - 6;
  y = doc.y;
  [['Earnings', earnings, BOX.left], ['Deductions', deductions, BOX.left + half + 12]].forEach(([label, list, x]) => {
    doc.roundedRect(x, y, half, 22, 6).fill(COLOR.navy);
    doc.font('semibold').fontSize(9.5).fillColor('#fff').text(label, x + 10, y + 6.5, { width: half / 2 });
    doc.text('Amount (Rs.)', x + half / 2, y + 6.5, { width: half / 2 - 10, align: 'right' });
    let ry = y + 28;
    list.forEach(([l, v]) => {
      doc.font('regular').fontSize(9.5).fillColor(COLOR.text).text(l, x + 10, ry, { width: half / 2 });
      doc.text(formatMoney(v), x + half / 2, ry, { width: half / 2 - 10, align: 'right' });
      ry += 18;
      doc.moveTo(x, ry - 4).lineTo(x + half, ry - 4).lineWidth(0.5).strokeColor(COLOR.border).stroke();
    });
  });
  const totalE = earnings.reduce((a, e) => a + Number(e[1] || 0), 0);
  const totalD = deductions.reduce((a, e) => a + Number(e[1] || 0), 0);
  y += 28 + 4 * 18 + 4;
  doc.font('bold').fontSize(9.5).fillColor(COLOR.text);
  doc.text('Total Earnings', BOX.left + 10, y, { width: half / 2 });
  doc.text(formatMoney(totalE), BOX.left + half / 2, y, { width: half / 2 - 10, align: 'right' });
  doc.text('Total Deductions', BOX.left + half + 22, y, { width: half / 2 });
  doc.text(formatMoney(totalD), BOX.left + half + 12 + half / 2, y, { width: half / 2 - 10, align: 'right' });
  y += 26;
  doc.roundedRect(BOX.left, y, WIDTH, 30, 6).fill(COLOR.blue);
  doc.font('bold').fontSize(12).fillColor('#fff').text('Net Pay', BOX.left + 12, y + 8);
  doc.text(`Rs. ${formatMoney(p.net_pay)} /-`, BOX.left, y + 8, { width: WIDTH - 12, align: 'right' });
  doc.y = y + 38;
  doc.font('semibold').fontSize(9.5).fillColor(COLOR.text).text(amountInWords(p.net_pay), BOX.left, doc.y);
  doc.moveDown(1.5);
  doc.font('regular').fontSize(8.5).fillColor(COLOR.muted).text('This is a computer generated payslip and does not require a signature.', BOX.left, doc.y, { width: WIDTH, align: 'center' });
  return toBuffer(doc);
}

// ---------------------------------------------------------------------------
// Payment receipt
// ---------------------------------------------------------------------------
async function receiptPdf(r) {
  const { doc, settings: s } = await createDoc({ title: `Receipt ${r.receipt_no}` });
  doc.y = BOX.top + 8;
  title(doc, 'Payment Receipt');
  const y = doc.y;
  labelValue(doc, 'Receipt No', r.receipt_no, BOX.left, y, { labelWidth: 80, width: 250 });
  labelValue(doc, 'Date', formatDate(r.payment_date), BOX.right - 200, y, { labelWidth: 60, width: 200 });
  doc.y = y + 26;
  doc.font('regular').fontSize(10.5).fillColor(COLOR.text).text(
    `Received with thanks from ${r.client_name} a sum of Rs. ${formatMoney(r.amount)} (${amountInWords(r.amount)}) by ${String(r.mode).replace('_', ' ')}${r.reference ? ` (Ref: ${r.reference})` : ''} against Invoice No. ${r.invoice_no}.`,
    BOX.left,
    doc.y,
    { width: WIDTH, align: 'justify', lineGap: 3 }
  );
  doc.moveDown(1);
  yellowRule(doc);
  const rows = [['Invoice Total', r.invoice_total], ['Total Received', r.invoice_paid], ['Balance Due', Number(r.invoice_total) - Number(r.invoice_paid)]];
  rows.forEach(([l, v]) => {
    labelValue(doc, l, `Rs. ${formatMoney(v)}`, BOX.left, doc.y, { labelWidth: 100, width: 300 });
    doc.moveDown(0.4);
  });
  doc.moveDown(1);
  signatureBlock(doc, s);
  return toBuffer(doc);
}

// ---------------------------------------------------------------------------
// Contract / agreement
// ---------------------------------------------------------------------------
function partyBox(doc, x, y, w, heading, lines) {
  doc.font('semibold').fontSize(8.5).fillColor(COLOR.blue).text(heading.toUpperCase(), x + 10, y + 8, { width: w - 20, characterSpacing: 0.6 });
  doc.font('bold').fontSize(10).fillColor(COLOR.text).text(lines[0] || '', x + 10, doc.y + 2, { width: w - 20 });
  const rest = lines.slice(1).filter(Boolean).join('\n');
  if (rest) doc.font('regular').fontSize(8.5).fillColor(COLOR.muted).text(rest, x + 10, doc.y + 1, { width: w - 20, lineGap: 1 });
  return doc.y + 8;
}

async function contractPdf(c) {
  const { doc, settings: s } = await createDoc({ title: c.title });
  doc.y = BOX.top + 6;
  doc.font('medium').fontSize(9.5).fillColor(COLOR.text).text(`Agreement No: ${c.contract_no}`, BOX.left, doc.y, { width: WIDTH / 2 });
  doc.text(`Date: ${formatDate(c.agreement_date)}`, BOX.left + WIDTH / 2, doc.y - 13.5, { width: WIDTH / 2, align: 'right' });
  doc.x = BOX.left;
  doc.moveDown(0.8);
  title(doc, c.title);

  // parties
  const y0 = doc.y;
  const half = WIDTH / 2 - 6;
  const left = partyBox(doc, BOX.left, y0, half, 'Service Provider', [s.company_name, s.address, [s.phone, s.email].filter(Boolean).join(' · '), s.gstin && `GSTIN: ${s.gstin}`, s.cin && `CIN: ${s.cin}`]);
  const right = partyBox(doc, BOX.left + half + 12, y0, half, 'Client', [c.party_name, c.party_representative && `Through: ${c.party_representative}`, c.party_address, [c.party_phone, c.party_email].filter(Boolean).join(' · ')]);
  const h = Math.max(left, right) - y0;
  doc.save();
  doc.roundedRect(BOX.left, y0, half, h, 8).lineWidth(0.8).strokeColor(COLOR.border).stroke();
  doc.roundedRect(BOX.left + half + 12, y0, half, h, 8).lineWidth(0.8).strokeColor(COLOR.border).stroke();
  doc.restore();
  doc.x = BOX.left;
  doc.y = y0 + h + 8;

  const meta = [
    c.start_date && `Term: ${formatDate(c.start_date)}${c.end_date ? ` to ${formatDate(c.end_date)}` : ''}`,
    Number(c.contract_value) ? `Contract value: Rs. ${formatMoney(c.contract_value)} /-` : null,
  ].filter(Boolean);
  if (meta.length) {
    doc.font('semibold').fontSize(9.5).fillColor(COLOR.text).text(meta.join('     |     '), BOX.left, doc.y, { width: WIDTH });
    doc.moveDown(0.3);
  }
  yellowRule(doc);
  renderHtml(doc, c.body, { size: 10 });

  // signatures
  ensureSpace(doc, 140);
  doc.moveDown(0.5);
  doc.font('regular').fontSize(9.5).fillColor(COLOR.text).text('IN WITNESS WHEREOF, the parties have executed this Agreement on the date first written above.', BOX.left, doc.y, { width: WIDTH });
  const sy = doc.y + 14;
  const sig = resolveUpload(s.signature_image);
  const stamp = resolveUpload(s.stamp_image);
  doc.font('semibold').fontSize(9.5).text(`For ${s.company_name || 'Service Provider'}`, BOX.left, sy, { width: half });
  if (stamp) doc.image(stamp, BOX.left + 120, sy + 14, { fit: [64, 48] });
  if (sig) doc.image(sig, BOX.left, sy + 18, { fit: [110, 40] });
  doc.moveTo(BOX.left, sy + 66).lineTo(BOX.left + 170, sy + 66).lineWidth(0.6).strokeColor(COLOR.muted).stroke();
  doc.font('medium').fontSize(9).fillColor(COLOR.text).text(s.signatory_name || 'Authorised Signatory', BOX.left, sy + 70, { width: half });
  if (s.signatory_designation) doc.font('regular').fontSize(8.5).fillColor(COLOR.muted).text(s.signatory_designation, BOX.left, doc.y, { width: half });

  const rx = BOX.left + half + 12;
  doc.font('semibold').fontSize(9.5).fillColor(COLOR.text).text(`For ${c.party_name}`, rx, sy, { width: half });
  if (c.accepted_at) {
    doc.roundedRect(rx, sy + 16, 200, 44, 6).fill('#ecfdf5');
    doc.font('semibold').fontSize(8.5).fillColor('#047857').text('DIGITALLY ACCEPTED ONLINE', rx + 8, sy + 21, { width: 184 });
    doc.font('regular').fontSize(7.5).fillColor('#065f46').text(`by ${c.accepted_by} on ${formatDate(c.accepted_at)} ${String(c.accepted_at).slice(11, 16)}${c.accepted_ip ? `\nIP ${c.accepted_ip}` : ''}`, rx + 8, doc.y, { width: 184 });
  }
  doc.moveTo(rx, sy + 66).lineTo(rx + 170, sy + 66).lineWidth(0.6).strokeColor(COLOR.muted).stroke();
  doc.font('medium').fontSize(9).fillColor(COLOR.text).text(c.party_representative || c.party_name, rx, sy + 70, { width: half });
  doc.font('regular').fontSize(8.5).fillColor(COLOR.muted).text('Authorised Signatory', rx, doc.y, { width: half });

  // page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // writing in the footer band must not create a new page
    doc.font('regular').fontSize(7.5).fillColor(COLOR.muted).text(`${c.contract_no}  ·  Page ${i + 1} of ${range.count}`, BOX.left, BOX.bottom + 4, { width: WIDTH, align: 'right', lineBreak: false });
  }
  return toBuffer(doc);
}

module.exports = { billingPdf, letterPdf, payslipPdf, receiptPdf, contractPdf, parseHtml };
