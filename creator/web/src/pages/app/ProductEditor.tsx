import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { money, toMinor } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton, Modal } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { PageHeader, QueryView } from '@/components/ui/misc';
import { MediaPicker, UploadButton } from '@/components/app/MediaPicker';
import { PRODUCT_TYPES } from './Products';
import { useWs } from './workspace';

const RESOURCE_LABEL: Record<string, string> = { COURSE: 'Course', DOWNLOAD: 'File', COMMUNITY: 'Community', WORKSHOP: 'Workshop', CONSULTATION: '1:1 session' };

function ItemsEditor({ product, onChanged }: { product: any; onChanged: () => void }) {
  const ws = useWs();
  const [kind, setKind] = useState('COURSE');
  const [picker, setPicker] = useState(false);
  const options = useQuery({
    queryKey: ['item-options', ws.slug, kind],
    queryFn: async () => {
      if (kind === 'COURSE') return (await ws.get('/courses?pageSize=100')).items.map((c: any) => ({ id: c.id, label: c.title }));
      if (kind === 'COMMUNITY') return (await ws.get('/community-admin')).items.map((c: any) => ({ id: c.id, label: c.name }));
      if (kind === 'WORKSHOP') return (await ws.get('/workshops')).items.map((w: any) => ({ id: w.id, label: w.title }));
      if (kind === 'CONSULTATION') return (await ws.get('/consultations/offerings')).offerings.map((o: any) => ({ id: o.id, label: o.title }));
      return [];
    },
    enabled: kind !== 'DOWNLOAD',
  });
  const names = useQuery({
    queryKey: ['item-names', ws.slug, product.items.map((i: any) => i.resourceId).join()],
    queryFn: async () => {
      const [courses, comms, wss, cons, media] = await Promise.all([ws.get('/courses?pageSize=100'), ws.get('/community-admin'), ws.get('/workshops'), ws.get('/consultations/offerings'), ws.get('/media?pageSize=100')]);
      const map: Record<string, string> = {};
      courses.items.forEach((c: any) => (map[c.id] = c.title));
      comms.items.forEach((c: any) => (map[c.id] = c.name));
      wss.items.forEach((w: any) => (map[w.id] = w.title));
      cons.offerings.forEach((o: any) => (map[o.id] = o.title));
      media.items.forEach((m: any) => (map[m.id] = m.filename));
      return map;
    },
  });
  const save = async (items: { resourceType: string; resourceId: string }[]) => {
    try {
      await ws.put(`/products/${product.id}/items`, { items });
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const current = product.items.map((i: any) => ({ resourceType: i.resourceType, resourceId: i.resourceId }));
  return (
    <Card>
      <CardHeader><CardTitle>What buyers get</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {current.length === 0 && <p className="text-sm text-muted-foreground">Nothing attached yet.</p>}
        {current.map((it: any) => (
          <div key={it.resourceId} className="flex items-center justify-between rounded-md border p-2 text-sm">
            <span><Badge variant="outline">{RESOURCE_LABEL[it.resourceType]}</Badge> <span className="ml-2">{names.data?.[it.resourceId] ?? '…'}</span></span>
            {ws.can('products.write') && <Button size="icon" variant="ghost" onClick={() => save(current.filter((x: any) => x.resourceId !== it.resourceId))} aria-label="Remove"><Trash2 /></Button>}
          </div>
        ))}
        {ws.can('products.write') && (
          <div className="flex flex-wrap gap-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-40" aria-label="Item type">
              {Object.entries(RESOURCE_LABEL).map(([k, v]) => <option key={k} value={k === 'DOWNLOAD' ? 'DOWNLOAD' : k}>{v}</option>)}
            </Select>
            {kind === 'DOWNLOAD' ? (
              <Button variant="outline" onClick={() => setPicker(true)}><Plus /> Choose file</Button>
            ) : (
              <Select value="" onChange={(e) => e.target.value && save([...current, { resourceType: kind, resourceId: e.target.value }])} className="flex-1" aria-label="Add item">
                <option value="">Add a {RESOURCE_LABEL[kind].toLowerCase()}…</option>
                {(options.data ?? []).filter((o: any) => !current.some((c: any) => c.resourceId === o.id)).map((o: any) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </Select>
            )}
          </div>
        )}
        <MediaPicker open={picker} onOpenChange={setPicker} onPick={(a) => save([...current, { resourceType: 'DOWNLOAD', resourceId: a.id }])} />
      </CardContent>
    </Card>
  );
}

function PricesEditor({ product, onChanged }: { product: any; onChanged: () => void }) {
  const ws = useWs();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ label: '', amount: '', compareAt: '', currency: ws.workspace.currency, type: 'ONE_TIME', interval: 'MONTH', accessDays: '' });
  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await ws.post(`/products/${product.id}/prices`, {
        label: f.label || null,
        currency: f.currency,
        amount: toMinor(f.amount || 0),
        compareAtAmount: f.compareAt ? toMinor(f.compareAt) : null,
        type: f.type,
        interval: f.type === 'RECURRING' ? f.interval : null,
        accessDays: f.accessDays ? Number(f.accessDays) : null,
      });
      setOpen(false);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between"><CardTitle>Pricing</CardTitle>{ws.can('products.write') && <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus /> Add price</Button>}</CardHeader>
      <CardContent className="space-y-2">
        {product.prices.map((p: any) => (
          <div key={p.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div>
              <span className="font-semibold">{p.amount ? money(p.amount, p.currency) : 'Free'}</span>
              {p.compareAtAmount && <span className="ml-2 text-muted-foreground line-through">{money(p.compareAtAmount, p.currency)}</span>}
              <span className="ml-2 text-muted-foreground">{p.type === 'RECURRING' ? `every ${p.interval.toLowerCase()}` : p.accessDays ? `${p.accessDays} days access` : 'lifetime access'}</span>
              {p.label && <Badge variant="outline" className="ml-2">{p.label}</Badge>}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">Active <Switch checked={p.active} label="Active" disabled={!ws.can('products.write')} onChange={async (v) => { try { await ws.patch(`/products/prices/${p.id}`, { active: v }); onChanged(); } catch (e) { toast.error(errorMessage(e)); } }} /></label>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">To change an amount, add a new price and deactivate the old one – past orders keep their original price.</p>
      </CardContent>
      <Modal open={open} onOpenChange={setOpen} title="Add a price">
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount"><Input type="number" min={0} step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Currency"><Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{['INR', 'USD', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Compare-at (optional)" hint="Shown struck through"><Input type="number" min={0} step="0.01" value={f.compareAt} onChange={(e) => setF({ ...f, compareAt: e.target.value })} /></Field>
            <Field label="Label (optional)"><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. Early bird" /></Field>
          </div>
          <Field label="Billing">
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="ONE_TIME">One-time payment</option>
              <option value="RECURRING">Recurring membership</option>
            </Select>
          </Field>
          {f.type === 'RECURRING' ? (
            <Field label="Every" hint="Members renew from their dashboard; we send a reminder 3 days before access ends.">
              <Select value={f.interval} onChange={(e) => setF({ ...f, interval: e.target.value })}>
                <option value="MONTH">Month</option>
                <option value="QUARTER">Quarter</option>
                <option value="YEAR">Year</option>
              </Select>
            </Field>
          ) : (
            <Field label="Access period (days)" hint="Leave empty for lifetime access"><Input type="number" min={1} value={f.accessDays} onChange={(e) => setF({ ...f, accessDays: e.target.value })} /></Field>
          )}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Add price</Button></div>
        </form>
      </Modal>
    </Card>
  );
}

export default function ProductEditor() {
  const { productId = '' } = useParams();
  const ws = useWs();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['product', productId], queryFn: () => ws.get(`/products/${productId}`) });
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setF(q.data.product);
  }, [q.data]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['product', productId] });
  const storeUrl = `${location.origin}/s/${ws.slug}/p/${f?.slug}`;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await ws.patch(`/products/${productId}`, { title: f.title, slug: f.slug, description: f.description || null, coverUrl: f.coverUrl || null, category: f.category || null, featured: f.featured });
      toast.success('Product saved');
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: string) => {
    try {
      await ws.post(`/products/${productId}/status`, { status });
      toast.success(status === 'PUBLISHED' ? 'Product is live on your storefront' : `Product ${status.toLowerCase()}`);
      refresh();
      qc.invalidateQueries({ queryKey: ['products'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <QueryView q={q}>
      {(d) =>
        f && (
          <>
            <PageHeader
              back={<Link to=".." relative="path" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Products</Link>}
              title={<span className="flex items-center gap-3">{d.product.title} <StatusBadge status={d.product.status} /></span>}
              description={PRODUCT_TYPES[d.product.type]}
              actions={
                ws.can('products.write') && (
                  <>
                    {d.product.status === 'PUBLISHED' && (
                      <>
                        <Button variant="outline" onClick={() => { navigator.clipboard.writeText(storeUrl); toast.success('Link copied'); }}><Copy /> Copy link</Button>
                        <Button asChild variant="outline"><a href={storeUrl} target="_blank" rel="noreferrer"><ExternalLink /> View</a></Button>
                      </>
                    )}
                    {d.product.status !== 'PUBLISHED' ? <Button onClick={() => setStatus('PUBLISHED')}>Publish</Button> : <Button variant="outline" onClick={() => setStatus('DRAFT')}>Unpublish</Button>}
                  </>
                )
              }
            />
            <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
              <form onSubmit={save} className="space-y-4">
                <Card>
                  <CardContent className="space-y-4 pt-5">
                    <Field label="Name"><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
                    <Field label="Description" hint="Plain text. Line breaks are kept; lines starting with • become bullets."><Textarea rows={8} value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
                    <Field label="Cover image"><div className="flex gap-2"><Input value={f.coverUrl ?? ''} onChange={(e) => setF({ ...f, coverUrl: e.target.value })} placeholder="https://…" /><UploadButton onUploaded={(a) => setF({ ...f, coverUrl: a.url })} /></div></Field>
                    {f.coverUrl && <img src={f.coverUrl} alt="" className="aspect-video w-64 rounded-md object-cover" />}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="URL slug" hint={`/s/${ws.slug}/p/${f.slug}`}><Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></Field>
                      <Field label="Category"><Input value={f.category ?? ''} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
                    </div>
                    <Checkbox checked={f.featured} onChange={(v) => setF({ ...f, featured: v })} label="Feature on storefront" />
                    <Button type="submit" loading={busy} disabled={!ws.can('products.write')}>Save</Button>
                  </CardContent>
                </Card>
              </form>
              <div className="space-y-4">
                <PricesEditor product={d.product} onChanged={refresh} />
                <ItemsEditor product={d.product} onChanged={refresh} />
                {ws.can('products.write') && (
                  <ConfirmButton variant="destructive" size="md" title="Delete this product?" description="Products with orders are archived instead, so order history stays intact." confirmLabel="Delete" onConfirm={async () => { const r = await ws.del(`/products/${productId}`); toast.success(r.archived ? 'Product archived (it has orders)' : 'Product deleted'); nav('..', { relative: 'path' }); }}>
                    <Trash2 /> Delete product
                  </ConfirmButton>
                )}
              </div>
            </div>
          </>
        )
      }
    </QueryView>
  );
}
