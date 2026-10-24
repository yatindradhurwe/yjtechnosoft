import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { PlatformRole } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../lib/errors';

interface AccessClaims {
  sub: string;
  typ: 'access';
}

export function signAccessToken(userId: string) {
  return jwt.sign({ typ: 'access' }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: env.ACCESS_TOKEN_TTL_SEC,
    algorithm: 'HS256',
  });
}

async function loadUser(req: Request) {
  const header = req.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;
  let claims: AccessClaims;
  try {
    claims = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as unknown as AccessClaims;
  } catch {
    throw unauthorized('Session expired, please sign in again');
  }
  if (claims.typ !== 'access') throw unauthorized();
  const user = await prisma.user.findFirst({
    where: { id: claims.sub, deletedAt: null },
    select: { id: true, email: true, name: true, platformRole: true, status: true, emailVerifiedAt: true },
  });
  if (!user) throw unauthorized();
  if (user.status !== 'ACTIVE') throw forbidden('This account is suspended');
  return user;
}

/** Requires a valid access token */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await loadUser(req);
  if (!user) throw unauthorized();
  req.user = user;
  next();
}

/** Attaches the user when a token is present, but does not require one */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await loadUser(req).catch(() => null);
  if (user) req.user = user;
  next();
}

export function requirePlatformRole(...roles: PlatformRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (req.user.platformRole === 'SUPER_ADMIN' || roles.includes(req.user.platformRole)) return next();
    throw forbidden();
  };
}
