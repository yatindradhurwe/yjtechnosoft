import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma, isUniqueViolation } from '../../lib/prisma';
import { badRequest, conflict, forbidden, unavailable } from '../../lib/errors';
import { body, email } from '../../lib/validate';
import { randomToken } from '../../lib/crypto';
import { requireAuth } from '../../middleware/auth';
import { authLimiter, otpSendLimiter } from '../../middleware/rateLimit';
import { audit } from '../../services/audit';
import {
  consumeOtp,
  hashPassword,
  issueSession,
  passwordLogin,
  publicUser,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  sendOtp,
  verifyPassword,
} from './service';

export const authRouter = Router();

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Use letters and at least one number');

/** Cookie-authenticated endpoints require this header (custom headers force a CORS preflight) */
function requireCsrfHeader(req: import('express').Request) {
  if (req.get('x-requested-with') !== 'fetch') throw forbidden('Missing CSRF header');
}

authRouter.post('/signup', authLimiter, async (req, res) => {
  const input = body(req, z.object({ name: z.string().trim().min(2).max(100), email, password }));
  let user;
  try {
    user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password) },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('An account with this email already exists. Sign in instead.');
    throw e;
  }
  const dev = await sendOtp(user.email, 'EMAIL_VERIFY', user.id);
  await audit({ action: 'user.signup', actorId: user.id, entityType: 'user', entityId: user.id, req });
  const session = await issueSession(user.id, req, res);
  res.status(201).json({ ...session, user: publicUser(user), ...dev });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const input = body(req, z.object({ email, password: z.string().min(1).max(200) }));
  const user = await passwordLogin(input.email, input.password);
  await audit({ action: 'user.login', actorId: user.id, entityType: 'user', entityId: user.id, req });
  res.json({ ...(await issueSession(user.id, req, res)), user: publicUser(user) });
});

/** Passwordless sign-in: always responds 200 so emails cannot be enumerated */
authRouter.post('/otp/request', otpSendLimiter, async (req, res) => {
  const input = body(req, z.object({ email }));
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  let dev = {};
  if (user && !user.deletedAt && user.status === 'ACTIVE') dev = await sendOtp(user.email, 'LOGIN_OTP', user.id);
  res.json({ ok: true, ...dev });
});

authRouter.post('/otp/verify', authLimiter, async (req, res) => {
  const input = body(req, z.object({ email, code: z.string().regex(/^\d{6}$/) }));
  await consumeOtp(input.email, 'LOGIN_OTP', input.code);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: input.email } });
  if (user.status !== 'ACTIVE') throw forbidden('This account is suspended');
  // Receiving the code proves ownership of the address
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date(), failedLoginCount: 0, lockedUntil: null },
  });
  await audit({ action: 'user.login_otp', actorId: user.id, entityType: 'user', entityId: user.id, req });
  res.json({ ...(await issueSession(user.id, req, res)), user: publicUser(updated) });
});

authRouter.post('/verify-email', requireAuth, authLimiter, async (req, res) => {
  const input = body(req, z.object({ code: z.string().regex(/^\d{6}$/) }));
  await consumeOtp(req.user!.email, 'EMAIL_VERIFY', input.code);
  const user = await prisma.user.update({ where: { id: req.user!.id }, data: { emailVerifiedAt: new Date() } });
  res.json({ user: publicUser(user) });
});

authRouter.post('/verify-email/resend', requireAuth, otpSendLimiter, async (req, res) => {
  if (req.user!.emailVerifiedAt) throw badRequest('Email already verified');
  res.json({ ok: true, ...(await sendOtp(req.user!.email, 'EMAIL_VERIFY', req.user!.id)) });
});

authRouter.post('/password/forgot', otpSendLimiter, async (req, res) => {
  const input = body(req, z.object({ email }));
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  let dev = {};
  if (user && !user.deletedAt) dev = await sendOtp(user.email, 'PASSWORD_RESET', user.id);
  res.json({ ok: true, ...dev });
});

authRouter.post('/password/reset', authLimiter, async (req, res) => {
  const input = body(req, z.object({ email, code: z.string().regex(/^\d{6}$/), password }));
  await consumeOtp(input.email, 'PASSWORD_RESET', input.code);
  const user = await prisma.user.update({
    where: { email: input.email },
    data: { passwordHash: await hashPassword(input.password), failedLoginCount: 0, lockedUntil: null, emailVerifiedAt: new Date() },
  });
  await revokeAllSessions(user.id);
  await audit({ action: 'user.password_reset', actorId: user.id, entityType: 'user', entityId: user.id, req });
  res.json({ ok: true });
});

authRouter.post('/refresh', async (req, res) => {
  requireCsrfHeader(req);
  res.json(await rotateSession(req, res));
});

authRouter.post('/logout', async (req, res) => {
  requireCsrfHeader(req);
  await revokeSession(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, status: 'ACTIVE', tenant: { deletedAt: null } },
    include: { tenant: { select: { id: true, slug: true, name: true, logoUrl: true, primaryColor: true, status: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    user: publicUser(user),
    workspaces: memberships.map((m) => ({ ...m.tenant, roles: m.roles })),
  });
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const input = body(
    req,
    z.object({
      name: z.string().trim().min(2).max(100).optional(),
      phone: z.string().trim().max(20).regex(/^[+\d\s-]*$/).optional(),
    }),
  );
  const user = await prisma.user.update({ where: { id: req.user!.id }, data: input });
  res.json({ user: publicUser(user) });
});

authRouter.post('/password/change', requireAuth, authLimiter, async (req, res) => {
  const input = body(req, z.object({ currentPassword: z.string().optional(), newPassword: password }));
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (user.passwordHash && !(await verifyPassword(user.passwordHash, input.currentPassword ?? ''))) {
    throw badRequest('Current password is incorrect');
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } });
  await revokeAllSessions(user.id);
  await audit({ action: 'user.password_change', entityType: 'user', entityId: user.id, req });
  res.json({ ...(await issueSession(user.id, req, res)) });
});

/** Personal data export (JSON): profile, memberships, orders, enrollments, posts, messages */
authRouter.get('/me/export', requireAuth, async (req, res) => {
  const id = req.user!.id;
  const [user, memberships, orders, enrollments, progress, posts, comments, messages, bookings, registrations, certificates] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, email: true, name: true, phone: true, createdAt: true, emailVerifiedAt: true, lastLoginAt: true } }),
    prisma.membership.findMany({ where: { userId: id }, include: { tenant: { select: { name: true, slug: true } } } }),
    prisma.order.findMany({ where: { userId: id }, include: { items: true, invoice: true } }),
    prisma.enrollment.findMany({ where: { userId: id }, include: { course: { select: { title: true } } } }),
    prisma.lessonProgress.findMany({ where: { userId: id } }),
    prisma.post.findMany({ where: { authorId: id } }),
    prisma.comment.findMany({ where: { authorId: id } }),
    prisma.message.findMany({ where: { senderId: id } }),
    prisma.booking.findMany({ where: { customerId: id } }),
    prisma.workshopRegistration.findMany({ where: { userId: id } }),
    prisma.certificate.findMany({ where: { userId: id } }),
  ]);
  await audit({ action: 'user.export', entityType: 'user', entityId: id, req });
  res.set('content-disposition', 'attachment; filename="my-data.json"').json({ exportedAt: new Date().toISOString(), user, memberships, orders, enrollments, progress, posts, comments, messages, bookings, registrations, certificates });
});

/** Account deletion: anonymises personal data, keeps financial records for legal retention */
authRouter.delete('/me', requireAuth, async (req, res) => {
  const owned = await prisma.tenant.count({ where: { ownerId: req.user!.id, deletedAt: null } });
  if (owned) throw badRequest('Transfer or delete the workspaces you own before deleting your account');
  const id = req.user!.id;
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), email: `deleted+${id}@invalid`, name: 'Deleted user', phone: null, avatarUrl: null, passwordHash: null, status: 'SUSPENDED' },
    }),
    prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.membership.updateMany({ where: { userId: id }, data: { status: 'SUSPENDED' } }),
  ]);
  await audit({ action: 'user.delete', entityType: 'user', entityId: id, req });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Google sign-in (OAuth 2.0 authorization code flow). Needs GOOGLE_CLIENT_ID/SECRET.
// ---------------------------------------------------------------------------

const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const googleRedirect = () => `${env.API_URL}/api/auth/google/callback`;

authRouter.get('/google/status', (_req, res) => res.json({ enabled: googleConfigured() }));

authRouter.get('/google/start', (req, res) => {
  if (!googleConfigured()) throw unavailable('Google sign-in is not configured');
  const state = randomToken(16);
  res.cookie('g_state', state, { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', maxAge: 600_000, path: '/api/auth/google' });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirect(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authRouter.get('/google/callback', async (req, res) => {
  if (!googleConfigured()) throw unavailable('Google sign-in is not configured');
  const { code, state } = req.query as Record<string, string>;
  if (!code || !state || state !== req.cookies?.g_state) throw badRequest('Invalid sign-in state, please try again');
  res.clearCookie('g_state', { path: '/api/auth/google' });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirect(),
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw badRequest('Google sign-in failed');
  const tokens = (await tokenRes.json()) as { access_token: string };
  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  const info = (await infoRes.json()) as { email?: string; email_verified?: boolean; name?: string; picture?: string };
  if (!info.email || !info.email_verified) throw badRequest('Your Google account email is not verified');
  const emailAddr = info.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email: emailAddr } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: emailAddr, name: info.name ?? emailAddr.split('@')[0], avatarUrl: info.picture, emailVerifiedAt: new Date() },
    });
  } else if (!user.emailVerifiedAt) {
    user = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  }
  if (user.status !== 'ACTIVE' || user.deletedAt) throw forbidden('This account is suspended');
  await issueSession(user.id, req, res);
  await audit({ action: 'user.login_google', actorId: user.id, entityType: 'user', entityId: user.id, req });
  // The web app calls /refresh on load and receives an access token from the cookie
  res.redirect(`${env.APP_URL}/auth/callback`);
});
