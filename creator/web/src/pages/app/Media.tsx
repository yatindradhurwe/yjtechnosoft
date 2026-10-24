import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Eye, Image, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { date } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/ui/dialog';
import { Select } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader, Pagination, QueryView, SearchInput, Table, Td } from '@/components/ui/misc';
import { fileSize, kindIcon, useUpload, MediaAsset } from '@/components/app/MediaPicker';
import { useWs } from './workspace';

export default function Media() {
  const ws = useWs();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
  const ref = useRef<HTMLInputElement>(null);
  const { upload, busy } = useUpload();
  const list = useQuery({ queryKey: ['media', ws.slug, q, kind, page], queryFn: () => ws.get(`/media?page=${page}&q=${encodeURIComponent(q)}${kind ? `&kind=${kind}` : ''}`) });
  const limitMb = ws.plan?.limits.storageMb as number | null | undefined;

  return (
    <>
      <PageHeader
        title="Media library"
        description="Private files (lessons, downloads) are only served through expiring links to people with access. Public files are for images on your pages."
        actions={
          ws.can('media.write') && (
            <>
              <Select value={visibility} onChange={(e) => setVisibility(e.target.value as 'PRIVATE' | 'PUBLIC')} className="w-36" aria-label="Visibility for new uploads">
                <option value="PRIVATE">Private</option>
                <option value="PUBLIC">Public</option>
              </Select>
              <input ref={ref} type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { await upload(f, visibility); list.refetch(); } e.target.value = ''; }} />
              <Button loading={busy} onClick={() => ref.current?.click()}><Upload /> Upload</Button>
            </>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search files" />
        <Select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} className="sm:w-40" aria-label="Type">
          <option value="">All types</option>
          {['VIDEO', 'AUDIO', 'DOCUMENT', 'IMAGE', 'OTHER'].map((k) => <option key={k} value={k}>{k.toLowerCase()}</option>)}
        </Select>
        {list.data && <span className="text-sm text-muted-foreground sm:ml-auto">Storage used: {fileSize(list.data.usedBytes)}{limitMb ? ` of ${limitMb >= 1024 ? `${limitMb / 1024} GB` : `${limitMb} MB`}` : ''}</span>}
      </div>
      <QueryView q={list}>
        {(d) =>
          d.total === 0 && !q && !kind ? (
            <EmptyState icon={<Image />} title="No files yet" description="Upload videos, PDFs, audio and images for your lessons and products." />
          ) : (
            <>
              <Table head={['File', 'Type', 'Size', 'Visibility', 'Uploaded', '']} empty={!d.items.length}>
                {d.items.map((a: MediaAsset) => (
                  <tr key={a.id}>
                    <Td><span className="flex items-center gap-2 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted-foreground">{kindIcon(a.kind)}<span className="max-w-xs truncate">{a.filename}</span></span></Td>
                    <Td className="text-muted-foreground">{a.kind.toLowerCase()}</Td>
                    <Td>{fileSize(a.sizeBytes)}</Td>
                    <Td><Badge variant={a.visibility === 'PUBLIC' ? 'default' : 'secondary'}>{a.visibility.toLowerCase()}</Badge></Td>
                    <Td className="text-muted-foreground">{date(a.createdAt)}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        {a.url ? (
                          <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(location.origin + a.url); toast.success('URL copied'); }}><Copy /> URL</Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={async () => { try { const r = await ws.get(`/media/${a.id}/signed-url`); window.open(r.url, '_blank'); } catch (e) { toast.error(errorMessage(e)); } }}><Eye /> Preview</Button>
                        )}
                        {ws.can('media.write') && <ConfirmButton title={`Delete ${a.filename}?`} description="Files used by lessons cannot be deleted." onConfirm={async () => { try { await ws.del(`/media/${a.id}`); list.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Delete</ConfirmButton>}
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
              <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )
        }
      </QueryView>
    </>
  );
}
