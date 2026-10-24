/**
 * End-to-end smoke test of the core business flow through the real UI.
 * Requires the API (NODE_ENV=development, no SMTP → dev codes shown) and the web app running:
 *   BASE_URL=http://localhost:5174 node e2e/run.mjs
 * Screenshots are written to e2e/screenshots/.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'admin@creator.local';
const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe-Admin-2026';
const shots = path.join(path.dirname(new URL(import.meta.url).pathname), 'screenshots');
fs.mkdirSync(shots, { recursive: true });

const run = Date.now().toString(36);
const slug = `e2e-${run}`;
const creatorEmail = `creator-${run}@example.test`;
const buyerEmail = `buyer-${run}@example.test`;
let step = 0;

async function shot(page, name) {
  await page.screenshot({ path: path.join(shots, `${String(++step).padStart(2, '0')}-${name}.png`), fullPage: true });
}

function log(msg) {
  console.log(`✔ ${msg}`);
}

/** Reads the 6-digit code shown in the development toast */
async function devCode(page) {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: /code/i }).last();
  await toast.waitFor({ timeout: 10_000 });
  const m = (await toast.innerText()).match(/\b(\d{6})\b/);
  if (!m) throw new Error('No dev code in toast');
  return m[1];
}

async function signup(page, name, email) {
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Passw0rd!123');
  await page.getByRole('button', { name: 'Create account' }).click();
}

const browser = await chromium.launch();
const errors = [];
try {
  // ---------------------------------------------------------------- marketing
  const creator = await browser.newPage();
  creator.on('pageerror', (e) => errors.push(`creator: ${e.message}`));
  await creator.goto(BASE);
  await creator.getByRole('heading', { level: 1 }).first().waitFor();
  await shot(creator, 'home');
  log('marketing home renders from the CMS');

  // ---------------------------------------------------------------- creator onboarding
  await creator.getByRole('link', { name: 'Start free' }).first().click();
  await signup(creator, 'Asha Creator', creatorEmail);
  const code = await devCode(creator);
  await creator.waitForURL('**/verify-email');
  await creator.getByLabel('Code').fill(code);
  await creator.getByRole('button', { name: 'Verify' }).click();
  await creator.waitForURL('**/onboarding');
  await creator.getByLabel('Business or creator name').fill(`E2E Studio ${run}`);
  await creator.getByLabel('Store address').fill(slug);
  await creator.getByRole('button', { name: 'Create workspace' }).click();
  await creator.waitForURL(`**/app/${slug}**`);
  await creator.getByText('Get your business live').waitFor();
  await shot(creator, 'creator-dashboard-empty');
  log('creator signed up, verified email and created a workspace');

  // ---------------------------------------------------------------- branding
  await creator.goto(`${BASE}/app/${slug}/settings`);
  await creator.getByLabel('Tagline').fill('Calm, strong, consistent');
  await creator.getByRole('button', { name: 'Save branding' }).click();
  await creator.getByText('Saved').first().waitFor();
  log('branding saved');

  // ---------------------------------------------------------------- course
  await creator.goto(`${BASE}/app/${slug}/courses`);
  await creator.getByRole('button', { name: 'Create a course' }).click();
  await creator.getByLabel('Course title').fill('Morning Yoga');
  await creator.getByRole('button', { name: 'Create', exact: true }).click();
  await creator.getByRole('button', { name: 'Add lesson' }).click();
  const dialog = creator.getByRole('dialog');
  await dialog.getByLabel('Title').fill('Welcome to the course');
  await dialog.getByLabel('Lesson notes / text').fill('Breathe in. Breathe out. This is lesson one.');
  await dialog.getByRole('button', { name: 'Save lesson' }).click();
  await dialog.waitFor({ state: 'detached' });
  await creator.getByRole('button', { name: 'Publish' }).click();
  await creator.getByText('Course published').waitFor();
  await shot(creator, 'course-editor');
  log('course built and published');

  // ---------------------------------------------------------------- product
  await creator.goto(`${BASE}/app/${slug}/products`);
  await creator.getByRole('button', { name: 'Create a product' }).click();
  const pd = creator.getByRole('dialog');
  await pd.getByLabel('Course', { exact: true }).selectOption({ label: 'Morning Yoga' });
  await pd.getByLabel('Price').fill('0');
  await pd.getByRole('button', { name: 'Create product' }).click();
  await creator.getByRole('button', { name: 'Publish' }).click();
  await creator.getByText('Product is live on your storefront').waitFor();
  await shot(creator, 'product-editor');
  log('product published');

  // ---------------------------------------------------------------- buyer
  const buyerCtx = await browser.newContext();
  const buyer = await buyerCtx.newPage();
  buyer.on('pageerror', (e) => errors.push(`buyer: ${e.message}`));
  await buyer.goto(`${BASE}/s/${slug}`);
  await buyer.getByText('Calm, strong, consistent').waitFor();
  await shot(buyer, 'storefront');
  await buyer.getByRole('link', { name: /Morning Yoga/ }).first().click();
  await buyer.getByText('Course curriculum').waitFor();
  await buyer.getByRole('button', { name: 'Continue' }).click();
  await buyer.waitForURL('**/signup**');
  await signup(buyer, 'Ravi Buyer', buyerEmail);
  await buyer.waitForURL(`**/s/${slug}/p/**`);
  await buyer.getByRole('button', { name: 'Get access' }).click();
  await buyer.getByText("You're in!").waitFor();
  await shot(buyer, 'order-confirmed');
  await buyer.getByRole('link', { name: 'Start learning' }).click();
  await buyer.getByRole('link', { name: /Morning Yoga/ }).click();
  await buyer.getByText('This is lesson one.').waitFor();
  await buyer.getByRole('button', { name: 'Mark as complete' }).click();
  await buyer.getByText('100% complete').waitFor();
  await shot(buyer, 'course-player');
  log('buyer checked out, got access and completed the lesson');

  // mobile storefront
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(`${BASE}/s/${slug}`);
  await mobile.getByText('Calm, strong, consistent').waitFor();
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error('Horizontal overflow on mobile storefront');
  await shot(mobile, 'storefront-mobile');
  log('mobile storefront has no horizontal overflow');

  // ---------------------------------------------------------------- creator sees real data
  await creator.goto(`${BASE}/app/${slug}`);
  const enrolCard = creator.locator('span', { hasText: /^New enrolments$/ }).locator('xpath=../..');
  await enrolCard.waitFor();
  const value = await enrolCard.locator('div.font-display').innerText();
  if (value.trim() !== '1') throw new Error(`Dashboard shows ${value} enrolments, expected 1`);
  await shot(creator, 'creator-dashboard-with-data');
  await creator.goto(`${BASE}/app/${slug}/customers`);
  await creator.getByText(buyerEmail).waitFor();
  log('creator dashboard and CRM show the real enrolment and customer');

  // ---------------------------------------------------------------- super admin
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  admin.on('pageerror', (e) => errors.push(`admin: ${e.message}`));
  await admin.goto(`${BASE}/login`);
  await admin.getByLabel('Email', { exact: true }).fill(ADMIN_EMAIL);
  await admin.getByRole('textbox', { name: 'Password' }).fill(ADMIN_PASSWORD);
  await admin.getByRole('button', { name: 'Sign in' }).click();
  await admin.waitForURL('**/admin');
  await admin.getByText('Platform overview').waitFor();
  await admin.goto(`${BASE}/admin/tenants`);
  await admin.getByText(`E2E Studio ${run}`).waitFor();
  await shot(admin, 'admin-tenants');
  log('super admin sees the new workspace');

  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
  console.log(`\nAll E2E checks passed. Screenshots: ${shots}`);
} catch (e) {
  console.error('✖ E2E failed:', e.message);
  for (const p of browser.contexts().flatMap((c) => c.pages())) {
    await p.screenshot({ path: path.join(shots, `failure-${Date.now()}.png`), fullPage: true }).catch(() => undefined);
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
