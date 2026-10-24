import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { testOutbox } from '../src/services/email';

export const app = createApp();
export const api = () => request(app);

let seq = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}${++seq}-${Date.now()}@example.test`;

/** Most recent 6-digit code emailed to `email` */
export function lastCode(email: string) {
  const msg = [...testOutbox].reverse().find((m) => m.to === email);
  const code = msg?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`No code emailed to ${email}`);
  return code;
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  cookie: string;
}

export async function signup(opts: { email?: string; name?: string; verify?: boolean } = {}): Promise<TestUser> {
  const email = opts.email ?? uniqueEmail();
  const res = await api().post('/api/auth/signup').send({ name: opts.name ?? 'Test User', email, password: 'Passw0rd!' });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = String(res.headers['set-cookie']?.[0] ?? '').split(';')[0];
  const user = { id: res.body.user.id, email, token: res.body.accessToken, cookie };
  if (opts.verify !== false) {
    const v = await api().post('/api/auth/verify-email').set('authorization', `Bearer ${user.token}`).send({ code: lastCode(email) });
    if (v.status !== 200) throw new Error(`verify failed: ${JSON.stringify(v.body)}`);
  }
  return user;
}

export async function ensurePlans() {
  await prisma.subscriptionPlan.upsert({
    where: { key: 'starter' },
    create: { key: 'starter', name: 'Starter', platformFeeBps: 500, limits: { maxCourses: 50, maxProducts: 50, maxTeamMembers: 10, customDomain: true, affiliates: true, automations: true, aiCreditsMonthly: 100 }, sortOrder: 0 },
    update: {},
  });
}

export async function createCreator(slug?: string) {
  await ensurePlans();
  const owner = await signup({ name: 'Creator' });
  const s = slug ?? `studio-${++seq}-${Math.floor(Math.random() * 1e6)}`;
  const res = await api().post('/api/workspaces').set('authorization', `Bearer ${owner.token}`).send({ name: 'Test Studio', slug: s });
  if (res.status !== 201) throw new Error(`workspace failed: ${JSON.stringify(res.body)}`);
  return { owner, tenant: res.body.workspace as { id: string; slug: string } };
}

/** Authorised request helpers */
export const as = (u: { token: string }, tenant?: { id: string }) => {
  const wrap = (r: request.Test) => {
    r.set('authorization', `Bearer ${u.token}`);
    if (tenant) r.set('x-tenant', tenant.id);
    return r;
  };
  return {
    get: (url: string) => wrap(api().get(url)),
    post: (url: string) => wrap(api().post(url)),
    patch: (url: string) => wrap(api().patch(url)),
    put: (url: string) => wrap(api().put(url)),
    delete: (url: string) => wrap(api().delete(url)),
  };
};
