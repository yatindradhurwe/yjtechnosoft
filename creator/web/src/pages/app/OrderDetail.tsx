import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { dateTime, money, toMinor } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { PageHeader, QueryView } from '@/components/ui/misc';
import { InvoiceView } from '@/components/app/InvoiceView';
import { useWs } from './workspace';

export default function OrderDetail() {
  const { orderId = '' } = useParams();
  const ws = useWs();
  const q = useQuery({ queryKey: ['order', orderId], queryFn: () => ws.get(`/orders/${orderId}`) });
  const [refund, setRefund] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState(false);

  return (
    <QueryView q={q}>
      {({ order: o }) => {
        const payment = o.payments.find((p: any) => ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status));
        const refundable = payment ? payment.amount - payment.refundedAmount - o.refunds.filter((r: any) => r.status === 'PENDING').reduce((s: number, r: any) => s + r.amount, 0) : 0;
        return (
          <>
            <PageHeader
              back={<Link to=".." relative="path" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Orders</Link>}
              title={<span className="flex items-center gap-3">Order #{o.number} <StatusBadge status={o.status} /></span>}
              description={`Placed ${dateTime(o.createdAt)}${o.paidAt ? ` · paid ${dateTime(o.paidAt)}` : ''}`}
              actions={
                <>
                  {o.invoice && <Button variant="outline" onClick={() => setInvoice(true)}><Printer /> Invoice</Button>}
                  {ws.can('orders.refund') && payment && payment.provider !== 'FREE' && refundable > 0 && <Button variant="destructive" onClick={() => { setAmount(String(refundable / 100)); setRefund(true); }}>Refund</Button>}
                </>
              }
            />
            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              <div className="space-y-6">
                <Card>
                  <CardHeader><CardTitle>Items</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {o.items.map((i: any) => <div key={i.id} className="flex justify-between"><span>{i.title}</span><span>{money(i.unitAmount, o.currency)}</span></div>)}
                    <div className="space-y-1 border-t pt-2 text-muted-foreground">
                      {o.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>−{money(o.discount, o.currency)}</span></div>}
                      {o.taxAmount > 0 && <div className="flex justify-between"><span>GST {o.invoice ? '' : '(included)'}</span><span>{money(o.taxAmount, o.currency)}</span></div>}
                      <div className="flex justify-between font-semibold text-foreground"><span>Total</span><span>{money(o.total, o.currency)}</span></div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {o.payments.length === 0 && <p className="text-muted-foreground">No payment attempt yet.</p>}
                    {o.payments.map((p: any) => (
                      <div key={p.id} className="rounded-md border p-3">
                        <div className="flex justify-between"><span className="font-medium">{p.provider}</span><StatusBadge status={p.status} /></div>
                        <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                          <dt>Amount</dt><dd>{money(p.amount, p.currency)}</dd>
                          <dt>Platform fee</dt><dd>{money(p.platformFee, p.currency)}</dd>
                          <dt>Gateway fee</dt><dd>{money(p.gatewayFee, p.currency)}</dd>
                          <dt>Your net</dt><dd>{money(p.netAmount, p.currency)}</dd>
                          {p.refundedAmount > 0 && <><dt>Refunded</dt><dd>{money(p.refundedAmount, p.currency)}</dd></>}
                          {p.providerPaymentId && <><dt>Provider ref.</dt><dd className="truncate font-mono">{p.providerPaymentId}</dd></>}
                          {p.failureReason && <><dt>Note</dt><dd>{p.failureReason}</dd></>}
                        </dl>
                      </div>
                    ))}
                    {o.refunds.map((r: any) => (
                      <div key={r.id} className="flex justify-between rounded-md bg-muted p-2 text-xs"><span>Refund {money(r.amount, o.currency)} · {r.reason ?? 'no reason'}</span><StatusBadge status={r.status} /></div>
                    ))}
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader><CardTitle>Buyer</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p className="font-medium">{o.buyerName}</p>
                  <p>{o.buyerEmail}</p>
                  {o.buyerPhone && <p>{o.buyerPhone}</p>}
                  <p className="text-muted-foreground">{o.buyerCountry}{o.buyerState ? ` · state code ${o.buyerState}` : ''}</p>
                </CardContent>
              </Card>
            </div>
            <Modal open={refund} onOpenChange={setRefund} title="Refund order" description="The refund is sent to the payment provider. Access is removed once the provider confirms a full refund." footer={
              <>
                <Button variant="outline" onClick={() => setRefund(false)}>Cancel</Button>
                <Button variant="destructive" loading={busy} onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await ws.post(`/orders/${orderId}/refund`, { amount: toMinor(amount), reason: reason || undefined });
                    toast.success(r.refund.status === 'PROCESSED' ? 'Refund processed' : 'Refund requested – waiting for the provider');
                    setRefund(false);
                    q.refetch();
                  } catch (e) {
                    toast.error(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}>Refund {amount && money(toMinor(amount), o.currency)}</Button>
              </>
            }>
              <div className="space-y-3">
                <Field label={`Amount (max ${money(refundable, o.currency)})`}><Input type="number" step="0.01" min={0.01} max={refundable / 100} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
                <Field label="Reason (optional)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              </div>
            </Modal>
            {o.invoice && <Modal open={invoice} onOpenChange={setInvoice} title={`Invoice ${o.invoice.number}`} wide footer={<Button onClick={() => window.print()}><Printer /> Print / save PDF</Button>}><InvoiceView invoice={o.invoice} /></Modal>}
          </>
        );
      }}
    </QueryView>
  );
}
