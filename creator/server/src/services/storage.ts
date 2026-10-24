import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import { hmacHex, safeEqual } from '../lib/crypto';

/**
 * Storage driver. LOCAL keeps files on disk outside any public web root; files are
 * only reachable through API routes that check access and signed, expiring URLs.
 * An S3-compatible driver can implement the same three functions (see docs/PROVIDERS.md).
 */
export interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  absolutePath(key: string): string;
  remove(key: string): Promise<void>;
}

const root = path.resolve(env.UPLOAD_DIR);

export const localStorage: StorageDriver = {
  async put(key, data) {
    const file = this.absolutePath(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  },
  absolutePath(key) {
    const file = path.resolve(root, key);
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid storage key');
    return file;
  },
  async remove(key) {
    await fs.rm(this.absolutePath(key), { force: true });
  },
};

/** Signed URL bound to asset + user + expiry. Cannot be reused by another account after expiry. */
export function signMediaUrl(assetId: string, userId: string, ttlSec = 300) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = hmacHex(env.MEDIA_SIGNING_SECRET, `${assetId}:${userId}:${exp}`);
  return `/api/media/file/${assetId}?u=${userId}&exp=${exp}&sig=${sig}`;
}

export function verifyMediaSignature(assetId: string, userId: string, exp: number, sig: string) {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  return safeEqual(hmacHex(env.MEDIA_SIGNING_SECRET, `${assetId}:${userId}:${exp}`), sig);
}
