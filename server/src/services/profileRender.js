/**
 * Renders a profile (company / personal) to a standalone A4 HTML document.
 * The same HTML feeds the live preview, the public share page and the PDF,
 * so all three always match. Every user value is escaped; images are limited
 * to files uploaded to this server so a profile can never pull in outside URLs.
 */

const THEMES = {
  'navy-gold': { label: 'Navy & Gold', primary: '#0b1f3a', primary2: '#13305a', accent: '#c9a961' },
  royal: { label: 'Royal Blue', primary: '#102a72', primary2: '#1d3f99', accent: '#f0b429' },
  emerald: { label: 'Emerald', primary: '#0b3d2e', primary2: '#145a43', accent: '#d4af37' },
  maroon: { label: 'Maroon', primary: '#4a0d1d', primary2: '#6b1a2e', accent: '#c9a961' },
  charcoal: { label: 'Charcoal & Orange', primary: '#1f2328', primary2: '#2f353d', accent: '#f97316' },
  teal: { label: 'Teal', primary: '#0f3d4c', primary2: '#15596e', accent: '#2dd4bf' },
};

const SECTION_KINDS = ['text', 'facts', 'cards', 'list', 'table', 'projects', 'timeline', 'chips', 'gallery', 'contact'];

const esc = (v) =>
  String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const arr = (v) => (Array.isArray(v) ? v : []);
const hex = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : fallback);

/** Only images uploaded through the profile builder are allowed */
function img(url, base) {
  const u = String(url || '');
  if (!/^\/uploads\/profiles\/[A-Za-z0-9._-]+$/.test(u)) return '';
  return `${base}/api${u}`;
}

/** Plain text → paragraphs (blank line = new paragraph, single newline = line break) */
const paras = (text, cls = '') =>
  String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p${cls ? ` class="${cls}"` : ''}>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

const lines = (text) =>
  String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

const ticks = (items, cls = '') => (items.length ? `<ul class="ticks ${cls}">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '');

function themeVars(data) {
  const t = THEMES[data.theme] || THEMES['navy-gold'];
  const c = data.colors || {};
  const primary = hex(c.primary, t.primary);
  const accent = hex(c.accent, t.accent);
  return { primary, primary2: hex(c.primary2, c.primary ? primary : t.primary2), accent };
}

// ------------------------------------------------------------------ sections
function sectionBody(s, base) {
  const items = arr(s.items);
  switch (s.kind) {
    case 'text':
      return paras(s.body) + (s.callout ? `<div class="callout">${esc(s.callout)}</div>` : '');
    case 'facts':
      return items.length
        ? `<table class="facts">${items.map((r) => `<tr><th>${esc(r.label)}</th><td>${esc(r.value)}</td></tr>`).join('')}</table>`
        : '';
    case 'cards': {
      const cols = Number(s.columns) === 2 ? 2 : 3;
      const dark = s.style === 'dark' ? ' dark' : '';
      return `<div class="grid g${cols}">${items
        .map((c) => `<div class="card${dark}"><h4>${esc(c.title)}</h4>${paras(c.text, 'small')}${ticks(lines(c.points), 'small')}</div>`)
        .join('')}</div>`;
    }
    case 'list':
      return ticks(items.map((i) => (typeof i === 'string' ? i : i.text)).filter(Boolean), Number(s.columns) === 2 ? 'two-col' : '');
    case 'table': {
      const cols = arr(s.columns).filter((c) => String(c).trim());
      if (!cols.length) return '';
      return `<table class="list"><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${arr(s.rows)
        .map((r) => `<tr>${cols.map((_, i) => `<td>${esc(arr(r)[i])}</td>`).join('')}</tr>`)
        .join('')}</table>`;
    }
    case 'projects':
      return items
        .map((p, i) => {
          const meta = [p.client && `Client: ${p.client}`, p.year && `Year: ${p.year}`, p.meta].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');
          const pic = img(p.image, base);
          return `<div class="proj">
            <div class="proj-head"><span class="proj-no">${String(i + 1).padStart(2, '0')}</span><span class="proj-name">${esc(p.name)}</span>${p.category ? `<span class="tag">${esc(p.category)}</span>` : ''}</div>
            ${paras(p.summary)}${ticks(lines(p.features), 'small')}
            ${pic ? `<img class="shot" src="${esc(pic)}" alt="">` : ''}
            ${meta ? `<div class="meta">${meta}</div>` : ''}
          </div>`;
        })
        .join('');
    case 'timeline':
      return `<div class="timeline">${items
        .map((t) => `<div class="item"><div class="when">${esc(t.when)}</div><h4>${esc(t.title)}</h4>${paras(t.text, 'small')}</div>`)
        .join('')}</div>`;
    case 'chips':
      return `<div class="chips">${items.map((c) => `<span>${esc(typeof c === 'string' ? c : c.text)}</span>`).join('')}</div>`;
    case 'gallery':
      return `<div class="grid g2">${items
        .map((g) => {
          const pic = img(g.image, base);
          return pic ? `<figure><img class="shot" src="${esc(pic)}" alt=""><figcaption>${esc(g.caption)}</figcaption></figure>` : '';
        })
        .join('')}</div>`;
    case 'contact':
      return '';
    default:
      return '';
  }
}

function contactBlock(b) {
  const cards = [
    ['Address', b.address],
    ['Phone', [b.phone, b.phone2].filter(Boolean).join('\n')],
    ['Email', b.email],
    ['Website', b.website],
    ['Working hours', b.hours],
    ['Registration', b.idLine],
  ].filter(([, v]) => v);
  return `<div class="grid g2">${cards.map(([k, v]) => `<div class="card"><h4>${esc(k)}</h4><p>${esc(v).replace(/\n/g, '<br>')}</p></div>`).join('')}</div>`;
}

function renderSection(s, idx, data, base) {
  if (!s || s.hidden || !SECTION_KINDS.includes(s.kind)) return '';
  const b = data.basics || {};
  const closing = s.kind === 'contact';
  const cls = ['section', s.newPage || closing ? 'new-page' : '', closing ? 'closing' : ''].filter(Boolean).join(' ');
  return `<section class="${cls}">
    ${s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : ''}
    ${s.title ? `<h2>${esc(s.title)}</h2><div class="rule"></div>` : ''}
    ${s.intro ? paras(s.intro, 'lead') : ''}
    ${sectionBody(s, base)}
    ${closing ? paras(s.body) + contactBlock(b) : ''}
  </section>`;
}

// ------------------------------------------------------------------ covers
function companyCover(b, base) {
  const logo = img(b.logo, base);
  const initials = (b.monogram || String(b.name || '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2)).toUpperCase();
  return `<section class="cover">
    <div class="frame"></div>
    <div class="inner">
      <div class="monogram"><span>${esc(initials)}</span></div>
      <h1>${esc(b.name)}</h1>
      ${b.subtitle ? `<div class="pl">${esc(b.subtitle)}</div>` : ''}
      ${b.headline ? `<div class="headline">${esc(b.headline).replace(/\n/g, '<br>')}</div>` : ''}
      ${b.tagline ? `<div class="sub">${esc(b.tagline)}</div>` : ''}
      <div class="bottom">
        <div>
          ${b.docLabel ? `<div class="doc">${esc(b.docLabel)}</div>` : ''}
          ${b.edition ? `<div class="sub" style="margin-top:2mm">${esc(b.edition)}</div>` : ''}
        </div>
        <div class="addr">
          ${logo ? `<div class="logo-chip"><img src="${esc(logo)}" alt=""></div>` : ''}
          ${b.address ? `<div style="margin-top:3mm">${esc(b.address)}</div>` : ''}
          ${b.idLine ? `<div>${esc(b.idLine)}</div>` : ''}
        </div>
      </div>
    </div>
  </section>`;
}

function personalHeader(b, base) {
  const photo = img(b.photo, base);
  const facts = [
    ['Location', b.address],
    ['Phone', b.phone],
    ['Email', b.email],
    ['Website', b.website],
    ['LinkedIn', b.linkedin],
  ].filter(([, v]) => v);
  return `<section class="person">
    ${photo ? `<img class="portrait" src="${esc(photo)}" alt="">` : ''}
    <div style="flex:1">
      ${b.docLabel ? `<div class="kicker">${esc(b.docLabel)}</div>` : ''}
      <h1>${esc(b.name)}</h1>
      ${b.subtitle ? `<div class="role">${esc(b.subtitle)}</div>` : ''}
      <div class="rule"></div>
      ${facts.length ? `<table class="facts">${facts.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}
    </div>
  </section>`;
}

// ------------------------------------------------------------------ document
function css({ primary, primary2, accent }, base) {
  const f = (w) => `@font-face{font-family:Poppins;font-weight:${w};src:url(${base}/api/assets/fonts/poppins-latin-${w}-normal.woff) format('woff')}`;
  return `${[400, 500, 600, 700].map(f).join('')}
:root{--p:${primary};--p2:${primary2};--a:${accent};--ink:#1d2433;--muted:#5d6677;--line:#dfe3ea;--tint:#f6f7fa}
@page{size:A4;margin:20mm 18mm 20mm}
@page cover{margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:var(--ink)}
body{font-family:Poppins,'Segoe UI',Arial,sans-serif;font-size:10.5pt;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media screen{body{background:#e3e6ec}.sheet{width:210mm;margin:0 auto;background:#fff;padding:20mm 18mm;box-shadow:0 2px 18px rgba(0,0,0,.12)}.cover{margin:-20mm -18mm 20mm}.section.new-page{border-top:1px dashed #cbd2dc;padding-top:10mm;margin-top:10mm}.cover+.section.new-page,.person+.section.new-page{border-top:0;padding-top:0;margin-top:0}}
h1,h2,h3,h4{color:var(--p);margin:0;line-height:1.2}
.kicker{font-size:8pt;letter-spacing:.28em;text-transform:uppercase;color:var(--a);font-weight:600;margin-bottom:3mm}
h2{font-size:22pt;font-weight:700}
.rule{width:22mm;height:1.1mm;background:var(--a);margin:4mm 0 6mm}
h4{font-size:10.5pt;font-weight:600;margin:0 0 1.5mm}
p{margin:0 0 3mm}
.lead{font-size:12pt;color:var(--p2);line-height:1.6}
.small{font-size:9pt}
.section{margin-bottom:9mm}
.section.new-page{break-before:page}
.section:first-of-type.new-page{break-before:auto}
.cover+.section.new-page,.person+.section.new-page{break-before:auto}
ul.ticks{list-style:none;padding:0;margin:0 0 3mm}
ul.ticks li{padding-left:6mm;position:relative;margin-bottom:1.6mm;break-inside:avoid}
ul.ticks li::before{content:'';position:absolute;left:0;top:2.1mm;width:2.4mm;height:2.4mm;background:var(--a);transform:rotate(45deg)}
ul.ticks.two-col{columns:2;column-gap:8mm}
.grid{display:grid;gap:5mm;margin-bottom:4mm}.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}
.card{border:.3mm solid var(--line);border-top:1mm solid var(--a);border-radius:1.5mm;padding:4.5mm;break-inside:avoid;background:#fff}
.card p:last-child,.card ul:last-child{margin-bottom:0}
.card.dark{background:var(--p);color:#e8ecf3;border-color:var(--p)}.card.dark h4{color:var(--a)}
.callout{border-left:1.2mm solid var(--a);background:var(--tint);padding:4mm 5mm;margin:4mm 0;break-inside:avoid}
table{width:100%;border-collapse:collapse;margin-bottom:4mm}
table.facts{font-size:9.5pt}table.facts th,table.facts td{text-align:left;padding:2.3mm 3mm;border-bottom:.3mm solid var(--line);vertical-align:top}
table.facts th{width:36%;color:var(--p);font-weight:600;background:var(--tint)}
table.list{font-size:9pt}table.list th{background:var(--p);color:#fff;font-weight:500;text-align:left;padding:2.4mm 3mm}
table.list td{padding:2.2mm 3mm;border-bottom:.3mm solid var(--line);vertical-align:top}table.list tr:nth-child(even) td{background:var(--tint)}
tr{break-inside:avoid}
.proj{border:.3mm solid var(--line);border-radius:1.5mm;padding:4.5mm 5mm;margin-bottom:4.5mm;break-inside:avoid}
.proj-head{display:flex;align-items:baseline;gap:3mm;margin-bottom:1.5mm}
.proj-no{font-size:15pt;font-weight:700;color:var(--a)}.proj-name{font-size:12pt;font-weight:600;color:var(--p)}
.tag{font-size:7.2pt;letter-spacing:.12em;text-transform:uppercase;color:var(--p);background:color-mix(in srgb,var(--a) 22%,#fff);padding:.6mm 2mm;border-radius:1mm;margin-left:auto;white-space:nowrap}
.meta{font-size:8pt;color:var(--muted);margin-top:2mm}
img.shot{display:block;width:100%;max-height:85mm;object-fit:cover;border-radius:1.5mm;border:.3mm solid var(--line);margin:2mm 0}
figure{margin:0;break-inside:avoid}figcaption{font-size:8pt;color:var(--muted)}
.timeline{border-left:.6mm solid color-mix(in srgb,var(--a) 35%,#fff);padding-left:6mm;margin-left:1.5mm}
.timeline .item{position:relative;margin-bottom:4.5mm;break-inside:avoid}
.timeline .item::before{content:'';position:absolute;left:-8mm;top:1.4mm;width:3mm;height:3mm;border-radius:50%;background:var(--a);border:.6mm solid #fff}
.timeline .when{font-size:8pt;letter-spacing:.14em;text-transform:uppercase;color:var(--a);font-weight:600}
.chips span{display:inline-block;border:.3mm solid var(--line);border-radius:5mm;padding:.8mm 3mm;margin:0 1.5mm 1.8mm 0;font-size:8.5pt;color:var(--p);background:var(--tint)}
.cover{page:cover;position:relative;height:297mm;width:210mm;background:radial-gradient(120% 70% at 100% 0%,var(--p2) 0%,transparent 60%),linear-gradient(180deg,var(--p),color-mix(in srgb,var(--p) 80%,#000));color:#fff;overflow:hidden}
.cover .frame{position:absolute;inset:12mm;border:.35mm solid color-mix(in srgb,var(--a) 60%,transparent)}
.cover .inner{position:absolute;left:24mm;right:24mm;top:34mm;bottom:30mm;display:flex;flex-direction:column}
.monogram{width:30mm;height:30mm;border:.6mm solid var(--a);display:flex;align-items:center;justify-content:center;font-size:20pt;font-weight:600;color:var(--a);letter-spacing:.08em;transform:rotate(45deg);margin:4mm 0 0 4mm}
.monogram span{transform:rotate(-45deg)}
.cover h1{color:#fff;font-size:34pt;font-weight:700;letter-spacing:.05em;margin-top:22mm}
.cover .pl{color:var(--a);letter-spacing:.5em;font-size:10pt;margin-top:2mm;text-transform:uppercase}
.cover .headline{font-size:22pt;font-weight:300;margin-top:18mm;line-height:1.25}
.cover .sub{color:#c6cfdd;font-size:10.5pt;margin-top:5mm}
.cover .bottom{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;gap:8mm;border-top:.3mm solid color-mix(in srgb,var(--a) 50%,transparent);padding-top:5mm}
.cover .doc{letter-spacing:.3em;font-size:8.5pt;color:var(--a);text-transform:uppercase}
.cover .addr{text-align:right;font-size:8.5pt;color:#c6cfdd}
.logo-chip{background:#fff;padding:2mm 3mm;border-radius:1mm;display:inline-block}.logo-chip img{height:13mm;display:block}
.person{display:flex;gap:9mm;align-items:flex-start;margin-bottom:8mm}
.person h1{font-size:26pt}.person .role{color:var(--p2);font-size:12pt;margin-top:2mm}
.portrait{width:42mm;height:52mm;object-fit:cover;border:.5mm solid var(--a);border-radius:1.5mm}
.closing{background:var(--p);color:#e8ecf3;padding:10mm;border-radius:2mm}
.closing h2{color:#fff}.closing .lead{color:#c6cfdd}
.closing .card{background:rgba(255,255,255,.05);border-color:color-mix(in srgb,var(--a) 40%,transparent);color:#e8ecf3}.closing .card h4{color:var(--a)}`;
}

/**
 * @param {object} profile  { type, title, data }
 * @param {object} opts     { base: absolute API origin (no trailing slash), print: bool }
 */
function renderProfileHtml(profile, { base = '', print = false } = {}) {
  const data = profile.data || {};
  const b = data.basics || {};
  const vars = themeVars(data);
  const sections = arr(data.sections);
  const top = profile.type === 'personal' ? personalHeader(b, base) : companyCover(b, base);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(profile.title || b.name || 'Profile')}</title><style>${css(vars, base)}</style></head>
<body${print ? ' onload="setTimeout(function(){window.print()},400)"' : ''}><main class="sheet">${top}${sections.map((s, i) => renderSection(s, i, data, base)).join('')}</main></body></html>`;
}

module.exports = { renderProfileHtml, THEMES, SECTION_KINDS, themeVars };
