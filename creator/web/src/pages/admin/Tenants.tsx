import { useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { PageHeader, Pagination, QueryView, SearchInput, StatCard, Table, Td } from '@/components/ui/misc';

function List() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['admin-tenants', q, status, page], queryFn: () => api.get(`/admin/tenants?page=${page}&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`) });
  return (
    <>
      <PageHeader title="Workspaces" />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name or slug" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sm:w-40" aria-label="Status"><option value="">All</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></Select>
      </div>
      <QueryView q={list}>
        {(d) => (
          <>
            <Table head={['Workspace', 'Owner', 'Plan', 'Courses', 'Orders', 'Members', 'Status', 'Created']} empty={!d.items.length}>
              {d.items.map((t: any) => (
                <tr key={t.id} className="hover:bg-muted/40">
                  <Td><Link to={t.id} className="font-medium hover:underline">{t.name}</Link><span className="block text-xs text-muted-foreground">/{t.slug}</span></Td>
                  <Td>{t.owner.name}<span className="block text-xs text-muted-foreground">{t.owner.email}</span></Td>
                  <Td>{t.subscriptions[0]?.plan.name ?? '—'}</Td>
                  <Td>{t._count.courses}</Td>
                  <Td>{t._count.orders}</Td>
                  <Td>{t._count.memberships}</Td>
                  <Td><StatusBadge status={t.status} /></Td>
                  <Td className="text-muted-foreground">{date(t.createdAt)}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryView>
    </>
  );
}

function Detail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const isSuper = user?.platformRole === 'SUPER_ADMIN';
  const q = useQuery({ queryKey: ['admin-tenant', id], queryFn: () => api.get(`/admin/tenants/${id}`) });
  const plans = useQuery({ queryKey: ['admin-plans'], queryFn: () => api.get('/admin/plans') });
  const [suspend, setSuspend] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <QueryView q={q}>
      {(d) => {
        const t = d.tenant;
        const current = t.subscriptions.find((s: any) => ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(s.status));
        return (
          <>
            <PageHeader
              back={<Link to=".." relative="path" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Workspaces</Link>}
              title={<span className="flex items-center gap-3">{t.name} <StatusBadge status={t.status} /></span>}
              description={`/${t.slug} · owner ${t.owner.name} (${t.owner.email}) · created ${date(t.createdAt)}`}
              actions={
                <>
                  <Button asChild variant="outline"><a href={`/s/${t.slug}`} target="_blank" rel="noreferrer"><ExternalLink /> Storefront</a></Button>
                  {isSuper && (t.status === 'ACTIVE' ? <Button variant="destructive" onClick={() => setSuspend(true)}>Suspend</Button> : <Button onClick={async () => { await api.patch(`/admin/tenants/${id}/status`, { status: 'ACTIVE' }); toast.success('Workspace reactivated'); q.refetch(); }}>Reactivate</Button>)}
                </>
              }
            />
            {t.suspendedReason && <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm">Suspended: {t.suspendedReason}</p>}
            <div className="mb-6 grid gap-4 sm:grid-cols-4">
              <StatCard label="Revenue" value={money(d.revenue, t.currency)} />
              <StatCard label="Platform fees" value={money(d.platformFees, t.currency)} />
              <StatCard label="Storage" value={`${(d.storageBytes / 1048576).toFixed(1)} MB`} />
              <StatCard label="Courses / products" value={`${t._count.courses} / ${t._count.products}`} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Plan</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Select disabled={!isSuper} value={current?.planId ?? ''} aria-label="Plan" onChange={async (e) => { try { await api.patch(`/admin/tenants/${id}/plan`, { planId: e.target.value }); toast.success('Plan changed'); q.refetch(); } catch (err) { toast.error(errorMessage(err)); } }}>
                    {plans.data?.plans.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                  <div className="space-y-1 text-xs text-muted-foreground">{t.subscriptions.map((s: any) => <p key={s.id}>{s.plan.name} · {s.status.toLowerCase()} · since {date(s.currentPeriodStart)}</p>)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Custom domains</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {t.customDomains.length === 0 && <p className="text-muted-foreground">None</p>}
                  {t.customDomains.map((dm: any) => <p key={dm.id}>{dm.hostname} <StatusBadge status={dm.status} /></p>)}
                </CardContent>
              </Card>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">Content and customer data inside this workspace are only visible to platform support after the owner grants time-limited access from their settings.</p>
            <Modal open={suspend} onOpenChange={setSuspend} title={`Suspend ${t.name}?`} description="The storefront goes offline and the team loses dashboard access. Customers keep their existing data." footer={<Button variant="destructive" disabled={!reason} onClick={async () => { try { await api.patch(`/admin/tenants/${id}/status`, { status: 'SUSPENDED', reason }); toast.success('Suspended'); setSuspend(false); q.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Suspend</Button>}>
              <Field label="Reason (shown to the workspace team)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            </Modal>
          </>
        );
      }}
    </QueryView>
  );
}

export default function Tenants() {
  return (
    <Routes>
      <Route index element={<List />} />
      <Route path=":id" element={<Detail />} />
    </Routes>
  );
}
