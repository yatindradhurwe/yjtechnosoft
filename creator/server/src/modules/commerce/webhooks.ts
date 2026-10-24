import { Router, Request } from 'express';
import type Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { prisma, isUniqueViolation } from '../../lib/prisma';
import { sha256 } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { razorpay, razorpayCreds, RzpPayment, RzpRefund } from '../../services/payments/razorpay';
import { constructStripeEvent, stripeCreds } from '../../services/payments/stripe';
import { applyRefund, capturePayment, markPaymentFailed, recordExternalRefund } from './capture';

/**
 * Payment provider webhooks. Every event is:
 *  1. signature-verified against the raw body (unsigned/forged → 400, nothing stored)
 *  2. recorded once in WebhookEvent (provider + event id unique) → duplicates and replays are no-ops
 *  3. processed; failures are stored and the provider's retry re-processes the event
 */
export const webhooksRouter = Router();

type Outcome = 'PROCESSED' | 'IGNORED';

async function processOnce(provider: string, eventId: string, type: string, payload: unknown, handler: () => Promise<Outcome>) {
  let event;
  try {
    event = await prisma.webhookEvent.create({ data: { provider, eventId, type, payload: payload as Prisma.InputJsonValue } });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    event = await prisma.webhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider, eventId } } });
    if (event.status === 'PROCESSED' || event.status === 'IGNORED') return { duplicate: true };
  }
  try {
    const status = await handler();
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status, processedAt: new Date(), attempts: { increment: 1 }, error: null } });
    return { duplicate: false, status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: 'FAILED', error: msg.slice(0, 2000), attempts: { increment: 1 } } });
    logger.error({ provider, eventId, err: msg }, 'webhook processing failed');
    throw e;
  }
}

const raw = (req: Request) => req.rawBody ?? Buffer.from('');

// ---------------------------------------------------------------------------
// Razorpay
// ---------------------------------------------------------------------------

webhooksRouter.post('/razorpay', async (req, res) => {
  const creds = await razorpayCreds();
  if (!creds?.webhookSecret) return res.status(503).json({ message: 'Razorpay webhooks are not configured' });
  const signature = req.get('x-razorpay-signature') ?? '';
  if (!razorpay.verifyWebhook(raw(req), signature, creds.webhookSecret)) {
    logger.warn({ ip: req.ip }, 'razorpay webhook with invalid signature');
    return res.status(400).json({ message: 'Invalid signature' });
  }
  const body = req.body as { event: string; payload: { payment?: { entity: RzpPayment }; refund?: { entity: RzpRefund } } };
  const eventId = req.get('x-razorpay-event-id') ?? sha256(raw(req).toString('utf8'));

  const result = await processOnce('razorpay', eventId, body.event, body, async () => {
    const p = body.payload.payment?.entity;
    switch (body.event) {
      case 'payment.captured':
      case 'order.paid': {
        if (!p) return 'IGNORED';
        const payment = await prisma.payment.findUnique({ where: { provider_providerOrderId: { provider: 'RAZORPAY', providerOrderId: p.order_id } } });
        if (!payment) return 'IGNORED';
        await capturePayment({ paymentId: payment.id, providerPaymentId: p.id, amount: p.amount, currency: p.currency, gatewayFee: p.fee ?? 0, source: `razorpay:${body.event}` });
        return 'PROCESSED';
      }
      case 'payment.failed': {
        if (!p) return 'IGNORED';
        const payment = await prisma.payment.findUnique({ where: { provider_providerOrderId: { provider: 'RAZORPAY', providerOrderId: p.order_id } } });
        if (!payment) return 'IGNORED';
        await markPaymentFailed(payment.id, p.error_description ?? 'Payment failed');
        return 'PROCESSED';
      }
      case 'refund.processed': {
        const r = body.payload.refund?.entity;
        if (!r) return 'IGNORED';
        const payment = await prisma.payment.findUnique({ where: { provider_providerPaymentId: { provider: 'RAZORPAY', providerPaymentId: r.payment_id } } });
        if (!payment) return 'IGNORED';
        await recordExternalRefund(payment, r.id, r.amount, 'razorpay:refund.processed');
        return 'PROCESSED';
      }
      case 'refund.failed': {
        const r = body.payload.refund?.entity;
        if (r) await prisma.refund.updateMany({ where: { provider: 'RAZORPAY', providerRefundId: r.id, status: { in: ['REQUESTED', 'PENDING'] } }, data: { status: 'FAILED' } });
        return 'PROCESSED';
      }
      default:
        return 'IGNORED';
    }
  });
  res.json({ ok: true, ...result });
});

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

webhooksRouter.post('/stripe', async (req, res) => {
  const creds = await stripeCreds();
  if (!creds?.webhookSecret) return res.status(503).json({ message: 'Stripe webhooks are not configured' });
  let event: Stripe.Event;
  try {
    event = constructStripeEvent(raw(req), req.get('stripe-signature') ?? '', creds.webhookSecret);
  } catch {
    logger.warn({ ip: req.ip }, 'stripe webhook with invalid signature');
    return res.status(400).json({ message: 'Invalid signature' });
  }
  const result = await processOnce('stripe', event.id, event.type, event, async () => {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.payment_status !== 'paid') return 'IGNORED';
        const payment = await prisma.payment.findUnique({ where: { provider_providerOrderId: { provider: 'STRIPE', providerOrderId: s.id } } });
        if (!payment) return 'IGNORED';
        const pi = typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id ?? null);
        await capturePayment({ paymentId: payment.id, providerPaymentId: pi, amount: s.amount_total ?? -1, currency: s.currency ?? '', source: `stripe:${event.type}` });
        return 'PROCESSED';
      }
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const payment = await prisma.payment.findUnique({ where: { provider_providerOrderId: { provider: 'STRIPE', providerOrderId: s.id } } });
        if (!payment) return 'IGNORED';
        await markPaymentFailed(payment.id, event.type === 'checkout.session.expired' ? 'Checkout expired' : 'Payment failed');
        return 'PROCESSED';
      }
      case 'refund.created':
      case 'refund.updated': {
        const r = event.data.object as Stripe.Refund;
        if (r.status !== 'succeeded') return 'IGNORED';
        const pi = typeof r.payment_intent === 'string' ? r.payment_intent : r.payment_intent?.id;
        if (!pi) return 'IGNORED';
        const payment = await prisma.payment.findUnique({ where: { provider_providerPaymentId: { provider: 'STRIPE', providerPaymentId: pi } } });
        if (!payment) return 'IGNORED';
        await recordExternalRefund(payment, r.id, r.amount, `stripe:${event.type}`);
        return 'PROCESSED';
      }
      default:
        return 'IGNORED';
    }
  });
  res.json({ received: true, ...result });
});

export { applyRefund };
