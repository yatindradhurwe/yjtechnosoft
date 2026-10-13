/**
 * HTML → PDF for the profile builder using headless Chromium (puppeteer-core).
 * Chromium is found from CHROME_PATH or the usual install locations. If none is
 * available, isPdfAvailable() is false and the website falls back to the
 * browser's own "Save as PDF".
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
  ];
  const pw = '/opt/pw-browsers';
  if (fs.existsSync(pw)) {
    for (const d of fs.readdirSync(pw).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
      candidates.push(path.join(pw, d, 'chrome-linux', 'chrome'));
    }
  }
  return candidates.find((c) => c && fs.existsSync(c)) || null;
}

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    const exe = findChrome();
    if (!exe) throw Object.assign(new Error('PDF engine (Chromium) is not installed on the server'), { status: 501 });
    const puppeteer = require('puppeteer-core');
    browserPromise = puppeteer
      .launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] })
      .then((b) => {
        b.on('disconnected', () => (browserPromise = null));
        return b;
      })
      .catch((e) => {
        browserPromise = null;
        throw e;
      });
  }
  return browserPromise;
}

const isPdfAvailable = () => !!findChrome();

// at most 2 renders at a time so a burst of downloads cannot exhaust memory
let running = 0;
const waiting = [];
async function slot(fn) {
  if (running >= 2) await new Promise((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    if (waiting.length) waiting.shift()();
  }
}

const hexRgb = (h) => {
  const n = parseInt(String(h).slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
// Standard PDF fonts only cover Latin-1 – drop anything else from the footer text
const latin = (s) => String(s || '').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF]/g, '').trim();

/**
 * @param {string} html     document from renderProfileHtml (with base = origin)
 * @param {string} origin   the only origin the page may load from
 * @param {object} decor    { primary, accent, footerLeft, footerRight, skipFirst }
 */
async function htmlToPdf(html, origin, decor) {
  const raw = await slot(async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const u = req.url();
        if (u.startsWith(`${origin}/`) || u.startsWith('data:') || u === 'about:blank') req.continue();
        else req.abort();
      });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.evaluateHandle('document.fonts.ready');
      return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    } finally {
      await page.close().catch(() => {});
    }
  });

  // header bar + footer with page numbers on every page except the cover
  const pdf = await PDFDocument.load(raw);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  const mm = 72 / 25.4;
  pages.forEach((p, i) => {
    if (decor.skipFirst && i === 0) return;
    const { width, height } = p.getSize();
    p.drawRectangle({ x: 0, y: height - 5 * mm, width, height: 5 * mm, color: hexRgb(decor.primary) });
    p.drawRectangle({ x: 0, y: height - 6.2 * mm, width, height: 1.2 * mm, color: hexRgb(decor.accent) });
    const y = 10 * mm;
    p.drawLine({ start: { x: 18 * mm, y: y + 4 * mm }, end: { x: width - 18 * mm, y: y + 4 * mm }, thickness: 0.6, color: rgb(0.87, 0.89, 0.92) });
    p.drawText(latin(decor.footerLeft).toUpperCase(), { x: 18 * mm, y, size: 7, font: bold, color: hexRgb(decor.primary) });
    const right = latin(`${decor.footerRight ? `${decor.footerRight}  ·  ` : ''}${i + 1}`);
    p.drawText(right, { x: width - 18 * mm - font.widthOfTextAtSize(right, 7), y, size: 7, font, color: rgb(0.36, 0.4, 0.47) });
  });
  return Buffer.from(await pdf.save());
}

module.exports = { htmlToPdf, isPdfAvailable };
