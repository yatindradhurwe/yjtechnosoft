import { lazy, Suspense, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, Building2, CreditCard, FileText, Flag, Globe, KeyRound, LifeBuoy, LogOut, Megaphone, Menu as MenuIcon, Moon, Package, ScrollText, Users, Webhook, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { toggleTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';

const Overview = lazy(() => import('./Overview'));
const Tenants = lazy(() => import('./Tenants'));
const UsersPage = lazy(() => import('./Users'));
const Plans = lazy(() => import('./Plans'));
const Integrations = lazy(() => import('./Integrations'));
const Cms = lazy(() => import('./Cms'));
const Finance = lazy(() => import('./Finance'));
const Operations = lazy(() => import('./Operations'));
const Audit = lazy(() => import('./Audit'));
const Flags = lazy(() => import('./Flags'));
const Announcements = lazy(() => import('./Announcements'));
const SupportDesk = lazy(() => import('./SupportDesk'));

const NAV = [
  { to: '', label: 'Overview', icon: <BarChart3 /> },
  { to: 'tenants', label: 'Workspaces', icon: <Building2 /> },
  { to: 'users', label: 'Users', icon: <Users /> },
  { to: 'plans', label: 'Plans', icon: <Package /> },
  { to: 'finance', label: 'Payments & payouts', icon: <CreditCard /> },
  { to: 'cms', label: 'Website CMS', icon: <Globe /> },
  { to: 'integrations', label: 'Integrations', icon: <KeyRound /> },
  { to: 'support', label: 'Support desk', icon: <LifeBuoy /> },
  { to: 'announcements', label: 'Announcements', icon: <Megaphone /> },
  { to: 'flags', label: 'Feature flags', icon: <Flag /> },
  { to: 'operations', label: 'Webhooks & jobs', icon: <Webhook /> },
  { to: 'audit', label: 'Audit log', icon: <ScrollText /> },
];

export default function AdminApp() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  if (user && user.platformRole === 'USER') return <Navigate to="/app" replace />;
  const side = (
    <nav className="space-y-1 p-3" aria-label="Admin">
      <Link to="/admin" className="mb-4 flex items-center gap-2 px-2 font-display font-extrabold"><img src="/favicon.svg" alt="" className="h-6 w-6" /> Platform admin</Link>
      {NAV.map((n) => (
        <NavLink key={n.to} to={`/admin${n.to ? `/${n.to}` : ''}`} end={!n.to} onClick={() => setOpen(false)} className={({ isActive }) => cn('flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm [&_svg]:h-4 [&_svg]:w-4', isActive ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted')}>
          {n.icon}
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-r bg-muted/20 lg:block">{side}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-background">{side}</aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X /> : <MenuIcon />}</Button>
          <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"><Activity className="h-3.5 w-3.5" /> {user?.platformRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Support (read-only)'} · every action is audited</span>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="sm"><Link to="/learn"><FileText /> Exit admin</Link></Button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle dark mode"><Moon /></Button>
            <Button variant="ghost" size="icon" onClick={async () => { await logout(); nav('/'); }} aria-label="Sign out"><LogOut /></Button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6">
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route index element={<Overview />} />
              <Route path="tenants/*" element={<Tenants />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="plans" element={<Plans />} />
              <Route path="finance" element={<Finance />} />
              <Route path="cms/*" element={<Cms />} />
              <Route path="integrations" element={<Integrations />} />
              <Route path="support" element={<SupportDesk />} />
              <Route path="announcements" element={<Announcements />} />
              <Route path="flags" element={<Flags />} />
              <Route path="operations" element={<Operations />} />
              <Route path="audit" element={<Audit />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
