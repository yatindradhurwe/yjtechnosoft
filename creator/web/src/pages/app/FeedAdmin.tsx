import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Film, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { relative } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton, Modal } from '@/components/ui/dialog';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState, PageHeader, QueryView, Table, Td } from '@/components/ui/misc';
import { useWs } from './workspace';

export default function FeedAdmin() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['feed-admin', ws.slug], queryFn: () => ws.get('/feed') });
  const products = useQuery({ queryKey: ['products-all', ws.slug], queryFn: () => ws.get('/products?pageSize=100') });
  const [settings, setSettings] = useState({ memberFeedPosts: ws.workspace.memberFeedPosts, maxVideoMb: ws.workspace.maxVideoMb });
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState({ caption: '', visibility: 'PUBLIC', productId: '' });
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setSettings({ memberFeedPosts: ws.workspace.memberFeedPosts, maxVideoMb: ws.workspace.maxVideoMb }), [ws.workspace]);

  const post = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const up = await api.upload(`/store/${ws.slug}/feed/upload`, form);
      await api.post(`/store/${ws.slug}/feed`, { mediaAssetId: up.asset.id, caption: f.caption || undefined, visibility: f.visibility, productId: f.visibility === 'PAID' ? f.productId : undefined });
      toast.success('Video posted');
      setOpen(false);
      setFile(null);
      q.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Video feed" description="Short vertical videos for your audience, with likes, comments and members-only posts." actions={<Button onClick={() => setOpen(true)}><Upload /> Post a video</Button>} />
      <Card className="mb-6">
        <CardHeader><CardTitle>Feed settings</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-6">
          <label className="flex items-center gap-2 text-sm"><Switch checked={settings.memberFeedPosts} onChange={(v) => setSettings({ ...settings, memberFeedPosts: v })} label="Members can post" /> Members can post videos</label>
          <Field label="Max video size (MB)"><Input type="number" min={5} max={2000} value={settings.maxVideoMb} onChange={(e) => setSettings({ ...settings, maxVideoMb: Number(e.target.value) })} className="w-32" /></Field>
          <Button variant="outline" onClick={async () => { try { await ws.put('/feed/settings', settings); toast.success('Saved'); } catch (e) { toast.error(errorMessage(e)); } }}>Save settings</Button>
          <Button asChild variant="link"><a href={`/s/${ws.slug}/feed`} target="_blank" rel="noreferrer">Open feed</a></Button>
        </CardContent>
      </Card>
      <QueryView q={q}>
        {(d) =>
          d.posts.length === 0 ? (
            <EmptyState icon={<Film />} title="No videos yet" description="Post short tips, behind-the-scenes clips and teasers." />
          ) : (
            <Table head={['Caption', 'Visibility', 'Views', 'Likes', 'Reports', 'Status', '']}>
              {d.posts.map((p: any) => (
                <tr key={p.id}>
                  <Td className="max-w-xs truncate">{p.caption ?? '—'}<span className="block text-xs text-muted-foreground">{relative(p.createdAt)}</span></Td>
                  <Td><Badge variant="outline">{p.visibility.toLowerCase()}</Badge></Td>
                  <Td>{p.viewCount}</Td>
                  <Td>{p._count.likes}</Td>
                  <Td>{p.openReports > 0 ? <Badge variant="warning">{p.openReports}</Badge> : 0}</Td>
                  <Td><StatusBadge status={p.status} /></Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={async () => { await ws.patch(`/feed/${p.id}`, { status: p.status === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE' }); q.refetch(); }}>{p.status === 'VISIBLE' ? 'Hide' : 'Show'}</Button>
                      <ConfirmButton title="Delete this video post?" onConfirm={async () => { await ws.patch(`/feed/${p.id}`, { deleted: true }); q.refetch(); }}>Delete</ConfirmButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )
        }
      </QueryView>
      <Modal open={open} onOpenChange={setOpen} title="Post a video" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={post} loading={busy} disabled={!file}>Post</Button></>}>
        <div className="space-y-3">
          <input ref={ref} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button variant="outline" onClick={() => ref.current?.click()}><Upload /> {file ? file.name : 'Choose video (MP4, WebM, MOV)'}</Button>
          <Field label="Caption"><Textarea value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} /></Field>
          <Field label="Who can watch">
            <Select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })}>
              <option value="PUBLIC">Everyone</option>
              <option value="MEMBERS">Community members</option>
              <option value="PAID">Buyers of a product</option>
            </Select>
          </Field>
          {f.visibility === 'PAID' && (
            <Field label="Product"><Select value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}><option value="">Choose…</option>{products.data?.items.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></Field>
          )}
          <p className="text-xs text-muted-foreground">Videos are served as uploaded. For adaptive streaming and transcoding, connect a video provider (see setup docs).</p>
        </div>
      </Modal>
    </>
  );
}
