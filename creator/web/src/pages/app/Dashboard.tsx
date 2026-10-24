import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, CheckCircle2, Circle, GraduationCap, IndianRupee, LayoutTemplate, Package, Percent, Radio, RefreshCcw, ShoppingCart, Users, Wallet } from 'lucide-react';
import { dateTime, money, pct } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { PageHeader, QueryView, StatCard } from '@/components/ui/misc';
import { useWs } from './workspace';

const RANGES = { '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days', '365': 'Last 12 months' } as const;

function GettingStarted() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['checklist', ws.slug], queryFn: async () => {
    const [courses, products, orders] = await Promise.all([ws.get('/courses?pageSize=1'), ws.get('/products?pageSize=1&status=PUBLISHED'), ws.get('/orders?pageSize=1')]);
    return { courses: courses.total, products: products.total, orders: orders.total };
  } });
  if (!q.data) return null;
  const steps = [
    { done: !!ws.workspace.logoUrl || ws.workspace.primaryColor !== '#6d28d9', label: 'Add your logo and brand colours', to: 'settings' },
    { done: q.data.courses > 0, label: 'Create your first course', to: 'courses' },
    { done: q.data.products > 0, label: 'Publish a product with a price', to: 'products' },
    { done: q.data.orders > 0, label: 'Make your first sale', to: `../../s/${ws.slug}` },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Card className="mb-6 border-primary/30 bg-accent/30">
      <CardHeader><CardTitle>Get your business live</CardTitle></CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <Link key={s.label} to={s.to} relative="path" className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-background">
            {s.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
            <span className={s.done ? 'text-muted-foreground line-through' : ''}>{s.label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const ws = useWs();
  const [params] = useSearchParams();
  const [range, setRange] = useState<keyof typeof RANGES>('30');
  const from = new Date(Date.now() - Number(range) * 86400_000).toISOString();
  const q = useQuery({ queryKey: ['dashboard', ws.slug, range], queryFn: () => ws.get(`/dashboard?from=${from}`) });
  const cur = ws.workspace.currency;

  return (
    <>
      <PageHeader
        title={params.get('welcome') ? `Welcome to ${ws.workspace.name} 🎉` : 'Overview'}
        description="Live numbers from your orders, students and community."
        actions={
          <>
            <Select value={range} onChange={(e) => setRange(e.target.value as keyof typeof RANGES)} aria-label="Date range" className="w-44">
              {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            {ws.can('courses.write') && <Button asChild variant="outline"><Link to="courses"><GraduationCap /> New course</Link></Button>}
            {ws.can('products.write') && <Button asChild><Link to="products"><Package /> New product</Link></Button>}
          </>
        }
      />
      <GettingStarted />
      <QueryView q={q}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Revenue" value={money(d.revenue, cur)} icon={<IndianRupee />} hint={d.taxCollected ? `incl. ${money(d.taxCollected, cur)} tax` : 'Paid orders in range'} />
              <StatCard label="Net earnings" value={money(d.netEarnings, cur)} icon={<Wallet />} hint="After fees, refunds and commissions" />
              <StatCard label="Paid orders" value={d.ordersPaid} icon={<ShoppingCart />} hint={`Checkout conversion ${pct(d.checkoutConversion)}`} />
              <StatCard label="Refunds" value={money(d.refunds, cur)} icon={<RefreshCcw />} hint={`${d.refundCount} refunds`} />
              <StatCard label="New enrolments" value={d.newEnrollments} icon={<GraduationCap />} hint={`${d.newCustomers} new customers`} />
              <StatCard label="Active learners (30d)" value={d.activeLearners30d} icon={<Users />} hint={`Completion rate ${pct(d.completionRate)}`} />
              <StatCard label="Affiliate sales" value={d.affiliate.conversions} icon={<Percent />} hint={`${money(d.affiliate.commissions, cur)} commissions`} />
              <StatCard label="Messages sent" value={d.messaging.emailSent + d.messaging.whatsappSent} icon={<LayoutTemplate />} hint={`${d.messaging.emailFailed + d.messaging.whatsappFailed} failed`} />
            </div>

            {(d.failedPayments > 0 || d.renewalsDue7d > 0) && (
              <div className="flex flex-wrap gap-3">
                {d.failedPayments > 0 && <Link to="orders?status=FAILED" className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"><AlertCircle className="h-4 w-4 text-destructive" /> {d.failedPayments} failed payments</Link>}
                {d.renewalsDue7d > 0 && <span className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm"><AlertCircle className="h-4 w-4 text-warning" /> {d.renewalsDue7d} memberships renew in the next 7 days</span>}
              </div>
            )}

            <Card>
              <CardHeader><CardTitle>Revenue</CardTitle></CardHeader>
              <CardContent className="h-72">
                {d.series.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No sales in this period yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={d.series.map((s: { day: string; revenue: number; orders: number }) => ({ ...s, revenue: s.revenue / 100 }))}>
                      <defs>
                        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} width={60} />
                      <Tooltip formatter={(v: number) => money(v * 100, cur)} contentStyle={{ borderRadius: 8 }} />
                      <Area type="monotone" dataKey="revenue" stroke="var(--brand)" fill="url(#rev)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex-row items-center justify-between"><CardTitle>Recent orders</CardTitle><Button asChild variant="link" size="sm"><Link to="orders">View all</Link></Button></CardHeader>
                <CardContent className="space-y-2">
                  {d.recentOrders.length === 0 && <p className="text-sm text-muted-foreground">No orders yet.</p>}
                  {d.recentOrders.map((o: any) => (
                    <Link key={o.id} to={`orders/${o.id}`} className="flex items-center justify-between rounded-md p-2 text-sm hover:bg-muted">
                      <span><span className="font-medium">#{o.number}</span> · {o.buyerName}<span className="block text-xs text-muted-foreground">{dateTime(o.createdAt)}</span></span>
                      <span className="text-right">{money(o.total, o.currency)}<span className="block"><StatusBadge status={o.status} /></span></span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>New enrolments</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {d.recentEnrollments.length === 0 && <p className="text-sm text-muted-foreground">No enrolments yet.</p>}
                  {d.recentEnrollments.map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between rounded-md p-2 text-sm">
                      <span>{e.user.name}<span className="block text-xs text-muted-foreground">{e.course}</span></span>
                      <span className="text-xs text-muted-foreground">{e.progressPct}% complete</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Top products</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {d.topProducts.length === 0 && <p className="text-sm text-muted-foreground">No sales in this period.</p>}
                  {d.topProducts.map((t: any) => (
                    <div key={t.productId} className="flex justify-between text-sm"><span>{t.title}</span><span>{money(t.revenue, cur)} · {t.sales} sales</span></div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Coming up</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {d.upcomingWorkshops.length + d.upcomingBookings.length === 0 && <p className="text-sm text-muted-foreground">No upcoming workshops or sessions.</p>}
                  {d.upcomingWorkshops.map((w: any) => (
                    <Link key={w.id} to="workshops" className="flex items-center justify-between rounded-md p-2 text-sm hover:bg-muted"><span className="flex items-center gap-2"><Radio className="h-4 w-4 text-muted-foreground" /> {w.title}</span><span className="text-xs text-muted-foreground">{dateTime(w.startsAt)} · {w.registered}{w.capacity ? `/${w.capacity}` : ''} registered</span></Link>
                  ))}
                  {d.upcomingBookings.map((b: any) => (
                    <Link key={b.id} to="consultations" className="flex items-center justify-between rounded-md p-2 text-sm hover:bg-muted"><span>{b.title}</span><span className="text-xs text-muted-foreground">{dateTime(b.startsAt)}</span></Link>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </QueryView>
    </>
  );
}
