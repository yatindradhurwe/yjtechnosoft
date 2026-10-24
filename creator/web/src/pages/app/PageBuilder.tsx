import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, History, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { PageHeader, QueryView } from '@/components/ui/misc';
import { BlockEditor } from '@/components/blocks/BlockEditor';
import { Block } from '@/components/blocks/BlockRenderer';
import { hexToHsl } from '@/lib/theme';
import { useWs } from './workspace';

export default function PageBuilder() {
  const { pageId = '' } = useParams();
  const ws = useWs();
  const q = useQuery({ queryKey: ['page', pageId], queryFn: () => ws.get(`/pages/${pageId}`) });
  const products = useQuery({ queryKey: ['store-products', ws.slug], queryFn: () => api.get(`/store/${ws.slug}`) });
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [meta, setMeta] = useState({ title: '', slug: '', seoTitle: '', seoDescription: '', primaryColor: '', font: '' });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    const p = q.data.page;
    setBlocks(p.draft.blocks ?? []);
    setMeta({ title: p.title, slug: p.slug, seoTitle: p.seo?.title ?? '', seoDescription: p.seo?.description ?? '', primaryColor: p.draft.theme?.primaryColor ?? '', font: p.draft.theme?.font ?? '' });
    setDirty(false);
  }, [q.data]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    setBusy(true);
    try {
      await ws.put(`/pages/${pageId}`, {
        title: meta.title,
        slug: meta.slug,
        draft: { blocks, theme: { ...(meta.primaryColor ? { primaryColor: meta.primaryColor } : {}), ...(meta.font ? { font: meta.font } : {}) } },
        seo: { title: meta.seoTitle || undefined, description: meta.seoDescription || undefined },
      });
      setDirty(false);
      toast.success('Draft saved');
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!(await save())) return;
    try {
      const r = await ws.post(`/pages/${pageId}/publish`);
      toast.success(`Published version ${r.version}`);
      q.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <QueryView q={q}>
      {(d) => (
        <div style={meta.primaryColor ? { ['--brand' as string]: meta.primaryColor, ['--primary' as string]: hexToHsl(meta.primaryColor) } : undefined}>
          <PageHeader
            back={<Link to=".." relative="path" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Pages</Link>}
            title={<span className="flex items-center gap-3">{meta.title} <StatusBadge status={d.page.status} />{dirty && <span className="text-xs font-normal text-warning">Unsaved changes</span>}</span>}
            actions={
              <>
                <Button variant="outline" onClick={() => setSettingsOpen(true)}>Page settings</Button>
                <Button variant="outline" onClick={() => setVersionsOpen(true)}><History /> Versions</Button>
                {d.page.status === 'PUBLISHED' && <Button asChild variant="outline"><a href={`/s/${ws.slug}/l/${meta.slug}`} target="_blank" rel="noreferrer"><ExternalLink /> Live page</a></Button>}
                {d.page.status === 'PUBLISHED' && <Button variant="outline" onClick={async () => { await ws.post(`/pages/${pageId}/unpublish`); q.refetch(); }}>Unpublish</Button>}
                <Button variant="outline" onClick={save} loading={busy}><Save /> Save draft</Button>
                <Button onClick={publish}>Publish</Button>
              </>
            }
          />
          <BlockEditor value={blocks} onChange={(b) => { setBlocks(b); setDirty(true); }} products={products.data?.products} storeSlug={ws.slug} allowed={['hero', 'features', 'text', 'image', 'video', 'testimonials', 'faq', 'pricing', 'cta', 'stats', 'logos', 'products', 'lead_form']} />
          <Modal open={settingsOpen} onOpenChange={setSettingsOpen} title="Page settings" footer={<Button onClick={() => { setDirty(true); setSettingsOpen(false); }}>Done</Button>}>
            <div className="space-y-3">
              <Field label="Title"><Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
              <Field label="URL" hint={`/s/${ws.slug}/l/${meta.slug}`}><Input value={meta.slug} onChange={(e) => setMeta({ ...meta, slug: e.target.value })} /></Field>
              <Field label="SEO title"><Input maxLength={70} value={meta.seoTitle} onChange={(e) => setMeta({ ...meta, seoTitle: e.target.value })} /></Field>
              <Field label="SEO / social description"><Textarea maxLength={170} value={meta.seoDescription} onChange={(e) => setMeta({ ...meta, seoDescription: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Accent colour"><Input type="color" value={meta.primaryColor || ws.workspace.primaryColor} onChange={(e) => setMeta({ ...meta, primaryColor: e.target.value })} className="h-10 p-1" /></Field>
                <Field label="Font"><Select value={meta.font} onChange={(e) => setMeta({ ...meta, font: e.target.value })}><option value="">Workspace default</option>{['Inter', 'Poppins', 'Lora', 'Playfair Display', 'DM Sans', 'Space Grotesk'].map((f) => <option key={f}>{f}</option>)}</Select></Field>
              </div>
            </div>
          </Modal>
          <Modal open={versionsOpen} onOpenChange={setVersionsOpen} title="Published versions" description="Restoring copies a version into your draft. Publish again to make it live.">
            <div className="space-y-2">
              {d.versions.length === 0 && <p className="text-sm text-muted-foreground">Not published yet.</p>}
              {d.versions.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span>Version {v.version} · {dateTime(v.createdAt)}{d.page.publishedVersionId === v.id && <span className="ml-2 text-success">live</span>}</span>
                  <Button size="sm" variant="outline" onClick={async () => { await ws.post(`/pages/${pageId}/versions/${v.id}/restore`); setVersionsOpen(false); q.refetch(); toast.success(`Version ${v.version} restored to draft`); }}>Restore</Button>
                </div>
              ))}
            </div>
          </Modal>
        </div>
      )}
    </QueryView>
  );
}
