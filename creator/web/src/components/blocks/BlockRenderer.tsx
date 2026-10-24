import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award, BookOpen, Briefcase, Calendar, Camera, Check, ChevronDown, Clock, Code, Coffee, Dumbbell, Gift, Globe, GraduationCap, Heart, Leaf, Lightbulb, Lock, Mail, MessageCircle,
  Music, Palette, Phone, PlayCircle, Radio, Rocket, Shield, Smile, Sparkles, Star, Store, Sun, Target, TrendingUp, Trophy, Users, Video, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { cn, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox, Input } from '@/components/ui/form';

/* Types mirror the server block schema (server/src/lib/blocks.ts) */
type Style = { background?: 'default' | 'muted' | 'brand' | 'dark'; align?: 'left' | 'center'; paddingY?: 'sm' | 'md' | 'lg' };
type Btn = { label: string; href: string };
export type Block =
  | { type: 'hero'; id: string; style?: Style; eyebrow?: string; heading: string; subheading?: string; image?: string; primary?: Btn; secondary?: Btn }
  | { type: 'features'; id: string; style?: Style; heading?: string; subheading?: string; columns?: 2 | 3 | 4; items: { icon?: string; title: string; body: string }[] }
  | { type: 'text'; id: string; style?: Style; heading?: string; body: string }
  | { type: 'image'; id: string; style?: Style; src: string; alt: string; caption?: string }
  | { type: 'video'; id: string; style?: Style; heading?: string; url: string }
  | { type: 'testimonials'; id: string; style?: Style; heading?: string; items: { quote: string; name: string; role?: string; avatar?: string }[] }
  | { type: 'faq'; id: string; style?: Style; heading?: string; items: { q: string; a: string }[] }
  | { type: 'pricing'; id: string; style?: Style; heading?: string; subheading?: string; source?: 'plans' | 'manual'; items: { name: string; price: string; period?: string; features: string[]; cta?: Btn; highlighted?: boolean }[] }
  | { type: 'cta'; id: string; style?: Style; heading: string; body?: string; button: Btn }
  | { type: 'stats'; id: string; style?: Style; items: { value: string; label: string }[] }
  | { type: 'logos'; id: string; style?: Style; heading?: string; items: { name: string; src?: string }[] }
  | { type: 'products'; id: string; style?: Style; heading?: string; productIds: string[] }
  | { type: 'lead_form'; id: string; style?: Style; heading?: string; body?: string; buttonLabel?: string; collectPhone?: boolean; tag?: string };

export interface PublicPlan {
  key: string;
  name: string;
  description: string | null;
  currency: string;
  priceMonthly: number;
  platformFeeBps: number;
  limits: Record<string, number | boolean | null>;
}

export interface RenderProduct {
  id: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  type: string;
  prices: { amount: number; currency: string; compareAtAmount: number | null }[];
}

interface Ctx {
  storeSlug?: string;
  plans?: PublicPlan[];
  products?: RenderProduct[];
  /** In the editor preview, links and forms are inert */
  preview?: boolean;
}

function SmartLink({ href, children, className, preview }: { href: string; children: React.ReactNode; className?: string; preview?: boolean }) {
  if (preview) return <span className={className}>{children}</span>;
  if (href.startsWith('/')) return <Link to={href} className={className}>{children}</Link>;
  return (
    <a href={href} className={className} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

function Section({ style, children, id }: { style?: Style; children: React.ReactNode; id: string }) {
  const bg = { default: '', muted: 'bg-muted/50', brand: 'bg-[var(--brand)] text-white', dark: 'bg-zinc-950 text-white' }[style?.background ?? 'default'];
  const py = { sm: 'py-10', md: 'py-16', lg: 'py-24' }[style?.paddingY ?? 'md'];
  return (
    <section id={id} className={cn(bg, py, style?.align === 'center' && 'text-center')}>
      <div className="container">{children}</div>
    </section>
  );
}

/** Icons available to page blocks (kebab-case names, as typed in the editor) */
export const BLOCK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  award: Award, 'book-open': BookOpen, briefcase: Briefcase, calendar: Calendar, camera: Camera, check: Check, clock: Clock, code: Code, coffee: Coffee, dumbbell: Dumbbell,
  gift: Gift, globe: Globe, 'graduation-cap': GraduationCap, heart: Heart, leaf: Leaf, lightbulb: Lightbulb, lock: Lock, mail: Mail, 'message-circle': MessageCircle, music: Music,
  palette: Palette, phone: Phone, 'play-circle': PlayCircle, radio: Radio, rocket: Rocket, shield: Shield, smile: Smile, sparkles: Sparkles, star: Star, store: Store, sun: Sun,
  target: Target, 'trending-up': TrendingUp, trophy: Trophy, users: Users, video: Video, zap: Zap,
};

function Icon({ name }: { name?: string }) {
  const C = BLOCK_ICONS[name ?? ''] ?? Sparkles;
  return <C className="h-5 w-5" />;
}

function LeadForm({ block, ctx }: { block: Extract<Block, { type: 'lead_form' }>; ctx: Ctx }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <p className="rounded-lg bg-success/10 p-4 text-success">Thanks! You're on the list.</p>;
  return (
    <form
      className="mx-auto mt-6 grid max-w-md gap-3 text-left"
      onSubmit={async (e) => {
        e.preventDefault();
        if (ctx.preview || !ctx.storeSlug) return;
        if (!consent) return toast.error('Please agree to receive emails');
        setBusy(true);
        try {
          await api.post(`/store/${ctx.storeSlug}/leads`, { email, name: name || undefined, phone: phone || undefined, consent: true, tag: block.tag, source: 'landing_page' });
          setDone(true);
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input required placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" className="text-foreground" />
      <Input required type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" className="text-foreground" />
      {block.collectPhone && <Input type="tel" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Phone" className="text-foreground" />}
      <Checkbox checked={consent} onChange={setConsent} label="I agree to receive emails. I can unsubscribe at any time." />
      <Button type="submit" variant="brand" loading={busy} disabled={ctx.preview}>
        {block.buttonLabel ?? 'Subscribe'}
      </Button>
    </form>
  );
}

export function BlockView({ block, ctx }: { block: Block; ctx: Ctx }) {
  const p = ctx.preview;
  switch (block.type) {
    case 'hero':
      return (
        <Section id={block.id} style={{ paddingY: 'lg', ...block.style }}>
          <div className={cn('grid items-center gap-10', block.image && 'lg:grid-cols-2')}>
            <div className={cn('animate-fade-up', block.style?.align === 'center' && 'mx-auto max-w-3xl')}>
              {block.eyebrow && <p className="mb-3 text-sm font-semibold uppercase tracking-wider opacity-80">{block.eyebrow}</p>}
              <h1 className="text-balance text-4xl font-extrabold leading-tight sm:text-5xl">{block.heading}</h1>
              {block.subheading && <p className="mt-5 text-lg opacity-80">{block.subheading}</p>}
              {(block.primary || block.secondary) && (
                <div className={cn('mt-8 flex flex-wrap gap-3', block.style?.align === 'center' && 'justify-center')}>
                  {block.primary && (
                    <Button asChild size="lg" variant={block.style?.background === 'brand' ? 'secondary' : 'brand'}>
                      <SmartLink href={block.primary.href} preview={p}>{block.primary.label}</SmartLink>
                    </Button>
                  )}
                  {block.secondary && (
                    <Button asChild size="lg" variant="outline" className="bg-transparent">
                      <SmartLink href={block.secondary.href} preview={p}>{block.secondary.label}</SmartLink>
                    </Button>
                  )}
                </div>
              )}
            </div>
            {block.image && <img src={block.image} alt="" className="w-full rounded-xl shadow-xl" loading="lazy" />}
          </div>
        </Section>
      );
    case 'features':
      return (
        <Section id={block.id} style={block.style}>
          {block.heading && <h2 className="text-3xl font-bold">{block.heading}</h2>}
          {block.subheading && <p className="mt-2 text-muted-foreground">{block.subheading}</p>}
          <div className={cn('mt-10 grid gap-6 text-left sm:grid-cols-2', block.columns === 3 && 'lg:grid-cols-3', block.columns === 4 && 'lg:grid-cols-4')}>
            {block.items.map((it, i) => (
              <div key={i} className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
                <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-2.5 text-[var(--brand)]">
                  <Icon name={it.icon} />
                </div>
                <h3 className="font-sans text-base font-semibold">{it.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{it.body}</p>
              </div>
            ))}
          </div>
        </Section>
      );
    case 'text':
      return (
        <Section id={block.id} style={block.style}>
          <div className={cn('max-w-3xl', block.style?.align === 'center' && 'mx-auto')}>
            {block.heading && <h2 className="mb-4 text-3xl font-bold">{block.heading}</h2>}
            <div className="whitespace-pre-line leading-relaxed opacity-90">{block.body}</div>
          </div>
        </Section>
      );
    case 'image':
      return (
        <Section id={block.id} style={block.style}>
          <figure>
            <img src={block.src} alt={block.alt} className="mx-auto max-h-[560px] rounded-xl object-cover" loading="lazy" />
            {block.caption && <figcaption className="mt-2 text-center text-sm text-muted-foreground">{block.caption}</figcaption>}
          </figure>
        </Section>
      );
    case 'video':
      return (
        <Section id={block.id} style={block.style}>
          {block.heading && <h2 className="mb-6 text-3xl font-bold">{block.heading}</h2>}
          <div className="mx-auto aspect-video max-w-4xl overflow-hidden rounded-xl bg-black shadow-lg">
            <iframe src={block.url} title={block.heading ?? 'Video'} className="h-full w-full" sandbox="allow-scripts allow-same-origin allow-presentation" allow="encrypted-media; picture-in-picture; fullscreen" loading="lazy" />
          </div>
        </Section>
      );
    case 'testimonials':
      return (
        <Section id={block.id} style={block.style}>
          {block.heading && <h2 className="text-3xl font-bold">{block.heading}</h2>}
          <div className="mt-8 grid gap-6 text-left md:grid-cols-2 lg:grid-cols-3">
            {block.items.map((t, i) => (
              <figure key={i} className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
                <blockquote className="text-sm leading-relaxed">“{t.quote}”</blockquote>
                <figcaption className="mt-4 text-sm font-semibold">
                  {t.name}
                  {t.role && <span className="block font-normal text-muted-foreground">{t.role}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>
      );
    case 'faq':
      return (
        <Section id={block.id} style={block.style}>
          {block.heading && <h2 className="text-3xl font-bold">{block.heading}</h2>}
          <div className="mx-auto mt-8 max-w-3xl divide-y rounded-xl border bg-card text-left text-card-foreground">
            {block.items.map((f, i) => (
              <details key={i} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>
      );
    case 'pricing': {
      const items =
        block.source === 'plans' && ctx.plans
          ? ctx.plans.map((pl, i) => ({
              name: pl.name,
              price: pl.priceMonthly ? money(pl.priceMonthly, pl.currency) : 'Free',
              period: pl.priceMonthly ? '/month + GST' : undefined,
              highlighted: i === 1,
              cta: { label: 'Get started', href: '/signup' },
              features: [
                pl.description ?? '',
                `${pl.platformFeeBps / 100}% platform fee`,
                pl.limits.maxCourses === null || pl.limits.maxCourses === undefined ? 'Unlimited courses' : `${pl.limits.maxCourses} courses`,
                `${pl.limits.aiCreditsMonthly ?? 0} AI credits / month`,
                pl.limits.customDomain ? 'Custom domain' : 'Platform subdomain',
                pl.limits.automations ? 'Email & WhatsApp automations' : 'Email campaigns',
              ].filter(Boolean),
            }))
          : block.items;
      return (
        <Section id={block.id} style={block.style}>
          {block.heading && <h2 className="text-3xl font-bold">{block.heading}</h2>}
          {block.subheading && <p className="mt-2 text-muted-foreground">{block.subheading}</p>}
          <div className="mt-10 grid gap-6 text-left md:grid-cols-3">
            {items.map((it, i) => (
              <div key={i} className={cn('flex flex-col rounded-xl border bg-card p-6 text-card-foreground shadow-sm', it.highlighted && 'border-[var(--brand)] ring-2 ring-primary/30')}>
                <h3 className="font-sans text-lg font-semibold">{it.name}</h3>
                <p className="mt-3">
                  <span className="font-display text-3xl font-bold">{it.price}</span>
                  {it.period && <span className="text-sm text-muted-foreground"> {it.period}</span>}
                </p>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {it.features.map((f, j) => (
                    <li key={j} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      {f}
                    </li>
                  ))}
                </ul>
                {it.cta && (
                  <Button asChild className="mt-6" variant={it.highlighted ? 'brand' : 'outline'}>
                    <SmartLink href={it.cta.href} preview={p}>{it.cta.label}</SmartLink>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Section>
      );
    }
    case 'cta':
      return (
        <Section id={block.id} style={{ align: 'center', ...block.style }}>
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold">{block.heading}</h2>
            {block.body && <p className="mt-3 opacity-80">{block.body}</p>}
            <Button asChild size="lg" className="mt-6" variant={block.style?.background === 'brand' || block.style?.background === 'dark' ? 'secondary' : 'brand'}>
              <SmartLink href={block.button.href} preview={p}>{block.button.label}</SmartLink>
            </Button>
          </div>
        </Section>
      );
    case 'stats':
      return (
        <Section id={block.id} style={{ paddingY: 'sm', ...block.style }}>
          <div className="grid gap-6 sm:grid-cols-3">
            {block.items.map((s, i) => (
              <div key={i} className="text-center">
                <div className="font-display text-3xl font-bold text-[var(--brand)]">{s.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </Section>
      );
    case 'logos':
      return (
        <Section id={block.id} style={{ align: 'center', paddingY: 'sm', ...block.style }}>
          {block.heading && <p className="mb-6 text-sm font-medium text-muted-foreground">{block.heading}</p>}
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-70">
            {block.items.map((l, i) => (l.src ? <img key={i} src={l.src} alt={l.name} className="h-8 object-contain" /> : <span key={i} className="font-semibold">{l.name}</span>))}
          </div>
        </Section>
      );
    case 'products': {
      const list = (ctx.products ?? []).filter((x) => !block.productIds.length || block.productIds.includes(x.id));
      return (
        <Section id={block.id} style={block.style}>
          {block.heading && <h2 className="text-3xl font-bold">{block.heading}</h2>}
          {list.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Published products appear here.</p>
          ) : (
            <div className="mt-8 grid gap-6 text-left sm:grid-cols-2 lg:grid-cols-3">
              {list.map((pr) => (
                <SmartLink key={pr.id} href={`/s/${ctx.storeSlug}/p/${pr.slug}`} preview={p} className="group overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition hover:shadow-md">
                  <div className="aspect-video bg-muted">{pr.coverUrl && <img src={pr.coverUrl} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="p-4">
                    <h3 className="font-sans font-semibold group-hover:underline">{pr.title}</h3>
                    {pr.prices[0] && <p className="mt-1 text-sm">{pr.prices[0].amount ? money(pr.prices[0].amount, pr.prices[0].currency) : 'Free'}</p>}
                  </div>
                </SmartLink>
              ))}
            </div>
          )}
        </Section>
      );
    }
    case 'lead_form':
      return (
        <Section id={block.id} style={{ align: 'center', ...block.style }}>
          {block.heading && <h2 className="text-3xl font-bold">{block.heading}</h2>}
          {block.body && <p className="mt-2 opacity-80">{block.body}</p>}
          {ctx.storeSlug || p ? <LeadForm block={block} ctx={ctx} /> : <p className="mt-4 text-sm opacity-70">Lead forms work on creator storefront pages.</p>}
        </Section>
      );
    default:
      return null;
  }
}

export function BlockRenderer({ blocks, ...ctx }: { blocks: Block[] } & Ctx) {
  return (
    <>
      {blocks.map((b) => (
        <BlockView key={b.id} block={b} ctx={ctx} />
      ))}
    </>
  );
}
