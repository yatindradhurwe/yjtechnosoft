import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { hash, verify } from '@node-rs/argon2';
import type { TokenPurpose, User } from '@prisma/client';
import { env, isProd } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { randomCode, randomToken, sha256 } from '../../lib/crypto';
import { badRequest, forbidden, unauthorized } from '../../lib/errors';
import { signAccessToken } from '../../middleware/auth';
import { emailConfigured, sendEmail } from '../../services/email';

export const REFRESH_COOKIE = 'rt';
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;

// argon2id with OWASP-recommended parameters
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string) => hash(password, ARGON);
export const verifyPassword = (stored: string, password: string) => verify(stored, password).catch(() => false);

export function publicUser(u: Pick<User, 'id' | 'email' | 'name' | 'platformRole' | 'emailVerifiedAt' | 'avatarUrl' | 'phone'>) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    platformRole: u.platformRole,
    emailVerified: !!u.emailVerifiedAt,
  };
}

// ---------------------------------------------------------------------------
// Sessions (refresh-token rotation with reuse detection)
// ---------------------------------------------------------------------------

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400_000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth', httpOnly: true, secure: isProd, sameSite: 'strict' });
}

async function createSession(userId: string, req: Request, familyId?: string) {
  const token = randomToken(48);
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      familyId: familyId ?? randomUUID(),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400_000),
      userAgent: req.get('user-agent')?.slice(0, 300),
      ip: req.ip,
    },
  });
  return { token, session };
}

/** Starts a session: sets the refresh cookie and returns an access token */
export async function issueSession(userId: string, req: Request, res: Response) {
  const { token } = await createSession(userId, req);
  setRefreshCookie(res, token);
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return { accessToken: signAccessToken(userId), expiresIn: env.ACCESS_TOKEN_TTL_SEC };
}

export async function rotateSession(req: Request, res: Response) {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (!presented) throw unauthorized('No session');
  const current = await prisma.session.findUnique({ where: { tokenHash: sha256(presented) } });
  if (!current) throw unauthorized('Session not found');
  if (current.revokedAt) {
    // A rotated token was presented again: treat as theft and end the whole family.
    await prisma.session.updateMany({ where: { familyId: current.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    clearRefreshCookie(res);
    throw unauthorized('Session was revoked, please sign in again');
  }
  if (current.expiresAt < new Date()) throw unauthorized('Session expired');
  const user = await prisma.user.findUnique({ where: { id: current.userId } });
  if (!user || user.deletedAt || user.status !== 'ACTIVE') throw unauthorized('Account unavailable');

  const { token, session } = await createSession(user.id, req, current.familyId);
  // Conditional update: if two refreshes race, only one wins; the loser is treated as reuse
  const updated = await prisma.session.updateMany({
    where: { id: current.id, revokedAt: null },
    data: { revokedAt: new Date(), replacedById: session.id },
  });
  if (updated.count === 0) {
    await prisma.session.updateMany({ where: { familyId: current.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw unauthorized('Session was revoked, please sign in again');
  }
  setRefreshCookie(res, token);
  return { accessToken: signAccessToken(user.id), expiresIn: env.ACCESS_TOKEN_TTL_SEC, user: publicUser(user) };
}

export async function revokeSession(req: Request, res: Response) {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (presented) {
    const s = await prisma.session.findUnique({ where: { tokenHash: sha256(presented) } });
    if (s) await prisma.session.updateMany({ where: { familyId: s.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  clearRefreshCookie(res);
}

export async function revokeAllSessions(userId: string) {
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// Password login with lockout
// ---------------------------------------------------------------------------

export async function passwordLogin(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Same message for unknown email / wrong password to avoid account enumeration
  const invalid = unauthorized('Incorrect email or password');
  if (!user || user.deletedAt || !user.passwordHash) {
    await hashPassword(password); // equalise timing
    throw invalid;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw forbidden('Too many failed attempts. Try again in a few minutes or sign in with an email code.');
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
      },
    });
    throw invalid;
  }
  if (user.status !== 'ACTIVE') throw forbidden('This account is suspended');
  if (user.failedLoginCount || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  }
  return user;
}

// ---------------------------------------------------------------------------
// One-time codes (email verification, passwordless login, password reset)
// ---------------------------------------------------------------------------

const OTP_COPY: Record<TokenPurpose, { subject: string; line: string }> = {
  EMAIL_VERIFY: { subject: 'Verify your email', line: 'Use this code to verify your email address' },
  LOGIN_OTP: { subject: 'Your sign-in code', line: 'Use this code to sign in' },
  PASSWORD_RESET: { subject: 'Reset your password', line: 'Use this code to reset your password' },
};

/**
 * Creates and emails a 6-digit code. Returns the code only in development when no
 * email provider is configured, so local setups work without SMTP.
 */
export async function sendOtp(email: string, purpose: TokenPurpose, userId?: string) {
  // Invalidate older unused codes for the same purpose
  await prisma.verificationToken.updateMany({
    where: { email, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const code = randomCode(6);
  await prisma.verificationToken.create({
    data: {
      email,
      purpose,
      userId,
      codeHash: sha256(`${purpose}:${email}:${code}`),
      expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000),
    },
  });
  const copy = OTP_COPY[purpose];
  await sendEmail({
    to: email,
    subject: `${copy.subject} – ${env.BRAND_NAME}`,
    text: `${copy.line}: ${code}\n\nThe code expires in ${OTP_TTL_MIN} minutes. If you did not request it, you can ignore this email.`,
  });
  const exposeForDev = env.NODE_ENV === 'development' && !(await emailConfigured());
  return exposeForDev ? { devCode: code } : {};
}

export async function consumeOtp(email: string, purpose: TokenPurpose, code: string) {
  const token = await prisma.verificationToken.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  const invalid = badRequest('The code is invalid or has expired');
  if (!token || token.expiresAt < new Date()) throw invalid;
  if (token.attempts >= OTP_MAX_ATTEMPTS) throw badRequest('Too many attempts. Request a new code.');
  if (token.codeHash !== sha256(`${purpose}:${email}:${code}`)) {
    await prisma.verificationToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
    throw invalid;
  }
  // Conditional consume prevents the same code being used twice concurrently
  const used = await prisma.verificationToken.updateMany({
    where: { id: token.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (used.count === 0) throw invalid;
  return token;
}
