import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2, IndianRupee, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { date, money } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { PageHeader, QueryView, StatCard } from '@/components/ui/misc';

export default function Overview() {
  const q = useQuery({ queryKey: ['admin-overview'], queryFn: () => api.get('/admin/overview') });
  const sys = useQuery({ queryKey: ['admin-system'], queryFn: () => api.get('/admin/system') });
  return (
    <>
      <PageHeader title="Platform overview" description="Amounts shown in INR minor units summed across currencies; see Payments for per-currency totals." />
      <QueryView q={q}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Workspaces" value={d.tenants} icon={<Building2 />} hint={`${d.activeTenants} active`} />
              <StatCard label="Users" value={d.users} icon={<Users />} hint={`${d.newUsers30} new in 30 days`} />
              <StatCard label="GMV (30d)" value={money(d.gmv30)} icon={<IndianRupee />} hint={`All time ${money(d.gmv)}`} />
              <StatCard label="Platform fees (30d)" value={money(d.platformFees30)} hint={`All time ${money(d.platformFees)} · refunded ${money(d.refunded)}`} />
            </div>
            {(d.failedWebhooks > 0 || d.failedJobs > 0 || d.openTickets > 0) && (
              <div className="flex flex-wrap gap-3">
                {d.failedWebhooks > 0 && <Link to="operations" className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"><AlertTriangle className="h-4 w-4 text-destructive" /> {d.failedWebhooks} failed webhooks</Link>}
                {d.failedJobs > 0 && <Link to="operations" className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"><AlertTriangle className="h-4 w-4 text-destructive" /> {d.failedJobs} failed jobs</Link>}
                {d.openTickets > 0 && <Link to="support" className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm">{d.openTickets} open support tickets</Link>}
              </div>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Newest workspaces</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {d.recentTenants.map((t: any) => <Link key={t.id} to={`tenants/${t.id}`} className="flex justify-between rounded-md p-2 text-sm hover:bg-muted"><span>{t.name} <span className="text-muted-foreground">/{t.slug}</span></span><span>{date(t.createdAt)} <StatusBadge status={t.status} /></span></Link>)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Plans in use</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {d.tenantsByPlan.map((p: any) => <div key={p.plan} className="flex justify-between"><span>{p.plan}</span><span>{p.count}</span></div>)}
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>System health</CardTitle></CardHeader>
                <CardContent>
                  {sys.data ? (
                    <dl className="grid gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
                      <div><dt className="text-muted-foreground">Uptime</dt><dd>{Math.round(sys.data.uptimeSec / 3600)} h</dd></div>
                      <div><dt className="text-muted-foreground">Node</dt><dd>{sys.data.node}</dd></div>
                      <div><dt className="text-muted-foreground">Memory</dt><dd>{sys.data.memoryMb} MB</dd></div>
                      <div><dt className="text-muted-foreground">DB latency</dt><dd>{sys.data.dbLatencyMs} ms</dd></div>
                      <div><dt className="text-muted-foreground">DB size</dt><dd>{sys.data.dbSize}</dd></div>
                      <div><dt className="text-muted-foreground">Storage</dt><dd>{(sys.data.storageBytes / 1073741824).toFixed(2)} GB</dd></div>
                      <div><dt className="text-muted-foreground">AI cost (30d)</dt><dd>${(sys.data.ai30.costMicros / 1e6).toFixed(2)}</dd></div>
                      <div><dt className="text-muted-foreground">AI tokens (30d)</dt><dd>{(sys.data.ai30.inputTokens + sys.data.ai30.outputTokens).toLocaleString()}</dd></div>
                    </dl>
                  ) : '…'}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </QueryView>
    </>
  );
}
