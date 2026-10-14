import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Play, ShieldCheck, Headphones, Zap, Award, Lightbulb, PenTool, Code2, Rocket, CheckCircle2, Star, TrendingUp, Users } from 'lucide-react';
import useFetch from '../../lib/useFetch';
import { useSite } from '../../context/SiteContext';
import { asset, cn } from '../../lib/utils';
import { Icon, PageLoader } from '../../components/ui';
import { Seo } from '../../components/site/Layout';
import {
  Reveal, SectionHeading, Counter, ServiceCard, PortfolioCard, ProductShowcase, BlogCard, TestimonialCard, Faq, PricingCard, CtaBand,
} from '../../components/site/Blocks';

function Hero({ sliders, stats }) {
  const [i, setI] = useState(0);
  const slide = sliders[i] || {};
  useEffect(() => {
    if (sliders.length < 2) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % sliders.length), 6500);
    return () => clearInterval(t);
  }, [sliders.length]);

  return (
    <section className="relative overflow-hidden bg-navy-900">
      <div className="grid-bg absolute inset-0" />
      <div className="absolute -left-40 top-10 h-[480px] w-[480px] rounded-full bg-brand-600/40 blur-[120px]" />
      <div className="absolute -right-20 bottom-0 h-[380px] w-[380px] rounded-full bg-accent-500/20 blur-[120px]" />
      <div className="container-x relative grid items-center gap-14 pb-24 pt-16 lg:grid-cols-2 lg:pb-32 lg:pt-24">
        <div>
          <AnimatePresence mode="wait">
            <motion.div key={i} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.55 }}>
              {slide.badge && (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/85 backdrop-blur">
                  {slide.badge}
                </span>
              )}
              <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] text-white sm:text-5xl lg:text-[64px]">
                {slide.title} <span className="text-gradient block">{slide.highlight}</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">{slide.subtitle}</p>
              <div className="mt-9 flex flex-wrap gap-3">
                {slide.button_text && (
                  <Link to={slide.button_link || '/get-quote'} className="btn-accent !px-7 !py-3.5 text-base">
                    {slide.button_text} <ArrowRight className="h-5 w-5" />
                  </Link>
                )}
                {slide.button2_text && (
                  <Link to={slide.button2_link || '/services'} className="btn !border !border-white/25 !px-7 !py-3.5 text-base text-white hover:bg-white/10">
                    <Play className="h-4 w-4" /> {slide.button2_text}
                  </Link>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="mt-10 flex flex-wrap items-center gap-6 text-sm text-white/60">
            {['ISO-grade processes', 'Govt. trusted', 'Dedicated support'].map((t) => (
              <span key={t} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-accent-400" /> {t}
              </span>
            ))}
          </div>
          {sliders.length > 1 && (
            <div className="mt-8 flex gap-2">
              {sliders.map((s, idx) => (
                <button key={s.id} onClick={() => setI(idx)} className={cn('h-1.5 rounded-full transition-all', idx === i ? 'w-10 bg-accent-500' : 'w-4 bg-white/25')} aria-label={`Slide ${idx + 1}`} />
              ))}
            </div>
          )}
        </div>

        <div className="relative hidden lg:block">
          {slide.image ? (
            <motion.img key={slide.image} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} src={asset(slide.image)} alt="" className="relative z-10 w-full rounded-3xl shadow-2xl" />
          ) : (
            <HeroVisual stats={stats} />
          )}
        </div>
      </div>
      <svg className="absolute bottom-0 left-0 w-full text-white" viewBox="0 0 1440 60" preserveAspectRatio="none" fill="currentColor">
        <path d="M0 60h1440V24c-240 26-480 34-720 18S240 0 0 24z" />
      </svg>
    </section>
  );
}

function HeroVisual({ stats }) {
  const s0 = stats[0] || { value: 150, suffix: '+', label: 'Projects Delivered' };
  const s1 = stats[1] || { value: 100, suffix: '+', label: 'Happy Clients' };
  return (
    <div className="relative mx-auto aspect-square max-w-[520px]">
      <div className="absolute inset-8 rounded-[2.5rem] bg-gradient-to-br from-brand-500/30 to-accent-500/10 blur-2xl" />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="absolute inset-x-6 top-10 rounded-3xl border border-white/10 bg-navy-800/80 p-5 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-400" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
        </div>
        <pre className="overflow-hidden font-mono text-[13px] leading-6 text-white/80">
          <span className="text-sky-300">const</span> <span className="text-accent-400">project</span> = {'{'}
          {'\n'}  client: <span className="text-emerald-300">'Your Business'</span>,
          {'\n'}  stack: [<span className="text-emerald-300">'React'</span>, <span className="text-emerald-300">'Node'</span>, <span className="text-emerald-300">'MySQL'</span>],
          {'\n'}  design: <span className="text-emerald-300">'Premium'</span>,
          {'\n'}  support: <span className="text-sky-300">true</span>,
          {'\n'}  result: <span className="text-emerald-300">'🚀 Growth'</span>
          {'\n'}{'}'};
        </pre>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[68, 92, 80].map((h, i) => (
            <div key={i} className="flex h-20 items-end rounded-xl bg-white/5 p-2">
              <motion.div initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: 0.6 + i * 0.15, duration: 0.8 }} className="w-full rounded-md bg-gradient-to-t from-brand-600 to-sky-400" />
            </div>
          ))}
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="absolute -left-4 bottom-20 animate-float-slow rounded-2xl bg-white p-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-600">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-navy-900">
              <Counter value={s0.value} suffix={s0.suffix} />
            </p>
            <p className="text-xs text-slate-500">{s0.label}</p>
          </div>
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 }} className="absolute -right-2 bottom-4 rounded-2xl bg-accent-500 p-4 shadow-2xl" style={{ animation: 'float 7s ease-in-out infinite' }}>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-navy-900 p-2.5 text-accent-400">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-navy-900">
              <Counter value={s1.value} suffix={s1.suffix} />
            </p>
            <p className="text-xs font-medium text-navy-900/70">{s1.label}</p>
          </div>
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="absolute -top-2 right-8 flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-xl">
        <div className="flex text-accent-500">
          {[0, 1, 2, 3, 4].map((x) => (
            <Star key={x} className="h-4 w-4 fill-current" />
          ))}
        </div>
        <span className="text-xs font-semibold text-navy-900">5.0 client rating</span>
      </motion.div>
    </div>
  );
}

function Marquee({ items, render }) {
  if (!items.length) return null;
  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <div className="flex w-max animate-marquee gap-4 hover:[animation-play-state:paused]">{doubled.map((it, i) => render(it, i))}</div>
    </div>
  );
}

const WHY = [
  { icon: ShieldCheck, title: 'Secure & Reliable', text: 'Enterprise-grade security practices trusted by government departments.' },
  { icon: Zap, title: 'Fast Delivery', text: 'Agile process with weekly demos – launch faster without compromising quality.' },
  { icon: Headphones, title: 'Dedicated Support', text: 'Local team, quick response and long-term maintenance you can count on.' },
  { icon: Award, title: 'Transparent Pricing', text: 'Clear quotations, GST invoices and no hidden charges – ever.' },
];

const PROCESS = [
  { icon: Lightbulb, title: 'Discover', text: 'We understand your goals, users and requirements in detail.' },
  { icon: PenTool, title: 'Design', text: 'Wireframes and pixel-perfect UI designs for your approval.' },
  { icon: Code2, title: 'Develop', text: 'Clean, scalable code with regular progress updates.' },
  { icon: Rocket, title: 'Launch & Support', text: 'Deployment, training and dedicated after-sales support.' },
];

export default function Home() {
  const { data, loading, error } = useFetch('/public/home');
  const { settings: s } = useSite();
  if (error && !data)
    return (
      <section className="container-x flex min-h-[50vh] flex-col items-center justify-center py-20 text-center">
        <h1 className="text-2xl font-bold">We’ll be right back</h1>
        <p className="mt-2 max-w-md text-slate-500">The website is being updated. Please try again in a few minutes.</p>
        {s.phone && <a href={`tel:${s.phone}`} className="btn-primary mt-6">Call {s.phone}</a>}
      </section>
    );
  if (loading || !data) return <PageLoader />;
  const { sliders, services, portfolio, testimonials, partners, technologies, stats, pricing, faqs, blog, products = [] } = data;

  return (
    <>
      <Seo />
      <Hero sliders={sliders.length ? sliders : [{ title: 'We build software that', highlight: 'grows your business', subtitle: s.footer_about, button_text: 'Get Free Quote', button_link: '/get-quote' }]} stats={stats} />

      {(partners.length > 0 || technologies.length > 0) && (
        <section className="border-b border-slate-100 py-12">
          <div className="container-x">
            <p className="mb-8 text-center text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
              {partners.length ? 'Trusted by organisations across India' : 'Technologies we master'}
            </p>
            <Marquee
              items={partners.length ? partners : technologies}
              render={(p, i) => (
                <div key={i} className="flex h-16 min-w-[170px] items-center justify-center rounded-2xl border border-slate-100 bg-slate-50/60 px-6">
                  {p.logo ? <img src={asset(p.logo)} alt={p.name} className="max-h-10 w-auto object-contain grayscale transition hover:grayscale-0" /> : <span className="font-display text-lg font-semibold text-slate-500">{p.name}</span>}
                </div>
              )}
            />
          </div>
        </section>
      )}

      <section className="section">
        <div className="container-x">
          <SectionHeading eyebrow="What we do" title="Services that power" highlight="digital growth" text="From idea to launch and beyond – complete technology services under one roof." />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((sv, i) => (
              <ServiceCard key={sv.id} s={sv} i={i} />
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link to="/services" className="btn-outline">
              View all services <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="section relative overflow-hidden bg-slate-50">
        <div className="container-x grid items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <span className="eyebrow">Why choose us</span>
            <h2 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl lg:text-[44px]">
              {s.about_title || 'A technology partner you can rely on'}
            </h2>
            <div className="rich mt-5 text-slate-600" dangerouslySetInnerHTML={{ __html: s.about_text || '' }} />
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {WHY.map((w) => (
                <div key={w.title} className="flex gap-4">
                  <div className="h-fit rounded-xl bg-brand-600 p-2.5 text-white shadow-lg shadow-brand-600/25">
                    <w.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold">{w.title}</h4>
                    <p className="mt-1 text-sm text-slate-500">{w.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/about" className="btn-primary mt-10">
              More about us <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="grid grid-cols-2 gap-3 sm:gap-5">
              {stats.map((st, i) => (
                <div key={st.id} className={cn('rounded-3xl p-5 shadow-sm sm:p-8', i % 3 === 0 ? 'bg-navy-900 text-white' : 'bg-white ring-1 ring-slate-200', (i === 1 || i === 3) && 'lg:translate-y-8')}>
                  <Icon name={st.icon} className={cn('h-8 w-8', i % 3 === 0 ? 'text-accent-400' : 'text-brand-600')} />
                  <p className={cn('mt-4 font-display text-3xl font-bold sm:mt-5 sm:text-4xl', i % 3 === 0 ? 'text-white' : 'text-navy-900')}>
                    <Counter value={st.value} suffix={st.suffix} />
                  </p>
                  <p className={cn('mt-1 text-sm', i % 3 === 0 ? 'text-white/70' : 'text-slate-500')}>{st.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section relative overflow-hidden bg-navy-900">
        <div className="grid-bg absolute inset-0" />
        <div className="container-x relative">
          <SectionHeading light eyebrow="How we work" title="A proven process for" highlight="predictable results" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {PROCESS.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.1}>
                <div className="group relative h-full rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur transition hover:border-accent-500/50 hover:bg-white/10">
                  <span className="absolute right-6 top-5 font-display text-5xl font-bold text-white/5 transition group-hover:text-accent-500/20">0{i + 1}</span>
                  <div className="inline-flex rounded-2xl bg-accent-500 p-3.5 text-navy-900">
                    <p.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-white">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">{p.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {products.length > 0 && (
        <section className="section bg-slate-50">
          <div className="container-x">
            <div className="mb-12 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
              <SectionHeading center={false} className="!mb-0" eyebrow="Our products" title="Software we" highlight="build & run" text="Ready-to-use products made and supported by our own team." />
              <Link to="/products" className="btn-outline shrink-0">
                All products <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="space-y-16">
              {products.slice(0, 4).map((p, i) => <ProductShowcase key={p.id} p={p} flip={i % 2 === 1} />)}
            </div>
          </div>
        </section>
      )}

      {portfolio.length > 0 && (
        <section className="section">
          <div className="container-x">
            <div className="mb-12 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
              <SectionHeading center={false} className="!mb-0" eyebrow="Our work" title="Featured" highlight="projects" text="A glimpse of the solutions we have delivered for our clients." />
              <Link to="/portfolio" className="btn-outline shrink-0">
                View portfolio <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
              {portfolio.map((p, i) => (
                <PortfolioCard key={p.id} p={p} i={i} />
              ))}
            </div>
          </div>
        </section>
      )}

      {technologies.length > 0 && partners.length > 0 && (
        <section className="pb-20">
          <div className="container-x">
            <SectionHeading eyebrow="Tech stack" title="Technologies we" highlight="master" />
            <div className="flex flex-wrap justify-center gap-3">
              {technologies.map((t) => (
                <span key={t.id} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-700">
                  {t.logo && <img src={asset(t.logo)} alt="" className="h-5 w-5 object-contain" />} {t.name}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {testimonials.length > 0 && (
        <section className="section bg-gradient-to-b from-brand-50/60 to-white">
          <div className="container-x">
            <SectionHeading eyebrow="Testimonials" title="What our clients" highlight="say about us" />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {testimonials.slice(0, 6).map((t, i) => (
                <Reveal key={t.id} delay={(i % 3) * 0.08}>
                  <TestimonialCard t={t} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {pricing.length > 0 && (
        <section className="section">
          <div className="container-x">
            <SectionHeading eyebrow="Pricing" title="Simple, transparent" highlight="pricing" text="Affordable packages for every stage of your business. Need something custom? Ask for a quote." />
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {pricing.map((p, i) => (
                <Reveal key={p.id} delay={i * 0.08}>
                  <PricingCard p={p} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {faqs.length > 0 && (
        <section className="section bg-slate-50">
          <div className="container-x grid gap-12 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <SectionHeading center={false} eyebrow="FAQ" title="Frequently asked" highlight="questions" text="Can’t find the answer you are looking for? Reach out to our team." />
              <Link to="/contact" className="btn-primary">
                Contact us <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="lg:col-span-3">
              <Faq items={faqs} />
            </div>
          </div>
        </section>
      )}

      {blog.length > 0 && (
        <section className="section">
          <div className="container-x">
            <SectionHeading eyebrow="Insights" title="Latest from our" highlight="blog" />
            <div className="grid gap-6 md:grid-cols-3">
              {blog.map((b, i) => (
                <BlogCard key={b.id} b={b} i={i} />
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBand />
    </>
  );
}
