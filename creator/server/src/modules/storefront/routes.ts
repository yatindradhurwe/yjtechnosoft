import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound, unavailable } from '../../lib/errors';
import { body, email, parse } from '../../lib/validate';
import { nextNumber } from '../../lib/counter';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { resolvePublicTenant } from '../../middleware/tenant';
import { publicWriteLimiter } from '../../middleware/rateLimit';
import { hasEntitlement } from '../../services/access';
import { audit } from '../../services/audit';
import { razorpay, razorpayCreds } from '../../services/payments/razorpay';
import { stripeClient, stripeCreds } from '../../services/payments/stripe';
import { computeQuote, resolveCoupon } from '../commerce/pricing';
import { capturePayment } from '../commerce/capture';
import { isCourseLive } from '../courses/service';
import { upsertContact } from '../customers/service';
import { resolveAttribution } from '../affiliates/attribution';

/** Public, branded storefront for a workspace: /api/store/:tenantSlug/... */
export const storefrontRouter = Router({ mergeParams: true });
storefrontRouter.use(resolvePublicTenant);

const publicTenant = (t: NonNullable<Express.Request['tenant']>) => ({
  id: t.id,
  slug: t.slug,
  name: t.name,
  tagline: t.tagline,
  about: t.about,
  logoUrl: t.logoUrl,
  faviconUrl: t.faviconUrl,
  socialImageUrl: t.socialImageUrl,
  primaryColor: t.primaryColor,
  accentColor: t.accentColor,
  fontFamily: t.fontFamily,
  supportEmail: t.supportEmail,
  currency: t.currency,
});

const productSelect = {
  id: true,
  slug: true,
  type: true,
  title: true,
  description: true,
  coverUrl: true,
  category: true,
  featured: true,
  prices: { where: { active: true }, orderBy: { amount: 'asc' as const }, select: { id: true, label: true, currency: true, amount: true, compareAtAmount: true, type: true, interval: true, accessDays: true } },
};

storefrontRouter.get('/', async (req, res) => {
  const products = await prisma.product.findMany({
    where: { tenantId: req.tenant!.id, status: 'PUBLISHED', deletedAt: null },
    orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    select: productSelect,
  });
  res.json({ store: publicTenant(req.tenant!), products });
});

storefrontRouter.get('/products/:productSlug', optionalAuth, async (req, res) => {
  const product = await prisma.product.findFirst({
    where: { tenantId: req.tenant!.id, slug: String(req.params.productSlug), status: 'PUBLISHED', deletedAt: null },
    select: { ...productSelect, items: true },
  });
  if (!product) throw notFound('Product not found');
  // Curriculum outline for course products: titles only, plus free-preview lessons
  const courses = await Promise.all(
    product.items
      .filter((i) => i.resourceType === 'COURSE')
      .map(async (i) => {
        const c = await prisma.course.findUnique({
          where: { id: i.resourceId },
          include: { modules: { orderBy: { position: 'asc' }, include: { lessons: { where: { published: true }, orderBy: { position: 'asc' }, select: { id: true, title: true, type: true, durationSec: true, isPreview: true } } } } },
        });
        if (!c || !isCourseLive(c)) return null;
        const reviews = await prisma.courseReview.aggregate({ where: { courseId: c.id }, _avg: { rating: true }, _count: true });
        return {
          id: c.id,
          title: c.title,
          subtitle: c.subtitle,
          level: c.level,
          modules: c.modules.map((m) => ({ title: m.title, lessons: m.lessons })),
          rating: reviews._avg.rating,
          reviewCount: reviews._count,
        };
      }),
  );
  const owned = req.user ? await hasEntitlement(req.user.id, req.tenant!.id, product.type === 'MEMBERSHIP' ? 'MEMBERSHIP' : 'PRODUCT', product.id) : false;
  const { items: _items, ...rest } = product;
  res.json({ store: publicTenant(req.tenant!), product: rest, courses: courses.filter(Boolean), owned });
});

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

const buyerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(20).regex(/^[+\d\s-]*$/).optional(),
  country: z.string().length(2).toUpperCase().default('IN'),
  state: z.string().regex(/^\d{2}$/, 'Use the 2-digit GST state code').optional(),
});

const checkoutSchema = z.object({
  priceId: z.string().uuid(),
  couponCode: z.string().trim().max(30).optional(),
  buyer: buyerSchema,
  affiliateCode: z.string().trim().max(40).optional(),
  visitorId: z.string().max(64).optional(),
  marketingConsent: z.boolean().default(false),
});

async function loadPrice(tenantId: string, priceId: string) {
  const price = await prisma.productPrice.findFirst({ where: { id: priceId, tenantId, active: true }, include: { product: true } });
  if (!price || price.product.status !== 'PUBLISHED' || price.product.deletedAt) throw notFound('This product is not available');
  return price;
}

storefrontRouter.post('/checkout/quote', publicWriteLimiter, optionalAuth, async (req, res) => {
  const input = body(req, z.object({ priceId: z.string().uuid(), couponCode: z.string().trim().max(30).optional(), country: z.string().length(2).toUpperCase().default('IN') }));
  const price = await loadPrice(req.tenant!.id, input.priceId);
  const { coupon, discount } = await resolveCoupon(req.tenant!.id, input.couponCode, price.productId, req.user?.id, price.amount);
  res.json({ quote: { ...computeQuote(req.tenant!, price, discount, input.country), coupon: coupon ? { code: coupon.code } : null } });
});

/** Which provider will take this payment. INR → Razorpay; other currencies → Stripe. */
async function pickProvider(currency: string) {
  if (currency === 'INR') {
    const rz = await razorpayCreds();
    if (rz) return { provider: 'RAZORPAY' as const, rz };
  }
  const st = await stripeCreds();
  if (st) return { provider: 'STRIPE' as const, st };
  return null;
}

storefrontRouter.post('/checkout', publicWriteLimiter, requireAuth, async (req, res) => {
  const input = body(req, checkoutSchema);
  const tenant = req.tenant!;
  const user = req.user!;
  const price = await loadPrice(tenant.id, input.priceId);
  const product = price.product;

  const ownKey = product.type === 'MEMBERSHIP' ? 'MEMBERSHIP' : 'PRODUCT';
  if (price.type === 'ONE_TIME' && !price.accessDays && (await hasEntitlement(user.id, tenant.id, ownKey, product.id))) {
    throw conflict('You already own this. Open it from your library.');
  }
  const { coupon, discount } = await resolveCoupon(tenant.id, input.couponCode, product.id, user.id, price.amount);
  const quote = computeQuote(tenant, price, discount, input.buyer.country);
  const affiliateId = await resolveAttribution(tenant.id, input.affiliateCode, input.visitorId, user.id);

  const chosen = quote.total > 0 ? await pickProvider(quote.currency) : null;
  if (quote.total > 0 && !chosen) throw unavailable('Online payments are not set up yet. Please contact the creator.');

  const order = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, tenant.id, 'order');
    const o = await tx.order.create({
      data: {
        tenantId: tenant.id,
        number,
        userId: user.id,
        currency: quote.currency,
        subtotal: quote.subtotal,
        discount: quote.discount,
        taxAmount: quote.taxAmount,
        total: quote.total,
        couponId: coupon?.id,
        affiliateId,
        buyerName: input.buyer.name,
        buyerEmail: user.email,
        buyerPhone: input.buyer.phone,
        buyerCountry: input.buyer.country,
        buyerState: input.buyer.state,
        items: { create: [{ productId: product.id, priceId: price.id, title: product.title, unitAmount: price.amount, discount: quote.discount, taxAmount: quote.taxAmount, total: quote.total }] },
      },
    });
    await upsertContact(tx, tenant.id, { email: user.email, name: input.buyer.name, phone: input.buyer.phone, userId: user.id, source: 'checkout', consentEmail: input.marketingConsent });
    return o;
  });

  // Free (or 100%-discounted) orders are fulfilled immediately – there is no payment to verify
  if (quote.total === 0) {
    const payment = await prisma.payment.create({ data: { tenantId: tenant.id, orderId: order.id, provider: 'FREE', amount: 0, currency: quote.currency } });
    await capturePayment({ paymentId: payment.id, providerPaymentId: null, amount: 0, currency: quote.currency, source: 'free_checkout' });
    return res.status(201).json({ orderId: order.id, status: 'PAID', provider: 'FREE' });
  }

  if (chosen!.provider === 'RAZORPAY') {
    const rzOrder = await razorpay.createOrder(chosen!.rz, {
      amount: quote.total,
      currency: quote.currency,
      receipt: `${tenant.slug}-${order.number}`.slice(0, 40),
      notes: { orderId: order.id, tenantId: tenant.id },
    });
    await prisma.payment.create({ data: { tenantId: tenant.id, orderId: order.id, provider: 'RAZORPAY', providerOrderId: rzOrder.id, amount: quote.total, currency: quote.currency } });
    return res.status(201).json({
      orderId: order.id,
      status: 'PENDING',
      provider: 'RAZORPAY',
      razorpay: {
        keyId: chosen!.rz.keyId,
        orderId: rzOrder.id,
        amount: quote.total,
        currency: quote.currency,
        name: tenant.name,
        description: product.title,
        prefill: { name: input.buyer.name, email: user.email, contact: input.buyer.phone },
        themeColor: tenant.primaryColor,
      },
    });
  }

  const stripe = stripeClient(chosen!.st);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: user.email,
    client_reference_id: order.id,
    metadata: { orderId: order.id, tenantId: tenant.id },
    line_items: [{ quantity: 1, price_data: { currency: quote.currency.toLowerCase(), unit_amount: quote.total, product_data: { name: product.title } } }],
    success_url: `${env.APP_URL}/s/${tenant.slug}/orders/${order.id}`,
    cancel_url: `${env.APP_URL}/s/${tenant.slug}/p/${product.slug}?canceled=1`,
  });
  await prisma.payment.create({ data: { tenantId: tenant.id, orderId: order.id, provider: 'STRIPE', providerOrderId: session.id, amount: quote.total, currency: quote.currency } });
  res.status(201).json({ orderId: order.id, status: 'PENDING', provider: 'STRIPE', stripe: { url: session.url } });
});

/**
 * Called by the browser after Razorpay Checkout returns. The signature proves the
 * response came from Razorpay, and we then ask Razorpay's API directly whether the
 * order has a captured payment of the right amount before fulfilling. Webhooks
 * remain the primary path; this makes fulfilment immediate when they are slow.
 */
storefrontRouter.post('/orders/:orderId/razorpay/verify', requireAuth, async (req, res) => {
  const orderId = parse(z.string().uuid(), req.params.orderId);
  const input = body(req, z.object({ razorpay_order_id: z.string().max(100), razorpay_payment_id: z.string().max(100), razorpay_signature: z.string().max(200) }));
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: req.tenant!.id, userId: req.user!.id } });
  if (!order) throw notFound('Order not found');
  const payment = await prisma.payment.findFirst({ where: { orderId, provider: 'RAZORPAY', providerOrderId: input.razorpay_order_id } });
  if (!payment) throw badRequest('Payment does not belong to this order');
  const creds = await razorpayCreds();
  if (!creds) throw unavailable('Payments are not configured');
  if (!razorpay.verifyCheckout(creds, input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
    await audit({ action: 'payment.signature_invalid', tenantId: order.tenantId, entityType: 'order', entityId: order.id, req });
    throw forbidden('Payment signature could not be verified');
  }
  const { items } = await razorpay.orderPayments(creds, input.razorpay_order_id);
  const captured = items.find((p) => p.id === input.razorpay_payment_id && p.status === 'captured');
  if (captured) {
    await capturePayment({ paymentId: payment.id, providerPaymentId: captured.id, amount: captured.amount, currency: captured.currency, gatewayFee: captured.fee ?? 0, source: 'razorpay_api_verify' });
  }
  const fresh = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  res.json({ status: fresh.status });
});

/** Order status for the buyer's confirmation page (polls until the webhook lands) */
storefrontRouter.get('/orders/:orderId', requireAuth, async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: parse(z.string().uuid(), req.params.orderId), tenantId: req.tenant!.id, userId: req.user!.id },
    include: { items: true, invoice: true, payments: { select: { provider: true, status: true, failureReason: true } } },
  });
  if (!order) throw notFound('Order not found');
  res.json({ order, store: publicTenant(req.tenant!) });
});

/** Lead capture from storefront / landing page forms */
storefrontRouter.post('/leads', publicWriteLimiter, async (req, res) => {
  const input = body(
    req,
    z.object({
      email,
      name: z.string().trim().max(100).optional(),
      phone: z.string().trim().max(20).regex(/^[+\d\s-]*$/).optional(),
      consent: z.literal(true, { errorMap: () => ({ message: 'Please agree to receive emails' }) }),
      tag: z.string().trim().max(40).optional(),
      source: z.string().trim().max(60).default('lead_form'),
    }),
  );
  const supp = await prisma.suppression.findUnique({ where: { tenantId_channel_address: { tenantId: req.tenant!.id, channel: 'EMAIL', address: input.email } } });
  if (supp) await prisma.suppression.delete({ where: { tenantId_channel_address: { tenantId: req.tenant!.id, channel: 'EMAIL', address: input.email } } });
  await upsertContact(prisma, req.tenant!.id, { email: input.email, name: input.name, phone: input.phone, source: input.source, consentEmail: true, tag: input.tag });
  res.status(201).json({ ok: true });
});
