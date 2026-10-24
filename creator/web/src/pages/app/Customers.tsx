import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';
import { download, errorMessage } from '@/lib/api';
import { date, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader, Pagination, QueryView, SearchInput, Table, Td } from '@/components/ui/misc';
import { useWs } from './workspace';

export default function Customers() {
  const ws = useWs();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const list = useQuery({ queryKey: ['contacts', ws.slug, q, tag, page], queryFn: () => ws.get(`/customers?page=${page}&q=${encodeURIComponent(q)}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`) });
  const tags = useQuery({ queryKey: ['tags', ws.slug], queryFn: () => ws.get('/marketing/tags') });
  const [f, setF] = useState({ email: '', name: '', phone: '', tags: '', consentEmail: false });
  const [csv, setCsv] = useState('');
  const [consent, setConsent] = useState(false);
  const [importTag, setImportTag] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await ws.post('/marketing/contacts', { email: f.email, name: f.name || undefined, phone: f.phone || undefined, consentEmail: f.consentEmail, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean) });
      toast.success('Contact added');
      setAddOpen(false);
      list.refetch();
      tags.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const doImport = async () => {
    try {
      const r = await ws.post('/marketing/contacts/import', { csv, consentConfirmed: consent, tag: importTag || undefined });
      toast.success(`Imported ${r.imported} contacts${r.failed ? `, ${r.failed} rows skipped` : ''}`);
      if (r.errors.length) toast.message(r.errors.slice(0, 5).map((x: any) => `Row ${x.row}: ${x.error}`).join('\n'));
      setImportOpen(false);
      list.refetch();
      tags.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Customers & leads"
        description="Everyone who bought, enrolled, registered or signed up through a form."
        actions={
          <>
            <Button variant="outline" onClick={() => download(`/customers?format=csv${tag ? `&tag=${tag}` : ''}`, 'contacts.csv', ws.workspace.id).catch((e) => toast.error(errorMessage(e)))}><Download /> Export</Button>
            {ws.can('customers.write') && <Button variant="outline" onClick={() => setImportOpen(true)}><Upload /> Import CSV</Button>}
            {ws.can('customers.write') && <Button onClick={() => setAddOpen(true)}><Plus /> Add contact</Button>}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name, email or phone" />
        <Select value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }} className="sm:w-48" aria-label="Tag">
          <option value="">All tags</option>
          {tags.data?.tags.map((t: any) => <option key={t.id} value={t.name}>{t.name} ({t.contacts})</option>)}
        </Select>
      </div>
      <QueryView q={list}>
        {(d) =>
          d.total === 0 && !q && !tag ? (
            <EmptyState icon={<Users />} title="No contacts yet" description="Contacts appear automatically when people buy, enrol or fill in a form." />
          ) : (
            <>
              <Table head={['Contact', 'Tags', 'Orders', 'Lifetime value', 'Email consent', 'Added']} empty={!d.items.length}>
                {d.items.map((c: any) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <Td><Link to={c.id} className="font-medium hover:underline">{c.name ?? c.email}</Link><span className="block text-xs text-muted-foreground">{c.email}</span></Td>
                    <Td><div className="flex flex-wrap gap-1">{c.tags.map((t: string) => <Badge key={t} variant="outline">{t}</Badge>)}</div></Td>
                    <Td>{c.orders}</Td>
                    <Td>{money(c.lifetimeValue, ws.workspace.currency)}</Td>
                    <Td>{c.unsubscribedAt ? <Badge variant="destructive">Unsubscribed</Badge> : c.consentEmail ? <Badge variant="success">Yes</Badge> : <Badge variant="outline">No</Badge>}</Td>
                    <Td className="text-muted-foreground">{date(c.createdAt)}</Td>
                  </tr>
                ))}
              </Table>
              <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )
        }
      </QueryView>
      <Modal open={addOpen} onOpenChange={setAddOpen} title="Add contact">
        <form onSubmit={add} className="space-y-3">
          <Field label="Email"><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Tags" hint="Comma separated"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
          <Checkbox checked={f.consentEmail} onChange={(v) => setF({ ...f, consentEmail: v })} label="This person agreed to receive marketing emails" />
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button type="submit">Add</Button></div>
        </form>
      </Modal>
      <Modal open={importOpen} onOpenChange={setImportOpen} title="Import contacts" description="CSV with columns: email, name, phone, tags (tags separated by |). Up to 20,000 rows." wide footer={<><Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button><Button onClick={doImport} disabled={!csv}>Import</Button></>}>
        <div className="space-y-3">
          <input type="file" accept=".csv,text/csv" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setCsv(await file.text()); }} aria-label="CSV file" />
          <Textarea rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'email,name,phone,tags\nasha@example.com,Asha,9876543210,vip|yoga'} className="font-mono text-xs" />
          <Field label="Tag everyone in this import (optional)"><Input value={importTag} onChange={(e) => setImportTag(e.target.value)} /></Field>
          <Checkbox checked={consent} onChange={setConsent} label="I have these contacts' permission to send them marketing email" description="Required by email providers and data-protection law. Without it, contacts are imported but excluded from campaigns." />
        </div>
      </Modal>
    </>
  );
}
