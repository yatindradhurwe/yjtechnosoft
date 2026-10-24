import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { download, errorMessage } from '@/lib/api';
import { dateTime, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, PageHeader, Pagination, QueryView, SearchInput, Table, Td } from '@/components/ui/misc';
import { useWs } from './workspace';

export default function Orders() {
  const ws = useWs();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const qs = `q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}${from ? `&from=${new Date(from).toISOString()}` : ''}${to ? `&to=${new Date(`${to}T23:59:59`).toISOString()}` : ''}`;
  const list = useQuery({ queryKey: ['orders', ws.slug, qs, page], queryFn: () => ws.get(`/orders?page=${page}&${qs}`) });

  return (
    <>
      <PageHeader title="Orders" description="Every checkout, with verified payment status." actions={<Button variant="outline" onClick={() => download(`/orders?format=csv&${qs}`, 'orders.csv', ws.workspace.id).catch((e) => toast.error(errorMessage(e)))}><Download /> Export CSV</Button>} />
      <div className="mb-4 flex flex-col flex-wrap gap-2 sm:flex-row">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Buyer, email or order #" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sm:w-48" aria-label="Status">
          <option value="">All statuses</option>
          {['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
        </Select>
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="sm:w-40" aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="sm:w-40" aria-label="To date" />
      </div>
      <QueryView q={list}>
        {(d) =>
          d.total === 0 && !q && !status && !from && !to ? (
            <EmptyState icon={<ShoppingBag />} title="No orders yet" description="Share your storefront link to get your first sale." action={<Button asChild variant="outline"><a href={`/s/${ws.slug}`} target="_blank" rel="noreferrer">Open storefront</a></Button>} />
          ) : (
            <>
              <Table head={['Order', 'Date', 'Buyer', 'Items', 'Total', 'Status']} empty={!d.items.length}>
                {d.items.map((o: any) => (
                  <tr key={o.id} className="hover:bg-muted/40">
                    <Td><Link to={o.id} className="font-medium hover:underline">#{o.number}</Link></Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{dateTime(o.createdAt)}</Td>
                    <Td>{o.buyerName}<span className="block text-xs text-muted-foreground">{o.buyerEmail}</span></Td>
                    <Td className="max-w-[16rem] truncate">{o.items.map((i: any) => i.title).join(', ')}</Td>
                    <Td>{money(o.total, o.currency)}</Td>
                    <Td><StatusBadge status={o.status} /></Td>
                  </tr>
                ))}
              </Table>
              <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )
        }
      </QueryView>
    </>
  );
}
