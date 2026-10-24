import type { Request } from 'express';
import { z, ZodTypeAny } from 'zod';
import { badRequest } from './errors';

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = result.error.flatten().fieldErrors;
    const first = result.error.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    throw badRequest(`${where}${first?.message ?? 'Invalid input'}`, fields);
  }
  return result.data;
}

export const body = <S extends ZodTypeAny>(req: Request, schema: S) => parse(schema, req.body);
export const query = <S extends ZodTypeAny>(req: Request, schema: S) => parse(schema, req.query);

export const uuid = z.string().uuid();
export const slug = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes');
export const email = z.string().trim().toLowerCase().email().max(200);
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #6d28d9');
/** http(s) URLs only – blocks javascript: and data: URLs stored by users */
export const safeUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v) || v.startsWith('/'), 'Must be an http(s) URL');

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
});

export function pageArgs(p: { page: number; pageSize: number }) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'item'
  );
}
