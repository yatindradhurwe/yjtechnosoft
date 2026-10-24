import { describe, expect, it } from 'vitest';
import { api, as, createCreator, signup } from './helpers';
import { prisma } from '../src/lib/prisma';

async function superAdmin() {
  const u = await signup({ name: 'Root' });
  await prisma.user.update({ where: { id: u.id }, data: { platformRole: 'SUPER_ADMIN' } });
  return u;
}

describe('super admin', () => {
  it('blocks normal users and creators from the admin API', async () => {
    const { owner } = await createCreator();
    expect((await as(owner).get('/api/admin/overview')).status).toBe(403);
    expect((await api().get('/api/admin/overview')).status).toBe(401);
  });

  it('support staff can read but not write', async () => {
    const support = await signup();
    await prisma.user.update({ where: { id: support.id }, data: { platformRole: 'SUPPORT' } });
    expect((await as(support).get('/api/admin/tenants')).status).toBe(200);
    expect((await as(support).put('/api/admin/feature-flags/new-ui').send({ enabled: true, rolloutPercent: 100 })).status).toBe(403);
  });

  it('suspends a workspace (with audit) which blocks its dashboard and storefront', async () => {
    const root = await superAdmin();
    const { owner, tenant } = await createCreator();
    expect((await as(root).patch(`/api/admin/tenants/${tenant.id}/status`).send({ status: 'SUSPENDED' })).status).toBe(400);
    const res = await as(root).patch(`/api/admin/tenants/${tenant.id}/status`).send({ status: 'SUSPENDED', reason: 'Policy violation' });
    expect(res.status).toBe(200);
    expect((await as(owner, tenant).get('/api/workspaces/current')).status).toBe(403);
    const log = await prisma.auditLog.findFirst({ where: { action: 'admin.tenant.suspend', entityId: tenant.id } });
    expect(log?.actorId).toBe(root.id);
  });

  it('suspending a user ends their sessions', async () => {
    const root = await superAdmin();
    const u = await signup();
    await as(root).patch(`/api/admin/users/${u.id}`).send({ status: 'SUSPENDED' }).expect(200);
    expect((await as(u).get('/api/auth/me')).status).toBe(403);
    const r = await api().post('/api/auth/refresh').set('cookie', u.cookie).set('x-requested-with', 'fetch');
    expect(r.status).toBe(401);
  });

  it('cannot change own role', async () => {
    const root = await superAdmin();
    expect((await as(root).patch(`/api/admin/users/${root.id}`).send({ platformRole: 'USER' })).status).toBe(403);
  });

  it('stores integration secrets encrypted and never returns them', async () => {
    const root = await superAdmin();
    const res = await as(root).put('/api/admin/integrations/RAZORPAY').send({ enabled: true, config: { keyId: 'rzp_live_abc' }, secrets: { keySecret: 'super-secret-value' } });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('super-secret-value');
    expect(res.body.secretsSet.keySecret).toBe(true);
    const row = await prisma.providerIntegration.findFirstOrThrow({ where: { kind: 'RAZORPAY' } });
    expect(row.secretsEnc).not.toContain('super-secret-value');
    // secrets cannot be smuggled into plain config
    expect((await as(root).put('/api/admin/integrations/RAZORPAY').send({ enabled: true, config: { keySecret: 'x' } })).status).toBe(400);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'admin.integration.update' } });
    expect(JSON.stringify(audit.metadata)).not.toContain('super-secret-value');
  });

  it('manages CMS pages with validated blocks; only published pages are public', async () => {
    const root = await superAdmin();
    const bad = await as(root).post('/api/admin/cms/pages').send({ slug: 'about', title: 'About', status: 'PUBLISHED', sections: [{ type: 'script', id: 'x', code: 'alert(1)' }] });
    expect(bad.status).toBe(400);
    const badUrl = await as(root).post('/api/admin/cms/pages').send({ slug: 'about', title: 'About', status: 'PUBLISHED', sections: [{ type: 'cta', id: 'c', heading: 'Hi', button: { label: 'Go', href: 'javascript:alert(1)' } }] });
    expect(badUrl.status).toBe(400);
    const ok = await as(root).post('/api/admin/cms/pages').send({ slug: 'about', title: 'About', status: 'DRAFT', sections: [{ type: 'hero', id: 'h', heading: 'About us' }] });
    expect(ok.status).toBe(201);
    expect((await api().get('/api/public/pages/about')).status).toBe(404);
    await as(root).put(`/api/admin/cms/pages/${ok.body.page.id}`).send({ ...ok.body.page, status: 'PUBLISHED' }).expect(200);
    const pub = await api().get('/api/public/pages/about');
    expect(pub.status).toBe(200);
    expect(pub.body.page.sections[0].heading).toBe('About us');
  });

  it('evaluates feature flags with allowlists and rollout', async () => {
    const root = await superAdmin();
    const { tenant } = await createCreator();
    await as(root).put('/api/admin/feature-flags/beta-ai').send({ enabled: true, rolloutPercent: 0, tenantAllowlist: [tenant.id] }).expect(200);
    const { isFeatureEnabled } = await import('../src/services/flags');
    expect(await isFeatureEnabled('beta-ai', tenant.id)).toBe(true);
    expect(await isFeatureEnabled('beta-ai', '00000000-0000-0000-0000-000000000000')).toBe(false);
  });
});
