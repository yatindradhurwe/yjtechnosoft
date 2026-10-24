import { z } from 'zod';
import { safeUrl } from './validate';

/**
 * Page content model shared by the marketing CMS and the landing-page builder.
 * Pages are a list of typed blocks; only these approved components can be stored
 * or rendered, and no block can carry HTML or JavaScript. Text is rendered as text.
 */
const text = (max = 300) => z.string().max(max);
const optUrl = safeUrl.optional().or(z.literal(''));

const style = z
  .object({
    background: z.enum(['default', 'muted', 'brand', 'dark']).default('default'),
    align: z.enum(['left', 'center']).default('left'),
    paddingY: z.enum(['sm', 'md', 'lg']).default('md'),
  })
  .partial()
  .default({});

const button = z.object({ label: text(60), href: safeUrl });

export const blockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hero'),
    id: z.string().max(40),
    style,
    eyebrow: text(80).optional(),
    heading: text(160),
    subheading: text(500).optional(),
    image: optUrl,
    primary: button.optional(),
    secondary: button.optional(),
  }),
  z.object({
    type: z.literal('features'),
    id: z.string().max(40),
    style,
    heading: text(160).optional(),
    subheading: text(400).optional(),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
    items: z.array(z.object({ icon: text(40).optional(), title: text(100), body: text(400) })).max(12),
  }),
  z.object({
    type: z.literal('text'),
    id: z.string().max(40),
    style,
    heading: text(160).optional(),
    body: text(10000),
  }),
  z.object({
    type: z.literal('image'),
    id: z.string().max(40),
    style,
    src: safeUrl,
    alt: text(200),
    caption: text(200).optional(),
  }),
  z.object({
    type: z.literal('video'),
    id: z.string().max(40),
    style,
    heading: text(160).optional(),
    // Only embeddable providers we know how to sandbox
    url: z.string().regex(/^https:\/\/(www\.youtube\.com\/embed\/|player\.vimeo\.com\/video\/)[\w-]+/, 'Use a YouTube or Vimeo embed URL'),
  }),
  z.object({
    type: z.literal('testimonials'),
    id: z.string().max(40),
    style,
    heading: text(160).optional(),
    items: z.array(z.object({ quote: text(600), name: text(80), role: text(100).optional(), avatar: optUrl })).max(12),
  }),
  z.object({
    type: z.literal('faq'),
    id: z.string().max(40),
    style,
    heading: text(160).optional(),
    items: z.array(z.object({ q: text(300), a: text(2000) })).max(30),
  }),
  z.object({
    type: z.literal('pricing'),
    id: z.string().max(40),
    style,
    heading: text(160).optional(),
    subheading: text(400).optional(),
    /** "plans" renders live SaaS plans; "manual" renders the items below */
    source: z.enum(['plans', 'manual']).default('manual'),
    items: z
      .array(z.object({ name: text(60), price: text(40), period: text(30).optional(), features: z.array(text(120)).max(20), cta: button.optional(), highlighted: z.boolean().optional() }))
      .max(6)
      .default([]),
  }),
  z.object({
    type: z.literal('cta'),
    id: z.string().max(40),
    style,
    heading: text(160),
    body: text(400).optional(),
    button,
  }),
  z.object({
    type: z.literal('stats'),
    id: z.string().max(40),
    style,
    items: z.array(z.object({ value: text(20), label: text(80) })).max(6),
  }),
  z.object({
    type: z.literal('logos'),
    id: z.string().max(40),
    style,
    heading: text(160).optional(),
    items: z.array(z.object({ name: text(80), src: optUrl })).max(20),
  }),
  z.object({
    type: z.literal('products'),
    id: z.string().max(40),
    style,
    heading: text(160).optional(),
    /** Storefront pages only: show published products (all, or specific ids) */
    productIds: z.array(z.string().uuid()).max(12).default([]),
  }),
  z.object({
    type: z.literal('lead_form'),
    id: z.string().max(40),
    style,
    heading: text(160).optional(),
    body: text(400).optional(),
    buttonLabel: text(40).default('Subscribe'),
    collectPhone: z.boolean().default(false),
    tag: text(40).optional(),
  }),
]);

export type Block = z.infer<typeof blockSchema>;
export const blocksSchema = z.array(blockSchema).max(60);

export const seoSchema = z
  .object({
    title: text(70).optional(),
    description: text(170).optional(),
    image: optUrl,
    noindex: z.boolean().optional(),
  })
  .default({});
