import { env } from '../../config/env';
import { hmacHex, safeEqual } from '../../lib/crypto';
import { getIntegration } from '../integrations';

export interface RazorpayCreds {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
}

/** Credentials from the Super Admin integration screen, falling back to env */
export async function razorpayCreds(): Promise<RazorpayCreds | null> {
  const stored = await getIntegration('platform', 'RAZORPAY');
  if (stored?.enabled && stored.config.keyId && stored.secrets.keySecret) {
    return { keyId: String(stored.config.keyId), keySecret: stored.secrets.keySecret, webhookSecret: stored.secrets.webhookSecret };
  }
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
    return { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET };
  }
  return null;
}

async function call<T>(creds: RazorpayCreds, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64')}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) throw new Error(`Razorpay ${method} ${path} failed: ${json.error?.description ?? res.status}`);
  return json;
}

export interface RzpOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}
export interface RzpPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  fee?: number;
  tax?: number;
  error_description?: string;
}
export interface RzpRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: 'pending' | 'processed' | 'failed';
}

export const razorpay = {
  createOrder: (c: RazorpayCreds, input: { amount: number; currency: string; receipt: string; notes: Record<string, string> }) =>
    call<RzpOrder>(c, 'POST', '/orders', { ...input, payment_capture: 1 }),
  orderPayments: (c: RazorpayCreds, orderId: string) => call<{ items: RzpPayment[] }>(c, 'GET', `/orders/${encodeURIComponent(orderId)}/payments`),
  refund: (c: RazorpayCreds, paymentId: string, amount: number, notes: Record<string, string>) =>
    call<RzpRefund>(c, 'POST', `/payments/${encodeURIComponent(paymentId)}/refund`, { amount, notes, speed: 'normal' }),

  /** Webhook: HMAC-SHA256 of the raw body with the webhook secret */
  verifyWebhook(rawBody: Buffer, signature: string, secret: string) {
    return !!signature && safeEqual(hmacHex(secret, rawBody), signature);
  },
  /** Checkout handler: HMAC-SHA256("order_id|payment_id") with the key secret */
  verifyCheckout(c: RazorpayCreds, orderId: string, paymentId: string, signature: string) {
    return !!signature && safeEqual(hmacHex(c.keySecret, `${orderId}|${paymentId}`), signature);
  },
};
