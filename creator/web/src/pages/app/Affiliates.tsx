import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Handshake } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { dateTime, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { TabPanel, Tabs } from '@/components/ui/menu';
import { EmptyState, PageHeader, QueryView, Table, Td } from '@/components/ui/misc';
import { useWs } from './workspace';

export default function Affiliates() {
  const ws = useWs();
  const [tab, setTab] = useState('affiliates');
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['affiliates', ws.slug], queryFn: () => ws.get('/affiliates') });
  const commissions = useQuery({ queryKey: ['commissions', ws.slug, status], queryFn: () => ws.get(`/affiliates/commissions${status ? `?status=${status}` : ''}`) });
  const products = useQuery({ queryKey: ['products-all', ws.slug], queryFn: () => ws.get('/products?pageSize=100') });
  const joinLink = `${location.origin}/s/${ws.slug}/affiliates`;
  const cur = ws.workspace.currency;

  const update = async (id: string, body: object) => {
    try {
      await ws.patch(`/affiliates/${id}`, body);
      q.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title="Affiliates" description="Partners share referral links; sales are attributed to the last click within 30 days. Commissions reverse automatically on refunds." actions={<Button variant="outline" onClick={() => { navigator.clipboard.writeText(joinLink); toast.success('Program sign-up link copied'); }}><Copy /> Copy sign-up link</Button>} />
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: 'affiliates', label: 'Affiliates' }, { value: 'commissions', label: 'Commissions' }, { value: 'rules', label: 'Commission rates' }]}>
        <TabPanel value="affiliates">
          <QueryView q={q}>
            {(d) =>
              d.affiliates.length === 0 ? (
                <EmptyState icon={<Handshake />} title="No affiliates yet" description="Share your program sign-up link with partners and students." />
              ) : (
                <Table head={['Affiliate', 'Code', 'Rate', 'Clicks', 'Sales', 'Earned', 'Status', '']}>
                  {d.affiliates.map((a: any) => (
                    <tr key={a.id}>
                      <Td>{a.user?.name}<span className="block text-xs text-muted-foreground">{a.user?.email}</span></Td>
                      <Td className="font-mono">{a.code}</Td>
                      <Td><Input type="number" min={0} max={90} defaultValue={a.commissionBps / 100} className="h-8 w-20" aria-label="Commission %" onBlur={(e) => Number(e.target.value) * 100 !== a.commissionBps && update(a.id, { commissionBps: Math.round(Number(e.target.value) * 100) })} />%</Td>
                      <Td>{a.clicks}</Td>
                      <Td>{a.conversions}</Td>
                      <Td className="text-xs">{Object.entries(a.earned).map(([k, v]) => `${k}: ${money(v as number, cur)}`).join(' · ') || '—'}</Td>
                      <Td><StatusBadge status={a.status} /></Td>
                      <Td>
                        <div className="flex gap-1">
                          {a.status !== 'APPROVED' && <Button size="sm" onClick={() => update(a.id, { status: 'APPROVED' })}>Approve</Button>}
                          {a.status === 'PENDING' && <Button size="sm" variant="outline" onClick={() => update(a.id, { status: 'REJECTED' })}>Reject</Button>}
                          {a.status === 'APPROVED' && <Button size="sm" variant="outline" onClick={() => update(a.id, { status: 'SUSPENDED' })}>Suspend</Button>}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </Table>
              )
            }
          </QueryView>
        </TabPanel>
        <TabPanel value="commissions">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="mb-3 w-44" aria-label="Status">
            <option value="">All</option>
            {['PENDING', 'APPROVED', 'PAID', 'REJECTED', 'REVERSED'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
          </Select>
          <QueryView q={commissions}>
            {(d) => (
              <Table head={['Date', 'Affiliate', 'Order', 'Commission', 'Status', '']} empty={!d.items.length}>
                {d.items.map((c: any) => (
                  <tr key={c.id}>
                    <Td className="whitespace-nowrap text-muted-foreground">{dateTime(c.createdAt)}</Td>
                    <Td className="font-mono">{c.affiliate.code}</Td>
                    <Td>#{c.order?.number} · {money(c.order?.total, c.currency)} <StatusBadge status={c.order?.status ?? ''} /></Td>
                    <Td>{money(c.amount, c.currency)}</Td>
                    <Td><StatusBadge status={c.status} /></Td>
                    <Td>
                      <div className="flex gap-1">
                        {c.status === 'PENDING' && <Button size="sm" onClick={async () => { try { await ws.patch(`/affiliates/commissions/${c.id}`, { status: 'APPROVED' }); commissions.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Approve</Button>}
                        {c.status === 'APPROVED' && <Button size="sm" onClick={async () => { await ws.patch(`/affiliates/commissions/${c.id}`, { status: 'PAID' }); commissions.refetch(); }}>Mark paid</Button>}
                        {['PENDING', 'APPROVED'].includes(c.status) && <Button size="sm" variant="outline" onClick={async () => { await ws.patch(`/affiliates/commissions/${c.id}`, { status: 'REJECTED' }); commissions.refetch(); }}>Reject</Button>}
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </QueryView>
        </TabPanel>
        <TabPanel value="rules">
          <Card className="max-w-2xl">
            <CardHeader><CardTitle>Per-product rates</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">A product rate overrides each affiliate's default rate. Commissions are calculated on the price excluding tax.</p>
              {products.data?.items.map((p: any) => {
                const rule = q.data?.productRules.find((r: any) => r.productId === p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{p.title}</span>
                    <span className="flex items-center gap-1">
                      <Input type="number" min={0} max={90} placeholder="default" defaultValue={rule ? rule.commissionBps / 100 : ''} className="h-8 w-24" aria-label={`${p.title} commission %`} onBlur={async (e) => { try { await ws.put(`/affiliates/rules/${p.id}`, { commissionBps: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) }); toast.success('Rate saved'); q.refetch(); } catch (err) { toast.error(errorMessage(err)); } }} />%
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>
    </>
  );
}
