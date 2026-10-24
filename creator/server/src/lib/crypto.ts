import crypto from 'node:crypto';
import { env, isProd } from '../config/env';

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const randomCode = (digits = 6) => crypto.randomInt(0, 10 ** digits).toString().padStart(digits, '0');

export function hmacHex(secret: string, data: string | Buffer) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/** Constant-time string comparison */
export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function encryptionKey(): Buffer {
  if (env.INTEGRATION_ENCRYPTION_KEY) {
    const key = Buffer.from(env.INTEGRATION_ENCRYPTION_KEY, 'base64');
    if (key.length !== 32) throw new Error('INTEGRATION_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
    return key;
  }
  if (isProd) throw new Error('INTEGRATION_ENCRYPTION_KEY missing');
  // Development fallback – derived, not secret. Never used in production (see env.ts).
  return crypto.createHash('sha256').update('dev-integration-key').digest();
}

/** AES-256-GCM. Output: base64(iv | tag | ciphertext) */
export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decryptJson<T = Record<string, string>>(payload: string): T {
  const buf = Buffer.from(payload, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  const dec = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
  return JSON.parse(dec.toString('utf8')) as T;
}
