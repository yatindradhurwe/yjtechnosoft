import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Printer, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { ErrorState, Spinner } from '@/components/ui/misc';
import { InvoiceView } from '@/components/app/InvoiceView';
import { RequireAuth } from '@/components/RequireAuth';
import { useStore } from './StoreApp';

/**
 * Confirmation page. Payment status comes only from the server, which marks an
 * order paid after verifying the payment with the provider. We poll until then.
 */
function Status() {
  const { orderId = '' } = useParams();
  const { store } = useStore();
  const [invoice, setInvoice] = useState(false);
  const q = useQuery({
    queryKey: ['order-status', orderId],
    queryFn: () => api.get(`/store/${store.slug}/orders/${orderId}`),
    refetchInterval: (query) => (query.state.data?.order.status === 'PENDING' && (query.state.dataUpdateCount ?? 0) < 60 ? 3000 : false),
  });
  if (q.isPending) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (q.isError) return <div className="container max-w-lg py-16"><ErrorState error={q.error} /></div>;
  const o = q.data.order;
  return (
    <div className="container max-w-lg py-16">
      <Card>
        <CardContent className="space-y-4 pt-8 text-center">
          {o.status === 'PAID' && (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
              <h1 className="text-2xl font-bold">You're in! 🎉</h1>
              <p className="text-muted-foreground">Payment confirmed for {o.items.map((i: any) => i.title).join(', ')}. A receipt is on its way to {o.buyerEmail}.</p>
              <Button asChild size="lg" variant="brand" className="w-full"><Link to="/learn">Start learning</Link></Button>
              {o.invoice && <Button variant="outline" className="w-full" onClick={() => setInvoice(true)}><Printer /> View invoice</Button>}
            </>
          )}
          {o.status === 'PENDING' && (
            <>
              <Clock className="mx-auto h-12 w-12 animate-pulse text-warning" />
              <h1 className="text-2xl font-bold">Confirming your payment…</h1>
              <p className="text-muted-foreground">This usually takes a few seconds. You can leave this page – we'll email you once it's confirmed and your purchase will appear in your library.</p>
            </>
          )}
          {['FAILED', 'CANCELED'].includes(o.status) && (
            <>
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <h1 className="text-2xl font-bold">Payment didn't go through</h1>
              <p className="text-muted-foreground">{o.payments[0]?.failureReason ?? 'No money was taken.'}</p>
              <Button asChild className="w-full"><Link to={`/s/${store.slug}`}>Back to store</Link></Button>
            </>
          )}
          {['REFUNDED', 'PARTIALLY_REFUNDED'].includes(o.status) && <p className="text-muted-foreground">This order was refunded.</p>}
          <p className="text-xs text-muted-foreground">Order #{o.number} · {money(o.total, o.currency)}</p>
        </CardContent>
      </Card>
      {o.invoice && <Modal open={invoice} onOpenChange={setInvoice} title={`Invoice ${o.invoice.number}`} wide footer={<Button onClick={() => window.print()}><Printer /> Print / save PDF</Button>}><InvoiceView invoice={o.invoice} /></Modal>}
    </div>
  );
}

export default function OrderStatus() {
  return <RequireAuth><Status /></RequireAuth>;
}
