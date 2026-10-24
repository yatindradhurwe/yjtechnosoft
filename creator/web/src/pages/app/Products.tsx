import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { money, toMinor } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, PageHeader, Pagination, QueryView, SearchInput, Table, Td } from '@/components/ui/misc';
import { useWs } from './workspace';

export const PRODUCT_TYPES: Record<string, string> = {
  COURSE: 'Course',
  BUNDLE: 'Bundle',
  DIGITAL_DOWNLOAD: 'Digital download',
  MEMBERSHIP: 'Membership / community',
  WORKSHOP: 'Workshop ticket',
  CONSULTATION: '1:1 session',
};

export default function Products() {
  const ws = useWs();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ type: 'COURSE', title: '', price: '', currency: ws.workspace.currency, courseId: '' });
  const [busy, setBusy] = useState(false);
  const list = useQuery({ queryKey: ['products', ws.slug, q, status, page], queryFn: () => ws.get(`/products?page=${page}&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`) });
  const courses = useQuery({ queryKey: ['courses-all', ws.slug], queryFn: () => ws.get('/courses?pageSize=100'), enabled: open });

  useEffect(() => {
    const c = params.get('newFor');
    if (c) {
      setF((x) => ({ ...x, type: 'COURSE', courseId: c }));
      setOpen(true);
    }
  }, [params]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const items = f.type === 'COURSE' && f.courseId ? [{ resourceType: 'COURSE', resourceId: f.courseId }] : [];
      const title = f.title || courses.data?.items.find((c: any) => c.id === f.courseId)?.title || 'Untitled product';
      const r = await ws.post('/products', { type: f.type, title, items, prices: [{ currency: f.currency, amount: toMinor(f.price || 0) }] });
      nav(r.product.id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Products" description="Everything you sell: courses, bundles, memberships, downloads, tickets and sessions." actions={ws.can('products.write') && <Button onClick={() => setOpen(true)}><Plus /> New product</Button>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search products" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sm:w-44" aria-label="Status">
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </div>
      <QueryView q={list}>
        {(d) =>
          d.total === 0 && !q && !status ? (
            <EmptyState icon={<Package />} title="No products yet" description="A product is what buyers pay for. Attach a course, files, a community or a workshop to it." action={ws.can('products.write') && <Button onClick={() => setOpen(true)}><Plus /> Create a product</Button>} />
          ) : (
            <>
              <Table head={['Product', 'Type', 'Price', 'Status', 'Sales', 'Revenue']} empty={!d.items.length}>
                {d.items.map((p: any) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <Td><Link to={p.id} className="font-medium hover:underline">{p.title}</Link></Td>
                    <Td className="text-muted-foreground">{PRODUCT_TYPES[p.type]}</Td>
                    <Td>{p.prices[0] ? (p.prices[0].amount ? money(p.prices[0].amount, p.prices[0].currency) : 'Free') : '—'}{p.prices[0]?.interval && <span className="text-xs text-muted-foreground"> / {p.prices[0].interval.toLowerCase()}</span>}</Td>
                    <Td><StatusBadge status={p.status} /></Td>
                    <Td>{p.salesCount}</Td>
                    <Td>{money(p.revenue, p.prices[0]?.currency ?? ws.workspace.currency)}</Td>
                  </tr>
                ))}
              </Table>
              <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )
        }
      </QueryView>
      <Modal open={open} onOpenChange={setOpen} title="New product">
        <form onSubmit={create} className="space-y-4">
          <Field label="What are you selling?">
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {Object.entries(PRODUCT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          {f.type === 'COURSE' && (
            <Field label="Course">
              <Select value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })} required>
                <option value="">Choose a course…</option>
                {courses.data?.items.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Product name" hint={f.type === 'COURSE' ? 'Defaults to the course title' : undefined}><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required={f.type !== 'COURSE'} /></Field>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Price" hint="0 for free"><Input type="number" min={0} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required /></Field>
            <Field label="Currency">
              <Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
                {['INR', 'USD', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={busy}>Create product</Button></div>
        </form>
      </Modal>
    </>
  );
}
