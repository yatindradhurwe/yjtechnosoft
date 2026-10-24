import { FormEvent, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { TabPanel, Tabs } from '@/components/ui/menu';
import { EmptyState, PageHeader, QueryView, Table, Td } from '@/components/ui/misc';
import { useWs } from './workspace';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromTime = (t: string) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);

function Availability() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['availability', ws.slug], queryFn: () => ws.get('/consultations/availability') });
  const [tz, setTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [rules, setRules] = useState<{ weekday: number; start: string; end: string }[]>([]);
  useEffect(() => {
    if (q.data) {
      setRules(q.data.rules.map((r: any) => ({ weekday: r.weekday, start: toTime(r.startMinute), end: toTime(r.endMinute) })));
      if (q.data.rules[0]) setTz(q.data.rules[0].timezone);
    }
  }, [q.data]);
  const save = async () => {
    try {
      await ws.put('/consultations/availability', { timezone: tz, rules: rules.map((r) => ({ weekday: r.weekday, startMinute: fromTime(r.start), endMinute: r.end === '00:00' ? 1440 : fromTime(r.end) })) });
      toast.success('Availability saved');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Weekly availability</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Field label="Time zone"><Input value={tz} onChange={(e) => setTz(e.target.value)} /></Field>
        {DAYS.map((d, i) => {
          const dayRules = rules.map((r, idx) => ({ ...r, idx })).filter((r) => r.weekday === i);
          return (
            <div key={d} className="flex flex-wrap items-start gap-3 border-b pb-3">
              <span className="w-28 pt-2 text-sm font-medium">{d}</span>
              <div className="flex-1 space-y-2">
                {dayRules.length === 0 && <p className="pt-2 text-sm text-muted-foreground">Unavailable</p>}
                {dayRules.map((r) => (
                  <div key={r.idx} className="flex items-center gap-2">
                    <Input type="time" value={r.start} onChange={(e) => setRules(rules.map((x, j) => (j === r.idx ? { ...x, start: e.target.value } : x)))} className="w-32" aria-label={`${d} start`} />
                    <span>–</span>
                    <Input type="time" value={r.end} onChange={(e) => setRules(rules.map((x, j) => (j === r.idx ? { ...x, end: e.target.value } : x)))} className="w-32" aria-label={`${d} end`} />
                    <Button size="icon" variant="ghost" onClick={() => setRules(rules.filter((_, j) => j !== r.idx))} aria-label="Remove hours"><Trash2 /></Button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setRules([...rules, { weekday: i, start: '10:00', end: '13:00' }])}><Plus /> Hours</Button>
            </div>
          );
        })}
        <Button onClick={save}>Save availability</Button>
      </CardContent>
    </Card>
  );
}

function Offerings() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['offerings', ws.slug], queryFn: () => ws.get('/consultations/offerings') });
  const products = useQuery({ queryKey: ['products-consult', ws.slug], queryFn: () => ws.get('/products?pageSize=100&type=CONSULTATION') });
  const [f, setF] = useState<any>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const body = { title: f.title, description: f.description || null, durationMin: Number(f.durationMin), bufferMin: Number(f.bufferMin || 0), productId: f.productId || null, active: f.active };
    try {
      if (f.id) await ws.put(`/consultations/offerings/${f.id}`, body);
      else await ws.post('/consultations/offerings', body);
      setF(null);
      q.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div className="space-y-4">
      <Button onClick={() => setF({ title: '', description: '', durationMin: 30, bufferMin: 10, productId: '', active: true })}><Plus /> New session type</Button>
      <QueryView q={q}>
        {(d) => (
          <div className="grid gap-4 md:grid-cols-2">
            {d.offerings.map((o: any) => (
              <Card key={o.id}>
                <CardHeader className="flex-row items-start justify-between"><div><CardTitle>{o.title}</CardTitle><p className="text-sm text-muted-foreground">{o.durationMin} min · {o.bufferMin} min buffer · {o.productId ? 'Paid' : 'Free'}</p></div><StatusBadge status={o.active ? 'ACTIVE' : 'DRAFT'} /></CardHeader>
                <CardContent className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setF({ ...o, productId: o.productId ?? '', description: o.description ?? '' })}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(`${location.origin}/s/${ws.slug}/book/${o.id}`); toast.success('Booking link copied'); }}>Copy booking link</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryView>
      {f && (
        <Modal open onOpenChange={(v) => !v && setF(null)} title={f.id ? 'Edit session type' : 'New session type'}>
          <form onSubmit={save} className="space-y-3">
            <Field label="Title"><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Discovery call" /></Field>
            <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duration (min)"><Input type="number" min={10} max={480} required value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} /></Field>
              <Field label="Buffer between sessions (min)"><Input type="number" min={0} max={120} value={f.bufferMin} onChange={(e) => setF({ ...f, bufferMin: e.target.value })} /></Field>
            </div>
            <Field label="Paid session" hint="Customers buy this product first, then pick a time. Leave empty for free calls.">
              <Select value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}>
                <option value="">Free</option>
                {products.data?.items.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Bookable" /> Accepting bookings</label>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setF(null)}>Cancel</Button><Button type="submit">Save</Button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Bookings() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['bookings', ws.slug], queryFn: () => ws.get('/consultations/bookings') });
  return (
    <QueryView q={q}>
      {(d) =>
        d.bookings.length === 0 ? (
          <EmptyState icon={<Calendar />} title="No bookings yet" description="Share your booking link to get your first session." />
        ) : (
          <Table head={['When', 'Session', 'Customer', 'Status', 'Meeting link', '']}>
            {d.bookings.map((b: any) => (
              <tr key={b.id}>
                <Td className="whitespace-nowrap">{dateTime(b.startsAt)}</Td>
                <Td>{b.offering.title}</Td>
                <Td>{b.customer?.name}<span className="block text-xs text-muted-foreground">{b.customer?.email}</span></Td>
                <Td><StatusBadge status={b.status} /></Td>
                <Td><Input defaultValue={b.meetingUrl ?? ''} placeholder="https://…" className="h-8 w-48" aria-label="Meeting link" onBlur={async (e) => { if (e.target.value !== (b.meetingUrl ?? '')) { try { await ws.patch(`/consultations/bookings/${b.id}`, { meetingUrl: e.target.value || null }); toast.success('Meeting link saved'); } catch (err) { toast.error(errorMessage(err)); } } }} /></Td>
                <Td>
                  {b.status === 'CONFIRMED' && (
                    <Select value="" onChange={async (e) => { if (!e.target.value) return; try { await ws.patch(`/consultations/bookings/${b.id}`, { status: e.target.value }); q.refetch(); } catch (err) { toast.error(errorMessage(err)); } }} className="h-8 w-36" aria-label="Update status">
                      <option value="">Update…</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="NO_SHOW">No-show</option>
                      <option value="CANCELED">Cancel</option>
                    </Select>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )
      }
    </QueryView>
  );
}

export default function Consultations() {
  const [tab, setTab] = useState('bookings');
  return (
    <>
      <PageHeader title="1:1 sessions" description="Double bookings are impossible: the database rejects overlapping sessions." />
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: 'bookings', label: 'Bookings' }, { value: 'offerings', label: 'Session types' }, { value: 'availability', label: 'Availability' }]}>
        <TabPanel value="bookings"><Bookings /></TabPanel>
        <TabPanel value="offerings"><Offerings /></TabPanel>
        <TabPanel value="availability"><Availability /></TabPanel>
      </Tabs>
    </>
  );
}
