import Stripe from 'stripe';
import { env } from '../../config/env';
import { getIntegration } from '../integrations';

export interface StripeCreds {
  secretKey: string;
  webhookSecret?: string;
}

export async function stripeCreds(): Promise<StripeCreds | null> {
  const stored = await getIntegration('platform', 'STRIPE');
  if (stored?.enabled && stored.secrets.secretKey) return { secretKey: stored.secrets.secretKey, webhookSecret: stored.secrets.webhookSecret };
  if (env.STRIPE_SECRET_KEY) return { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET };
  return null;
}

export const stripeClient = (c: StripeCreds) => new Stripe(c.secretKey);

/** Verifies signature and timestamp (default 5-minute tolerance → replay protection) */
export function constructStripeEvent(rawBody: Buffer, signature: string, secret: string) {
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}
