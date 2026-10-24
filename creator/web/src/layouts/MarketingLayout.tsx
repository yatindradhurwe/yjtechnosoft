import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Menu as MenuIcon, Moon, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toggleTheme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/lib/brand';

export interface SiteSettings {
  brandName: string;
  tagline?: string;
  logoUrl?: string;
  announcement?: string;
  footerText?: string;
  footerLinks?: { label: string; href: string }[];
  social?: Record<string, string>;
  analytics?: { gaMeasurementId?: string; plausibleDomain?: string };
}

/** Loads the analytics configured in Admin › Website CMS (marketing pages only) */
function useAnalytics(a?: SiteSettings['analytics']) {
  useEffect(() => {
    const added: HTMLScriptElement[] = [];
    const add = (src: string, attrs: Record<string, string> = {}, inline?: string) => {
      const el = document.createElement('script');
      if (src) el.src = src;
      if (inline) el.text = inline;
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
      added.push(el);
    };
    if (a?.gaMeasurementId && /^G-[A-Z0-9]+$/.test(a.gaMeasurementId)) {
      add(`https://www.googletagmanager.com/gtag/js?id=${a.gaMeasurementId}`, { async: '' });
      add('', {}, `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${a.gaMeasurementId}');`);
    }
    if (a?.plausibleDomain && /^[a-z0-9.-]+$/i.test(a.plausibleDomain)) add('https://plausible.io/js/script.js', { defer: '', 'data-domain': a.plausibleDomain });
    return () => added.forEach((el) => el.remove());
  }, [a?.gaMeasurementId, a?.plausibleDomain]);
}

export function useSite() {
  return useQuery({ queryKey: ['site'], queryFn: () => api.get<{ settings: SiteSettings; nav: { slug: string; title: string }[] }>('/public/site'), staleTime: 300_000 });
}

export function Logo({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-extrabold">
      {logoUrl ? <img src={logoUrl} alt="" className="h-7 w-7 rounded-md object-cover" /> : <img src="/favicon.svg" alt="" className="h-7 w-7" />}
      {name}
    </span>
  );
}

export function MarketingLayout() {
  const site = useSite();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const s = site.data?.settings;
  const nav = site.data?.nav ?? [];
  useAnalytics(s?.analytics);
  return (
    <div className="flex min-h-screen flex-col" style={{ ['--brand' as string]: 'hsl(var(--primary))' }}>
      {s?.announcement && <div className="bg-primary px-4 py-2 text-center text-sm text-primary-foreground">{s.announcement}</div>}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link to="/" aria-label="Home">
            <Logo name={s?.brandName ?? BRAND} logoUrl={s?.logoUrl} />
          </Link>
          <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Main">
            {nav.map((n) => (
              <NavLink key={n.slug} to={`/${n.slug}`} className={({ isActive }) => (isActive ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {n.title}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle dark mode">
              <Moon />
            </Button>
            {user ? (
              <>
                <Button asChild variant="ghost"><Link to="/learn">My learning</Link></Button>
                <Button asChild><Link to={user.platformRole === 'SUPER_ADMIN' ? '/admin' : '/app'}>Dashboard</Link></Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost"><Link to="/login">Sign in</Link></Button>
                <Button asChild><Link to="/signup">Start free</Link></Button>
              </>
            )}
          </div>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
            {open ? <X /> : <MenuIcon />}
          </Button>
        </div>
        {open && (
          <div className="border-t md:hidden">
            <nav className="container flex flex-col gap-1 py-3" aria-label="Mobile">
              {nav.map((n) => (
                <Link key={n.slug} to={`/${n.slug}`} className="rounded-md px-2 py-2 hover:bg-muted" onClick={() => setOpen(false)}>
                  {n.title}
                </Link>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2">
                {user ? (
                  <Button asChild className="col-span-2"><Link to="/app" onClick={() => setOpen(false)}>Dashboard</Link></Button>
                ) : (
                  <>
                    <Button asChild variant="outline"><Link to="/login" onClick={() => setOpen(false)}>Sign in</Link></Button>
                    <Button asChild><Link to="/signup" onClick={() => setOpen(false)}>Start free</Link></Button>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t py-10">
        <div className="container flex flex-col gap-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div>
            <Logo name={s?.brandName ?? BRAND} logoUrl={s?.logoUrl} />
            <p className="mt-2">{s?.footerText}</p>
          </div>
          <nav className="flex flex-wrap gap-4" aria-label="Footer">
            {(s?.footerLinks ?? []).map((l) => (
              <Link key={l.href} to={l.href} className="hover:text-foreground">
                {l.label}
              </Link>
            ))}
            {Object.entries(s?.social ?? {}).map(([k, v]) => (
              <a key={k} href={v} target="_blank" rel="noopener noreferrer" className="capitalize hover:text-foreground">
                {k}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
