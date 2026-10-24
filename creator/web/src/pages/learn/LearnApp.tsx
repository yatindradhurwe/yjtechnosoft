import { lazy, Suspense } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { Award, BookOpen, Calendar, Gift, LifeBuoy, LogOut, Moon, Radio, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { toggleTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { NotificationBell } from '@/pages/app/CreatorApp';

const Library = lazy(() => import('./Library'));
const CoursePlayer = lazy(() => import('./CoursePlayer'));
const MyWorkshops = lazy(() => import('./MyWorkshops'));
const MyBookings = lazy(() => import('./MyBookings'));
const Certificates = lazy(() => import('./Certificates'));
const AffiliateDashboard = lazy(() => import('./AffiliateDashboard'));
const Account = lazy(() => import('./Account'));
const Support = lazy(() => import('./Support'));

const NAV = [
  { to: '/learn', label: 'Library', icon: <BookOpen />, end: true },
  { to: '/learn/workshops', label: 'Workshops', icon: <Radio /> },
  { to: '/learn/bookings', label: 'Sessions', icon: <Calendar /> },
  { to: '/learn/certificates', label: 'Certificates', icon: <Award /> },
  { to: '/learn/affiliate', label: 'Affiliate', icon: <Gift /> },
  { to: '/learn/account', label: 'Account', icon: <User /> },
];

export default function LearnApp() {
  const { user, workspaces, logout } = useAuth();
  const nav = useNavigate();
  const isStaff = workspaces.some((w) => w.roles.some((r) => r !== 'STUDENT' && r !== 'AFFILIATE'));
  return (
    <div className="min-h-screen" style={{ ['--brand' as string]: 'hsl(var(--primary))' }}>
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="container flex h-14 items-center gap-4">
          <Link to="/learn" className="flex items-center gap-2 font-display font-extrabold"><img src="/favicon.svg" alt="" className="h-6 w-6" /> My learning</Link>
          <nav className="hidden gap-1 md:flex" aria-label="Learning">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm [&_svg]:h-4 [&_svg]:w-4', isActive ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted')}>
                {n.icon}
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {isStaff && <Button asChild size="sm" variant="outline"><Link to="/app">Creator dashboard</Link></Button>}
            {user?.platformRole !== 'USER' && <Button asChild size="sm" variant="ghost"><Link to="/admin">Admin</Link></Button>}
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle dark mode"><Moon /></Button>
            <NotificationBell linkBase="" />
            <Button variant="ghost" size="icon" onClick={() => nav('/learn/support')} aria-label="Help"><LifeBuoy /></Button>
            <Button variant="ghost" size="icon" onClick={async () => { await logout(); nav('/'); }} aria-label="Sign out"><LogOut /></Button>
          </div>
        </div>
        <nav className="container flex gap-1 overflow-x-auto pb-2 md:hidden" aria-label="Learning mobile">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('whitespace-nowrap rounded-md px-3 py-1.5 text-sm', isActive ? 'bg-accent font-medium' : 'text-muted-foreground')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="container py-6">
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route index element={<Library />} />
            <Route path="course/:courseId" element={<CoursePlayer />} />
            <Route path="course/:courseId/:lessonId" element={<CoursePlayer />} />
            <Route path="workshops" element={<MyWorkshops />} />
            <Route path="bookings" element={<MyBookings />} />
            <Route path="certificates" element={<Certificates />} />
            <Route path="affiliate" element={<AffiliateDashboard />} />
            <Route path="account" element={<Account />} />
            <Route path="support" element={<Support />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
