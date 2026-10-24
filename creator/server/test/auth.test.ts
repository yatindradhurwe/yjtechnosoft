import { describe, expect, it } from 'vitest';
import { api, as, lastCode, signup, uniqueEmail } from './helpers';
import { prisma } from '../src/lib/prisma';

describe('auth', () => {
  it('signs up, verifies email, and returns profile', async () => {
    const u = await signup({ verify: false });
    const me = await as(u).get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.emailVerified).toBe(false);
    const v = await as(u).post('/api/auth/verify-email').send({ code: lastCode(u.email) });
    expect(v.status).toBe(200);
    expect(v.body.user.emailVerified).toBe(true);
  });

  it('stores passwords hashed with argon2id', async () => {
    const u = await signup();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rejects duplicate signup and wrong password with a generic message', async () => {
    const u = await signup();
    const dup = await api().post('/api/auth/signup').send({ name: 'X Y', email: u.email, password: 'Passw0rd!' });
    expect(dup.status).toBe(409);
    const bad = await api().post('/api/auth/login').send({ email: u.email, password: 'wrong-pass1' });
    expect(bad.status).toBe(401);
    const unknown = await api().post('/api/auth/login').send({ email: uniqueEmail(), password: 'wrong-pass1' });
    expect(unknown.body.message).toBe(bad.body.message);
  });

  it('locks the account after repeated failures', async () => {
    const u = await signup();
    for (let i = 0; i < 5; i++) await api().post('/api/auth/login').send({ email: u.email, password: 'nope-nope1' });
    const locked = await api().post('/api/auth/login').send({ email: u.email, password: 'Passw0rd!' });
    expect(locked.status).toBe(403);
  });

  it('signs in with an email OTP and a code cannot be reused', async () => {
    const u = await signup();
    await api().post('/api/auth/otp/request').send({ email: u.email }).expect(200);
    const code = lastCode(u.email);
    const ok = await api().post('/api/auth/otp/verify').send({ email: u.email, code });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
    const again = await api().post('/api/auth/otp/verify').send({ email: u.email, code });
    expect(again.status).toBe(400);
  });

  it('does not reveal whether an email exists when requesting an OTP', async () => {
    const res = await api().post('/api/auth/otp/request').send({ email: uniqueEmail() });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const u = await signup();
    const first = await api().post('/api/auth/refresh').set('cookie', u.cookie).set('x-requested-with', 'fetch');
    expect(first.status).toBe(200);
    const newCookie = String(first.headers['set-cookie'][0]).split(';')[0];
    // Re-using the old (rotated) token revokes the whole family
    const reuse = await api().post('/api/auth/refresh').set('cookie', u.cookie).set('x-requested-with', 'fetch');
    expect(reuse.status).toBe(401);
    const afterTheft = await api().post('/api/auth/refresh').set('cookie', newCookie).set('x-requested-with', 'fetch');
    expect(afterTheft.status).toBe(401);
  });

  it('requires the CSRF header on cookie-authenticated endpoints', async () => {
    const u = await signup();
    const res = await api().post('/api/auth/refresh').set('cookie', u.cookie);
    expect(res.status).toBe(403);
  });

  it('resets a password with a code and ends existing sessions', async () => {
    const u = await signup();
    await api().post('/api/auth/password/forgot').send({ email: u.email }).expect(200);
    const reset = await api().post('/api/auth/password/reset').send({ email: u.email, code: lastCode(u.email), password: 'NewPassw0rd' });
    expect(reset.status).toBe(200);
    const old = await api().post('/api/auth/refresh').set('cookie', u.cookie).set('x-requested-with', 'fetch');
    expect(old.status).toBe(401);
    await api().post('/api/auth/login').send({ email: u.email, password: 'NewPassw0rd' }).expect(200);
  });

  it('rejects requests without a valid access token', async () => {
    await api().get('/api/auth/me').expect(401);
    await api().get('/api/auth/me').set('authorization', 'Bearer garbage').expect(401);
  });
});
