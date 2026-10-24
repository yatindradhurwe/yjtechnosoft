import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calculator, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { slugify } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton, Modal } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, PageHeader, QueryView, Table, Td } from '@/components/ui/misc';
import { useWs } from './workspace';

const TEMPLATES: Record<string, any> = {
  bmi: { title: 'BMI calculator', definition: { fields: [{ key: 'weight', label: 'Weight (kg)', type: 'number', min: 20, max: 300, required: true }, { key: 'height', label: 'Height (cm)', type: 'number', min: 100, max: 250, required: true }], outputs: [{ key: 'bmi', label: 'Your BMI', formula: 'weight / (height / 100) ^ 2', format: 'number', decimals: 1 }], saveResults: true, leadCapture: false } },
  savings: { title: 'Savings planner', definition: { fields: [{ key: 'monthly', label: 'Monthly saving (₹)', type: 'number', min: 0, required: true }, { key: 'years', label: 'Years', type: 'number', min: 1, max: 50, required: true }, { key: 'rate', label: 'Expected return % per year', type: 'number', min: 0, max: 30, required: true }], outputs: [{ key: 'total', label: 'Projected corpus', formula: 'monthly * ((1 + rate/1200) ^ (years*12) - 1) / (rate/1200)', format: 'currency', decimals: 0 }], saveResults: false, leadCapture: true } },
  habit: { title: 'Daily study tracker', definition: { fields: [{ key: 'minutes', label: 'Minutes studied today', type: 'number', min: 0, max: 1440, required: true }, { key: 'focus', label: 'Focus level', type: 'select', options: [{ label: 'Low', value: 1 }, { label: 'Medium', value: 2 }, { label: 'High', value: 3 }], required: true }], outputs: [{ key: 'score', label: 'Study score', formula: 'round(minutes * focus / 3)', format: 'number', decimals: 0 }], saveResults: true, leadCapture: false } },
};

function ToolEditor({ tool, onClose }: { tool: any; onClose: () => void }) {
  const ws = useWs();
  const products = useQuery({ queryKey: ['products-all', ws.slug], queryFn: () => ws.get('/products?pageSize=100') });
  const [t, setT] = useState(tool);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const def = t.definition;
  const setDef = (d: any) => setT({ ...t, definition: { ...def, ...d } });

  const save = async (status?: string) => {
    const body = { title: t.title, slug: t.slug, description: t.description || null, access: t.access, productId: t.productId || null, definition: def, ...(status ? { status } : t.id ? { status: t.status } : {}) };
    try {
      if (t.id) await ws.put(`/tools/${t.id}`, body);
      else {
        const r = await ws.post('/tools', body);
        if (status) await ws.put(`/tools/${r.tool.id}`, { ...body, status });
      }
      toast.success('Tool saved');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={t.id ? 'Edit tool' : 'New tool'} wide footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="outline" onClick={() => save()}>Save</Button><Button onClick={() => save('PUBLISHED')}>Save & publish</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title"><Input value={t.title} onChange={(e) => setT({ ...t, title: e.target.value, slug: t.id ? t.slug : slugify(e.target.value) })} /></Field>
          <Field label="URL slug"><Input value={t.slug} onChange={(e) => setT({ ...t, slug: e.target.value })} /></Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={t.description ?? ''} onChange={(e) => setT({ ...t, description: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Who can use it">
            <Select value={t.access} onChange={(e) => setT({ ...t, access: e.target.value })}><option value="PUBLIC">Anyone</option><option value="MEMBERS">Signed-in members</option><option value="PRODUCT">Buyers of a product</option></Select>
          </Field>
          {t.access === 'PRODUCT' && <Field label="Product"><Select value={t.productId ?? ''} onChange={(e) => setT({ ...t, productId: e.target.value })}><option value="">Choose…</option>{products.data?.items.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></Field>}
        </div>
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Inputs</CardTitle><Button size="sm" variant="outline" onClick={() => setDef({ fields: [...def.fields, { key: `field${def.fields.length + 1}`, label: 'New field', type: 'number', required: true }] })}><Plus /> Field</Button></CardHeader>
          <CardContent className="space-y-2">
            {def.fields.map((f: any, i: number) => (
              <div key={i} className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_120px_auto]">
                <Field label="Label"><Input value={f.label} onChange={(e) => setDef({ fields: def.fields.map((x: any, j: number) => (j === i ? { ...x, label: e.target.value } : x)) })} /></Field>
                <Field label="Key (used in formulas)"><Input value={f.key} onChange={(e) => setDef({ fields: def.fields.map((x: any, j: number) => (j === i ? { ...x, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') } : x)) })} /></Field>
                <Field label="Type"><Select value={f.type} onChange={(e) => setDef({ fields: def.fields.map((x: any, j: number) => (j === i ? { ...x, type: e.target.value, options: e.target.value === 'select' ? [{ label: 'Option', value: 1 }] : undefined } : x)) })}>{['number', 'select', 'checkbox', 'text', 'date'].map((k) => <option key={k}>{k}</option>)}</Select></Field>
                <Button size="icon" variant="ghost" onClick={() => setDef({ fields: def.fields.filter((_: any, j: number) => j !== i) })} aria-label="Remove field"><Trash2 /></Button>
                {f.type === 'select' && (
                  <Field label="Options (label=value per line)" className="sm:col-span-4">
                    <Textarea rows={3} value={(f.options ?? []).map((o: any) => `${o.label}=${o.value}`).join('\n')} onChange={(e) => setDef({ fields: def.fields.map((x: any, j: number) => (j === i ? { ...x, options: e.target.value.split('\n').filter(Boolean).map((l) => ({ label: l.split('=')[0], value: Number(l.split('=')[1] ?? 0) })) } : x)) })} />
                  </Field>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Results</CardTitle><Button size="sm" variant="outline" onClick={() => setDef({ outputs: [...def.outputs, { key: `result${def.outputs.length + 1}`, label: 'Result', formula: '0', format: 'number', decimals: 0 }] })}><Plus /> Result</Button></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">Formulas use field keys with + − × ÷ ^ and min, max, round, abs, sqrt, floor, ceil, if(condition, a, b). They run safely on the server and are never shown to users.</p>
            {def.outputs.map((o: any, i: number) => (
              <div key={i} className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-[1fr_2fr_110px_70px_auto]">
                <Field label="Label"><Input value={o.label} onChange={(e) => setDef({ outputs: def.outputs.map((x: any, j: number) => (j === i ? { ...x, label: e.target.value } : x)) })} /></Field>
                <Field label="Formula"><Input className="font-mono" value={o.formula} onChange={(e) => setDef({ outputs: def.outputs.map((x: any, j: number) => (j === i ? { ...x, formula: e.target.value } : x)) })} /></Field>
                <Field label="Format"><Select value={o.format} onChange={(e) => setDef({ outputs: def.outputs.map((x: any, j: number) => (j === i ? { ...x, format: e.target.value } : x)) })}><option value="number">Number</option><option value="currency">Currency</option><option value="percent">Percent</option></Select></Field>
                <Field label="Decimals"><Input type="number" min={0} max={4} value={o.decimals} onChange={(e) => setDef({ outputs: def.outputs.map((x: any, j: number) => (j === i ? { ...x, decimals: Number(e.target.value) } : x)) })} /></Field>
                <Button size="icon" variant="ghost" onClick={() => setDef({ outputs: def.outputs.filter((_: any, j: number) => j !== i) })} aria-label="Remove result"><Trash2 /></Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-4 pt-2">
              <Checkbox checked={def.saveResults} onChange={(v) => setDef({ saveResults: v })} label="Save results so users can track progress" />
              <Checkbox checked={def.leadCapture} onChange={(v) => setDef({ leadCapture: v })} label="Ask for email before showing results" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Test it</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-3">
              {def.fields.filter((f: any) => f.type !== 'text' && f.type !== 'date').map((f: any) => <Field key={f.key} label={f.label}><Input value={inputs[f.key] ?? ''} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })} /></Field>)}
            </div>
            <Button size="sm" variant="outline" onClick={async () => { try { setPreview((await ws.post('/tools/preview', { definition: def, inputs })).outputs); } catch (e) { toast.error(errorMessage(e)); } }}>Calculate</Button>
            {preview && <div className="flex flex-wrap gap-4 text-sm">{Object.entries(preview).map(([k, v]) => <span key={k}><strong>{def.outputs.find((o: any) => o.key === k)?.label}:</strong> {v}</span>)}</div>}
          </CardContent>
        </Card>
      </div>
    </Modal>
  );
}

export default function Tools() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['tools', ws.slug], queryFn: () => ws.get('/tools') });
  const [editing, setEditing] = useState<any>(null);
  const startFrom = (key: string) => setEditing({ ...TEMPLATES[key], slug: slugify(TEMPLATES[key].title), access: 'PUBLIC', description: '' });
  return (
    <>
      <PageHeader title="Creator tools" description="Calculators, trackers and worksheets for your audience – built from safe, configurable components." actions={<Button onClick={() => setEditing({ title: 'New tool', slug: 'new-tool', access: 'PUBLIC', description: '', definition: { fields: [{ key: 'value', label: 'Value', type: 'number', required: true }], outputs: [], saveResults: false, leadCapture: false } })}><Plus /> Blank tool</Button>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {Object.entries(TEMPLATES).map(([k, t]) => (
          <button key={k} onClick={() => startFrom(k)} className="rounded-lg border bg-card p-4 text-left hover:border-primary">
            <Calculator className="mb-2 h-5 w-5 text-primary" />
            <p className="font-medium">{t.title}</p>
            <p className="text-xs text-muted-foreground">Start from template</p>
          </button>
        ))}
      </div>
      <QueryView q={q}>
        {(d) =>
          d.tools.length === 0 ? (
            <EmptyState icon={<Calculator />} title="No tools yet" description="Pick a template above to get started." />
          ) : (
            <Table head={['Tool', 'Access', 'Status', 'Uses', '']}>
              {d.tools.map((t: any) => (
                <tr key={t.id}>
                  <Td className="font-medium">{t.title}</Td>
                  <Td>{t.access.toLowerCase()}</Td>
                  <Td><StatusBadge status={t.status} /></Td>
                  <Td>{t._count.submissions}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {t.status === 'PUBLISHED' && <Button asChild size="sm" variant="ghost"><a href={`/s/${ws.slug}/t/${t.slug}`} target="_blank" rel="noreferrer"><ExternalLink /> Open</a></Button>}
                      <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>Edit</Button>
                      <ConfirmButton title={`Delete ${t.title}?`} description="Saved results are deleted too." onConfirm={async () => { await ws.del(`/tools/${t.id}`); q.refetch(); }}>Delete</ConfirmButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )
        }
      </QueryView>
      {editing && <ToolEditor tool={editing} onClose={() => { setEditing(null); q.refetch(); }} />}
    </>
  );
}
