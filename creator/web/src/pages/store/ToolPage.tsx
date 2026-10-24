import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { QueryView } from '@/components/ui/misc';
import { useStore } from './StoreApp';

function format(v: number, o: any, currency: string) {
  if (o.format === 'currency') return money(Math.round(v * 100), currency);
  if (o.format === 'percent') return `${v}%`;
  return v.toLocaleString(undefined, { maximumFractionDigits: o.decimals });
}

export default function ToolPage() {
  const { toolSlug = '' } = useParams();
  const { store } = useStore();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['tool', store.slug, toolSlug, user?.id], queryFn: () => api.get(`/store/${store.slug}/tools/${toolSlug}`) });
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="container max-w-3xl py-10">
      <QueryView q={q}>
        {(d) => {
          const t = d.tool;
          const run = async (e: FormEvent) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await api.post(`/store/${store.slug}/tools/${toolSlug}/run`, { inputs, email: email || undefined, consent });
              setResult(r.outputs);
              if (t.saveResults && user) q.refetch();
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          };
          return (
            <div className="space-y-6">
              <div><h1 className="text-3xl font-bold">{t.title}</h1>{t.description && <p className="mt-2 text-muted-foreground">{t.description}</p>}</div>
              {!d.allowed ? (
                <Card><CardContent className="space-y-3 pt-6 text-center">
                  <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p>{t.access === 'MEMBERS' ? 'This tool is for members.' : 'This tool is included with a purchase.'}</p>
                  {!user ? <Button asChild><Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>Sign in</Link></Button> : d.product && <Button asChild variant="brand"><Link to={`/s/${store.slug}/p/${d.product.slug}`}>Get {d.product.title}</Link></Button>}
                </CardContent></Card>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <form onSubmit={run} className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        {t.fields.map((f: any) => (
                          f.type === 'checkbox' ? (
                            <Checkbox key={f.key} checked={!!inputs[f.key]} onChange={(v) => setInputs({ ...inputs, [f.key]: v })} label={f.label} description={f.help} />
                          ) : (
                            <Field key={f.key} label={f.label} hint={f.help}>
                              {f.type === 'select' ? (
                                <Select required={f.required} value={String(inputs[f.key] ?? '')} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                                  <option value="">Choose…</option>
                                  {f.options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </Select>
                              ) : (
                                <Input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} step="any" min={f.min} max={f.max} required={f.required} value={String(inputs[f.key] ?? '')} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })} />
                              )}
                            </Field>
                          )
                        ))}
                      </div>
                      {t.leadCapture && !user && (
                        <>
                          <Field label="Your email (to see your results)"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
                          <Checkbox checked={consent} onChange={setConsent} label={`Send me tips from ${store.name}`} />
                        </>
                      )}
                      <Button type="submit" variant="brand" loading={busy}>Calculate</Button>
                    </form>
                    {result && (
                      <div className="mt-6 grid gap-3 sm:grid-cols-2" aria-live="polite">
                        {t.outputs.map((o: any) => (
                          <div key={o.key} className="rounded-lg bg-primary/10 p-4">
                            <p className="text-sm text-muted-foreground">{o.label}</p>
                            <p className="text-2xl font-bold">{format(result[o.key], o, store.currency)}</p>
                          </div>
                        ))}
                        {t.resultMessage && <p className="text-sm sm:col-span-2">{t.resultMessage}</p>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              {d.history.length > 1 && t.outputs[0] && (
                <Card>
                  <CardHeader><CardTitle>Your progress</CardTitle></CardHeader>
                  <CardContent className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={d.history.map((h: any) => ({ day: date(h.createdAt), value: h.outputs[t.outputs[0].key] }))}>
                        <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} width={50} />
                        <Tooltip />
                        <Line dataKey="value" stroke="var(--brand)" strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
