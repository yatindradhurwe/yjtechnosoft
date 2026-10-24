import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { date, money, toMinor } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmButton, Modal } from '@/components/ui/dialog';
import { Field, Input, Select, Switch } from '@/components/ui/form';
import { EmptyState, PageHeader, QueryView, Table, Td } from '@/components/ui/misc';
import { useWs } from './workspace';

export default function Coupons() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['coupons', ws.slug], queryFn: () => ws.get('/coupons') });
  const products = useQuery({ queryKey: ['products-all', ws.slug], queryFn: () => ws.get('/products?pageSize=100') });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: '', type: 'PERCENT', value: '', maxRedemptions: '', perUserLimit: '1', endsAt: '', productIds: [] as string[] });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await ws.post('/coupons', {
        code: f.code,
        type: f.type,
        value: f.type === 'PERCENT' ? Math.round(Number(f.value) * 100) : toMinor(f.value),
        maxRedemptions: f.maxRedemptions ? Number(f.maxRedemptions) : null,
        perUserLimit: Number(f.perUserLimit || 0),
        endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
        productIds: f.productIds,
      });
      toast.success('Coupon created');
      setOpen(false);
      q.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Coupons" description="Discount codes buyers enter at checkout." actions={ws.can('products.write') && <Button onClick={() => setOpen(true)}><Plus /> New coupon</Button>} />
      <QueryView q={q}>
        {(d) =>
          d.coupons.length === 0 ? (
            <EmptyState icon={<Ticket />} title="No coupons yet" description="Run launch offers, early-bird pricing or partner discounts." action={ws.can('products.write') && <Button onClick={() => setOpen(true)}><Plus /> Create a coupon</Button>} />
          ) : (
            <Table head={['Code', 'Discount', 'Used', 'Expires', 'Active', '']}>
              {d.coupons.map((c: any) => (
                <tr key={c.id}>
                  <Td className="font-mono font-semibold">{c.code}</Td>
                  <Td>{c.type === 'PERCENT' ? `${c.value / 100}%` : money(c.value, ws.workspace.currency)}{c.productIds.length > 0 && <span className="block text-xs text-muted-foreground">{c.productIds.length} product(s)</span>}</Td>
                  <Td>{c.redeemedCount}{c.maxRedemptions ? ` / ${c.maxRedemptions}` : ''}</Td>
                  <Td>{c.endsAt ? date(c.endsAt) : 'Never'}</Td>
                  <Td><Switch checked={c.active} label={`Activate ${c.code}`} disabled={!ws.can('products.write')} onChange={async (v) => { await ws.patch(`/coupons/${c.id}`, { active: v }); q.refetch(); }} /></Td>
                  <Td>{ws.can('products.write') && <ConfirmButton title={`Delete ${c.code}?`} description="Used coupons are deactivated instead of deleted." onConfirm={async () => { await ws.del(`/coupons/${c.id}`); q.refetch(); }}>Delete</ConfirmButton>}</Td>
                </tr>
              ))}
            </Table>
          )
        }
      </QueryView>
      <Modal open={open} onOpenChange={setOpen} title="New coupon">
        <form onSubmit={create} className="space-y-3">
          <Field label="Code"><Input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="LAUNCH20" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="PERCENT">Percentage</option><option value="FIXED">Fixed amount</option></Select></Field>
            <Field label={f.type === 'PERCENT' ? 'Percent off' : `Amount off (${ws.workspace.currency})`}><Input type="number" min={0.01} step="0.01" max={f.type === 'PERCENT' ? 100 : undefined} required value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
            <Field label="Total uses (optional)"><Input type="number" min={1} value={f.maxRedemptions} onChange={(e) => setF({ ...f, maxRedemptions: e.target.value })} /></Field>
            <Field label="Uses per buyer" hint="0 = unlimited"><Input type="number" min={0} value={f.perUserLimit} onChange={(e) => setF({ ...f, perUserLimit: e.target.value })} /></Field>
          </div>
          <Field label="Expires (optional)"><Input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
          <Field label="Limit to products" hint="Leave all unticked to apply to every product">
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
              {products.data?.items.map((p: any) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={f.productIds.includes(p.id)} onChange={(e) => setF({ ...f, productIds: e.target.checked ? [...f.productIds, p.id] : f.productIds.filter((x) => x !== p.id) })} />
                  {p.title}
                </label>
              ))}
            </div>
          </Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Create</Button></div>
        </form>
      </Modal>
    </>
  );
}
