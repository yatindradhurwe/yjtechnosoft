import { describe, expect, it } from 'vitest';
import { as, createCreator, ensurePlans, signup } from './helpers';
import { prisma } from '../src/lib/prisma';

describe('workspaces & permissions', () => {
  it('requires a verified email to create a workspace', async () => {
    await ensurePlans();
    const u = await signup({ verify: false });
    const res = await as(u).post('/api/workspaces').send({ name: 'My Studio', slug: 'unverified-studio' });
    expect(res.status).toBe(403);
  });

  it('creates a workspace with the owner role and default plan, and audits it', async () => {
    const { owner, tenant } = await createCreator('alpha-studio');
    const cur = await as(owner, tenant).get('/api/workspaces/current');
    expect(cur.status).toBe(200);
    expect(cur.body.roles).toEqual(['OWNER']);
    expect(cur.body.plan.key).toBe('starter');
    const logs = await prisma.auditLog.findMany({ where: { tenantId: tenant.id, action: 'tenant.create' } });
    expect(logs).toHaveLength(1);
  });

  it('rejects reserved or taken slugs', async () => {
    const { owner } = await createCreator('taken-slug');
    expect((await as(owner).post('/api/workspaces').send({ name: 'Again', slug: 'taken-slug' })).status).toBe(409);
    expect((await as(owner).post('/api/workspaces').send({ name: 'Admin', slug: 'admin' })).status).toBe(400);
  });

  it('isolates tenants: a creator cannot access another workspace', async () => {
    const a = await createCreator();
    const b = await createCreator();
    const res = await as(a.owner, b.tenant).get('/api/workspaces/current');
    expect(res.status).toBe(403);
    const patch = await as(a.owner, b.tenant).patch('/api/workspaces/current').send({ name: 'Hacked' });
    expect(patch.status).toBe(403);
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: b.tenant.id } });
    expect(t.name).toBe('Test Studio');
  });

  it('enforces granular permissions for team members', async () => {
    const { owner, tenant } = await createCreator();
    const member = await signup();
    const add = await as(owner, tenant).post('/api/workspaces/current/team').send({ email: member.email, roles: ['TEAM_MEMBER'] });
    expect(add.status).toBe(201);
    // Team members can read but not change workspace settings
    expect((await as(member, tenant).get('/api/workspaces/current')).status).toBe(200);
    expect((await as(member, tenant).patch('/api/workspaces/current').send({ name: 'Nope' })).status).toBe(403);
    // Grant the specific permission and retry
    await as(owner, tenant).patch(`/api/workspaces/current/team/${add.body.membership.id}`).send({ permissions: ['workspace.manage'] }).expect(200);
    expect((await as(member, tenant).patch('/api/workspaces/current').send({ name: 'Renamed' })).status).toBe(200);
  });

  it('validates GSTIN format', async () => {
    const { owner, tenant } = await createCreator();
    expect((await as(owner, tenant).patch('/api/workspaces/current').send({ gstin: 'BAD' })).status).toBe(400);
    const ok = await as(owner, tenant).patch('/api/workspaces/current').send({ gstin: '22AAAAA0000A1Z5' });
    expect(ok.status).toBe(200);
    expect(ok.body.workspace.gstStateCode).toBe('22');
  });

  it('only lets platform support in with an owner-granted, unexpired grant', async () => {
    const { owner, tenant } = await createCreator();
    const support = await signup();
    await prisma.user.update({ where: { id: support.id }, data: { platformRole: 'SUPPORT' } });
    expect((await as(support, tenant).get('/api/workspaces/current')).status).toBe(403);
    const g = await as(owner, tenant).post('/api/workspaces/current/support-access').send({ hours: 2, reason: 'ticket #1' });
    expect(g.status).toBe(201);
    const cur = await as(support, tenant).get('/api/workspaces/current');
    expect(cur.status).toBe(200);
    expect(cur.body.supportSession).toBe(true);
    // read-only: cannot change settings
    expect((await as(support, tenant).patch('/api/workspaces/current').send({ name: 'x y' })).status).toBe(403);
    await as(owner, tenant).delete(`/api/workspaces/current/support-access/${g.body.grant.id}`).expect(200);
    expect((await as(support, tenant).get('/api/workspaces/current')).status).toBe(403);
  });
});
