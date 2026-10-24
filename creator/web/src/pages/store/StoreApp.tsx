import { createContext, lazy, Suspense, useContext, useEffect } from 'react';
import { Link, NavLink, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hexToHsl, visitorId } from '@/lib/theme';
import { useSeo } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';
import { Button } from '@/components/ui/button';
import { ErrorState, Spinner } from '@/components/ui/misc';

const StoreHome = lazy(() => import('./StoreHome'));
const ProductPage = lazy(() => import('./ProductPage'));
const OrderStatus = lazy(() => import('./OrderStatus'));
const Workshops = lazy(() => import('./Workshops'));
const WorkshopPage = lazy(() => import('./WorkshopPage'));
const Booking = lazy(() => import('./Booking'));
const LandingPage = lazy(() => import('./LandingPage'));
const ToolPage = lazy(() => import('./ToolPage'));
const FeedPage = lazy(() => import('./FeedPage'));
const AffiliateJoin = lazy(() => import('./AffiliateJoin'));
const Communities = lazy(() => import('./Communities'));

export interface Store {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  about: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  socialImageUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  supportEmail: string | null;
  currency: string;
}

const StoreCtx = createContext<{ store: Store; products: any[] } | null>(null);
export const useStore = () => {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('useStore outside store');
  return v;
};

function useAffiliateCapture(slug: string) {
  const [params] = useSearchParams();
  const ref = params.get('ref');
  useEffect(() => {
    if (!ref) return;
    try {
      localStorage.setItem(`ref:${slug}`, JSON.stringify({ code: ref, at: Date.now() }));
    } catch {
      /* storage unavailable */
    }
    api.post(`/store/${slug}/affiliates/click`, { code: ref, visitorId: visitorId(), path: location.pathname }).catch(() => undefined);
  }, [ref, slug]);
}

export function affiliateCode(slug: string) {
  try {
    const v = JSON.parse(localStorage.getItem(`ref:${slug}`) ?? 'null');
    if (v && Date.now() - v.at < 30 * 86400_000) return v.code as string;
  } catch {
    /* ignore */
  }
  return undefined;
}

export default function StoreApp() {
  const { slug = '' } = useParams();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['store', slug], queryFn: () => api.get<{ store: Store; products: any[] }>(`/store/${slug}`), retry: false });
  useAffiliateCapture(slug);
  useSeo(q.data?.store.name, q.data?.store.tagline ?? undefined, q.data?.store.socialImageUrl ?? undefined);

  useEffect(() => {
    const fav = q.data?.store.faviconUrl;
    if (!fav) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const prev = link?.href;
    if (link) link.href = fav;
    return () => {
      if (link && prev) link.href = prev;
    };
  }, [q.data]);

  if (q.isPending) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (q.isError)
    return (
      <div className="container max-w-lg py-24 text-center">
        {q.error instanceof ApiError && q.error.status === 404 ? <><h1 className="text-3xl font-bold">Store not found</h1><p className="mt-2 text-muted-foreground">This store doesn't exist or is unavailable.</p></> : <ErrorState error={q.error} />}
      </div>
    );
  const s = q.data.store;
  const navItems = [
    { to: '', label: 'Home' },
    { to: 'workshops', label: 'Workshops' },
    { to: 'book', label: 'Book a session' },
    { to: 'feed', label: 'Videos' },
    { to: 'community', label: 'Community' },
  ];
  return (
    <StoreCtx.Provider value={q.data}>
      <div className="flex min-h-screen flex-col" style={{ ['--brand' as string]: s.primaryColor, ['--primary' as string]: hexToHsl(s.primaryColor), ['--ring' as string]: hexToHsl(s.primaryColor), fontFamily: `${s.fontFamily}, Inter, sans-serif` }}>
        <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(s.fontFamily)}:wght@400;600;700&display=swap`} />
        <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
          <div className="container flex h-16 items-center gap-4">
            <Link to={`/s/${s.slug}`} className="flex items-center gap-2 text-lg font-bold">
              {s.logoUrl ? <img src={s.logoUrl} alt="" className="h-8 w-8 rounded-md object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-md text-white" style={{ background: s.primaryColor }}>{s.name[0]}</span>}
              {s.name}
            </Link>
            <nav className="hidden gap-1 md:flex" aria-label="Store">
              {navItems.map((n) => (
                <NavLink key={n.to} end={!n.to} to={`/s/${s.slug}${n.to ? `/${n.to}` : ''}`} className={({ isActive }) => cn('rounded-md px-3 py-1.5 text-sm', isActive ? 'font-semibold' : 'text-muted-foreground hover:text-foreground')}>
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              {user ? <Button asChild size="sm" variant="outline"><Link to="/learn">My library</Link></Button> : <Button asChild size="sm" variant="outline"><Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>Sign in</Link></Button>}
            </div>
          </div>
          <nav className="container flex gap-1 overflow-x-auto pb-2 md:hidden" aria-label="Store mobile">
            {navItems.map((n) => <NavLink key={n.to} end={!n.to} to={`/s/${s.slug}${n.to ? `/${n.to}` : ''}`} className={({ isActive }) => cn('whitespace-nowrap rounded-md px-3 py-1 text-sm', isActive ? 'bg-muted font-medium' : 'text-muted-foreground')}>{n.label}</NavLink>)}
          </nav>
        </header>
        <main className="flex-1">
          <Suspense fallback={<div className="flex justify-center py-20"><Spinner /></div>}>
            <Routes>
              <Route index element={<StoreHome />} />
              <Route path="p/:productSlug" element={<ProductPage />} />
              <Route path="orders/:orderId" element={<OrderStatus />} />
              <Route path="workshops" element={<Workshops />} />
              <Route path="workshops/:workshopId" element={<WorkshopPage />} />
              <Route path="book" element={<Booking />} />
              <Route path="book/:offeringId" element={<Booking />} />
              <Route path="l/:pageSlug" element={<LandingPage />} />
              <Route path="t/:toolSlug" element={<ToolPage />} />
              <Route path="feed" element={<FeedPage />} />
              <Route path="affiliates" element={<AffiliateJoin />} />
              <Route path="community" element={<Communities />} />
              <Route path="*" element={<div className="container py-20 text-center"><h1 className="text-2xl font-bold">Page not found</h1></div>} />
            </Routes>
          </Suspense>
        </main>
        <footer className="border-t py-8 text-sm text-muted-foreground">
          <div className="container flex flex-col gap-2 sm:flex-row sm:justify-between">
            <span>© {new Date().getFullYear()} {s.name}{s.supportEmail && <> · <a href={`mailto:${s.supportEmail}`} className="hover:text-foreground">{s.supportEmail}</a></>}</span>
            <span className="flex gap-4"><Link to={`/s/${s.slug}/affiliates`} className="hover:text-foreground">Become an affiliate</Link><Link to="/" className="hover:text-foreground">Powered by {BRAND}</Link></span>
          </div>
        </footer>
      </div>
    </StoreCtx.Provider>
  );
}
