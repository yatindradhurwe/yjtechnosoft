import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { ArrowRight, ArrowUpRight, ChevronDown, Quote, Star, Calendar, Check, Send, Home } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../../lib/api';
import { asset, cn, fmtDate, lines } from '../../lib/utils';
import { useSite } from '../../context/SiteContext';
import { Icon, Spinner } from '../ui';

export function Reveal({ children, delay = 0, className, y = 28 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeading({ eyebrow, title, highlight, text, center = true, light = false, className }) {
  return (
    <Reveal className={cn('mb-12 max-w-3xl', center && 'mx-auto text-center', className)}>
      {eyebrow && <span className={cn('eyebrow', light && 'bg-white/10 text-accent-400')}>{eyebrow}</span>}
      <h2 className={cn('mt-4 text-3xl font-bold leading-tight sm:text-4xl lg:text-[44px]', light && 'text-white')}>
        {title} {highlight && <span className="text-gradient">{highlight}</span>}
      </h2>
      {text && <p className={cn('mt-4 text-base leading-relaxed sm:text-lg', light ? 'text-white/70' : 'text-slate-500')}>{text}</p>}
    </Reveal>
  );
}

export function PageHero({ title, text, crumbs = [], image }) {
  return (
    <section className="relative overflow-hidden bg-navy-900 pb-20 pt-16 lg:pb-24 lg:pt-20">
      <div className="grid-bg absolute inset-0" />
      {image && <img src={asset(image)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-15" />}
      <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-brand-600/40 blur-3xl" />
      <div className="absolute -right-10 bottom-0 h-72 w-72 rounded-full bg-accent-500/20 blur-3xl" />
      <div className="container-x relative">
        <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-white/60">
          <Link to="/" className="flex items-center gap-1 hover:text-accent-400">
            <Home className="h-4 w-4" /> Home
          </Link>
          {crumbs.map((c) => (
            <span key={c.label} className="flex items-center gap-2">
              <span>/</span>
              {c.to ? (
                <Link to={c.to} className="hover:text-accent-400">{c.label}</Link>
              ) : (
                <span className="text-white/90">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl text-4xl font-bold text-white sm:text-5xl">
          {title}
        </motion.h1>
        {text && (
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 max-w-2xl text-lg text-white/70">
            {text}
          </motion.p>
        )}
      </div>
      <svg className="absolute bottom-0 left-0 w-full text-white" viewBox="0 0 1440 48" preserveAspectRatio="none" fill="currentColor">
        <path d="M0 48h1440V20c-240 22-480 28-720 14S240 0 0 20z" />
      </svg>
    </section>
  );
}

export function Counter({ value, suffix = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return undefined;
    const target = Number(value) || 0;
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / 1600);
      setN(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);
  return (
    <span ref={ref}>
      {n}
      {suffix}
    </span>
  );
}

export function ServiceCard({ s, i = 0 }) {
  return (
    <Reveal delay={(i % 3) * 0.08}>
      <Link
        to={`/services/${s.slug}`}
        className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-7 transition duration-300 hover:-translate-y-1.5 hover:border-transparent hover:shadow-glow"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600 to-navy-900 opacity-0 transition duration-500 group-hover:opacity-100" />
        <div className="relative">
          <div className="mb-6 inline-flex rounded-2xl bg-brand-50 p-4 text-brand-600 transition duration-300 group-hover:bg-white/15 group-hover:text-accent-400">
            <Icon name={s.icon} className="h-7 w-7" />
          </div>
          <h3 className="text-xl font-semibold transition group-hover:text-white">{s.title}</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-500 transition group-hover:text-white/75">{s.short_description}</p>
          <div className="mt-6 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 transition group-hover:text-accent-400">
              Learn more <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </span>
            {s.starting_price && <span className="text-xs font-semibold text-slate-400 group-hover:text-white/60">from {s.starting_price}</span>}
          </div>
        </div>
      </Link>
    </Reveal>
  );
}

export function PortfolioCard({ p, i = 0 }) {
  return (
    <Reveal delay={(i % 3) * 0.08}>
      <Link to={`/portfolio/${p.slug}`} className="group block overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200/70 transition hover:-translate-y-1 hover:shadow-soft">
        <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-brand-100 to-brand-50">
          {p.image ? (
            <img src={asset(p.image)} alt={p.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl font-black text-brand-200">{p.title?.[0]}</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-navy-950/80 via-navy-950/0 opacity-0 transition group-hover:opacity-100" />
          <span className="absolute right-4 top-4 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-accent-500 text-navy-900 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
            <ArrowUpRight className="h-5 w-5" />
          </span>
        </div>
        <div className="p-6">
          {p.category && <span className="text-xs font-bold uppercase tracking-widest text-brand-600">{p.category}</span>}
          <h3 className="mt-1.5 text-lg font-semibold">{p.title}</h3>
          {p.short_description && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{p.short_description}</p>}
        </div>
      </Link>
    </Reveal>
  );
}

export function BlogCard({ b, i = 0 }) {
  return (
    <Reveal delay={(i % 3) * 0.08}>
      <Link to={`/blog/${b.slug}`} className="group flex h-full flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200/70 transition hover:-translate-y-1 hover:shadow-soft">
        <div className="aspect-[16/10] overflow-hidden bg-gradient-to-br from-navy-800 to-brand-700">
          {b.image ? (
            <img src={asset(b.image)} alt={b.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center font-display text-lg font-semibold text-white/80">{b.title}</div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-6">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {b.category && <span className="rounded-full bg-brand-50 px-2.5 py-1 font-semibold text-brand-700">{b.category}</span>}
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> {fmtDate(b.published_at)}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold leading-snug transition group-hover:text-brand-700">{b.title}</h3>
          {b.excerpt && <p className="mt-2 line-clamp-3 text-sm text-slate-500">{b.excerpt}</p>}
          <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold text-brand-700">
            Read article <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </span>
        </div>
      </Link>
    </Reveal>
  );
}

export function TestimonialCard({ t }) {
  return (
    <div className="flex h-full flex-col rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200/70">
      <div className="flex items-center justify-between">
        <div className="flex gap-0.5 text-accent-500">
          {Array.from({ length: Number(t.rating) || 5 }).map((_, i) => (
            <Star key={i} className="h-4 w-4 fill-current" />
          ))}
        </div>
        <Quote className="h-9 w-9 text-brand-100" />
      </div>
      <p className="mt-5 flex-1 leading-relaxed text-slate-600">“{t.message}”</p>
      <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-5">
        {t.photo ? (
          <img src={asset(t.photo)} alt={t.name} className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-navy-800 font-bold text-white">{t.name?.[0]}</div>
        )}
        <div>
          <p className="font-semibold text-navy-900">{t.name}</p>
          <p className="text-xs text-slate-500">{[t.designation, t.company].filter(Boolean).join(', ')}</p>
        </div>
      </div>
    </div>
  );
}

export function Faq({ items }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-3">
      {items.map((f, i) => (
        <div key={f.id} className={cn('overflow-hidden rounded-2xl border transition', open === i ? 'border-brand-200 bg-brand-50/40 shadow-sm' : 'border-slate-200 bg-white')}>
          <button className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left" onClick={() => setOpen(open === i ? -1 : i)}>
            <span className="font-semibold text-navy-900">{f.question}</span>
            <ChevronDown className={cn('h-5 w-5 shrink-0 text-brand-600 transition', open === i && 'rotate-180')} />
          </button>
          {open === i && <div className="px-6 pb-5 text-[15px] leading-relaxed text-slate-600">{f.answer}</div>}
        </div>
      ))}
    </div>
  );
}

export function PricingCard({ p }) {
  const hi = Number(p.is_highlighted) === 1;
  return (
    <div className={cn('relative flex h-full flex-col rounded-3xl p-8 transition', hi ? 'bg-navy-900 text-white shadow-2xl shadow-brand-900/40 lg:-translate-y-4' : 'bg-white ring-1 ring-slate-200')}>
      {hi && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-500 px-4 py-1 text-xs font-bold text-navy-900">Most Popular</span>}
      <h3 className={cn('text-lg font-semibold', hi && 'text-white')}>{p.name}</h3>
      <p className={cn('mt-1 text-sm', hi ? 'text-white/60' : 'text-slate-500')}>{p.description}</p>
      <div className="mt-6 flex items-end gap-1">
        <span className={cn('font-display text-4xl font-bold', hi ? 'text-white' : 'text-navy-900')}>{p.price}</span>
        {p.period && <span className={cn('mb-1 text-sm', hi ? 'text-white/60' : 'text-slate-500')}>/ {p.period}</span>}
      </div>
      <ul className="mt-7 flex-1 space-y-3">
        {lines(p.features).map((f) => (
          <li key={f} className="flex gap-3 text-sm">
            <span className={cn('mt-0.5 rounded-full p-0.5', hi ? 'bg-accent-500 text-navy-900' : 'bg-brand-100 text-brand-700')}>
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className={hi ? 'text-white/85' : 'text-slate-600'}>{f}</span>
          </li>
        ))}
      </ul>
      <Link to={`/get-quote?plan=${encodeURIComponent(p.name)}`} className={cn('mt-8 w-full', hi ? 'btn-accent' : 'btn-outline')}>
        {p.button_text || 'Get Started'}
      </Link>
    </div>
  );
}

export function CtaBand() {
  const { settings: s } = useSite();
  return (
    <section className="container-x py-20">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-600 via-brand-700 to-navy-900 px-8 py-14 text-center sm:px-16 lg:py-20">
          <div className="grid-bg absolute inset-0 opacity-40" />
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-accent-500/30 blur-3xl" />
          <div className="relative mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">{s.cta_title || 'Ready to start your project?'}</h2>
            <p className="mt-4 text-lg text-white/75">{s.cta_text}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/get-quote" className="btn-accent !px-7 !py-3.5 text-base">
                Get Free Quote <ArrowRight className="h-5 w-5" />
              </Link>
              {s.phone && (
                <a href={`tel:${s.phone}`} className="btn !border !border-white/30 !px-7 !py-3.5 text-base text-white hover:bg-white/10">
                  Call {s.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function EnquiryForm({ source = 'contact', defaultService = '', defaultMessage = '', compact = false, title }) {
  const { services } = useSite();
  const empty = { name: '', email: '', phone: '', company: '', service: defaultService, budget: '', message: defaultMessage, website: '' };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    setF((x) => ({ ...x, service: defaultService }));
  }, [defaultService]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/public/enquiry', { ...f, source });
      toast.success(data.message);
      setF(empty);
      setDone(true);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl bg-emerald-50 p-10 text-center">
        <div className="rounded-full bg-emerald-500 p-4 text-white">
          <Check className="h-8 w-8" />
        </div>
        <h3 className="mt-5 text-2xl font-bold">Thank you!</h3>
        <p className="mt-2 text-slate-600">Your request has been received. Our team will contact you very soon.</p>
        <button className="btn-outline mt-6" onClick={() => setDone(false)}>Send another message</button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {title && <h3 className="text-xl font-semibold">{title}</h3>}
      <input type="text" className="hidden" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <input className="input !py-3" required placeholder="Your name *" value={f.name} onChange={set('name')} />
        <input className="input !py-3" required placeholder="Phone number *" value={f.phone} onChange={set('phone')} />
        <input className="input !py-3" type="email" placeholder="Email address" value={f.email} onChange={set('email')} />
        <input className="input !py-3" placeholder="Company / Organisation" value={f.company} onChange={set('company')} />
        <select className="input !py-3" value={f.service} onChange={set('service')}>
          <option value="">Service interested in</option>
          {services.map((s) => (
            <option key={s.id}>{s.title}</option>
          ))}
          <option>Other</option>
        </select>
        {!compact && (
          <select className="input !py-3" value={f.budget} onChange={set('budget')}>
            <option value="">Approx. budget</option>
            {['Below ₹10,000', '₹10,000 – ₹25,000', '₹25,000 – ₹50,000', '₹50,000 – ₹1,00,000', 'Above ₹1,00,000'].map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        )}
      </div>
      <textarea className="input !py-3" rows={compact ? 3 : 5} placeholder="Tell us about your project…" value={f.message} onChange={set('message')} />
      <button className="btn-primary w-full !py-3.5 text-base sm:w-auto" disabled={busy}>
        {busy ? <Spinner className="h-5 w-5 text-white" /> : <Send className="h-5 w-5" />} {source === 'quote' ? 'Request Quote' : 'Send Message'}
      </button>
    </form>
  );
}
