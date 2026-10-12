const crypto = require('crypto');

function slugify(text = '') {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Local YYYY-MM-DD */
function toDateStr(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

function toDateTimeStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${toDateStr(d)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 2024-10-21 -> 21-10-2024 (format used on the company letterhead) */
function formatDate(value, style = 'dmy') {
  if (!value) return '';
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return String(value);
  if (style === 'long') {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
  }
  return `${d}-${m}-${y}`;
}

/** Indian number grouping: 1234567.5 -> 12,34,567.50 */
function formatMoney(n, decimals = 2) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Financial year label for India (April – March), e.g. 2024-25 */
function financialYear(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const start = d.getMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
}

/** Indian system words: 28000 -> "Twenty Eight Thousand" */
function numberToWords(num) {
  num = Math.floor(Math.abs(Number(num) || 0));
  if (num === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  if (crore) parts.push(`${numberToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (num) parts.push(threeDigits(num));
  return parts.join(' ');
}

function amountInWords(amount) {
  const rupees = Math.floor(Number(amount) || 0);
  const paise = Math.round(((Number(amount) || 0) - rupees) * 100);
  let words = `Rupees ${numberToWords(rupees)}`;
  if (paise) words += ` and ${numberToWords(paise)} Paise`;
  return `${words} Only`;
}

/** Replace {{placeholders}} in a template */
function renderTemplate(tpl = '', data = {}) {
  return String(tpl).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => {
    const val = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
    return val === undefined || val === null ? '' : String(val);
  });
}

function docToken(type, id) {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  return crypto.createHmac('sha256', secret).update(`${type}:${id}`).digest('hex').slice(0, 32);
}

function verifyDocToken(type, id, token) {
  const expected = docToken(type, id);
  return token && token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function pick(obj, keys) {
  const out = {};
  keys.forEach((k) => {
    if (obj[k] !== undefined) out[k] = obj[k] === '' ? null : obj[k];
  });
  return out;
}

function stripHtml(html = '') {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  slugify,
  round2,
  toDateStr,
  toDateTimeStr,
  formatDate,
  formatMoney,
  financialYear,
  numberToWords,
  amountInWords,
  renderTemplate,
  docToken,
  verifyDocToken,
  pick,
  stripHtml,
};
