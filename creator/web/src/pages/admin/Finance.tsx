import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { TabPanel, Tabs } from '@/components/ui/menu';
import { PageHeader, Pagination, QueryView, StatCard, Table, Td } from '@/components/ui/misc';

function Payments() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['admin-payments', page, status], queryFn: () => api.get(`/admin/payments?page=${page}${status ? `&status=${status}` : ''}`) });
  return (
    <QueryView q={q}>
      {(d) => (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            {d.totals.map((t: any) => <StatCard key={t.currency} label={`Captured (${t.currency})`} value={money(t.amount, t.currency)} hint={`Fees ${money(t.platformFee, t.currency)} · gateway ${money(t.gatewayFee, t.currency)} · refunded ${money(t.refundedAmount, t.currency)}`} />)}
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="mb-3 w-48" aria-label="Status">
            <option value="">All statuses</option>
            {['CREATED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
          </Select>
          <Table head={['When', 'Workspace', 'Order', 'Provider', 'Amount', 'Platform fee', 'Status']} empty={!d.items.length}>
            {d.items.map((p: any) => (
              <tr key={p.id}>
                <Td className="whitespace-nowrap text-muted-foreground">{dateTime(p.createdAt)}</Td>
                <Td>{p.order.tenant.name}</Td>
                <Td>#{p.order.number}<span className="block text-xs text-muted-foreground">{p.order.buyerEmail}</span></Td>
                <Td><Badge variant="outline">{p.provider}</Badge></Td>
                <Td>{money(p.amount, p.currency)}</Td>
                <Td>{money(p.platformFee, p.currency)}</Td>
                <Td><StatusBadge status={p.status} /></Td>
              </tr>
            ))}
          </Table>
          <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
        </>
      )}
    </QueryView>
  );
}

function Payouts() {
  const { user } = useAuth();
  const [status, setStatus] = useState('REQUESTED');
  const q = useQuery({ queryKey: ['admin-payouts', status], queryFn: () => api.get(`/admin/payouts${status ? `?status=${status}` : ''}`) });
  const [paying, setPaying] = useState<any>(null);
  const [ref, setRef] = useState('');
  const act = async (id: string, body: object) => {
    try {
      await api.patch(`/admin/payouts/${id}`, body);
      toast.success('Payout updated');
      q.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const isSuper = user?.platformRole === 'SUPER_ADMIN';
  return (
    <>
      <Select value={status} onChange={(e) => setStatus(e.target.value)} className="mb-3 w-48" aria-label="Status"><option value="">All</option>{['REQUESTED', 'APPROVED', 'PAID', 'REJECTED'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</Select>
      <QueryView q={q}>
        {(d) => (
          <Table head={['Requested', 'Workspace', 'Amount', 'Notes', 'Status', '']} empty={!d.items.length}>
            {d.items.map((p: any) => (
              <tr key={p.id}>
                <Td className="whitespace-nowrap text-muted-foreground">{dateTime(p.createdAt)}</Td>
                <Td>{p.tenant?.name}</Td>
                <Td>{money(p.amount, p.currency)}</Td>
                <Td className="max-w-xs truncate text-xs">{p.notes}{p.reference && <span className="block font-mono">ref {p.reference}</span>}</Td>
                <Td><StatusBadge status={p.status} /></Td>
                <Td>
                  {isSuper && (
                    <div className="flex gap-1">
                      {p.status === 'REQUESTED' && <Button size="sm" onClick={() => act(p.id, { status: 'APPROVED' })}>Approve</Button>}
                      {p.status === 'APPROVED' && <Button size="sm" onClick={() => { setPaying(p); setRef(''); }}>Mark paid</Button>}
                      {['REQUESTED', 'APPROVED'].includes(p.status) && <Button size="sm" variant="outline" onClick={() => act(p.id, { status: 'REJECTED' })}>Reject</Button>}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </QueryView>
      {paying && (
        <Modal open onOpenChange={() => setPaying(null)} title={`Mark ${money(paying.amount, paying.currency)} as paid`} description="Record the bank transfer reference. The creator's ledger is debited." footer={<Button disabled={!ref} onClick={async () => { await act(paying.id, { status: 'PAID', reference: ref }); setPaying(null); }}>Confirm</Button>}>
          <Field label="Bank / UTR reference"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        </Modal>
      )}
    </>
  );
}

function Reconciliation() {
  const q = useQuery({ queryKey: ['admin-recon'], queryFn: () => api.get('/admin/reconciliation') });
  const tenants = useQuery({ queryKey: ['admin-tenants-all'], queryFn: () => api.get('/admin/tenants?pageSize=100') });
  return (
    <QueryView q={q}>
      {(d) => (
        <>
          <p className="mb-3 text-sm text-muted-foreground">Captured payments compared with ledger sale entries. A mismatch means a payment was captured without its ledger entry (or vice versa) and should be investigated.</p>
          <Table head={['Workspace', 'Currency', 'Captured', 'Ledger sales', 'Refunded', 'Ledger refunds', 'Platform fees', 'Check']} empty={!d.rows.length}>
            {d.rows.map((r: any) => (
              <tr key={`${r.tenantId}${r.currency}`}>
                <Td>{tenants.data?.items.find((t: any) => t.id === r.tenantId)?.name ?? r.tenantId.slice(0, 8)}</Td>
                <Td>{r.currency}</Td>
                <Td>{money(r.captured, r.currency)}</Td>
                <Td>{money(r.ledgerSales, r.currency)}</Td>
                <Td>{money(r.refunded, r.currency)}</Td>
                <Td>{money(r.ledgerRefunds, r.currency)}</Td>
                <Td>{money(r.platformFee, r.currency)}</Td>
                <Td>{r.matches ? <Badge variant="success">matches</Badge> : <Badge variant="destructive">mismatch</Badge>}</Td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </QueryView>
  );
}

export default function Finance() {
  const [tab, setTab] = useState('payments');
  return (
    <>
      <PageHeader title="Payments & payouts" description="Payments are marked captured only after verified provider webhooks or server-side API confirmation." />
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: 'payments', label: 'Payments' }, { value: 'payouts', label: 'Payout requests' }, { value: 'recon', label: 'Reconciliation' }]}>
        <TabPanel value="payments"><Payments /></TabPanel>
        <TabPanel value="payouts"><Payouts /></TabPanel>
        <TabPanel value="recon"><Reconciliation /></TabPanel>
      </Tabs>
    </>
  );
}
