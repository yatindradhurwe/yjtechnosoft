import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, LayoutTemplate, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { date, slugify } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmButton, Modal } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, PageHeader, QueryView, Table, Td } from '@/components/ui/misc';
import { newBlockId } from '@/components/blocks/BlockEditor';
import { useWs } from './workspace';

export default function Pages() {
  const ws = useWs();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['pages', ws.slug], queryFn: () => ws.get('/pages') });
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await ws.post('/pages', { title, slug: slugify(title) || `page-${Date.now()}`, draft: { blocks: [{ type: 'hero', id: newBlockId(), heading: title, style: { align: 'center', paddingY: 'lg' } }], theme: {} } });
      nav(r.page.id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await ws.post('/ai/generate', { kind: 'landing_page', prompt });
      const page = await ws.post('/ai/apply/landing-page', { title: title || 'AI landing page', doc: r.draft });
      toast.success(`Draft created (${r.credits} AI credits). Review it before publishing.`);
      nav(page.page.id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Landing pages" description="Sales pages, webinar sign-ups and lead magnets on your storefront." actions={<>{ws.can('ai.use') && <Button variant="outline" onClick={() => setAiOpen(true)}><Sparkles /> Generate with AI</Button>}<Button onClick={() => setOpen(true)}><Plus /> New page</Button></>} />
      <QueryView q={q}>
        {(d) =>
          d.pages.length === 0 ? (
            <EmptyState icon={<LayoutTemplate />} title="No pages yet" description="Build a page from sections: hero, benefits, testimonials, FAQ, pricing, lead forms and more." action={<Button onClick={() => setOpen(true)}><Plus /> Create a page</Button>} />
          ) : (
            <Table head={['Page', 'URL', 'Status', 'Updated', '']}>
              {d.pages.map((p: any) => (
                <tr key={p.id}>
                  <Td><Link to={p.id} className="font-medium hover:underline">{p.title}</Link></Td>
                  <Td className="text-muted-foreground">/s/{ws.slug}/l/{p.slug}</Td>
                  <Td><StatusBadge status={p.status} /></Td>
                  <Td className="text-muted-foreground">{date(p.updatedAt)}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {p.status === 'PUBLISHED' && <Button asChild size="sm" variant="ghost"><a href={`/s/${ws.slug}/l/${p.slug}`} target="_blank" rel="noreferrer"><ExternalLink /> View</a></Button>}
                      <Button size="sm" variant="ghost" onClick={async () => { const r = await ws.post(`/pages/${p.id}/duplicate`); nav(r.page.id); }}>Duplicate</Button>
                      <ConfirmButton title={`Delete "${p.title}"?`} onConfirm={async () => { await ws.del(`/pages/${p.id}`); q.refetch(); }}>Delete</ConfirmButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )
        }
      </QueryView>
      <Modal open={open} onOpenChange={setOpen} title="New landing page">
        <form onSubmit={create} className="space-y-3">
          <Field label="Page title"><Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Free webinar: Yoga for desk workers" /></Field>
          <div className="flex justify-end"><Button type="submit">Create</Button></div>
        </form>
      </Modal>
      <Modal open={aiOpen} onOpenChange={setAiOpen} title="Generate a landing page" description="The AI drafts sections from approved components only. Nothing is published until you review and publish it.">
        <form onSubmit={generate} className="space-y-3">
          <Field label="Page title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Describe the page"><Textarea required minLength={5} rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A landing page for my six-week fitness course for busy mothers. Premium dark theme, emerald accent, include FAQ and a lead form." /></Field>
          <div className="flex justify-end"><Button type="submit" loading={busy}><Sparkles /> Generate draft</Button></div>
        </form>
      </Modal>
    </>
  );
}
