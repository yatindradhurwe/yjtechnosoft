'use strict';

// Renders the sample templates with a sample business profile into ./out.
//   npm run demo
const fs = require('fs/promises');
const path = require('path');
const { renderTemplate, createAssetLoader, renderCacheKey } = require('../src');

const ROOT = path.join(__dirname, '..');
const read = async (p) => JSON.parse(await fs.readFile(path.join(ROOT, p), 'utf8'));

const data = {
  business: {
    name: 'Shree Ram Homes & Developers',
    tagline: 'Trusted builders in Raipur since 2008',
    category: 'real-estate',
    phone: '+91 98765 43210',
    whatsapp: '+91 98765 43210',
    email: 'sales@shreeramhomes.in',
    website: 'www.shreeramhomes.in',
    address: 'VIP Road, Raipur, Chhattisgarh',
    city: 'Raipur, Chhattisgarh',
  },
  brand: {
    logo: { primary: 'sample-logo.svg' },
    colors: { primary: '#1e3a8a', secondary: '#0f172a', accent: '#f59e0b' },
  },
  event: { key: 'diwali', name: 'Diwali', date: '2026-11-08' },
  post: { price: 'Starting ₹ 42.5 Lakh*', link: 'https://www.shreeramhomes.in/projects/skyline' },
};

async function main() {
  const loadAsset = createAssetLoader({ assetRoot: path.join(ROOT, 'templates/assets') });
  const loadFrame = (id) => read(`frames/${path.basename(id)}.json`);
  await fs.mkdir(path.join(ROOT, 'out'), { recursive: true });

  const jobs = [
    { name: 'diwali-wave', template: 'templates/festival-diwali-square.json' },
    { name: 'diwali-classic', template: 'templates/festival-diwali-square.json', frameId: 'footer-classic' },
    { name: 'diwali-english-edited', template: 'templates/festival-diwali-square.json', overrides: { greeting: { text: 'Happy Diwali', style: { color: '#ffffff' } }, 'frame/address': { hidden: true } } },
    { name: 'realestate-promo', template: 'templates/realestate-2bhk-promo.json' },
    { name: 'realestate-promo-preview', template: 'templates/realestate-2bhk-promo.json', width: 540, format: 'webp' },
  ];

  for (const job of jobs) {
    const template = await read(job.template);
    const options = { loadAsset, loadFrame, frameId: job.frameId, overrides: job.overrides, width: job.width, format: job.format, strict: true };
    const { buffer, info, stats } = await renderTemplate(template, data, options);
    const file = path.join(ROOT, 'out', `${job.name}.${info.format}`);
    await fs.writeFile(file, buffer);
    console.log(
      `${path.relative(ROOT, file).padEnd(36)} ${info.width}x${info.height}  ${(buffer.length / 1024).toFixed(0).padStart(4)} KB  ` +
        `${stats.ms.toFixed(0).padStart(4)} ms  key=${renderCacheKey(template, data, options).slice(0, 12)}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
