import { describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { api, as, createCreator, signup } from './helpers';
import { prisma } from '../src/lib/prisma';

// Stripe's HTTP API is mocked; webhook signature verification uses the real SDK
let sessionSeq = 0;
vi.mock('../src/services/payments/stripe', async (orig) => {
  const real = await orig<typeof import('../src/services/payments/stripe')>();
  return {
    ...real,
    stripeClient: () => ({
      checkout: { sessions: { create: async () => ({ id: `cs_test_${++sessionSeq}`, url: `https://checkout.stripe.test/${sessionSeq}` }) } },
      refunds: { create: async () => ({ id: `re_${Date.now()}`, status: 'pending' }) },
    }),
  };
});

function stripeWebhook(event: object, opts: { secret?: string; timestamp?: number } = {}) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? 'whsec_stripe_test', timestamp: opts.timestamp });
  return api().post('/api/webhooks/stripe').set('content-type', 'application/json').set('stripe-signature', header).send(payload);
}

async function usdStore() {
  const { owner, tenant } = await createCreator();
  const o = as(owner, tenant);
  const asset = await o.post('/api/media').field('visibility', 'PRIVATE').attach('file', Buffer.from('%PDF-1.4 test ebook'), { filename: 'ebook.pdf', contentType: 'application/pdf' });
  expect(asset.status).toBe(201);
  const product = await o.post('/api/products').send({
    type: 'DIGITAL_DOWNLOAD',
    title: 'Ebook',
    items: [{ resourceType: 'DOWNLOAD', resourceId: asset.body.asset.id }],
    prices: [{ currency: 'USD', amount: 1900 }],
  });
  await o.post(`/api/products/${product.body.product.id}/status`).send({ status: 'PUBLISHED' }).expect(200);
  return { owner, tenant, assetId: asset.body.asset.id as string, priceId: product.body.product.prices[0].id as string };
}

describe('stripe payments', () => {
  it('fulfils a USD order only from a signed checkout.session.completed event, once', async () => {
    const s = await usdStore();
    const buyer = await signup();
    const c = await as(buyer).post(`/api/store/${s.tenant.slug}/checkout`).send({ priceId: s.priceId, buyer: { name: 'Sam Buyer', country: 'US' } });
    expect(c.status).toBe(201);
    expect(c.body.provider).toBe('STRIPE');
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: c.body.orderId } });
    const event = {
      id: 'evt_stripe_1',
      type: 'checkout.session.completed',
      data: { object: { id: payment.providerOrderId, payment_status: 'paid', payment_intent: 'pi_123', amount_total: 1900, currency: 'usd' } },
    };
    // Forged signature
    expect((await stripeWebhook(event, { secret: 'whsec_wrong' })).status).toBe(400);
    // Replayed old event (outside Stripe's 5-minute tolerance)
    expect((await stripeWebhook(event, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: c.body.orderId } })).status).toBe('PENDING');
    // Buyer cannot download before payment
    expect((await as(buyer).get(`/api/media/download/${s.tenant.id}/${s.assetId}`)).status).toBe(403);

    expect((await stripeWebhook(event)).status).toBe(200);
    expect((await stripeWebhook(event)).body.duplicate).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: c.body.orderId } })).status).toBe('PAID');

    const dl = await as(buyer).get(`/api/media/download/${s.tenant.id}/${s.assetId}`);
    expect(dl.status).toBe(200);
    const file = await api().get(dl.body.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toContain('attachment');

    // Refund reported by Stripe revokes the download
    await stripeWebhook({ id: 'evt_refund_1', type: 'refund.updated', data: { object: { id: 're_1', status: 'succeeded', amount: 1900, payment_intent: 'pi_123' } } }).expect(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: c.body.orderId } })).status).toBe('REFUNDED');
    expect((await as(buyer).get(`/api/media/download/${s.tenant.id}/${s.assetId}`)).status).toBe(403);
  });
});

describe('media security', () => {
  it('rejects disallowed and disguised files', async () => {
    const { owner, tenant } = await createCreator();
    const o = as(owner, tenant);
    expect((await o.post('/api/media').attach('file', Buffer.from('<svg onload=alert(1)>'), { filename: 'x.svg', contentType: 'image/svg+xml' })).status).toBe(400);
    expect((await o.post('/api/media').attach('file', Buffer.from('MZ not a png'), { filename: 'x.png', contentType: 'image/png' })).status).toBe(400);
  });

  it('serves private files only through valid, unexpired signed URLs', async () => {
    const { owner, tenant } = await createCreator();
    const o = as(owner, tenant);
    const up = await o.post('/api/media').attach('file', Buffer.from('%PDF-1.4 private'), { filename: 'notes.pdf', contentType: 'application/pdf' });
    const id = up.body.asset.id;
    expect((await api().get(`/api/media/public/${id}`)).status).toBe(404);
    const signed = await o.get(`/api/media/${id}/signed-url`);
    expect((await api().get(signed.body.url)).status).toBe(200);
    expect((await api().get(signed.body.url.replace(/sig=[a-f0-9]+/, 'sig=00'))).status).toBe(403);
    expect((await api().get(signed.body.url.replace(/exp=\d+/, 'exp=1'))).status).toBe(403);
    // Another workspace cannot mint a URL for it
    const other = await createCreator();
    expect((await as(other.owner, other.tenant).get(`/api/media/${id}/signed-url`)).status).toBe(404);
  });

  it('serves public images without auth', async () => {
    const { owner, tenant } = await createCreator();
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const up = await as(owner, tenant).post('/api/media').field('visibility', 'PUBLIC').attach('file', png, { filename: 'logo.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    const res = await api().get(up.body.asset.url);
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
