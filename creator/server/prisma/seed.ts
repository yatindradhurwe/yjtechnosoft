/**
 * Seed script.
 *   npm run db:seed              → plans, Super Admin (from env), marketing CMS pages. Safe to re-run.
 *   npm run db:seed -- --demo    → also a clearly labelled demo creator workspace (refused in production).
 * Existing rows are never overwritten.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import 'dotenv/config';

const prisma = new PrismaClient();
const demo = process.argv.includes('--demo');
const brand = process.env.BRAND_NAME ?? 'YJ Creator Studio';

const plans = [
  {
    key: 'starter',
    name: 'Starter',
    description: 'Everything you need to launch your first course.',
    priceMonthly: 0,
    priceYearly: 0,
    platformFeeBps: 1000,
    sortOrder: 0,
    limits: { maxCourses: 3, maxProducts: 5, maxTeamMembers: 1, storageMb: 5120, aiCreditsMonthly: 50, customDomain: false, affiliates: false, automations: false },
  },
  {
    key: 'growth',
    name: 'Growth',
    description: 'For creators selling every week.',
    priceMonthly: 199900,
    priceYearly: 1999000,
    platformFeeBps: 500,
    sortOrder: 1,
    limits: { maxCourses: 25, maxProducts: 50, maxTeamMembers: 5, storageMb: 51200, aiCreditsMonthly: 500, customDomain: true, affiliates: true, automations: true },
  },
  {
    key: 'pro',
    name: 'Pro',
    description: 'Teams, communities and high-volume launches.',
    priceMonthly: 499900,
    priceYearly: 4999000,
    platformFeeBps: 200,
    sortOrder: 2,
    limits: { maxCourses: null, maxProducts: null, maxTeamMembers: 25, storageMb: 512000, aiCreditsMonthly: 3000, customDomain: true, affiliates: true, automations: true },
  },
];

const cta = { label: 'Start free', href: '/signup' };

const pages: { slug: string; title: string; showInNav: boolean; navOrder: number; seo: object; sections: object[] }[] = [
  {
    slug: 'home',
    title: 'Home',
    showInNav: false,
    navOrder: 0,
    seo: { title: `${brand} – sell courses, memberships and coaching`, description: 'Launch your creator business: courses, live workshops, paid communities, 1:1 coaching and a branded storefront with Indian payments.' },
    sections: [
      { type: 'hero', id: 'hero', style: { background: 'brand', align: 'center', paddingY: 'lg' }, eyebrow: 'Built for Indian creators', heading: 'Turn what you know into a business you own', subheading: 'Courses, live workshops, paid communities and 1:1 coaching – on your own branded storefront, with UPI, cards and GST invoices built in.', primary: cta, secondary: { label: 'See features', href: '/features' } },
      { type: 'stats', id: 'stats', style: { background: 'default', align: 'center' }, items: [{ value: '1 place', label: 'for content, community and payments' }, { value: 'UPI + cards', label: 'Razorpay and Stripe checkout' }, { value: 'GST-ready', label: 'invoices on every sale' }] },
      {
        type: 'features',
        id: 'features',
        style: { background: 'muted' },
        heading: 'Everything you need to run your creator business',
        columns: 3,
        items: [
          { icon: 'graduation-cap', title: 'Courses that people finish', body: 'Video, PDF and text lessons, drip schedules, quizzes, assignments and certificates.' },
          { icon: 'radio', title: 'Live workshops', body: 'Paid or free registrations, waitlists, Zoom links protected behind login, replays and reminders.' },
          { icon: 'users', title: 'Paid communities', body: 'Channels, posts, comments, direct messages and moderation – members only.' },
          { icon: 'calendar', title: '1:1 coaching', body: 'Availability calendars with buffers, time zones and no double bookings.' },
          { icon: 'store', title: 'Your own storefront', body: 'Branded pages, coupons, bundles and memberships on your subdomain or custom domain.' },
          { icon: 'sparkles', title: 'AI that knows your business', body: 'Draft course outlines, emails and landing pages; ask questions about your own sales data.' },
        ],
      },
      { type: 'testimonials', id: 'testimonials', heading: 'Creators on the platform', items: [{ quote: '[Add a real customer quote here before launch]', name: '[Creator name]', role: '[Niche]' }] },
      { type: 'faq', id: 'faq', heading: 'Questions, answered', items: [
        { q: 'How do I get paid?', a: 'Buyers pay through Razorpay (India) or Stripe (international). Your earnings, fees and refunds are tracked in your balance and paid out to your bank account on request.' },
        { q: 'Can I use my own domain?', a: 'Yes, on Growth and Pro. Add a DNS record and we verify it before routing traffic.' },
        { q: 'Do you charge a transaction fee?', a: 'Each plan has a platform fee shown on the pricing page. Payment gateway fees are charged by the provider.' },
      ] },
      { type: 'cta', id: 'cta', style: { background: 'dark', align: 'center' }, heading: 'Launch your first product this week', body: 'Free to start. No card required.', button: cta },
    ],
  },
  {
    slug: 'features',
    title: 'Features',
    showInNav: true,
    navOrder: 1,
    seo: { title: `Features – ${brand}` },
    sections: [
      { type: 'hero', id: 'hero', style: { align: 'center' }, heading: 'One platform for teaching, community and sales', subheading: 'Every feature works together, so a sale instantly unlocks the course, the community and the workshop seat.' },
      { type: 'features', id: 'learn', heading: 'Courses & learning', columns: 2, items: [
        { title: 'Curriculum builder', body: 'Modules and lessons with drag-to-reorder, previews and scheduled publishing.' },
        { title: 'Drip & prerequisites', body: 'Unlock lessons in order, a number of days after enrolment, or on fixed dates.' },
        { title: 'Quizzes & assignments', body: 'Server-graded quizzes and reviewed assignments with feedback.' },
        { title: 'Certificates', body: 'Issued automatically on completion with a public verification ID.' },
      ] },
      { type: 'features', id: 'grow', style: { background: 'muted' }, heading: 'Marketing & growth', columns: 2, items: [
        { title: 'CRM', body: 'Every buyer and lead in one place with tags, consent and purchase history.' },
        { title: 'Email & WhatsApp', body: 'Campaigns and automations through your own SMTP and WhatsApp Business account.' },
        { title: 'Affiliates', body: 'Referral links, attribution windows and commissions that reverse on refunds.' },
        { title: 'Landing pages', body: 'Section-based builder with versions, rollback and lead forms.' },
      ] },
      { type: 'cta', id: 'cta', heading: 'Ready to start?', button: cta },
    ],
  },
  {
    slug: 'pricing',
    title: 'Pricing',
    showInNav: true,
    navOrder: 2,
    seo: { title: `Pricing – ${brand}` },
    sections: [
      { type: 'hero', id: 'hero', style: { align: 'center' }, heading: 'Simple pricing that grows with you', subheading: 'Start free. Upgrade when you need more.' },
      { type: 'pricing', id: 'plans', source: 'plans', items: [] },
      { type: 'faq', id: 'faq', heading: 'Billing FAQ', items: [{ q: 'Are prices inclusive of GST?', a: 'Plan prices are shown before GST, which is added on your invoice.' }, { q: 'Can I change plans later?', a: 'Yes. Contact support to upgrade or downgrade at any time.' }] },
    ],
  },
  {
    slug: 'about',
    title: 'About',
    showInNav: true,
    navOrder: 3,
    seo: { title: `About – ${brand}` },
    sections: [{ type: 'text', id: 'about', heading: `About ${brand}`, body: 'We build software that lets educators, coaches and creators run their business on their own terms. [Edit this page in Admin › Website.]' }],
  },
  {
    slug: 'contact',
    title: 'Contact',
    showInNav: true,
    navOrder: 4,
    seo: { title: `Contact – ${brand}` },
    sections: [{ type: 'text', id: 'contact', heading: 'Talk to us', body: 'Email support@example.com or book a demo. [Edit this page in Admin › Website.]' }],
  },
  { slug: 'privacy', title: 'Privacy policy', showInNav: false, navOrder: 10, seo: {}, sections: [{ type: 'text', id: 'privacy', heading: 'Privacy policy', body: '[Replace with your privacy policy reviewed by counsel, covering the Digital Personal Data Protection Act, 2023 and any other laws that apply to you.]' }] },
  { slug: 'terms', title: 'Terms of service', showInNav: false, navOrder: 11, seo: {}, sections: [{ type: 'text', id: 'terms', heading: 'Terms of service', body: '[Replace with your terms of service reviewed by counsel.]' }] },
  { slug: 'refund-policy', title: 'Refund policy', showInNav: false, navOrder: 12, seo: {}, sections: [{ type: 'text', id: 'refunds', heading: 'Refund policy', body: '[Replace with your refund policy.]' }] },
];

async function main() {
  for (const p of plans) {
    await prisma.subscriptionPlan.upsert({ where: { key: p.key }, create: { ...p, limits: p.limits as Prisma.InputJsonValue }, update: {} });
  }
  for (const page of pages) {
    await prisma.cmsPage.upsert({ where: { slug: page.slug }, create: { ...page, status: 'PUBLISHED' }, update: {} });
  }
  await prisma.siteSetting.upsert({
    where: { key: 'site' },
    create: {
      key: 'site',
      value: {
        brandName: brand,
        tagline: 'The creator business platform',
        logoUrl: '',
        announcement: '',
        footerText: `© ${new Date().getFullYear()} ${brand}. All rights reserved.`,
        contactEmail: '',
        footerLinks: [
          { label: 'Privacy', href: '/privacy' },
          { label: 'Terms', href: '/terms' },
          { label: 'Refunds', href: '/refund-policy' },
        ],
        social: {},
        analytics: {},
      },
    },
    update: {},
  });
  for (const key of ['ai-assistant', 'video-feed', 'creator-tools']) {
    await prisma.featureFlag.upsert({ where: { key }, create: { key, enabled: true, rolloutPercent: 100, description: `Module: ${key}` }, update: {} });
  }

  const email = process.env.SUPER_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 12) throw new Error('SUPER_ADMIN_PASSWORD must be at least 12 characters');
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({ data: { email, name: 'Platform Admin', passwordHash: await hash(password), platformRole: 'SUPER_ADMIN', emailVerifiedAt: new Date() } });
      console.log(`✔ Super Admin created: ${email}`);
    } else if (existing.platformRole !== 'SUPER_ADMIN') {
      await prisma.user.update({ where: { id: existing.id }, data: { platformRole: 'SUPER_ADMIN' } });
      console.log(`✔ ${email} promoted to Super Admin`);
    }
  } else {
    console.log('ℹ Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD to create the first Super Admin.');
  }

  if (demo) {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to create demo data in production');
    await seedDemo();
  }
  console.log('✔ Seed complete');
}

/** DEMO DATA – clearly labelled, development only */
async function seedDemo() {
  const email = 'creator@demo.test';
  if (await prisma.user.findUnique({ where: { email } })) return console.log('ℹ Demo data already present');
  const creator = await prisma.user.create({ data: { email, name: 'Demo Creator', passwordHash: await hash('DemoPass123'), emailVerifiedAt: new Date() } });
  const student = await prisma.user.create({ data: { email: 'student@demo.test', name: 'Demo Student', passwordHash: await hash('DemoPass123'), emailVerifiedAt: new Date() } });
  const plan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { key: 'growth' } });
  const tenant = await prisma.tenant.create({
    data: { slug: 'demo-yoga', name: 'Demo Yoga Studio (demo data)', tagline: 'Sample workspace for development', ownerId: creator.id, primaryColor: '#0f766e', accentColor: '#f59e0b', supportEmail: email },
  });
  await prisma.membership.create({ data: { tenantId: tenant.id, userId: creator.id, roles: ['OWNER'] } });
  await prisma.tenantSubscription.create({ data: { tenantId: tenant.id, planId: plan.id } });
  const course = await prisma.course.create({
    data: { tenantId: tenant.id, slug: 'yoga-foundations', title: 'Yoga Foundations', subtitle: 'A gentle 2-week start', description: 'Demo course content.', status: 'PUBLISHED', publishAt: new Date(), certificateEnabled: true, createdById: creator.id },
  });
  const mod = await prisma.courseModule.create({ data: { tenantId: tenant.id, courseId: course.id, title: 'Week 1', position: 0 } });
  await prisma.lesson.createMany({
    data: [
      { tenantId: tenant.id, courseId: course.id, moduleId: mod.id, title: 'Welcome', type: 'TEXT', body: 'Welcome to the demo course.', position: 0, isPreview: true },
      { tenantId: tenant.id, courseId: course.id, moduleId: mod.id, title: 'Breathing basics', type: 'EMBED', embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', position: 1 },
      { tenantId: tenant.id, courseId: course.id, moduleId: mod.id, title: 'Morning flow', type: 'TEXT', body: 'Ten minutes, every morning.', position: 2 },
    ],
  });
  const product = await prisma.product.create({
    data: { tenantId: tenant.id, slug: 'yoga-foundations', type: 'COURSE', title: 'Yoga Foundations', description: 'Demo product.', status: 'PUBLISHED', featured: true, items: { create: [{ resourceType: 'COURSE', resourceId: course.id }] }, prices: { create: [{ tenantId: tenant.id, currency: 'INR', amount: 99900, compareAtAmount: 149900 }] } },
  });
  const community = await prisma.community.create({
    data: { tenantId: tenant.id, name: 'Yoga Circle', slug: 'yoga-circle', access: 'FREE', channels: { create: [{ tenantId: tenant.id, name: 'Announcements', type: 'ANNOUNCEMENT', position: 0 }, { tenantId: tenant.id, name: 'General', type: 'FEED', position: 1 }] } },
  });
  await prisma.membership.create({ data: { tenantId: tenant.id, userId: student.id, roles: ['STUDENT'] } });
  await prisma.workshop.create({
    data: { tenantId: tenant.id, title: 'Live Sunday session', startsAt: new Date(Date.now() + 5 * 86400_000), endsAt: new Date(Date.now() + 5 * 86400_000 + 3600_000), capacity: 50, status: 'PUBLISHED', meetingUrl: 'https://meet.example.com/demo' },
  });
  console.log(`✔ Demo workspace /s/${tenant.slug} (creator@demo.test / DemoPass123, student@demo.test / DemoPass123). Product ${product.id}, community ${community.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
