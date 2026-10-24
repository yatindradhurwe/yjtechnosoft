import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { dateTime, money, toMinor } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { PageHeader, QueryView, StatCard, Table, Td } from '@/components/ui/misc';
import { useWs } from './workspace';

export default function Finance() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['finance', ws.slug], queryFn: () => ws.get('/finance/balance') });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ amount: '', currency: ws.workspace.currency, notes: '' });

  const request = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await ws.post('/finance/payouts', { amount: toMinor(f.amount), currency: f.currency, notes: f.notes || undefined });
      toast.success('Payout requested. The platform team reviews requests before transfer.');
      setOpen(false);
      q.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Earnings & payouts" description="Your balance is calculated from the ledger: sales minus platform fees, gateway fees, refunds, commissions and payouts." actions={<Button onClick={() => setOpen(true)}>Request payout</Button>} />
      <QueryView q={q}>
        {(d) => (
          <div className="space-y-6">
            {d.balances.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
            {d.balances.map((b: any) => (
              <div key={b.currency} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label={`Available (${b.currency})`} value={money(b.available, b.currency)} hint={`Balance ${money(b.balance, b.currency)}`} />
                <StatCard label="Gross sales" value={money(b.gross, b.currency)} hint={`Refunds ${money(b.refunds, b.currency)}`} />
                <StatCard label="Fees" value={money(b.platformFees + b.gatewayFees, b.currency)} hint={`Platform ${money(b.platformFees, b.currency)} · gateway ${money(b.gatewayFees, b.currency)}`} />
                <StatCard label="Paid out" value={money(b.paidOut, b.currency)} hint={`Affiliate commissions ${money(b.affiliateCommissions, b.currency)}`} />
              </div>
            ))}
            <Card>
              <CardHeader><CardTitle>Payout requests</CardTitle></CardHeader>
              <CardContent>
                <Table head={['Requested', 'Amount', 'Status', 'Reference']} empty={!d.payouts.length}>
                  {d.payouts.map((p: any) => <tr key={p.id}><Td>{dateTime(p.createdAt)}</Td><Td>{money(p.amount, p.currency)}</Td><Td><StatusBadge status={p.status} /></Td><Td className="font-mono text-xs">{p.reference ?? '—'}</Td></tr>)}
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Ledger</CardTitle></CardHeader>
              <CardContent>
                <Table head={['Date', 'Type', 'Memo', 'Amount']} empty={!d.ledger.length}>
                  {d.ledger.map((l: any) => <tr key={l.id}><Td className="whitespace-nowrap text-muted-foreground">{dateTime(l.createdAt)}</Td><Td>{l.type.replace(/_/g, ' ').toLowerCase()}</Td><Td>{l.memo}</Td><Td className={l.amount < 0 ? 'text-destructive' : 'text-success'}>{money(l.amount, l.currency)}</Td></tr>)}
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </QueryView>
      <Modal open={open} onOpenChange={setOpen} title="Request a payout" description="Transfers go to the bank account on file with the platform team.">
        <form onSubmit={request} className="space-y-3">
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Amount"><Input type="number" min={1} step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Currency"><Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{(q.data?.balances ?? [{ currency: ws.workspace.currency }]).map((b: any) => <option key={b.currency}>{b.currency}</option>)}</Select></Field>
          </div>
          <Field label="Notes (optional)"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Request</Button></div>
        </form>
      </Modal>
    </>
  );
}
