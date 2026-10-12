import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Image, Briefcase, FileText, MessageSquareQuote, Users, Building2, Cpu, BarChart3, BadgeIndianRupee, HelpCircle, FileStack,
  Inbox, Mail, Receipt, FileSpreadsheet, Wallet, Package, Server, CreditCard, UserCog, CalendarCheck, CalendarOff, PartyPopper, Banknote, Network,
  BadgeCheck, CalendarRange, Megaphone, UserPlus, ClipboardList, FileSignature, FolderKanban, ListTodo, NotebookPen, Settings, Shield, Bell, LogOut,
  Menu, X, ChevronDown, UserCircle, ExternalLink, Clock, Layers, FolderLock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/SiteContext';
import { asset, cn } from '../lib/utils';
import { Avatar, PageLoader } from '../components/ui';
import NotificationBell from '../components/admin/NotificationBell';

export const NAV = [
  { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true },
  {
    group: 'My Workspace',
    employeeOnly: true,
    items: [
      { label: 'My Attendance', to: '/admin/my/attendance', icon: Clock },
      { label: 'My Leaves', to: '/admin/my/leaves', icon: CalendarOff },
      { label: 'My Tasks', to: '/admin/my/tasks', icon: ListTodo },
      { label: 'Daily Reports', to: '/admin/my/reports', icon: NotebookPen },
      { label: 'My Payslips', to: '/admin/my/payslips', icon: Banknote },
      { label: 'My Letters', to: '/admin/my/letters', icon: FileSignature },
    ],
  },
  {
    group: 'Billing & Clients',
    roles: ['accounts'],
    items: [
      { label: 'Clients', to: '/admin/clients', icon: Building2 },
      { label: 'Quotations', to: '/admin/quotations', icon: FileSpreadsheet },
      { label: 'Invoices', to: '/admin/invoices', icon: Receipt },
      { label: 'Payments', to: '/admin/payments', icon: Wallet },
      { label: 'Servers & Domains', to: '/admin/servers', icon: Server },
      { label: 'Items Catalogue', to: '/admin/billing-items', icon: Package },
      { label: 'Expenses', to: '/admin/expenses', icon: CreditCard },
      { label: 'Leads / Enquiries', to: '/admin/enquiries', icon: Inbox },
    ],
  },
  {
    group: 'Contracts & Documents',
    roles: ['accounts', 'hr'],
    items: [
      { label: 'Agreements', to: '/admin/contracts', icon: FileSignature, roles: ['accounts'] },
      { label: 'Documents Vault', to: '/admin/vault', icon: FolderLock },
      { label: 'Agreement Templates', to: '/admin/contract-templates', icon: FileStack, roles: ['accounts'] },
    ],
  },
  {
    group: 'HR & People',
    roles: ['hr'],
    items: [
      { label: 'Employees', to: '/admin/employees', icon: UserCog },
      { label: 'Attendance', to: '/admin/attendance', icon: CalendarCheck },
      { label: 'Leave Requests', to: '/admin/leaves', icon: CalendarOff },
      { label: 'Payroll', to: '/admin/payroll', icon: Banknote },
      { label: 'Holidays', to: '/admin/holidays', icon: PartyPopper },
      { label: 'Departments', to: '/admin/departments', icon: Network },
      { label: 'Designations', to: '/admin/designations', icon: BadgeCheck },
      { label: 'Leave Types', to: '/admin/leave-types', icon: CalendarRange },
      { label: 'Announcements', to: '/admin/announcements', icon: Megaphone },
    ],
  },
  {
    group: 'Recruitment & Letters',
    roles: ['hr'],
    items: [
      { label: 'Job Openings', to: '/admin/jobs', icon: Briefcase },
      { label: 'Applications', to: '/admin/applications', icon: UserPlus },
      { label: 'Letters', to: '/admin/letters', icon: FileSignature },
      { label: 'Letter Templates', to: '/admin/letter-templates', icon: FileStack },
    ],
  },
  {
    group: 'Work Management',
    roles: ['hr'],
    items: [
      { label: 'Projects', to: '/admin/projects', icon: FolderKanban },
      { label: 'Task Board', to: '/admin/tasks', icon: ClipboardList },
      { label: 'Daily Reports', to: '/admin/reports', icon: NotebookPen },
    ],
  },
  {
    group: 'Website',
    roles: [],
    items: [
      { label: 'Hero Slider', to: '/admin/cms/sliders', icon: Image },
      { label: 'Services', to: '/admin/cms/services', icon: Layers },
      { label: 'Portfolio', to: '/admin/cms/portfolio', icon: Briefcase },
      { label: 'Blog Posts', to: '/admin/cms/blog_posts', icon: FileText },
      { label: 'Testimonials', to: '/admin/cms/testimonials', icon: MessageSquareQuote },
      { label: 'Team', to: '/admin/cms/team_members', icon: Users },
      { label: 'Client Logos', to: '/admin/cms/partners', icon: Building2 },
      { label: 'Technologies', to: '/admin/cms/technologies', icon: Cpu },
      { label: 'Counters', to: '/admin/cms/stats', icon: BarChart3 },
      { label: 'Pricing Plans', to: '/admin/cms/pricing_plans', icon: BadgeIndianRupee },
      { label: 'FAQs', to: '/admin/cms/faqs', icon: HelpCircle },
      { label: 'Pages', to: '/admin/cms/pages', icon: FileStack },
      { label: 'Subscribers', to: '/admin/cms/subscribers', icon: Mail },
    ],
  },
  {
    group: 'System',
    roles: [],
    items: [
      { label: 'Settings', to: '/admin/settings', icon: Settings },
      { label: 'Users & Roles', to: '/admin/users', icon: Shield },
      { label: 'Message Logs', to: '/admin/logs', icon: Bell },
    ],
  },
];

function visible(user, entry) {
  if (entry.employeeOnly) return !!user.employee_id;
  if (!entry.roles) return true;
  return user.role === 'admin' || entry.roles.includes(user.role);
}

function Sidebar({ onNavigate }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [closed, setClosed] = useState({});
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 thin-scroll">
      {NAV.filter((e) => visible(user, e)).map((entry) =>
        entry.group ? (
          <div key={entry.group} className="pt-3">
            <button
              onClick={() => setClosed((c) => ({ ...c, [entry.group]: !c[entry.group] }))}
              className="flex w-full items-center justify-between px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40 hover:text-white/60"
            >
              {entry.group}
              <ChevronDown className={cn('h-3.5 w-3.5 transition', closed[entry.group] && '-rotate-90')} />
            </button>
            {!closed[entry.group] &&
              entry.items.filter((it) => !it.roles || visible(user, it)).map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                      isActive || pathname.startsWith(`${it.to}/`) ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/40' : 'text-white/65 hover:bg-white/5 hover:text-white'
                    )
                  }
                >
                  <it.icon className="h-[18px] w-[18px] shrink-0" />
                  {it.label}
                </NavLink>
              ))}
          </div>
        ) : (
          <NavLink
            key={entry.to}
            to={entry.to}
            end={entry.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition', isActive ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/40' : 'text-white/70 hover:bg-white/5 hover:text-white')
            }
          >
            <entry.icon className="h-[18px] w-[18px]" />
            {entry.label}
          </NavLink>
        )
      )}
    </nav>
  );
}

const ROLE_LABEL = { admin: 'Administrator', hr: 'HR Manager', accounts: 'Accounts', employee: 'Employee' };

export default function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const { settings } = useSite();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    setMenu(false);
  }, [pathname]);

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />;

  const brand = (
    <Link to="/admin" className="flex items-center gap-3 px-5 py-5">
      <img src={asset(settings.favicon || '/favicon.png')} alt="" className="h-10 w-10 rounded-xl bg-white object-contain p-0.5" />
      <div>
        <p className="font-display text-base font-bold leading-tight text-white">{settings.site_name || 'YJTechnosoft'}</p>
        <p className="text-[11px] uppercase tracking-widest text-accent-400">{user.role === 'employee' ? 'Employee Portal' : 'Admin Panel'}</p>
      </div>
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-100/70">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-navy-900 lg:flex">
        {brand}
        <Sidebar />
        <div className="border-t border-white/10 p-3">
          <a href="/" target="_blank" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white">
            <ExternalLink className="h-4 w-4" /> View website
          </a>
        </div>
      </aside>
      {/* mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-navy-900">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-white/70 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/85 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <p className="hidden text-sm text-slate-500 sm:block">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-1">
          <NotificationBell />
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-100">
              <Avatar src={user.avatar || user.employee_photo} name={user.name} />
              <div className="hidden text-left sm:block">
                <p className="text-sm font-semibold text-navy-900">{user.name}</p>
                <p className="text-xs text-slate-500">{user.designation_name || ROLE_LABEL[user.role]}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
            {menu && (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-100 bg-white py-1.5 shadow-2xl">
                <Link to="/admin/profile" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  <UserCircle className="h-4 w-4" /> My profile
                </Link>
                <a href="/" target="_blank" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  <ExternalLink className="h-4 w-4" /> View website
                </a>
                <button
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </div>
            )}
          </div>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Route guard for role-restricted admin pages */
export function RequireRole({ roles = [], children }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'admin' || roles.includes(user.role)) return children;
  return (
    <div className="card p-10 text-center">
      <Shield className="mx-auto h-10 w-10 text-slate-300" />
      <h2 className="mt-4 text-lg font-semibold">Access restricted</h2>
      <p className="mt-1 text-sm text-slate-500">You do not have permission to view this page.</p>
    </div>
  );
}
