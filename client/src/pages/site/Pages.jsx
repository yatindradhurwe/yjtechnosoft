import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, ArrowUpRight, Check, MapPin, Phone, Mail, Clock, Briefcase, Calendar, IndianRupee, Users, Target, Eye, Send, Upload, ExternalLink, Search } from 'lucide-react';
import useFetch from '../../lib/useFetch';
import api, { errMsg } from '../../lib/api';
import { useSite } from '../../context/SiteContext';
import { asset, cn, fmtDate, lines } from '../../lib/utils';
import { Icon, PageLoader, Spinner } from '../../components/ui';
import { Seo } from '../../components/site/Layout';
import SocialIcon from '../../components/site/SocialIcons';
import { PageHero, Reveal, SectionHeading, ServiceCard, PortfolioCard, ProductCard, StageBadge, BlogCard, TestimonialCard, Counter, CtaBand, EnquiryForm, Faq } from '../../components/site/Blocks';

/* ====================================================================== About */
export function About() {
  const { settings: s } = useSite();
  const { data } = useFetch('/public/about');
  return (
    <>
      <Seo title="About Us" />
      <PageHero title="About Us" text={s.tagline ? `${s.site_name} – ${s.tagline}` : ''} crumbs={[{ label: 'About' }]} />
      <section className="section">
        <div className="container-x grid items-center gap-14 lg:grid-cols-2">
          <Reveal>
            {s.about_image ? (
              <img src={asset(s.about_image)} alt="" className="w-full rounded-3xl shadow-soft" />
            ) : (
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 to-brand-700 p-5 sm:p-10 lg:p-12">
                <div className="grid-bg absolute inset-0" />
                <img src={asset(s.logo || '/logo.png')} alt="" className="relative mx-auto w-full max-w-[280px] rounded-2xl bg-white p-4 shadow-2xl sm:p-6" />
                <div className="relative mt-6 grid grid-cols-2 gap-3 sm:mt-10 sm:gap-4">
                  {(data?.stats || []).slice(0, 4).map((st) => (
                    <div key={st.id} className="rounded-2xl bg-white/10 p-4 text-white backdrop-blur sm:p-5">
                      <p className="font-display text-2xl font-bold sm:text-3xl">
                        <Counter value={st.value} suffix={st.suffix} />
                      </p>
                      <p className="text-sm text-white/70">{st.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Reveal>
          <Reveal delay={0.1}>
            <span className="eyebrow">Who we are</span>
            <h2 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">{s.about_title}</h2>
            <div className="rich mt-5" dangerouslySetInnerHTML={{ __html: s.about_text || '' }} />
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-brand-50 p-6">
                <Target className="h-7 w-7 text-brand-600" />
                <h4 className="mt-3 font-semibold">Our Mission</h4>
                <p className="mt-1 text-sm text-slate-600">{s.mission}</p>
              </div>
              <div className="rounded-2xl bg-accent-500/15 p-6">
                <Eye className="h-7 w-7 text-accent-600" />
                <h4 className="mt-3 font-semibold">Our Vision</h4>
                <p className="mt-1 text-sm text-slate-600">{s.vision}</p>
              </div>
            </div>
            {s.cin && (
              <p className="mt-6 text-sm text-slate-500">
                Registered as <b>{s.company_name}</b> · CIN: {s.cin}
                {s.gstin ? ` · GSTIN: ${s.gstin}` : ''}
              </p>
            )}
          </Reveal>
        </div>
      </section>
      {data?.team?.length > 0 && (
        <section className="section bg-slate-50">
          <div className="container-x">
            <SectionHeading eyebrow="Our team" title="Meet the people behind" highlight="our success" />
            <div className="grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-4">
              {data.team.map((m, i) => (
                <Reveal key={m.id} delay={(i % 4) * 0.06}>
                  <div className="group overflow-hidden rounded-3xl bg-white text-center shadow-sm ring-1 ring-slate-200/70">
                    <div className="aspect-[4/5] overflow-hidden bg-gradient-to-br from-brand-100 to-brand-50 sm:aspect-square">
                      {m.photo ? (
                        <img src={asset(m.photo)} alt={m.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full items-center justify-center font-display text-6xl font-bold text-brand-300">{m.name[0]}</div>
                      )}
                    </div>
                    <div className="p-3 sm:p-5">
                      <h4 className="text-sm font-semibold sm:text-base">{m.name}</h4>
                      <p className="text-xs text-brand-600 sm:text-sm">{m.designation}</p>
                      {m.linkedin && (
                        <a href={m.linkedin} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-brand-600 hover:text-white">
                          <SocialIcon name="linkedin" />
                        </a>
                      )}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}
      {data?.testimonials?.length > 0 && (
        <section className="section">
          <div className="container-x">
            <SectionHeading eyebrow="Testimonials" title="Loved by" highlight="our clients" />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data.testimonials.slice(0, 3).map((t) => (
                <TestimonialCard key={t.id} t={t} />
              ))}
            </div>
          </div>
        </section>
      )}
      <CtaBand />
    </>
  );
}

/* ====================================================================== Services */
export function Services() {
  const { data, loading } = useFetch('/public/services');
  return (
    <>
      <Seo title="Services" />
      <PageHero title="Our Services" text="End-to-end technology services to build, grow and scale your business." crumbs={[{ label: 'Services' }]} />
      <section className="section">
        <div className="container-x">
          {loading ? (
            <PageLoader />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.map((s, i) => (
                <ServiceCard key={s.id} s={s} i={i} />
              ))}
            </div>
          )}
        </div>
      </section>
      <CtaBand />
    </>
  );
}

export function ServiceDetail() {
  const { slug } = useParams();
  const { data: s, loading, error } = useFetch(`/public/services/${slug}`);
  if (loading) return <PageLoader />;
  if (error || !s) return <NotFound />;
  return (
    <>
      <Seo title={s.meta_title || s.title} description={s.meta_description || s.short_description} image={s.image} />
      <PageHero title={s.title} text={s.short_description} crumbs={[{ label: 'Services', to: '/services' }, { label: s.title }]} image={s.image} />
      <section className="section">
        <div className="container-x grid gap-12 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {s.image && <img src={asset(s.image)} alt={s.title} className="mb-8 w-full rounded-3xl object-cover shadow-soft" />}
            <div className="rich" dangerouslySetInnerHTML={{ __html: s.description || '' }} />
            {lines(s.features).length > 0 && (
              <div className="mt-10">
                <h3 className="text-2xl font-bold">What’s included</h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {lines(s.features).map((f) => (
                    <div key={f} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                      <span className="rounded-full bg-brand-600 p-1 text-white">
                        <Check className="h-4 w-4" />
                      </span>
                      <span className="font-medium text-slate-700">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {s.faqs?.length > 0 && (
              <div className="mt-12">
                <h3 className="mb-5 text-2xl font-bold">Frequently asked questions</h3>
                <Faq items={s.faqs} />
              </div>
            )}
          </div>
          <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-3xl bg-navy-900 p-7 text-white">
              <h3 className="text-xl font-semibold text-white">Get a free quote</h3>
              {s.starting_price && (
                <p className="mt-1 text-sm text-white/60">
                  Starting from <span className="font-bold text-accent-400">{s.starting_price}</span>
                </p>
              )}
              <div className="mt-5 [&_.input]:border-white/15 [&_.input]:bg-white/10 [&_.input]:text-white [&_.input]:placeholder-white/50 [&_option]:text-navy-900">
                <EnquiryForm source="quote" defaultService={s.title} compact />
              </div>
            </div>
            {s.related?.length > 0 && (
              <div className="rounded-3xl border border-slate-200 p-6">
                <h4 className="mb-4 font-semibold">Other services</h4>
                <div className="space-y-2">
                  {s.related.map((r) => (
                    <Link key={r.id} to={`/services/${r.slug}`} className="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-brand-50">
                      <span className="rounded-lg bg-brand-50 p-2 text-brand-600">
                        <Icon name={r.icon} className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-medium">{r.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}

/* ====================================================================== Portfolio */
export function Portfolio() {
  const { data, loading } = useFetch('/public/portfolio');
  const [cat, setCat] = useState('All');
  const cats = ['All', ...new Set((data || []).map((p) => p.category).filter(Boolean))];
  const list = (data || []).filter((p) => cat === 'All' || p.category === cat);
  return (
    <>
      <Seo title="Portfolio" />
      <PageHero title="Our Portfolio" text="Real projects, real results – explore the work we are proud of." crumbs={[{ label: 'Portfolio' }]} />
      <section className="section">
        <div className="container-x">
          {cats.length > 2 && (
            <div className="mb-10 flex flex-wrap justify-center gap-2">
              {cats.map((c) => (
                <button key={c} onClick={() => setCat(c)} className={cn('rounded-full px-5 py-2 text-sm font-semibold transition', cat === c ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                  {c}
                </button>
              ))}
            </div>
          )}
          {loading ? (
            <PageLoader />
          ) : list.length ? (
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
              {list.map((p, i) => (
                <PortfolioCard key={p.id} p={p} i={i} />
              ))}
            </div>
          ) : (
            <p className="text-center text-slate-500">Projects will be published soon.</p>
          )}
        </div>
      </section>
      <CtaBand />
    </>
  );
}

export function PortfolioDetail() {
  const { slug } = useParams();
  const { data: p, loading, error } = useFetch(`/public/portfolio/${slug}`);
  if (loading) return <PageLoader />;
  if (error || !p) return <NotFound />;
  return (
    <>
      <Seo title={p.title} description={p.short_description} image={p.image} />
      <PageHero title={p.title} text={p.short_description} crumbs={[{ label: 'Portfolio', to: '/portfolio' }, { label: p.title }]} />
      <section className="section">
        <div className="container-x grid gap-12 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {p.image && <img src={asset(p.image)} alt={p.title} className="mb-8 w-full rounded-3xl shadow-soft" />}
            <div className="rich" dangerouslySetInnerHTML={{ __html: p.description || '' }} />
          </div>
          <aside className="h-fit rounded-3xl bg-slate-50 p-7">
            <h3 className="text-lg font-semibold">Project details</h3>
            <dl className="mt-5 space-y-4 text-sm">
              {[['Client', p.client_name], ['Category', p.category], ['Technologies', p.technologies], ['Completed', p.completed_on && fmtDate(p.completed_on)]]
                .filter((x) => x[1])
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
                    <dd className="mt-1 font-medium text-navy-900">{v}</dd>
                  </div>
                ))}
            </dl>
            {p.project_url && (
              <a href={p.project_url} target="_blank" rel="noreferrer" className="btn-primary mt-6 w-full">
                Visit project <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </aside>
        </div>
        {p.related?.length > 0 && (
          <div className="container-x mt-20">
            <h3 className="mb-8 text-2xl font-bold">More projects</h3>
            <div className="grid gap-6 md:grid-cols-3">
              {p.related.map((r, i) => (
                <PortfolioCard key={r.id} p={r} i={i} />
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

/* ====================================================================== Products */
export function Products() {
  const { data, loading } = useFetch('/public/products');
  return (
    <>
      <Seo title="Our Products" description="Software products built and run by our team." />
      <PageHero title="Our Products" text="Ready-to-use software built and supported by our own team." crumbs={[{ label: 'Products' }]} />
      <section className="section">
        <div className="container-x">
          {loading ? (
            <PageLoader />
          ) : data?.length ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.map((p, i) => <ProductCard key={p.id} p={p} i={i} />)}
            </div>
          ) : (
            <p className="text-center text-slate-500">Our products will be listed here soon.</p>
          )}
        </div>
      </section>
      <CtaBand />
    </>
  );
}

export function ProductDetail() {
  const { slug } = useParams();
  const { data: p, loading, error } = useFetch(`/public/products/${slug}`);
  if (loading) return <PageLoader />;
  if (error || !p) return <NotFound />;
  const features = lines(p.features);
  return (
    <>
      <Seo title={p.name} description={p.short_description} image={p.image} />
      <PageHero title={p.name} text={p.tagline || p.short_description} crumbs={[{ label: 'Products', to: '/products' }, { label: p.name }]} />
      <section className="section">
        <div className="container-x grid gap-10 lg:grid-cols-3 lg:gap-12">
          <div className="min-w-0 lg:col-span-2">
            {p.image && <img src={asset(p.image)} alt={p.name} className="mb-8 w-full rounded-3xl shadow-soft ring-1 ring-slate-200" />}
            {p.short_description && <p className="mb-6 text-lg leading-relaxed text-slate-600">{p.short_description}</p>}
            <div className="rich" dangerouslySetInnerHTML={{ __html: p.description || '' }} />
          </div>
          <aside className="h-fit rounded-3xl bg-slate-50 p-6 sm:p-7 lg:sticky lg:top-28">
            <div className="flex items-center gap-3">
              {p.logo && <img src={asset(p.logo)} alt="" className="h-12 w-12 rounded-2xl object-contain" />}
              <div><h3 className="text-lg font-semibold">{p.name}</h3><StageBadge stage={p.stage} /></div>
            </div>
            {features.length > 0 && (
              <ul className="mt-6 space-y-2.5">
                {features.map((f) => <li key={f} className="flex items-start gap-2 text-sm text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {f}</li>)}
              </ul>
            )}
            {p.audience && (
              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Built for</p>
                <p className="mt-1 text-sm font-medium text-navy-900">{p.audience}</p>
              </div>
            )}
            <div className="mt-6 space-y-2">
              {p.website_url && <a href={p.website_url} target="_blank" rel="noreferrer" className="btn-primary w-full">{p.cta_text || 'Visit website'} <ArrowUpRight className="h-4 w-4" /></a>}
              <Link to={`/get-quote?product=${encodeURIComponent(p.name)}`} className={cn('w-full', p.website_url ? 'btn-outline' : 'btn-primary')}>Request a demo <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </aside>
        </div>
        {p.related?.length > 0 && (
          <div className="container-x mt-20">
            <h3 className="mb-8 text-2xl font-bold">More products</h3>
            <div className="grid gap-6 md:grid-cols-3">{p.related.map((r, i) => <ProductCard key={r.id} p={r} i={i} />)}</div>
          </div>
        )}
      </section>
    </>
  );
}

/* ====================================================================== Blog */
export function Blog() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1);
  const category = params.get('category') || '';
  const [q, setQ] = useState(params.get('q') || '');
  const { data, loading } = useFetch('/public/blog', { page, category, q: params.get('q') || '' });
  const pages = data ? Math.ceil(data.total / data.limit) : 1;
  return (
    <>
      <Seo title="Blog" />
      <PageHero title="Blog & Insights" text="Tips, trends and stories from the world of technology and digital growth." crumbs={[{ label: 'Blog' }]} />
      <section className="section">
        <div className="container-x">
          <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {[{ category: '' }, ...(data?.categories || [])].map((c) => (
                <button
                  key={c.category || 'all'}
                  onClick={() => setParams(c.category ? { category: c.category } : {})}
                  className={cn('rounded-full px-4 py-2 text-sm font-semibold', category === (c.category || '') ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
                >
                  {c.category || 'All'}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setParams(q ? { q } : {});
              }}
              className="relative w-full md:w-72"
            >
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Search articles…" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
          </div>
          {loading ? (
            <PageLoader />
          ) : data?.data?.length ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data.data.map((b, i) => (
                <BlogCard key={b.id} b={b} i={i} />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-slate-500">No articles found.</p>
          )}
          {pages > 1 && (
            <div className="mt-12 flex justify-center gap-2">
              {Array.from({ length: pages }).map((_, i) => (
                <button key={i} onClick={() => setParams({ ...(category && { category }), page: i + 1 })} className={cn('h-10 w-10 rounded-xl text-sm font-semibold', page === i + 1 ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600')}>
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function BlogPost() {
  const { slug } = useParams();
  const { data: p, loading, error } = useFetch(`/public/blog/${slug}`);
  if (loading) return <PageLoader />;
  if (error || !p) return <NotFound />;
  return (
    <>
      <Seo title={p.meta_title || p.title} description={p.meta_description || p.excerpt} image={p.image} />
      <PageHero title={p.title} crumbs={[{ label: 'Blog', to: '/blog' }, { label: p.category || 'Article' }]} />
      <section className="section !pt-12">
        <div className="container-x grid gap-12 lg:grid-cols-3">
          <article className="lg:col-span-2">
            <div className="mb-6 flex flex-wrap items-center gap-4 text-sm text-slate-500">
              {p.author && <span>By <b className="text-navy-900">{p.author}</b></span>}
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" /> {fmtDate(p.published_at)}
              </span>
              {p.category && <span className="rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-700">{p.category}</span>}
            </div>
            {p.image && <img src={asset(p.image)} alt={p.title} className="mb-8 w-full rounded-3xl" />}
            <div className="rich" dangerouslySetInnerHTML={{ __html: p.content || '' }} />
            {p.tags && (
              <div className="mt-8 flex flex-wrap gap-2">
                {p.tags.split(',').map((t) => (
                  <span key={t} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">#{t.trim()}</span>
                ))}
              </div>
            )}
          </article>
          <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
            {p.recent?.length > 0 && (
              <div className="rounded-3xl border border-slate-200 p-6">
                <h4 className="mb-4 font-semibold">Recent posts</h4>
                <div className="space-y-4">
                  {p.recent.map((r) => (
                    <Link key={r.id} to={`/blog/${r.slug}`} className="group flex gap-3">
                      <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-brand-100 to-brand-50">
                        {r.image && <img src={asset(r.image)} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div>
                        <p className="line-clamp-2 text-sm font-semibold group-hover:text-brand-700">{r.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{fmtDate(r.published_at)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-3xl bg-gradient-to-br from-brand-600 to-navy-900 p-7 text-white">
              <h4 className="text-xl font-semibold text-white">Need help with your project?</h4>
              <p className="mt-2 text-sm text-white/70">Talk to our experts for a free consultation.</p>
              <Link to="/get-quote" className="btn-accent mt-5">Get a Quote</Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

/* ====================================================================== Careers */
const JOB_TYPE = { full_time: 'Full Time', part_time: 'Part Time', internship: 'Internship', contract: 'Contract', remote: 'Remote' };

export function Careers() {
  const { data, loading } = useFetch('/public/careers');
  return (
    <>
      <Seo title="Careers" />
      <PageHero title="Careers & Internships" text="Join a passionate team building technology that matters. Grow your career with real projects." crumbs={[{ label: 'Careers' }]} />
      <section className="section">
        <div className="container-x">
          <div className="mb-14 grid gap-5 md:grid-cols-3">
            {[
              { i: Users, t: 'Great team culture', d: 'Collaborative, friendly and growth-focused environment.' },
              { i: Briefcase, t: 'Live projects', d: 'Work on real client & government projects from day one.' },
              { i: Target, t: 'Career growth', d: 'Mentorship, certificates and full-time opportunities for interns.' },
            ].map((x) => (
              <div key={x.t} className="rounded-3xl bg-slate-50 p-7">
                <x.i className="h-8 w-8 text-brand-600" />
                <h3 className="mt-4 text-lg font-semibold">{x.t}</h3>
                <p className="mt-1 text-sm text-slate-500">{x.d}</p>
              </div>
            ))}
          </div>
          <SectionHeading eyebrow="Open positions" title="Find your" highlight="next role" />
          {loading ? (
            <PageLoader />
          ) : data?.length ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {data.map((j, i) => (
                <Reveal key={j.id} delay={(i % 2) * 0.06}>
                  <Link to={`/careers/${j.slug}`} className="group flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-7 transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-soft">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className={cn('badge', j.job_type === 'internship' ? 'bg-accent-500/20 text-accent-600' : 'bg-brand-50 text-brand-700')}>{JOB_TYPE[j.job_type]}</span>
                        <h3 className="mt-3 text-xl font-semibold group-hover:text-brand-700">{j.title}</h3>
                      </div>
                      <span className="rounded-full bg-slate-100 p-2.5 text-slate-600 transition group-hover:bg-brand-600 group-hover:text-white">
                        <ArrowRight className="h-5 w-5" />
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-500">{j.short_description}</p>
                    <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-5 text-sm text-slate-600">
                      {j.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-brand-600" />{j.location}</span>}
                      {j.experience && <span className="flex items-center gap-1.5"><Briefcase className="h-4 w-4 text-brand-600" />{j.experience}</span>}
                      {j.salary_range && <span className="flex items-center gap-1.5"><IndianRupee className="h-4 w-4 text-brand-600" />{j.salary_range}</span>}
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl bg-slate-50 p-10 text-center">
              <p className="text-slate-600">There are no open positions right now, but we are always looking for talent.</p>
              <Link to="/careers/apply" className="btn-primary mt-5">Send your resume</Link>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function ApplyForm({ job }) {
  const empty = { name: '', email: '', phone: '', city: '', qualification: '', college: '', experience: '', current_ctc: '', expected_ctc: '', notice_period: '', portfolio_url: '', cover_letter: '' };
  const [f, setF] = useState(empty);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const intern = job?.job_type === 'internship';
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      if (job) fd.append('job_id', job.id);
      if (file) fd.append('resume', file);
      const { data } = await api.post('/public/apply', fd);
      toast.success(data.message);
      setDone(true);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  if (done)
    return (
      <div className="rounded-3xl bg-emerald-50 p-8 text-center">
        <Check className="mx-auto h-12 w-12 rounded-full bg-emerald-500 p-2.5 text-white" />
        <h3 className="mt-4 text-xl font-bold">Application submitted!</h3>
        <p className="mt-2 text-sm text-slate-600">Thank you for applying. Our HR team will review your profile and contact you soon.</p>
      </div>
    );
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <input className="input" required placeholder="Full name *" value={f.name} onChange={set('name')} />
        <input className="input" required type="email" placeholder="Email *" value={f.email} onChange={set('email')} />
        <input className="input" required placeholder="Mobile number *" value={f.phone} onChange={set('phone')} />
        <input className="input" placeholder="City" value={f.city} onChange={set('city')} />
        <input className="input" placeholder="Highest qualification" value={f.qualification} onChange={set('qualification')} />
        <input className="input" placeholder="College / University" value={f.college} onChange={set('college')} />
        {!intern && (
          <>
            <input className="input" placeholder="Total experience" value={f.experience} onChange={set('experience')} />
            <input className="input" placeholder="Notice period" value={f.notice_period} onChange={set('notice_period')} />
            <input className="input" placeholder="Current CTC" value={f.current_ctc} onChange={set('current_ctc')} />
            <input className="input" placeholder="Expected CTC" value={f.expected_ctc} onChange={set('expected_ctc')} />
          </>
        )}
        <input className="input sm:col-span-2" placeholder="Portfolio / GitHub / LinkedIn URL" value={f.portfolio_url} onChange={set('portfolio_url')} />
      </div>
      <textarea className="input" rows={4} placeholder="Why should we hire you?" value={f.cover_letter} onChange={set('cover_letter')} />
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 p-4 transition hover:border-brand-400">
        <Upload className="h-6 w-6 text-brand-600" />
        <span className="text-sm text-slate-600">{file ? file.name : 'Upload resume (PDF / DOC, max 5 MB)'}</span>
        <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => setFile(e.target.files[0])} />
      </label>
      <button className="btn-primary w-full !py-3.5" disabled={busy}>
        {busy ? <Spinner className="h-5 w-5 text-white" /> : <Send className="h-5 w-5" />} Submit application
      </button>
    </form>
  );
}

export function CareerDetail() {
  const { slug } = useParams();
  const general = slug === 'apply';
  const { data: j, loading, error } = useFetch(general ? null : `/public/careers/${slug}`, undefined, { skip: general });
  if (!general && loading) return <PageLoader />;
  if (!general && (error || !j)) return <NotFound />;
  return (
    <>
      <Seo title={general ? 'Apply' : j.title} description={j?.short_description} />
      <PageHero title={general ? 'Send your resume' : j.title} text={general ? 'We are always looking for passionate people.' : j.short_description} crumbs={[{ label: 'Careers', to: '/careers' }, { label: general ? 'Apply' : j.title }]} />
      <section className="section">
        <div className="container-x grid gap-12 lg:grid-cols-5">
          {!general && (
            <div className="lg:col-span-3">
              <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  [Briefcase, 'Type', JOB_TYPE[j.job_type]],
                  [MapPin, 'Location', j.location],
                  [Clock, 'Experience', j.experience],
                  [IndianRupee, j.job_type === 'internship' ? 'Stipend' : 'Salary', j.salary_range],
                ]
                  .filter((x) => x[2])
                  .map(([I, k, v]) => (
                    <div key={k} className="rounded-2xl bg-slate-50 p-4">
                      <I className="h-5 w-5 text-brand-600" />
                      <p className="mt-2 text-xs text-slate-400">{k}</p>
                      <p className="text-sm font-semibold text-navy-900">{v}</p>
                    </div>
                  ))}
              </div>
              <h3 className="text-xl font-bold">Job description</h3>
              <div className="rich mt-3" dangerouslySetInnerHTML={{ __html: j.description || '' }} />
              {j.requirements && (
                <>
                  <h3 className="mt-8 text-xl font-bold">Requirements</h3>
                  <div className="rich mt-3" dangerouslySetInnerHTML={{ __html: j.requirements }} />
                </>
              )}
              {j.last_date && <p className="mt-6 text-sm text-slate-500">Last date to apply: <b>{fmtDate(j.last_date)}</b></p>}
            </div>
          )}
          <div className={general ? 'lg:col-span-3 lg:col-start-2' : 'lg:col-span-2'}>
            <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-soft lg:sticky lg:top-28">
              <h3 className="mb-5 text-xl font-semibold">Apply {general ? 'now' : 'for this position'}</h3>
              <ApplyForm job={general ? null : j} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ====================================================================== Contact / Quote */
export function Contact() {
  const { settings: s } = useSite();
  const cards = [
    { i: Phone, t: 'Call us', v: [s.phone, s.phone2].filter(Boolean), href: (x) => `tel:${x}` },
    { i: Mail, t: 'Email us', v: [s.email].filter(Boolean), href: (x) => `mailto:${x}` },
    { i: MapPin, t: 'Visit us', v: [s.address].filter(Boolean) },
    { i: Clock, t: 'Working hours', v: [s.working_hours].filter(Boolean) },
  ];
  return (
    <>
      <Seo title="Contact Us" />
      <PageHero title="Contact Us" text="We would love to hear about your project. Let’s talk!" crumbs={[{ label: 'Contact' }]} />
      <section className="section">
        <div className="container-x">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c, i) => (
              <Reveal key={c.t} delay={i * 0.06}>
                <div className="h-full rounded-3xl border border-slate-200 p-7 transition hover:border-brand-200 hover:shadow-soft">
                  <div className="inline-flex rounded-2xl bg-brand-600 p-3 text-white shadow-lg shadow-brand-600/30">
                    <c.i className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 font-semibold">{c.t}</h3>
                  {c.v.map((v) =>
                    c.href ? (
                      <a key={v} href={c.href(v)} className="mt-1 block text-sm text-slate-600 hover:text-brand-700">{v}</a>
                    ) : (
                      <p key={v} className="mt-1 text-sm text-slate-600">{v}</p>
                    )
                  )}
                </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-14 grid gap-10 lg:grid-cols-2">
            <div className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-slate-100 sm:p-8">
              <h2 className="text-2xl font-bold">Send us a message</h2>
              <p className="mb-6 mt-1 text-slate-500">Fill the form and our team will get back within 24 hours.</p>
              <EnquiryForm />
            </div>
            <div className="min-h-[300px] overflow-hidden rounded-3xl bg-slate-100 sm:min-h-[420px]">
              {s.map_embed && <iframe title="map" src={s.map_embed} className="h-full min-h-[300px] w-full border-0 sm:min-h-[420px]" loading="lazy" allowFullScreen />}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export function GetQuote() {
  const [params] = useSearchParams();
  const { settings: s } = useSite();
  return (
    <>
      <Seo title="Get a Free Quote" />
      <PageHero title="Get a Free Quote" text="Tell us about your requirements and receive a detailed proposal within 24 hours." crumbs={[{ label: 'Get a Quote' }]} />
      <section className="section">
        <div className="container-x grid gap-12 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <h2 className="text-3xl font-bold">Let’s build something great together</h2>
            <p className="mt-4 text-slate-600">Share a few details and our consultant will prepare a tailored quotation with timelines and costs – no obligation.</p>
            <ul className="mt-8 space-y-4">
              {['Free consultation & requirement analysis', 'Detailed GST quotation within 24 hours', 'Flexible milestone-based payments', 'Dedicated project manager', 'Post-launch support & maintenance'].map((x) => (
                <li key={x} className="flex items-center gap-3">
                  <span className="rounded-full bg-emerald-500 p-1 text-white"><Check className="h-4 w-4" /></span>
                  <span className="font-medium text-slate-700">{x}</span>
                </li>
              ))}
            </ul>
            {s.phone && (
              <div className="mt-10 rounded-3xl bg-navy-900 p-7 text-white">
                <p className="text-sm text-white/60">Prefer to talk?</p>
                <a href={`tel:${s.phone}`} className="mt-1 block font-display text-2xl font-bold text-accent-400">{s.phone}</a>
              </div>
            )}
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-slate-100 sm:p-8 lg:col-span-3">
            <EnquiryForm source="quote" defaultMessage={params.get('product') ? `I would like a demo of ${params.get('product')}.` : params.get('plan') ? `I am interested in the ${params.get('plan')} plan.` : ''} />
          </div>
        </div>
      </section>
    </>
  );
}

/* ====================================================================== CMS Page & 404 */
export function CmsPage() {
  const { slug } = useParams();
  const { data: p, loading, error } = useFetch(`/public/pages/${slug}`);
  if (loading) return <PageLoader />;
  if (error || !p) return <NotFound />;
  return (
    <>
      <Seo title={p.meta_title || p.title} description={p.meta_description} />
      <PageHero title={p.title} crumbs={[{ label: p.title }]} />
      <section className="section !pt-12">
        <div className="container-x max-w-4xl">
          <div className="rich" dangerouslySetInnerHTML={{ __html: p.content || '' }} />
        </div>
      </section>
    </>
  );
}

export function NotFound() {
  return (
    <section className="container-x flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="font-display text-8xl font-black text-gradient">404</p>
      <h1 className="mt-4 text-3xl font-bold">Page not found</h1>
      <p className="mt-2 text-slate-500">The page you are looking for doesn’t exist or has been moved.</p>
      <Link to="/" className="btn-primary mt-8">Back to home</Link>
    </section>
  );
}

