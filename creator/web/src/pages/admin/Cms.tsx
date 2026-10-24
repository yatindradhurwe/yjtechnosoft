import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { date } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton, Modal } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { TabPanel, Tabs } from '@/components/ui/menu';
import { PageHeader, QueryView, Table, Td } from '@/components/ui/misc';
import { BlockEditor, newBlockId } from '@/components/blocks/BlockEditor';
import { Block } from '@/components/blocks/BlockRenderer';

function PagesList() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['admin-cms'], queryFn: () => api.get('/admin/cms/pages') });
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  return (
    <>
      <div className="mb-4"><Button onClick={() => setOpen(true)}><Plus /> New page</Button></div>
      <QueryView q={q}>
        {(d) => (
          <Table head={['Page', 'URL', 'In menu', 'Status', 'Updated', '']}>
            {d.pages.map((p: any) => (
              <tr key={p.id}>
                <Td><Link to={p.id} className="font-medium hover:underline">{p.title}</Link></Td>
                <Td className="text-muted-foreground">/{p.slug === 'home' ? '' : p.slug}</Td>
                <Td>{p.showInNav ? 'Yes' : 'No'}</Td>
                <Td><StatusBadge status={p.status} /></Td>
                <Td className="text-muted-foreground">{date(p.updatedAt)}</Td>
                <Td><Button asChild size="sm" variant="ghost"><a href={`/${p.slug === 'home' ? '' : p.slug}`} target="_blank" rel="noreferrer"><ExternalLink /></a></Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </QueryView>
      <Modal open={open} onOpenChange={setOpen} title="New page">
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); try { const r = await api.post('/admin/cms/pages', { slug, title, status: 'DRAFT', sections: [{ type: 'hero', id: newBlockId(), heading: title }], seo: {} }); nav(r.page.id); } catch (err) { toast.error(errorMessage(err)); } }}>
          <Field label="Title"><Input required value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="URL path" hint="e.g. features/communities"><Input required value={slug} onChange={(e) => setSlug(e.target.value)} /></Field>
          <div className="flex justify-end"><Button type="submit">Create</Button></div>
        </form>
      </Modal>
    </>
  );
}

function PageEditor() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['admin-cms-page', id], queryFn: () => api.get(`/admin/cms/pages/${id}`) });
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.get('/public/plans') });
  const [page, setPage] = useState<any>(null);
  useEffect(() => {
    if (q.data) setPage(q.data.page);
  }, [q.data]);
  const save = async (status?: string) => {
    try {
      const r = await api.put(`/admin/cms/pages/${id}`, { slug: page.slug, title: page.title, status: status ?? page.status, sections: page.sections, seo: page.seo ?? {}, showInNav: page.showInNav, navOrder: page.navOrder });
      setPage(r.page);
      toast.success(status === 'PUBLISHED' ? 'Published' : 'Saved');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  if (!page) return <QueryView q={q}>{() => null}</QueryView>;
  return (
    <div style={{ ['--brand' as string]: 'hsl(var(--primary))' }}>
      <PageHeader
        back={<Link to=".." relative="path" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Pages</Link>}
        title={<span className="flex items-center gap-3">{page.title} <StatusBadge status={page.status} /></span>}
        actions={
          <>
            <ConfirmButton title="Delete this page?" onConfirm={async () => { await api.del(`/admin/cms/pages/${id}`); nav('..', { relative: 'path' }); }}>Delete</ConfirmButton>
            <Button variant="outline" onClick={() => save()}>Save</Button>
            {page.status === 'PUBLISHED' ? <Button variant="outline" onClick={() => save('DRAFT')}>Unpublish</Button> : <Button onClick={() => save('PUBLISHED')}>Publish</Button>}
          </>
        }
      />
      <Card className="mb-6">
        <CardContent className="grid gap-3 pt-5 md:grid-cols-4">
          <Field label="Title"><Input value={page.title} onChange={(e) => setPage({ ...page, title: e.target.value })} /></Field>
          <Field label="URL path"><Input value={page.slug} onChange={(e) => setPage({ ...page, slug: e.target.value })} /></Field>
          <Field label="SEO title"><Input value={page.seo?.title ?? ''} onChange={(e) => setPage({ ...page, seo: { ...page.seo, title: e.target.value } })} /></Field>
          <Field label="SEO description"><Input value={page.seo?.description ?? ''} onChange={(e) => setPage({ ...page, seo: { ...page.seo, description: e.target.value } })} /></Field>
          <Checkbox checked={page.showInNav} onChange={(v) => setPage({ ...page, showInNav: v })} label="Show in main menu" />
          <Field label="Menu order"><Input type="number" value={page.navOrder} onChange={(e) => setPage({ ...page, navOrder: Number(e.target.value) })} /></Field>
        </CardContent>
      </Card>
      <BlockEditor value={page.sections as Block[]} onChange={(sections) => setPage({ ...page, sections })} plans={plans.data?.plans} allowed={['hero', 'features', 'text', 'image', 'video', 'testimonials', 'faq', 'pricing', 'cta', 'stats', 'logos']} />
    </div>
  );
}

function SiteSettings() {
  const q = useQuery({ queryKey: ['admin-site'], queryFn: () => api.get('/admin/cms/settings') });
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    if (q.data) setS(q.data.settings ?? { brandName: 'Creator Studio', footerLinks: [], social: {}, analytics: {} });
  }, [q.data]);
  if (!s) return <QueryView q={q}>{() => null}</QueryView>;
  return (
    <Card className="max-w-3xl">
      <CardHeader><CardTitle>Global site settings</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Brand name"><Input value={s.brandName} onChange={(e) => setS({ ...s, brandName: e.target.value })} /></Field>
          <Field label="Tagline"><Input value={s.tagline ?? ''} onChange={(e) => setS({ ...s, tagline: e.target.value })} /></Field>
          <Field label="Logo URL"><Input value={s.logoUrl ?? ''} onChange={(e) => setS({ ...s, logoUrl: e.target.value })} /></Field>
          <Field label="Contact email"><Input value={s.contactEmail ?? ''} onChange={(e) => setS({ ...s, contactEmail: e.target.value })} /></Field>
        </div>
        <Field label="Announcement bar"><Input value={s.announcement ?? ''} onChange={(e) => setS({ ...s, announcement: e.target.value })} /></Field>
        <Field label="Footer text"><Input value={s.footerText ?? ''} onChange={(e) => setS({ ...s, footerText: e.target.value })} /></Field>
        <Field label="Footer links (Label|/path per line)"><Textarea rows={4} value={(s.footerLinks ?? []).map((l: any) => `${l.label}|${l.href}`).join('\n')} onChange={(e) => setS({ ...s, footerLinks: e.target.value.split('\n').filter((x) => x.includes('|')).map((l) => ({ label: l.split('|')[0].trim(), href: l.split('|')[1].trim() })) })} /></Field>
        <Field label="Social links (network|https://… per line)"><Textarea rows={3} value={Object.entries(s.social ?? {}).map(([k, v]) => `${k}|${v}`).join('\n')} onChange={(e) => setS({ ...s, social: Object.fromEntries(e.target.value.split('\n').filter((x) => x.includes('|')).map((l) => [l.split('|')[0].trim(), l.split('|').slice(1).join('|').trim()])) })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Google Analytics ID"><Input value={s.analytics?.gaMeasurementId ?? ''} onChange={(e) => setS({ ...s, analytics: { ...s.analytics, gaMeasurementId: e.target.value || undefined } })} placeholder="G-XXXXXXX" /></Field>
          <Field label="Plausible domain"><Input value={s.analytics?.plausibleDomain ?? ''} onChange={(e) => setS({ ...s, analytics: { ...s.analytics, plausibleDomain: e.target.value || undefined } })} /></Field>
        </div>
        <Button onClick={async () => { try { await api.put('/admin/cms/settings', s); toast.success('Saved'); } catch (e) { toast.error(errorMessage(e)); } }}>Save settings</Button>
      </CardContent>
    </Card>
  );
}

function Home() {
  const [tab, setTab] = useState('pages');
  return (
    <>
      <PageHeader title="Website CMS" description="Edit the marketing website without touching code." />
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: 'pages', label: 'Pages' }, { value: 'settings', label: 'Navigation, footer & analytics' }]}>
        <TabPanel value="pages"><PagesList /></TabPanel>
        <TabPanel value="settings"><SiteSettings /></TabPanel>
      </Tabs>
    </>
  );
}

export default function Cms() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path=":id" element={<PageEditor />} />
    </Routes>
  );
}
