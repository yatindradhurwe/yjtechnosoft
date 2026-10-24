import { Router } from 'express';
import { z } from 'zod';
import { prisma, isUniqueViolation } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { body, email, parse, slug } from '../../lib/validate';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff, resolvePublicTenant } from '../../middleware/tenant';
import { publicWriteLimiter } from '../../middleware/rateLimit';
import { hasEntitlement } from '../../services/access';
import { upsertContact } from '../customers/service';
import { checkFormula, evaluate } from './formula';

const id = z.string().uuid();
const key = z.string().regex(/^[a-z][a-z0-9_]{0,30}$/, 'Keys use lowercase letters, numbers and _');

const fieldSchema = z.object({
  key,
  label: z.string().trim().min(1).max(100),
  type: z.enum(['number', 'select', 'checkbox', 'text', 'date']),
  /** select: value is the option's number */
  options: z.array(z.object({ label: z.string().max(80), value: z.number() })).max(30).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  required: z.boolean().default(true),
  help: z.string().max(200).optional(),
});

const outputSchema = z.object({
  key,
  label: z.string().trim().min(1).max(100),
  formula: z.string().min(1).max(500),
  format: z.enum(['number', 'currency', 'percent']).default('number'),
  decimals: z.number().int().min(0).max(4).default(0),
});

export const definitionSchema = z
  .object({
    fields: z.array(fieldSchema).min(1).max(40),
    outputs: z.array(outputSchema).max(20),
    /** Store each submission so users can track progress over time */
    saveResults: z.boolean().default(false),
    /** Ask for an email before showing results (adds the user to the CRM) */
    leadCapture: z.boolean().default(false),
    resultMessage: z.string().max(1000).optional(),
  })
  .superRefine((d, ctx) => {
    const keys = [...d.fields.map((f) => f.key), ...d.outputs.map((o) => o.key)];
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'Field and output keys must be unique' });
    // Outputs may reference numeric fields and earlier outputs
    const known = d.fields.filter((f) => f.type !== 'text' && f.type !== 'date').map((f) => f.key);
    for (const o of d.outputs) {
      try {
        checkFormula(o.formula, known);
      } catch (e) {
        ctx.addIssue({ code: 'custom', message: `Output "${o.label}": ${e instanceof Error ? e.message : e}` });
      }
      known.push(o.key);
    }
  });

type Definition = z.infer<typeof definitionSchema>;

export function runTool(def: Definition, inputs: Record<string, unknown>) {
  const vars: Record<string, number> = {};
  const clean: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = inputs[f.key];
    if (v === undefined || v === null || v === '') {
      if (f.required) throw badRequest(`${f.label} is required`);
      if (f.type === 'number' || f.type === 'select' || f.type === 'checkbox') vars[f.key] = 0;
      continue;
    }
    if (f.type === 'number' || f.type === 'select') {
      const n = Number(v);
      if (!Number.isFinite(n)) throw badRequest(`${f.label} must be a number`);
      if (f.min !== undefined && n < f.min) throw badRequest(`${f.label} must be at least ${f.min}`);
      if (f.max !== undefined && n > f.max) throw badRequest(`${f.label} must be at most ${f.max}`);
      if (f.type === 'select' && !f.options?.some((o) => o.value === n)) throw badRequest(`Choose a valid option for ${f.label}`);
      vars[f.key] = n;
      clean[f.key] = n;
    } else if (f.type === 'checkbox') {
      vars[f.key] = v ? 1 : 0;
      clean[f.key] = !!v;
    } else {
      clean[f.key] = String(v).slice(0, f.type === 'date' ? 10 : 2000);
    }
  }
  const outputs: Record<string, number> = {};
  for (const o of def.outputs) {
    try {
      const raw = evaluate(o.formula, vars);
      const val = Math.round(raw * 10 ** o.decimals) / 10 ** o.decimals;
      outputs[o.key] = val;
      vars[o.key] = raw;
    } catch (e) {
      throw badRequest(`Could not calculate ${o.label}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { inputs: clean, outputs };
}

// ---- Creator management ----

export const toolsAdminRouter = Router();
toolsAdminRouter.use(requireAuth, requireTenantStaff, can('pages.write'));

const toolSchema = z.object({
  title: z.string().trim().min(2).max(120),
  slug,
  description: z.string().trim().max(2000).nullable().optional(),
  access: z.enum(['PUBLIC', 'MEMBERS', 'PRODUCT']),
  productId: z.string().uuid().nullable().optional(),
  definition: definitionSchema,
});

toolsAdminRouter.get('/', async (req, res) => {
  const tools = await prisma.creatorTool.findMany({ where: { tenantId: req.tenant!.id }, orderBy: { updatedAt: 'desc' }, include: { _count: { select: { submissions: true } } } });
  res.json({ tools });
});

toolsAdminRouter.post('/', async (req, res) => {
  const input = body(req, toolSchema);
  if (input.access === 'PRODUCT' && !input.productId) throw badRequest('Choose the product that unlocks this tool');
  try {
    res.status(201).json({ tool: await prisma.creatorTool.create({ data: { ...input, tenantId: req.tenant!.id } }) });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('A tool with this URL already exists');
    throw e;
  }
});

toolsAdminRouter.put('/:toolId', async (req, res) => {
  const t = await prisma.creatorTool.findFirst({ where: { id: parse(id, req.params.toolId), tenantId: req.tenant!.id } });
  if (!t) throw notFound('Tool not found');
  const input = body(req, toolSchema.extend({ status: z.enum(['DRAFT', 'PUBLISHED']).optional() }));
  res.json({ tool: await prisma.creatorTool.update({ where: { id: t.id }, data: input }) });
});

/** Preview a calculation without saving */
toolsAdminRouter.post('/preview', async (req, res) => {
  const input = body(req, z.object({ definition: definitionSchema, inputs: z.record(z.unknown()) }));
  res.json(runTool(input.definition, input.inputs));
});

toolsAdminRouter.get('/:toolId/submissions', async (req, res) => {
  const t = await prisma.creatorTool.findFirst({ where: { id: parse(id, req.params.toolId), tenantId: req.tenant!.id } });
  if (!t) throw notFound('Tool not found');
  res.json({ submissions: await prisma.toolSubmission.findMany({ where: { toolId: t.id }, orderBy: { createdAt: 'desc' }, take: 500 }) });
});

toolsAdminRouter.delete('/:toolId', async (req, res) => {
  const r = await prisma.creatorTool.deleteMany({ where: { id: parse(id, req.params.toolId), tenantId: req.tenant!.id } });
  if (!r.count) throw notFound('Tool not found');
  res.json({ ok: true });
});

// ---- Public use: /api/store/:tenantSlug/tools ----

export const toolsPublicRouter = Router({ mergeParams: true });
toolsPublicRouter.use(resolvePublicTenant);

async function loadPublicTool(tenantId: string, s: string, userId?: string) {
  const t = await prisma.creatorTool.findFirst({ where: { tenantId, slug: s, status: 'PUBLISHED' } });
  if (!t) throw notFound('Tool not found');
  let allowed = t.access === 'PUBLIC';
  if (!allowed && userId) {
    if (t.access === 'MEMBERS') allowed = !!(await prisma.membership.findFirst({ where: { tenantId, userId, status: 'ACTIVE' } }));
    else if (t.productId) allowed = (await hasEntitlement(userId, tenantId, 'PRODUCT', t.productId)) || (await hasEntitlement(userId, tenantId, 'MEMBERSHIP', t.productId));
  }
  return { tool: t, allowed };
}

toolsPublicRouter.get('/:toolSlug', optionalAuth, async (req, res) => {
  const { tool, allowed } = await loadPublicTool(req.tenant!.id, String(req.params.toolSlug), req.user?.id);
  const def = tool.definition as Definition;
  const product = tool.productId ? await prisma.product.findFirst({ where: { id: tool.productId, status: 'PUBLISHED' }, select: { slug: true, title: true } }) : null;
  const history = allowed && req.user && def.saveResults ? await prisma.toolSubmission.findMany({ where: { toolId: tool.id, userId: req.user.id }, orderBy: { createdAt: 'asc' }, take: 200 }) : [];
  // Formulas are not exposed; the client only renders fields and results
  res.json({
    tool: { id: tool.id, title: tool.title, description: tool.description, access: tool.access, fields: def.fields, outputs: def.outputs.map(({ formula: _f, ...o }) => o), saveResults: def.saveResults, leadCapture: def.leadCapture, resultMessage: def.resultMessage },
    allowed,
    product,
    history: history.map((h) => ({ createdAt: h.createdAt, inputs: h.inputs, outputs: h.outputs })),
  });
});

toolsPublicRouter.post('/:toolSlug/run', publicWriteLimiter, optionalAuth, async (req, res) => {
  const { tool, allowed } = await loadPublicTool(req.tenant!.id, String(req.params.toolSlug), req.user?.id);
  if (!allowed) throw forbidden(tool.access === 'MEMBERS' ? 'Sign in as a member to use this tool' : 'Purchase access to use this tool');
  const def = tool.definition as Definition;
  const input = body(req, z.object({ inputs: z.record(z.unknown()), email: email.optional(), consent: z.boolean().optional() }));
  const result = runTool(def, input.inputs);
  if (def.leadCapture) {
    const addr = req.user?.email ?? input.email;
    if (!addr) throw badRequest('Enter your email to see your results');
    await upsertContact(prisma, tool.tenantId, { email: addr, userId: req.user?.id, source: `tool:${tool.slug}`, consentEmail: !!input.consent });
  }
  if (def.saveResults && req.user) {
    await prisma.toolSubmission.create({ data: { tenantId: tool.tenantId, toolId: tool.id, userId: req.user.id, inputs: result.inputs as object, outputs: result.outputs } });
  }
  res.json(result);
});
