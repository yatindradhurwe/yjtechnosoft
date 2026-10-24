import { lazy, ReactNode, Suspense, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3, Bell, BookOpen, Bot, Calendar, CreditCard, ExternalLink, FileText, Film, Gift, GraduationCap, Image, LayoutTemplate, LifeBuoy, LogOut, Mail, Menu as MenuIcon, Moon,
  Package, Radio, Search, Settings, ShieldAlert, ShoppingBag, Ticket, Trophy, Users, Wrench, X, Handshake,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toggleTheme } from '@/lib/theme';
import { cn, relative } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/menu';
import { ErrorState, Spinner } from '@/components/ui/misc';
import { makeWsCtx, WorkspaceState, WsContext, useWs } from './workspace';

const Dashboard = lazy(() => import('./Dashboard'));
const Courses = lazy(() => import('./Courses'));
const CourseEditor = lazy(() => import('./CourseEditor'));
const Products = lazy(() => import('./Products'));
const ProductEditor = lazy(() => import('./ProductEditor'));
const Coupons = lazy(() => import('./Coupons'));
const Orders = lazy(() => import('./Orders'));
const OrderDetail = lazy(() => import('./OrderDetail'));
const Customers = lazy(() => import('./Customers'));
const CustomerDetail = lazy(() => import('./CustomerDetail'));
const Media = lazy(() => import('./Media'));
const Workshops = lazy(() => import('./Workshops'));
const Consultations = lazy(() => import('./Consultations'));
const CommunityAdmin = lazy(() => import('./CommunityAdmin'));
const FeedAdmin = lazy(() => import('./FeedAdmin'));
const Gamification = lazy(() => import('./Gamification'));
const Marketing = lazy(() => import('./Marketing'));
const Affiliates = lazy(() => import('./Affiliates'));
const Pages = lazy(() => import('./Pages'));
const PageBuilder = lazy(() => import('./PageBuilder'));
const Tools = lazy(() => import('./Tools'));
const Assistant = lazy(() => import('./Assistant'));
const SettingsPage = lazy(() => import('./Settings'));
const Finance = lazy(() => import('./Finance'));

interface NavEntry {
  to: string;
  label: string;
  icon: ReactNode;
  perm?: string;
}

const NAV: { group: string; items: NavEntry[] }[] = [
  { group: '', items: [{ to: '', label: 'Overview', icon: <BarChart3 />, perm: 'analytics.read' }] },
  {
    group: 'Sell',
    items: [
      { to: 'products', label: 'Products', icon: <Package />, perm: 'products.read' },
      { to: 'courses', label: 'Courses', icon: <GraduationCap />, perm: 'courses.read' },
      { to: 'orders', label: 'Orders', icon: <ShoppingBag />, perm: 'orders.read' },
      { to: 'coupons', label: 'Coupons', icon: <Ticket />, perm: 'products.read' },
      { to: 'finance', label: 'Earnings & payouts', icon: <CreditCard />, perm: 'billing.manage' },
    ],
  },
  {
    group: 'Engage',
    items: [
      { to: 'community', label: 'Community', icon: <Users />, perm: 'community.write' },
      { to: 'workshops', label: 'Workshops', icon: <Radio />, perm: 'workshops.write' },
      { to: 'consultations', label: '1:1 sessions', icon: <Calendar />, perm: 'consultations.write' },
      { to: 'feed', label: 'Video feed', icon: <Film />, perm: 'community.moderate' },
      { to: 'gamification', label: 'Rewards', icon: <Trophy />, perm: 'community.write' },
    ],
  },
  {
    group: 'Grow',
    items: [
      { to: 'customers', label: 'Customers', icon: <BookOpen />, perm: 'customers.read' },
      { to: 'marketing', label: 'Email & WhatsApp', icon: <Mail />, perm: 'customers.read' },
      { to: 'affiliates', label: 'Affiliates', icon: <Handshake />, perm: 'affiliates.manage' },
      { to: 'pages', label: 'Landing pages', icon: <LayoutTemplate />, perm: 'pages.write' },
      { to: 'tools', label: 'Creator tools', icon: <Wrench />, perm: 'pages.write' },
      { to: 'assistant', label: 'AI assistant', icon: <Bot />, perm: 'ai.use' },
    ],
  },
  {
    group: 'Workspace',
    items: [
      { to: 'media', label: 'Media library', icon: <Image />, perm: 'courses.read' },
      { to: 'settings', label: 'Settings', icon: <Settings /> },
    ],
  },
];

function GlobalSearch() {
  const ws = useWs();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const results = useQuery({ queryKey: ['search', ws.slug, q], queryFn: () => ws.get(`/dashboard/search?q=${encodeURIComponent(q)}`), enabled: q.trim().length >= 2 && ws.can('analytics.read') });
  const r = results.data;
  const go = (path: string) => {
    setQ('');
    nav(`/app/${ws.slug}/${path}`);
  };
  return (
    <div className="relative hidden w-full max-w-sm md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses, products, customers, orders…" className="pl-9" aria-label="Search workspace" />
      {q.trim().length >= 2 && r && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover p-1 shadow-lg">
          {[...r.courses.map((c: any) => ({ k: `c${c.id}`, label: c.title, kind: 'Course', path: `courses/${c.id}` })), ...r.products.map((p: any) => ({ k: `p${p.id}`, label: p.title, kind: 'Product', path: `products/${p.id}` })), ...r.contacts.map((c: any) => ({ k: `ct${c.id}`, label: c.name ?? c.email, kind: 'Customer', path: `customers/${c.id}` })), ...r.orders.map((o: any) => ({ k: `o${o.id}`, label: `#${o.number} · ${o.buyerEmail}`, kind: 'Order', path: `orders/${o.id}` }))].map((x) => (
            <button key={x.k} className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted" onClick={() => go(x.path)}>
              <span className="truncate">{x.label}</span>
              <span className="text-xs text-muted-foreground">{x.kind}</span>
            </button>
          ))}
          {!r.courses.length && !r.products.length && !r.contacts.length && !r.orders.length && <p className="p-3 text-sm text-muted-foreground">No results</p>}
        </div>
      )}
    </div>
  );
}

export function NotificationBell({ linkBase }: { linkBase: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ items: { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }[]; unread: number }>('/learn/notifications'), refetchInterval: 60_000 });
  const nav = useNavigate();
  return (
    <Menu
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Notifications${q.data?.unread ? ` (${q.data.unread} unread)` : ''}`} className="relative">
          <Bell />
          {!!q.data?.unread && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />}
        </Button>
      }
    >
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <span className="text-sm font-semibold">Notifications</span>
        {!!q.data?.unread && (
          <button className="text-xs text-primary" onClick={async () => { await api.post('/learn/notifications/read', {}); qc.invalidateQueries({ queryKey: ['notifications'] }); }}>
            Mark all read
          </button>
        )}
      </div>
      <MenuSeparator />
      <div className="max-h-80 w-80 overflow-y-auto">
        {(q.data?.items ?? []).length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">You're all caught up.</p>}
        {q.data?.items.map((n) => (
          <MenuItem key={n.id} onSelect={() => { api.post('/learn/notifications/read', { ids: [n.id] }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })); if (n.link) nav(n.link.startsWith('/learn') || n.link.startsWith('/community') ? n.link : `${linkBase}${n.link}`); }}>
            <div className={cn('min-w-0', !n.readAt && 'font-medium')}>
              <p className="truncate text-sm">{n.title}</p>
              {n.body && <p className="truncate text-xs text-muted-foreground">{n.body}</p>}
              <p className="text-xs text-muted-foreground">{relative(n.createdAt)}</p>
            </div>
          </MenuItem>
        ))}
      </div>
    </Menu>
  );
}

function Announcements() {
  const q = useQuery({ queryKey: ['announcements'], queryFn: () => api.get<{ announcements: { id: string; title: string; body: string }[] }>('/public/announcements'), staleTime: 300_000 });
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('dismissed-announcements') ?? '[]');
    } catch {
      return [];
    }
  });
  const items = (q.data?.announcements ?? []).filter((a) => !hidden.includes(a.id));
  if (!items.length) return null;
  return (
    <div className="space-y-px">
      {items.map((a) => (
        <div key={a.id} role="status" className="flex items-start gap-3 bg-primary/10 px-4 py-2 text-sm">
          <span className="flex-1"><strong>{a.title}</strong> — {a.body}</span>
          <button aria-label="Dismiss" onClick={() => { const next = [...hidden, a.id]; setHidden(next); try { localStorage.setItem('dismissed-announcements', JSON.stringify(next)); } catch { /* ignore */ } }}><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const ws = useWs();
  const { user, workspaces, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const staffWorkspaces = workspaces.filter((w) => w.roles.some((r) => ['OWNER', 'ADMIN', 'TEAM_MEMBER', 'INSTRUCTOR', 'MODERATOR'].includes(r)));

  const sidebar = (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto p-3" aria-label="Dashboard">
      <Menu
        align="start"
        trigger={
          <button className="flex w-full items-center gap-2 rounded-lg border bg-card p-2 text-left hover:bg-muted">
            {ws.workspace.logoUrl ? <img src={ws.workspace.logoUrl} alt="" className="h-8 w-8 rounded-md object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-white" style={{ background: ws.workspace.primaryColor }}>{ws.workspace.name[0]}</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{ws.workspace.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{ws.plan?.name ?? 'No plan'} plan</span>
            </span>
          </button>
        }
      >
        <MenuLabel>Switch workspace</MenuLabel>
        {staffWorkspaces.map((w) => (
          <MenuItem key={w.id} onSelect={() => nav(`/app/${w.slug}`)}>
            {w.name}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => nav('/onboarding')}>+ New workspace</MenuItem>
      </Menu>
      {NAV.map((g) => {
        const items = g.items.filter((i) => !i.perm || ws.can(i.perm));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            {g.group && <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{g.group}</p>}
            {items.map((i) => (
              <NavLink
                key={i.to}
                to={`/app/${ws.slug}${i.to ? `/${i.to}` : ''}`}
                end={!i.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) => cn('flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm [&_svg]:h-4 [&_svg]:w-4', isActive ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
              >
                {i.icon}
                {i.label}
              </NavLink>
            ))}
          </div>
        );
      })}
      <div className="mt-auto space-y-1 border-t pt-3">
        <a href={`/s/${ws.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted [&_svg]:h-4 [&_svg]:w-4">
          <ExternalLink /> View storefront
        </a>
        <Link to="/learn/support" className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted [&_svg]:h-4 [&_svg]:w-4">
          <LifeBuoy /> Help & support
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r bg-muted/20 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-background shadow-xl">
            <Button variant="ghost" size="icon" className="absolute right-2 top-2" onClick={() => setOpen(false)} aria-label="Close menu"><X /></Button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><MenuIcon /></Button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            {ws.supportSession && <span className="mr-2 flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning"><ShieldAlert className="h-3.5 w-3.5" /> Support view (read-only)</span>}
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle dark mode"><Moon /></Button>
            <NotificationBell linkBase={`/app/${ws.slug}`} />
            <Menu trigger={<Button variant="ghost" className="gap-2 px-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{user?.name?.[0]}</span><span className="hidden text-sm sm:inline">{user?.name}</span></Button>}>
              <MenuLabel>{user?.email}</MenuLabel>
              <MenuItem onSelect={() => nav('/learn')}><GraduationCap /> My learning</MenuItem>
              <MenuItem onSelect={() => nav('/learn/account')}><FileText /> Account</MenuItem>
              {user?.platformRole !== 'USER' && <MenuItem onSelect={() => nav('/admin')}><ShieldAlert /> Platform admin</MenuItem>}
              <MenuItem onSelect={() => nav('/learn/affiliate')}><Gift /> Affiliate programs</MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={async () => { await logout(); nav('/'); }}><LogOut /> Sign out</MenuItem>
            </Menu>
          </div>
        </header>
        <Announcements />
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export default function CreatorApp() {
  const { ws: slug = '' } = useParams();
  const q = useQuery({ queryKey: ['ws', slug], queryFn: () => api.get<WorkspaceState>('/workspaces/current', slug), retry: false });
  const ctx = useMemo(() => (q.data ? makeWsCtx(slug, q.data) : null), [slug, q.data]);
  if (q.isPending) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (q.isError || !ctx)
    return (
      <div className="container max-w-lg py-24">
        <ErrorState error={q.error} />
        <div className="mt-4 text-center"><Button asChild variant="outline"><Link to="/app">Back to my workspaces</Link></Button></div>
      </div>
    );
  return (
    <WsContext.Provider value={ctx}>
      <div style={{ ['--brand' as string]: ctx.workspace.primaryColor }}>
        <Shell>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="courses" element={<Courses />} />
              <Route path="courses/:courseId" element={<CourseEditor />} />
              <Route path="products" element={<Products />} />
              <Route path="products/:productId" element={<ProductEditor />} />
              <Route path="coupons" element={<Coupons />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:orderId" element={<OrderDetail />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:contactId" element={<CustomerDetail />} />
              <Route path="media" element={<Media />} />
              <Route path="workshops" element={<Workshops />} />
              <Route path="consultations" element={<Consultations />} />
              <Route path="community" element={<CommunityAdmin />} />
              <Route path="feed" element={<FeedAdmin />} />
              <Route path="gamification" element={<Gamification />} />
              <Route path="marketing" element={<Marketing />} />
              <Route path="affiliates" element={<Affiliates />} />
              <Route path="pages" element={<Pages />} />
              <Route path="pages/:pageId" element={<PageBuilder />} />
              <Route path="tools" element={<Tools />} />
              <Route path="assistant" element={<Assistant />} />
              <Route path="finance" element={<Finance />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<ErrorState error={new Error('Page not found')} />} />
            </Routes>
          </Suspense>
        </Shell>
      </div>
    </WsContext.Provider>
  );
}
