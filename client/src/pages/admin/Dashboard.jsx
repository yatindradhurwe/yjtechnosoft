import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from 'recharts';
import {
  Wallet, AlertCircle, FileSpreadsheet, UserCheck, CalendarOff, Briefcase, ClipboardList, Server, Inbox, LogIn, LogOut, Clock, Megaphone, PartyPopper, Cake, MapPin, NotebookPen, Receipt, FileSignature, UserPlus,
} from 'lucide-react';
import api, { errMsg } from '../../lib/api';
import useFetch from '../../lib/useFetch';
import { useAuth } from '../../context/AuthContext';
import { cn, fmtDate, fmtTime, minutesToHours, money, titleCase } from '../../lib/utils';
import { StatCard, StatusBadge, PageLoader, Spinner } from '../../components/ui';

function Panel({ title, action, children, className }) {
  return (
    <div className={cn('card p-5', className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-navy-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Best-effort location; never blocks check-in (the browser timeout ignores time spent on the permission prompt) */
function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    const timer = setTimeout(() => resolve(null), 5000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer);
        resolve(`${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

export function CheckInCard({ today, onChange }) {
  const now = useClock();
  const [busy, setBusy] = useState(false);
  const [wfh, setWfh] = useState(false);
  const act = async (kind) => {
    setBusy(true);
    try {
      const location = await getLocation();
      const { data } = await api.post(`/hr/attendance/${kind}`, { location, wfh });
      toast.success(data.message);
      onChange?.();
    } catch (e) {
      toast.error(errMsg(e), { duration: 6000 });
    } finally {
      setBusy(false);
    }
  };
  const worked = today?.check_in && !today?.check_out ? Math.round((now - new Date(today.check_in.replace(' ', 'T'))) / 60000) : today?.work_minutes;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 via-navy-800 to-brand-700 p-6 text-white shadow-soft">
      <div className="grid-bg absolute inset-0 opacity-50" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-white/60">{now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <p className="mt-1 font-display text-4xl font-bold tabular-nums">{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-white/75">
            <span className="flex items-center gap-1.5"><LogIn className="h-4 w-4 text-emerald-300" /> In: {fmtTime(today?.check_in)}</span>
            <span className="flex items-center gap-1.5"><LogOut className="h-4 w-4 text-red-300" /> Out: {fmtTime(today?.check_out)}</span>
            {worked > 0 && <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-accent-400" /> {minutesToHours(worked)}</span>}
          </div>
          {today?.status && <StatusBadge status={today.status} className="mt-3 !bg-white/15 !text-white" />}
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          {!today?.check_in ? (
            <>
              <button className="btn-accent !px-8 !py-3.5 text-base" onClick={() => act('check-in')} disabled={busy}>{busy ? <Spinner className="h-5 w-5" /> : <LogIn className="h-5 w-5" />} Check in</button>
              <label className="flex items-center gap-2 text-sm text-white/75"><input type="checkbox" className="accent-accent-500" checked={wfh} onChange={(e) => setWfh(e.target.checked)} /> Working from home</label>
            </>
          ) : !today?.check_out ? (
            <button className="btn !bg-white !px-8 !py-3.5 text-base !text-navy-900 hover:!bg-slate-100" onClick={() => act('check-out')} disabled={busy}>{busy ? <Spinner className="h-5 w-5" /> : <LogOut className="h-5 w-5" />} Check out</button>
          ) : (
            <p className="rounded-xl bg-white/10 px-4 py-3 text-sm">✅ Attendance completed for today</p>
          )}
          <p className="flex items-center gap-1 text-[11px] text-white/50"><MapPin className="h-3 w-3" /> Location is captured with consent for attendance</p>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const { data: d, loading, reload } = useFetch('/dashboard');
  if (loading || !d) return <PageLoader />;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{greet}, {user.name.split(' ')[0]} 👋</h1>
          <p className="mt-1 text-sm text-slate-500">Here’s what’s happening today.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasRole('accounts') && <Link to="/admin/invoices/new" className="btn-primary btn-sm"><Receipt className="h-4 w-4" /> New invoice</Link>}
          {hasRole('accounts') && <Link to="/admin/quotations/new" className="btn-outline btn-sm"><FileSpreadsheet className="h-4 w-4" /> Quotation</Link>}
          {hasRole('hr') && <Link to="/admin/letters/new" className="btn-outline btn-sm"><FileSignature className="h-4 w-4" /> Letter</Link>}
          {hasRole('hr') && <Link to="/admin/employees" className="btn-outline btn-sm"><UserPlus className="h-4 w-4" /> Employee</Link>}
        </div>
      </div>

      {d.me && <CheckInCard today={d.me.today} onChange={reload} />}

      {d.announcements?.length > 0 && (
        <div className="space-y-2">
          {d.announcements.map((a) => (
            <div key={a.id} className={cn('flex gap-3 rounded-2xl p-4', a.priority === 'important' ? 'bg-red-50 text-red-900' : 'bg-brand-50 text-brand-900')}>
              <Megaphone className="mt-0.5 h-5 w-5 shrink-0" />
              <div><p className="font-semibold">{a.title}</p><p className="text-sm opacity-80">{a.message}</p></div>
            </div>
          ))}
        </div>
      )}

      {d.billing && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Collected this month" value={money(d.billing.collected_month, 0)} icon={Wallet} tone="green" hint={`Billed ${money(d.billing.billed_month, 0)}`} />
            <StatCard label="Outstanding" value={money(d.billing.outstanding, 0)} icon={AlertCircle} tone="red" hint={`${d.billing.overdue_count} overdue invoice(s)`} />
            <StatCard label="Open quotations" value={d.billing.open_quotes} icon={FileSpreadsheet} tone="violet" hint={`${d.billing.clients} active clients`} />
            <StatCard label="New leads" value={d.billing.new_enquiries} icon={Inbox} tone="amber" hint={`${d.billing.servers_expiring} renewals due in 30 days`} />
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Revenue – last 12 months" className="xl:col-span-2">
              <div className="h-72">
                <ResponsiveContainer>
                  <AreaChart data={d.revenue} margin={{ left: 0, right: 10, top: 10 }}>
                    <defs>
                      <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1d6fb8" stopOpacity={0.35} /><stop offset="100%" stopColor="#1d6fb8" stopOpacity={0} /></linearGradient>
                      <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f7c41a" stopOpacity={0.3} /><stop offset="100%" stopColor="#f7c41a" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                    <Tooltip formatter={(v) => money(v, 0)} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="billed" name="Billed" stroke="#f7c41a" strokeWidth={2} fill="url(#gb)" />
                    <Area type="monotone" dataKey="collected" name="Collected" stroke="#1d6fb8" strokeWidth={2.5} fill="url(#gc)" />
                    <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={1.5} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Upcoming renewals" action={<Link to="/admin/servers" className="text-xs font-semibold text-brand-700">View all</Link>}>
              {d.expiring_servers.length ? (
                <div className="space-y-3">
                  {d.expiring_servers.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="rounded-lg bg-slate-100 p-2 text-slate-600"><Server className="h-4 w-4" /></div>
                        <div className="min-w-0"><p className="truncate text-sm font-medium">{s.domain || s.name}</p><p className="truncate text-xs text-slate-500">{s.client_name}</p></div>
                      </div>
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', s.days_left < 0 ? 'bg-red-50 text-red-700' : s.days_left <= 7 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600')}>
                        {s.days_left < 0 ? 'Expired' : `${s.days_left}d`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">No renewals due in the next 30 days. 🎉</p>}
            </Panel>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Recent invoices" action={<Link to="/admin/invoices" className="text-xs font-semibold text-brand-700">View all</Link>}>
              <div className="divide-y divide-slate-100">
                {d.recent_invoices.map((i) => (
                  <Link key={i.id} to={`/admin/invoices/${i.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50">
                    <div><p className="text-sm font-semibold text-brand-700">{i.invoice_no}</p><p className="text-xs text-slate-500">{i.client_name} · {fmtDate(i.invoice_date)}</p></div>
                    <div className="text-right"><p className="text-sm font-semibold">{money(i.total, 0)}</p><StatusBadge status={i.status} /></div>
                  </Link>
                ))}
                {!d.recent_invoices.length && <p className="py-4 text-sm text-slate-500">No invoices yet.</p>}
              </div>
            </Panel>
            <Panel title="Latest leads" action={<Link to="/admin/enquiries" className="text-xs font-semibold text-brand-700">View all</Link>}>
              <div className="divide-y divide-slate-100">
                {d.recent_enquiries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div><p className="text-sm font-semibold">{e.name}</p><p className="text-xs text-slate-500">{e.service || '—'} · {e.phone || e.email}</p></div>
                    <StatusBadge status={e.status} />
                  </div>
                ))}
                {!d.recent_enquiries.length && <p className="py-4 text-sm text-slate-500">No enquiries yet.</p>}
              </div>
            </Panel>
          </div>
        </>
      )}

      {d.hr && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Present today" value={`${d.hr.present_today} / ${d.hr.employees}`} icon={UserCheck} tone="green" hint={`${d.hr.late_today} late · ${d.hr.on_leave_today} on leave`} />
            <StatCard label="Pending leaves" value={d.hr.pending_leaves} icon={CalendarOff} tone="amber" hint={`${d.hr.interns} active interns`} />
            <StatCard label="Active candidates" value={d.hr.active_candidates} icon={Briefcase} tone="violet" hint={`${d.hr.open_jobs} open positions`} />
            <StatCard label="Open tasks" value={d.hr.open_tasks} icon={ClipboardList} tone="brand" hint={`${d.hr.overdue_tasks} overdue · ${d.hr.reports_today} reports today`} />
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Attendance – last 7 days" className="xl:col-span-2">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={d.attendance_week}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="present" name="Present" stackId="a" fill="#10b981" />
                    <Bar dataKey="late" name="Late" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="on_leave" name="Leave" stackId="a" fill="#8b5cf6" />
                    <Bar dataKey="absent" name="Absent" stackId="a" fill="#ef4444" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Pending leave requests" action={<Link to="/admin/leaves" className="text-xs font-semibold text-brand-700">Review</Link>}>
              {d.pending_leaves.length ? (
                <div className="space-y-3">
                  {d.pending_leaves.map((l) => (
                    <div key={l.id} className="rounded-xl bg-slate-50 p-3">
                      <p className="text-sm font-semibold">{l.employee_name}</p>
                      <p className="text-xs text-slate-500">{l.leave_type} · {fmtDate(l.from_date)} – {fmtDate(l.to_date)} ({l.days}d)</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">No pending requests.</p>}
            </Panel>
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Recent applications" action={<Link to="/admin/applications" className="text-xs font-semibold text-brand-700">Pipeline</Link>}>
              <div className="divide-y divide-slate-100">
                {d.recent_applications.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-2.5"><div><p className="text-sm font-semibold">{a.name}</p><p className="text-xs text-slate-500">{a.job_title || 'General'}</p></div><StatusBadge status={a.stage} /></div>
                ))}
                {!d.recent_applications.length && <p className="py-3 text-sm text-slate-500">No applications yet.</p>}
              </div>
            </Panel>
            <Panel title="Task status">
              <div className="space-y-3">
                {['todo', 'in_progress', 'review', 'blocked', 'done'].map((s) => {
                  const c = d.task_status.find((x) => x.status === s)?.count || 0;
                  const total = d.task_status.reduce((a, x) => a + x.count, 0) || 1;
                  return (
                    <div key={s}>
                      <div className="flex justify-between text-sm"><span>{titleCase(s)}</span><span className="font-semibold">{c}</span></div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${(c / total) * 100}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </Panel>
            <Panel title="Upcoming birthdays & holidays">
              <div className="space-y-3">
                {d.birthdays.map((b) => (
                  <div key={b.id} className="flex items-center gap-3"><div className="rounded-lg bg-pink-50 p-2 text-pink-600"><Cake className="h-4 w-4" /></div><div><p className="text-sm font-medium">{b.name}</p><p className="text-xs text-slate-500">{fmtDate(b.dob, { day: 'numeric', month: 'long' })}</p></div></div>
                ))}
                {d.holidays.map((h) => (
                  <div key={h.id} className="flex items-center gap-3"><div className="rounded-lg bg-amber-50 p-2 text-amber-600"><PartyPopper className="h-4 w-4" /></div><div><p className="text-sm font-medium">{h.title}</p><p className="text-xs text-slate-500">{fmtDate(h.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p></div></div>
                ))}
                {!d.birthdays.length && !d.holidays.length && <p className="text-sm text-slate-500">Nothing upcoming.</p>}
              </div>
            </Panel>
          </div>
        </>
      )}

      {d.me && (
        <div className="grid gap-6 xl:grid-cols-3">
          <Panel title="This month">
            <div className="grid grid-cols-2 gap-3">
              {[['Present', d.me.month?.present, 'text-emerald-600'], ['Late', d.me.month?.late, 'text-amber-600'], ['Leave', d.me.month?.on_leave, 'text-violet-600'], ['Absent', d.me.month?.absent, 'text-red-600']].map(([l, v, c]) => (
                <div key={l} className="rounded-xl bg-slate-50 p-4"><p className={cn('font-display text-2xl font-bold', c)}>{v || 0}</p><p className="text-xs text-slate-500">{l}</p></div>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-500">Total hours: <b>{minutesToHours(d.me.month?.minutes)}</b></p>
            {!d.me.report_today && <Link to="/admin/my/reports" className="btn-accent mt-4 w-full"><NotebookPen className="h-4 w-4" /> Submit today’s report</Link>}
          </Panel>
          <Panel title="My tasks" action={<Link to="/admin/my/tasks" className="text-xs font-semibold text-brand-700">Open board</Link>}>
            <div className="mb-3 flex gap-2 text-xs">
              <span className="rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">{d.me.tasks?.open || 0} open</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">{d.me.tasks?.due_today || 0} due today</span>
              <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">{d.me.tasks?.overdue || 0} overdue</span>
            </div>
            <div className="divide-y divide-slate-100">
              {d.me.my_tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{t.title}</p><p className="text-xs text-slate-500">{t.project_name || '—'} · due {fmtDate(t.due_date)}</p></div><StatusBadge status={t.priority} /></div>
              ))}
              {!d.me.my_tasks.length && <p className="py-3 text-sm text-slate-500">No open tasks. Great job!</p>}
            </div>
          </Panel>
          <Panel title="Leave balance" action={<Link to="/admin/my/leaves" className="text-xs font-semibold text-brand-700">Apply</Link>}>
            <div className="space-y-3">
              {d.me.leave_balance.map((l) => (
                <div key={l.id}>
                  <div className="flex justify-between text-sm"><span>{l.name}</span><span className="font-semibold">{Number(l.is_paid) ? `${l.remaining} left` : `${l.used} taken`}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${Math.min(100, (l.used / l.days_per_year) * 100)}%`, background: l.color }} /></div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {!d.billing && !d.hr && !d.me && (
        <div className="card p-10 text-center text-slate-500">Your account is not linked to an employee profile yet. Please contact the administrator.</div>
      )}
      {d.holidays?.length > 0 && !d.hr && (
        <Panel title="Upcoming holidays">
          <div className="flex flex-wrap gap-3">
            {d.holidays.map((h) => <span key={h.id} className="rounded-xl bg-amber-50 px-3 py-2 text-sm"><b>{h.title}</b> · {fmtDate(h.date, { day: 'numeric', month: 'short' })}</span>)}
          </div>
        </Panel>
      )}
    </div>
  );
}
