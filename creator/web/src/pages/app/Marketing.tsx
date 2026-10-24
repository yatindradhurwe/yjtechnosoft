import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Clock, Filter, Mail, MessageCircle, Plus, Send, Tag, Trash2, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton, Modal } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { TabPanel, Tabs } from '@/components/ui/menu';
import { EmptyState, Pagination, PageHeader, QueryView, Table, Td } from '@/components/ui/misc';
import { useWs } from './workspace';

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

function Campaigns() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['campaigns', ws.slug], queryFn: () => ws.get('/marketing/campaigns') });
  const tags = useQuery({ queryKey: ['tags', ws.slug], queryFn: () => ws.get('/marketing/tags') });
  const [f, setF] = useState<any>(null);
  const [scheduling, setScheduling] = useState<any>(null);
  const [sendAt, setSendAt] = useState('');
  const [recipients, setRecipients] = useState<number | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const body = { channel: f.channel, name: f.name, subject: f.subject || undefined, body: f.body, audience: { tags: f.tags } };
    try {
      if (f.id) await ws.put(`/marketing/campaigns/${f.id}`, body);
      else await ws.post('/marketing/campaigns', body);
      setF(null);
      q.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const openSchedule = async (c: any) => {
    setScheduling(c);
    setSendAt('');
    setRecipients(null);
    try {
      setRecipients((await ws.get(`/marketing/campaigns/${c.id}/audience`)).recipients);
    } catch {
      setRecipients(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={() => setF({ channel: 'EMAIL', name: '', subject: '', body: 'Hi {{first_name}},\n\n', tags: [] })}><Mail /> Email campaign</Button>
        <Button variant="outline" onClick={() => setF({ channel: 'WHATSAPP', name: '', subject: 'en', body: '', tags: [] })}><MessageCircle /> WhatsApp broadcast</Button>
      </div>
      <QueryView q={q}>
        {(d) =>
          d.campaigns.length === 0 ? (
            <EmptyState icon={<Send />} title="No campaigns yet" description="Campaigns go only to contacts who gave consent and have not unsubscribed." />
          ) : (
            <Table head={['Campaign', 'Channel', 'Status', 'Delivered', 'Scheduled / sent', '']}>
              {d.campaigns.map((c: any) => (
                <tr key={c.id}>
                  <Td className="font-medium">{c.name}<span className="block text-xs text-muted-foreground">{c.audience?.tags?.length ? `Tags: ${c.audience.tags.join(', ')}` : 'All consenting contacts'}</span></Td>
                  <Td><Badge variant="outline">{c.channel.toLowerCase()}</Badge></Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td className="text-xs">{c.stats.sent ?? 0} sent{c.stats.failed ? ` · ${c.stats.failed} failed` : ''}{c.stats.skipped ? ` · ${c.stats.skipped} skipped` : ''}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{dateTime(c.sentAt ?? c.scheduledAt)}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {c.status === 'DRAFT' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setF({ ...c, tags: c.audience?.tags ?? [] })}>Edit</Button>
                          <Button size="sm" onClick={() => openSchedule(c)}><Send /> Send</Button>
                        </>
                      )}
                      {c.status === 'SCHEDULED' && <ConfirmButton title="Cancel this campaign?" onConfirm={async () => { await ws.post(`/marketing/campaigns/${c.id}/cancel`); q.refetch(); }}>Cancel</ConfirmButton>}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )
        }
      </QueryView>
      {f && (
        <Modal open onOpenChange={(v) => !v && setF(null)} title={`${f.id ? 'Edit' : 'New'} ${f.channel === 'EMAIL' ? 'email campaign' : 'WhatsApp broadcast'}`} wide>
          <form onSubmit={save} className="space-y-3">
            <Field label="Internal name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            {f.channel === 'EMAIL' ? (
              <>
                <Field label="Subject"><Input required value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
                <Field label="Message" hint="Plain text. Merge fields: {{first_name}} {{name}} {{email}} {{store_url}}. An unsubscribe link is added automatically."><Textarea required rows={10} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
              </>
            ) : (
              <>
                <p className="rounded-md bg-muted p-3 text-sm">WhatsApp only allows broadcasts using templates approved by Meta. Create the template in WhatsApp Manager, then enter its name here. Messages go only to contacts with a phone number and WhatsApp consent.</p>
                <div className="grid grid-cols-[1fr_140px] gap-3">
                  <Field label="Approved template name"><Input required pattern="[a-z0-9_]+" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="course_launch" /></Field>
                  <Field label="Language code"><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="en" /></Field>
                </div>
              </>
            )}
            <Field label="Audience" hint="No tags selected = all consenting contacts">
              <div className="flex flex-wrap gap-2 rounded-md border p-2">
                {(tags.data?.tags ?? []).length === 0 && <span className="text-sm text-muted-foreground">No tags yet</span>}
                {tags.data?.tags.map((t: any) => (
                  <label key={t.id} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={f.tags.includes(t.name)} onChange={(e) => setF({ ...f, tags: e.target.checked ? [...f.tags, t.name] : f.tags.filter((x: string) => x !== t.name) })} />
                    {t.name} <span className="text-muted-foreground">({t.contacts})</span>
                  </label>
                ))}
              </div>
            </Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setF(null)}>Cancel</Button><Button type="submit">Save draft</Button></div>
          </form>
        </Modal>
      )}
      {scheduling && (
        <Modal open onOpenChange={() => setScheduling(null)} title={`Send "${scheduling.name}"`} description={recipients === null ? 'Counting recipients…' : `${recipients} contacts will receive this.`} footer={
          <>
            <Button variant="outline" onClick={() => setScheduling(null)}>Cancel</Button>
            <Button disabled={!recipients} onClick={async () => { try { await ws.post(`/marketing/campaigns/${scheduling.id}/schedule`, { sendAt: sendAt ? new Date(sendAt).toISOString() : undefined }); toast.success(sendAt ? 'Campaign scheduled' : 'Sending now'); setScheduling(null); q.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>{sendAt ? 'Schedule' : 'Send now'}</Button>
          </>
        }>
          <Field label="Send later (optional)"><Input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Automation builder
// ---------------------------------------------------------------------------

const TRIGGERS: Record<string, string> = {
  'order.paid': 'Someone buys a product',
  'lead.created': 'Someone fills in a lead form',
  'tag.added': 'A tag is added to a contact',
  'checkout.abandoned': 'Checkout abandoned (1 hour)',
  'learner.inactive': 'Learner inactive for 7 days',
  'workshop.registered': 'Someone registers for a workshop',
};

const STEP_META: Record<string, { label: string; icon: JSX.Element }> = {
  delay: { label: 'Wait', icon: <Clock className="h-4 w-4" /> },
  send_email: { label: 'Send email', icon: <Mail className="h-4 w-4" /> },
  send_whatsapp: { label: 'Send WhatsApp template', icon: <MessageCircle className="h-4 w-4" /> },
  add_tag: { label: 'Add tag', icon: <Tag className="h-4 w-4" /> },
  remove_tag: { label: 'Remove tag', icon: <Tag className="h-4 w-4" /> },
  condition: { label: 'Continue only if…', icon: <Filter className="h-4 w-4" /> },
};

const newStep = (type: string): any =>
  ({
    delay: { type, minutes: 1440 },
    send_email: { type, subject: 'Welcome, {{first_name}}!', body: 'Hi {{first_name}},\n\n' },
    send_whatsapp: { type, template: '', language: 'en', params: [] },
    add_tag: { type, tag: '' },
    remove_tag: { type, tag: '' },
    condition: { type, check: 'not_purchased', value: '' },
  })[type];

function StepEditor({ step, onChange, products }: { step: any; onChange: (s: any) => void; products: any[] }) {
  switch (step.type) {
    case 'delay':
      return (
        <div className="flex items-center gap-2">
          <Input type="number" min={1} value={step.minutes >= 1440 ? step.minutes / 1440 : step.minutes >= 60 ? step.minutes / 60 : step.minutes} onChange={(e) => onChange({ ...step, minutes: Math.max(1, Math.round(Number(e.target.value) * (step.minutes >= 1440 ? 1440 : step.minutes >= 60 ? 60 : 1))) })} className="w-24" aria-label="Wait duration" />
          <Select value={step.minutes >= 1440 ? '1440' : step.minutes >= 60 ? '60' : '1'} onChange={(e) => onChange({ ...step, minutes: Number(e.target.value) })} className="w-32" aria-label="Unit">
            <option value="1">minutes</option>
            <option value="60">hours</option>
            <option value="1440">days</option>
          </Select>
        </div>
      );
    case 'send_email':
      return (
        <div className="space-y-2">
          <Input value={step.subject} onChange={(e) => onChange({ ...step, subject: e.target.value })} placeholder="Subject" aria-label="Email subject" />
          <Textarea rows={4} value={step.body} onChange={(e) => onChange({ ...step, body: e.target.value })} aria-label="Email body" />
        </div>
      );
    case 'send_whatsapp':
      return (
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <Input value={step.template} onChange={(e) => onChange({ ...step, template: e.target.value })} placeholder="approved_template_name" aria-label="Template" />
          <Input value={step.language} onChange={(e) => onChange({ ...step, language: e.target.value })} aria-label="Language" />
        </div>
      );
    case 'add_tag':
    case 'remove_tag':
      return <Input value={step.tag} onChange={(e) => onChange({ ...step, tag: e.target.value })} placeholder="tag name" aria-label="Tag" />;
    case 'condition':
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={step.check} onChange={(e) => onChange({ ...step, check: e.target.value, value: '' })} aria-label="Condition">
            <option value="has_tag">Contact has tag</option>
            <option value="not_has_tag">Contact does not have tag</option>
            <option value="has_purchased">Has bought product</option>
            <option value="not_purchased">Has not bought product</option>
          </Select>
          {step.check.includes('tag') ? (
            <Input value={step.value} onChange={(e) => onChange({ ...step, value: e.target.value })} placeholder="tag" aria-label="Tag" />
          ) : (
            <Select value={step.value} onChange={(e) => onChange({ ...step, value: e.target.value })} aria-label="Product">
              <option value="">Choose product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </Select>
          )}
        </div>
      );
    default:
      return null;
  }
}

function Automations() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['workflows', ws.slug], queryFn: () => ws.get('/marketing/workflows') });
  const products = useQuery({ queryKey: ['products-all', ws.slug], queryFn: () => ws.get('/products?pageSize=100') });
  const [f, setF] = useState<any>(null);
  const [history, setHistory] = useState<string | null>(null);
  const executions = useQuery({ queryKey: ['executions', history], queryFn: () => ws.get(`/marketing/workflows/${history}/executions`), enabled: !!history });
  const plist = products.data?.items ?? [];

  const save = async (status?: string) => {
    const body = { name: f.name, trigger: Object.fromEntries(Object.entries(f.trigger).filter(([, v]) => v)), steps: f.steps, ...(status ? { status } : {}) };
    try {
      if (f.id) await ws.put(`/marketing/workflows/${f.id}`, body);
      else await ws.post('/marketing/workflows', body);
      toast.success('Automation saved');
      setF(null);
      q.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const moveStep = (i: number, d: number) => {
    const steps = [...f.steps];
    const [s] = steps.splice(i, 1);
    steps.splice(i + d, 0, s);
    setF({ ...f, steps });
  };

  return (
    <div className="space-y-4">
      <Button onClick={() => setF({ name: '', trigger: { event: 'order.paid' }, steps: [newStep('send_email')] })}><Plus /> New automation</Button>
      <QueryView q={q}>
        {(d) =>
          d.workflows.length === 0 ? (
            <EmptyState icon={<Workflow />} title="No automations yet" description="Welcome buyers, recover abandoned checkouts and re-engage inactive learners automatically." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {d.workflows.map((w: any) => (
                <Card key={w.id}>
                  <CardHeader className="flex-row items-start justify-between">
                    <div><CardTitle>{w.name}</CardTitle><p className="text-sm text-muted-foreground">When: {TRIGGERS[w.trigger.event]} · {w.steps.length} steps</p></div>
                    <StatusBadge status={w.status} />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">Runs: {Object.entries(w.executions).map(([k, v]) => `${v} ${k}`).join(' · ') || 'none yet'}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setF({ ...w })}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => setHistory(w.id)}>History</Button>
                      <Button size="sm" variant={w.status === 'ACTIVE' ? 'outline' : 'default'} onClick={async () => { try { await ws.put(`/marketing/workflows/${w.id}`, { name: w.name, trigger: w.trigger, steps: w.steps, status: w.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }); q.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>{w.status === 'ACTIVE' ? 'Pause' : 'Activate'}</Button>
                      <ConfirmButton title="Delete automation?" onConfirm={async () => { await ws.del(`/marketing/workflows/${w.id}`); q.refetch(); }}>Delete</ConfirmButton>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        }
      </QueryView>
      {f && (
        <Modal open onOpenChange={(v) => !v && setF(null)} title={f.id ? 'Edit automation' : 'New automation'} wide footer={<><Button variant="outline" onClick={() => setF(null)}>Cancel</Button><Button variant="outline" onClick={() => save()}>Save</Button><Button onClick={() => save('ACTIVE')}>Save & activate</Button></>}>
          <div className="space-y-4">
            <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Welcome new buyers" /></Field>
            <div className="rounded-lg border-2 border-dashed border-primary/40 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">Trigger</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={f.trigger.event} onChange={(e) => setF({ ...f, trigger: { event: e.target.value } })} aria-label="Trigger">
                  {Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                {['order.paid', 'checkout.abandoned'].includes(f.trigger.event) && (
                  <Select value={f.trigger.productId ?? ''} onChange={(e) => setF({ ...f, trigger: { ...f.trigger, productId: e.target.value || undefined } })} aria-label="Product filter">
                    <option value="">Any product</option>
                    {plist.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </Select>
                )}
                {f.trigger.event === 'tag.added' && <Input value={f.trigger.tag ?? ''} onChange={(e) => setF({ ...f, trigger: { ...f.trigger, tag: e.target.value } })} placeholder="tag name" aria-label="Tag" />}
              </div>
            </div>
            <ol className="space-y-2">
              {f.steps.map((s: any, i: number) => (
                <li key={i} className="relative rounded-lg border bg-card p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs">{i + 1}</span>
                    {STEP_META[s.type].icon} {STEP_META[s.type].label}
                    <div className="ml-auto flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label="Move step up"><ArrowUp /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === f.steps.length - 1} onClick={() => moveStep(i, 1)} aria-label="Move step down"><ArrowDown /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setF({ ...f, steps: f.steps.filter((_: any, j: number) => j !== i) })} aria-label="Remove step"><Trash2 /></Button>
                    </div>
                  </div>
                  <StepEditor step={s} products={plist} onChange={(ns) => setF({ ...f, steps: f.steps.map((x: any, j: number) => (j === i ? ns : x)) })} />
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              {Object.entries(STEP_META).map(([t, m]) => <Button key={t} size="sm" variant="outline" onClick={() => setF({ ...f, steps: [...f.steps, newStep(t)] })}>{m.icon} {m.label}</Button>)}
            </div>
          </div>
        </Modal>
      )}
      {history && (
        <Modal open onOpenChange={() => setHistory(null)} title="Execution history" wide>
          <QueryView q={executions}>
            {(d) => (
              <Table head={['Contact', 'Status', 'Step', 'Last activity', 'Error']} empty={!d.items.length}>
                {d.items.map((e: any) => (
                  <tr key={e.id}>
                    <Td>{e.contact?.name ?? e.contact?.email}</Td>
                    <Td><StatusBadge status={e.status} /></Td>
                    <Td>{e.stepIndex + 1}{e.nextRunAt && e.status === 'WAITING' && <span className="block text-xs text-muted-foreground">next {dateTime(e.nextRunAt)}</span>}</Td>
                    <Td className="text-xs">{(e.history as any[]).slice(-1).map((h) => `${h.type} ${h.status}`)}</Td>
                    <Td className="max-w-xs truncate text-xs text-destructive">{e.lastError}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </QueryView>
        </Modal>
      )}
    </div>
  );
}

function Logs() {
  const ws = useWs();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['message-logs', ws.slug, page, status], queryFn: () => ws.get(`/marketing/messages?page=${page}${status ? `&status=${status}` : ''}`) });
  return (
    <>
      <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="mb-3 w-40" aria-label="Status">
        <option value="">All</option>
        {['SENT', 'FAILED', 'SKIPPED'].map((s) => <option key={s}>{s}</option>)}
      </Select>
      <QueryView q={q}>
        {(d) => (
          <>
            <Table head={['When', 'Channel', 'To', 'Subject / template', 'Status', 'Error']} empty={!d.items.length}>
              {d.items.map((m: any) => (
                <tr key={m.id}>
                  <Td className="whitespace-nowrap text-muted-foreground">{dateTime(m.createdAt)}</Td>
                  <Td>{m.channel.toLowerCase()}</Td>
                  <Td>{m.to}</Td>
                  <Td className="max-w-xs truncate">{m.subject}</Td>
                  <Td><StatusBadge status={m.status} /></Td>
                  <Td className="max-w-xs truncate text-xs text-muted-foreground">{m.error}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryView>
    </>
  );
}

function Suppressions() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['suppressions', ws.slug], queryFn: () => ws.get('/marketing/suppressions') });
  const [address, setAddress] = useState('');
  const [channel, setChannel] = useState('EMAIL');
  return (
    <div className="space-y-4">
      <form className="flex max-w-xl gap-2" onSubmit={async (e) => { e.preventDefault(); try { await ws.post('/marketing/suppressions', { channel, address }); setAddress(''); q.refetch(); } catch (err) { toast.error(errorMessage(err)); } }}>
        <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-32" aria-label="Channel"><option value="EMAIL">Email</option><option value="WHATSAPP">WhatsApp</option></Select>
        <Input required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="address to never message" aria-label="Address" />
        <Button type="submit">Suppress</Button>
      </form>
      <QueryView q={q}>
        {(d) => (
          <Table head={['Channel', 'Address', 'Reason', 'Since']} empty={!d.items.length}>
            {d.items.map((s: any) => <tr key={`${s.channel}${s.address}`}><Td>{s.channel.toLowerCase()}</Td><Td>{s.address}</Td><Td>{s.reason ?? '—'}</Td><Td>{dateTime(s.createdAt)}</Td></tr>)}
          </Table>
        )}
      </QueryView>
    </div>
  );
}

function WhatsappSettings() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['wa', ws.slug], queryFn: () => ws.get('/marketing/whatsapp') });
  const [f, setF] = useState<{ phoneNumberId: string; businessAccountId: string; accessToken: string; enabled: boolean } | null>(null);
  const v = f ?? { phoneNumberId: String(q.data?.config.phoneNumberId ?? ''), businessAccountId: String(q.data?.config.businessAccountId ?? ''), accessToken: '', enabled: q.data?.enabled ?? true };
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>WhatsApp Business Platform</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Connect your own number through Meta's official Cloud API. Create a system-user access token in Meta Business Settings and copy the phone number ID from the WhatsApp developer console. Status: {q.data?.configured ? (q.data.enabled ? 'connected' : 'disabled') : 'not connected'}.</p>
        <Field label="Phone number ID"><Input value={v.phoneNumberId} onChange={(e) => setF({ ...v, phoneNumberId: e.target.value })} /></Field>
        <Field label="WhatsApp Business account ID (optional)"><Input value={v.businessAccountId} onChange={(e) => setF({ ...v, businessAccountId: e.target.value })} /></Field>
        <Field label="Access token" hint={q.data?.secretsSet?.accessToken ? 'A token is saved. Leave blank to keep it.' : undefined}><Input type="password" value={v.accessToken} onChange={(e) => setF({ ...v, accessToken: e.target.value })} autoComplete="off" /></Field>
        <Button onClick={async () => { try { await ws.put('/marketing/whatsapp', { ...v, businessAccountId: v.businessAccountId || undefined, accessToken: v.accessToken || undefined }); toast.success('WhatsApp settings saved'); setF(null); q.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Save</Button>
      </CardContent>
    </Card>
  );
}

export default function Marketing() {
  const ws = useWs();
  const [tab, setTab] = useState('campaigns');
  const tabs = [
    { value: 'campaigns', label: 'Campaigns' },
    { value: 'automations', label: 'Automations' },
    { value: 'logs', label: 'Delivery log' },
    { value: 'suppressions', label: 'Suppression list' },
    ...(ws.can('workspace.manage') ? [{ value: 'whatsapp', label: 'WhatsApp' }] : []),
  ];
  return (
    <>
      <PageHeader title="Email & WhatsApp" description="Every message respects consent, unsubscribes and the suppression list, and is logged." />
      <Tabs value={tab} onValueChange={setTab} tabs={tabs}>
        <TabPanel value="campaigns"><Campaigns /></TabPanel>
        <TabPanel value="automations"><Automations /></TabPanel>
        <TabPanel value="logs"><Logs /></TabPanel>
        <TabPanel value="suppressions"><Suppressions /></TabPanel>
        <TabPanel value="whatsapp"><WhatsappSettings /></TabPanel>
      </Tabs>
    </>
  );
}
