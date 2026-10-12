import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Mail, MapPin, Menu, X, ChevronDown, ArrowRight, Clock, Send, ArrowUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { Helmet } from 'react-helmet-async';
import { useSite } from '../../context/SiteContext';
import { useAuth } from '../../context/AuthContext';
import { asset, cn, waLink } from '../../lib/utils';
import api, { errMsg } from '../../lib/api';
import { Icon } from '../ui';
import SocialIcon from './SocialIcons';

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/services', label: 'Services', mega: true },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/careers', label: 'Careers' },
  { to: '/blog', label: 'Blog' },
  { to: '/contact', label: 'Contact' },
];

export function Logo({ light = false, className = 'h-11' }) {
  const { settings } = useSite();
  const src = (light && settings.logo_light) || settings.logo || '/logo.png';
  return (
    <img
      src={asset(src)}
      alt={settings.site_name || 'YJTechnosoft'}
      className={cn(className, 'w-auto object-contain', light && !settings.logo_light && 'rounded-lg bg-white px-2 py-1')}
    />
  );
}

function Socials({ className }) {
  const { settings: s } = useSite();
  const items = ['facebook', 'instagram', 'linkedin', 'twitter', 'youtube'].filter((k) => s[k]);
  return (
    <div className={cn('flex gap-2', className)}>
      {items.map((k) => (
        <a key={k} href={s[k]} target="_blank" rel="noreferrer" aria-label={k} className="rounded-lg bg-white/10 p-2 text-white/80 transition hover:bg-accent-500 hover:text-navy-900">
          <SocialIcon name={k} />
        </a>
      ))}
    </div>
  );
}

function Header() {
  const { settings: s, services } = useSite();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [mega, setMega] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    setOpen(false);
    setMega(false);
  }, [pathname]);

  return (
    <>
      <div className="hidden bg-navy-950 text-xs text-white/70 md:block">
        <div className="container-x flex h-10 items-center justify-between">
          <div className="flex items-center gap-6">
            {s.phone && (
              <a href={`tel:${s.phone}`} className="flex items-center gap-1.5 hover:text-accent-400">
                <Phone className="h-3.5 w-3.5" /> {s.phone}
              </a>
            )}
            {s.email && (
              <a href={`mailto:${s.email}`} className="flex items-center gap-1.5 hover:text-accent-400">
                <Mail className="h-3.5 w-3.5" /> {s.email}
              </a>
            )}
            {s.working_hours && (
              <span className="hidden items-center gap-1.5 lg:flex">
                <Clock className="h-3.5 w-3.5" /> {s.working_hours}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {s.cin && <span>CIN: {s.cin}</span>}
            <Link to={user ? '/admin' : '/login'} className="font-semibold text-accent-400 hover:text-accent-300">
              {user ? 'Dashboard' : 'Employee / Admin Login'}
            </Link>
          </div>
        </div>
      </div>
      <header className={cn('sticky top-0 z-50 transition-all duration-300', scrolled ? 'bg-white/90 shadow-soft backdrop-blur-xl' : 'bg-white')}>
        <div className="container-x flex h-[76px] items-center justify-between gap-6">
          <Link to="/" className="shrink-0">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) =>
              n.mega ? (
                <div key={n.to} className="relative" onMouseEnter={() => setMega(true)} onMouseLeave={() => setMega(false)}>
                  <NavLink
                    to={n.to}
                    className={({ isActive }) => cn('flex items-center gap-1 rounded-lg px-3.5 py-2 text-[15px] font-medium transition', isActive ? 'text-brand-700' : 'text-slate-700 hover:text-brand-700')}
                  >
                    {n.label} <ChevronDown className={cn('h-4 w-4 transition', mega && 'rotate-180')} />
                  </NavLink>
                  <AnimatePresence>
                    {mega && services.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.18 }}
                        className="absolute left-1/2 top-full w-[620px] -translate-x-1/2 pt-3"
                      >
                        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-100 bg-white p-3 shadow-2xl">
                          {services.map((sv) => (
                            <Link key={sv.id} to={`/services/${sv.slug}`} className="group flex items-center gap-3 rounded-xl p-3 transition hover:bg-brand-50">
                              <span className="rounded-lg bg-brand-600/10 p-2 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
                                <Icon name={sv.icon} className="h-5 w-5" />
                              </span>
                              <span className="text-sm font-semibold text-navy-900">{sv.title}</span>
                            </Link>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) => cn('rounded-lg px-3.5 py-2 text-[15px] font-medium transition', isActive ? 'text-brand-700' : 'text-slate-700 hover:text-brand-700')}
                >
                  {n.label}
                </NavLink>
              )
            )}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/get-quote" className="btn-primary hidden sm:inline-flex">
              Get a Quote <ArrowRight className="h-4 w-4" />
            </Link>
            <button className="rounded-lg p-2 text-navy-900 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[60] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              className="absolute right-0 top-0 flex h-full w-[84%] max-w-sm flex-col bg-white p-6"
            >
              <div className="mb-6 flex items-center justify-between">
                <Logo className="h-10" />
                <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-slate-100">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <nav className="flex flex-col gap-1">
                {NAV.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === '/'}
                    className={({ isActive }) => cn('rounded-xl px-4 py-3 font-medium', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50')}
                  >
                    {n.label}
                  </NavLink>
                ))}
              </nav>
              <div className="mt-auto space-y-3">
                <Link to="/get-quote" className="btn-primary w-full">
                  Get a Free Quote
                </Link>
                <Link to={user ? '/admin' : '/login'} className="btn-outline w-full">
                  {user ? 'Go to Dashboard' : 'Login'}
                </Link>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Newsletter() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/public/subscribe', { email });
      toast.success(data.message);
      setEmail('');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex w-full max-w-md gap-2 rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/15">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email address"
        className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white placeholder-white/50 focus:outline-none"
      />
      <button className="btn-accent !px-4" disabled={busy}>
        <Send className="h-4 w-4" /> Subscribe
      </button>
    </form>
  );
}

function Footer() {
  const { settings: s, services, pages } = useSite();
  return (
    <footer className="relative overflow-hidden bg-navy-900 text-white/70">
      <div className="grid-bg absolute inset-0 opacity-60" />
      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
      <div className="relative">
        <div className="container-x border-b border-white/10 py-10">
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <h3 className="text-2xl font-bold text-white">Stay ahead with tech insights</h3>
              <p className="mt-1 text-sm">Subscribe for updates, offers and digital growth tips.</p>
            </div>
            <Newsletter />
          </div>
        </div>
        <div className="container-x grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo light className="h-12" />
            <p className="mt-5 text-sm leading-relaxed">{s.footer_about}</p>
            <Socials className="mt-6" />
          </div>
          <div className="lg:col-span-2">
            <h4 className="mb-4 font-semibold text-white">Company</h4>
            <ul className="space-y-2.5 text-sm">
              {[['About Us', '/about'], ['Portfolio', '/portfolio'], ['Careers', '/careers'], ['Blog', '/blog'], ['Contact', '/contact'], ['Get a Quote', '/get-quote']].map(([l, to]) => (
                <li key={to}>
                  <Link to={to} className="transition hover:text-accent-400">{l}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-3">
            <h4 className="mb-4 font-semibold text-white">Services</h4>
            <ul className="space-y-2.5 text-sm">
              {services.slice(0, 7).map((sv) => (
                <li key={sv.id}>
                  <Link to={`/services/${sv.slug}`} className="transition hover:text-accent-400">{sv.title}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-3">
            <h4 className="mb-4 font-semibold text-white">Get in touch</h4>
            <ul className="space-y-3.5 text-sm">
              {s.address && (
                <li className="flex gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" /> {s.address}
                </li>
              )}
              {s.phone && (
                <li className="flex gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" />
                  <span>
                    <a href={`tel:${s.phone}`} className="hover:text-white">{s.phone}</a>
                    {s.phone2 && (
                      <>
                        <br />
                        <a href={`tel:${s.phone2}`} className="hover:text-white">{s.phone2}</a>
                      </>
                    )}
                  </span>
                </li>
              )}
              {s.email && (
                <li className="flex gap-3">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" />
                  <a href={`mailto:${s.email}`} className="hover:text-white">{s.email}</a>
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="container-x flex flex-col items-center justify-between gap-3 py-6 text-xs sm:flex-row">
            <p>
              © {new Date().getFullYear()} {s.company_name}. All rights reserved. {s.cin && <span className="ml-1 text-white/50">CIN: {s.cin}</span>}
            </p>
            <div className="flex flex-wrap gap-4">
              {pages.map((p) => (
                <Link key={p.slug} to={`/page/${p.slug}`} className="hover:text-white">{p.title}</Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FloatingActions() {
  const { settings: s } = useSite();
  const [top, setTop] = useState(false);
  useEffect(() => {
    const f = () => setTop(window.scrollY > 600);
    window.addEventListener('scroll', f);
    return () => window.removeEventListener('scroll', f);
  }, []);
  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {top && (
        <button onClick={() => window.scrollTo({ top: 0 })} className="rounded-full bg-navy-900 p-3 text-white shadow-lg transition hover:bg-brand-600" aria-label="Back to top">
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
      {(s.whatsapp_number || s.phone) && (
        <a
          href={waLink(s.whatsapp_number || s.phone, `Hello ${s.site_name || ''}, I would like to know more about your services.`)}
          target="_blank"
          rel="noreferrer"
          className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl shadow-green-600/30 transition hover:scale-105"
          aria-label="Chat on WhatsApp"
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-[#25D366]/40" />
          <SocialIcon name="whatsapp" className="relative h-7 w-7" />
        </a>
      )}
    </div>
  );
}

export function Seo({ title, description, image }) {
  const { settings: s } = useSite();
  const t = title ? `${title} | ${s.site_name || 'YJTechnosoft'}` : s.meta_title || s.site_name;
  return (
    <Helmet>
      <title>{t}</title>
      <meta name="description" content={description || s.meta_description || ''} />
      {s.meta_keywords && <meta name="keywords" content={s.meta_keywords} />}
      <meta property="og:title" content={t} />
      <meta property="og:description" content={description || s.meta_description || ''} />
      {image && <meta property="og:image" content={asset(image)} />}
      {s.favicon && <link rel="icon" href={asset(s.favicon)} />}
    </Helmet>
  );
}

export default function SiteLayout() {
  const { pathname } = useLocation();
  // Block body on purpose: newer Chrome returns a Promise from scrollTo, which React would treat as a cleanup
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <Seo />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <FloatingActions />
    </div>
  );
}
