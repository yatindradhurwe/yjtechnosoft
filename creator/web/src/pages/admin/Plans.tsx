import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { PageHeader, QueryView } from '@/components/ui/misc';

const LIMITS = [
  ['maxCourses', 'Max courses'],
  ['maxProducts', 'Max products'],
  ['maxTeamMembers', 'Max team members'],
  ['storageMb', 'Storage (MB)'],
  ['aiCreditsMonthly', 'AI credits / month'],
] as const;
const FEATURES = [['customDomain', 'Custom domains'], ['affiliates', 'Affiliate program'], ['automations', 'Automations']] as const;

export default function Plans() {
  const q = useQuery({ queryKey: ['admin-plans'], queryFn: () => api.get('/admin/plans') });
  const [f, setF] = useState<any>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const limits: Record<string, unknown> = {};
    for (const [k] of LIMITS) limits[k] = f.limits[k] === '' || f.limits[k] === null || f.limits[k] === undefined ? null : Number(f.limits[k]);
    for (const [k] of FEATURES) limits[k] = !!f.limits[k];
    const body = { key: f.key, name: f.name, description: f.description || null, currency: f.currency, priceMonthly: Math.round(Number(f.priceMonthly) * 100), priceYearly: Math.round(Number(f.priceYearly) * 100), platformFeeBps: Math.round(Number(f.platformFee) * 100), limits, isPublic: f.isPublic, active: f.active, sortOrder: Number(f.sortOrder) };
    try {
      if (f.id) await api.put(`/admin/plans/${f.id}`, body);
      else await api.post('/admin/plans', body);
      toast.success('Plan saved');
      setF(null);
      q.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const edit = (p?: any) =>
    setF(p ? { ...p, priceMonthly: p.priceMonthly / 100, priceYearly: p.priceYearly / 100, platformFee: p.platformFeeBps / 100, description: p.description ?? '' } : { key: '', name: '', description: '', currency: 'INR', priceMonthly: 0, priceYearly: 0, platformFee: 5, limits: {}, isPublic: true, active: true, sortOrder: 10 });
  return (
    <>
      <PageHeader title="Plans & entitlements" description="Limits are enforced by the API when creators create courses, products, team members, uploads and AI requests." actions={<Button onClick={() => edit()}><Plus /> New plan</Button>} />
      <QueryView q={q}>
        {(d) => (
          <div className="grid gap-4 md:grid-cols-3">
            {d.plans.map((p: any) => (
              <Card key={p.id}>
                <CardHeader className="flex-row items-start justify-between"><div><CardTitle>{p.name}</CardTitle><p className="text-sm text-muted-foreground">{money(p.priceMonthly, p.currency)}/mo · {p.platformFeeBps / 100}% fee</p></div><div className="flex flex-col items-end gap-1">{!p.active && <Badge variant="outline">inactive</Badge>}{!p.isPublic && <Badge variant="secondary">hidden</Badge>}</div></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {LIMITS.map(([k, l]) => <p key={k} className="flex justify-between"><span className="text-muted-foreground">{l}</span><span>{p.limits[k] ?? '∞'}</span></p>)}
                  {FEATURES.map(([k, l]) => <p key={k} className="flex justify-between"><span className="text-muted-foreground">{l}</span><span>{p.limits[k] ? 'Yes' : 'No'}</span></p>)}
                  <p className="pt-2 text-xs text-muted-foreground">{p._count.tenantSubscriptions} workspaces</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => edit(p)}>Edit</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryView>
      {f && (
        <Modal open onOpenChange={() => setF(null)} title={f.id ? `Edit ${f.name}` : 'New plan'} wide>
          <form onSubmit={save} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Key"><Input required value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} disabled={!!f.id} /></Field>
              <Field label="Name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Sort order"><Input type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} /></Field>
            </div>
            <Field label="Description"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Monthly price (₹)"><Input type="number" min={0} step="0.01" value={f.priceMonthly} onChange={(e) => setF({ ...f, priceMonthly: e.target.value })} /></Field>
              <Field label="Yearly price (₹)"><Input type="number" min={0} step="0.01" value={f.priceYearly} onChange={(e) => setF({ ...f, priceYearly: e.target.value })} /></Field>
              <Field label="Platform fee (%)"><Input type="number" min={0} max={50} step="0.01" value={f.platformFee} onChange={(e) => setF({ ...f, platformFee: e.target.value })} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {LIMITS.map(([k, l]) => <Field key={k} label={l} hint="Empty = unlimited"><Input type="number" min={0} value={f.limits[k] ?? ''} onChange={(e) => setF({ ...f, limits: { ...f.limits, [k]: e.target.value } })} /></Field>)}
            </div>
            <div className="flex flex-wrap gap-6">
              {FEATURES.map(([k, l]) => <Checkbox key={k} checked={!!f.limits[k]} onChange={(v) => setF({ ...f, limits: { ...f.limits, [k]: v } })} label={l} />)}
              <Checkbox checked={f.isPublic} onChange={(v) => setF({ ...f, isPublic: v })} label="Show on pricing page" />
              <Checkbox checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" />
            </div>
            <div className="flex justify-end"><Button type="submit">Save plan</Button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
