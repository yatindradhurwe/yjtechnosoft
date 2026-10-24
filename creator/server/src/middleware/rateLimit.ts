import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env';

const make = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit: isTest ? 10_000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message },
  });

/** Login / OTP / reset endpoints – per IP */
export const authLimiter = make(15 * 60_000, 30, 'Too many attempts. Please wait a few minutes and try again.');
/** Sending codes by email – stricter */
export const otpSendLimiter = make(15 * 60_000, 8, 'Too many codes requested. Please wait before requesting another.');
/** General API */
export const apiLimiter = make(60_000, 600, 'Too many requests, slow down.');
/** Public write endpoints (lead forms, checkout) */
export const publicWriteLimiter = make(60_000, 30, 'Too many requests, please try again shortly.');
/** AI endpoints */
export const aiLimiter = make(60_000, 20, 'AI rate limit reached, please wait a minute.');
