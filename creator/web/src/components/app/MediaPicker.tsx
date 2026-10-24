import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Film, ImageIcon, Music, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Select } from '@/components/ui/form';
import { Spinner } from '@/components/ui/misc';
import { useWs } from '@/pages/app/workspace';

export interface MediaAsset {
  id: string;
  kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER';
  visibility: 'PUBLIC' | 'PRIVATE';
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string | null;
  createdAt: string;
}

export const kindIcon = (k: string) => ({ IMAGE: <ImageIcon />, VIDEO: <Film />, AUDIO: <Music /> } as Record<string, JSX.Element>)[k] ?? <FileText />;
export const fileSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

export function useUpload() {
  const ws = useWs();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File, visibility: 'PUBLIC' | 'PRIVATE') => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('visibility', visibility);
      form.append('file', file);
      const r = await ws.upload<{ asset: MediaAsset }>('/media', form);
      qc.invalidateQueries({ queryKey: ['media', ws.slug] });
      toast.success(`${file.name} uploaded`);
      return r.asset;
    } catch (e) {
      toast.error(errorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { upload, busy };
}

/** Upload button: public files return a URL usable for logos, covers and page images */
export function UploadButton({ visibility = 'PUBLIC', accept = 'image/*', onUploaded, label = 'Upload' }: { visibility?: 'PUBLIC' | 'PRIVATE'; accept?: string; onUploaded: (a: MediaAsset) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const { upload, busy } = useUpload();
  return (
    <>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const a = await upload(f, visibility); if (a) onUploaded(a); } e.target.value = ''; }} />
      <Button type="button" variant="outline" size="sm" loading={busy} onClick={() => ref.current?.click()}><Upload /> {label}</Button>
    </>
  );
}

export function MediaPicker({ open, onOpenChange, onPick, kind }: { open: boolean; onOpenChange: (v: boolean) => void; onPick: (a: MediaAsset) => void; kind?: MediaAsset['kind'] }) {
  const ws = useWs();
  const [filter, setFilter] = useState<string>(kind ?? '');
  const q = useQuery({ queryKey: ['media', ws.slug, filter], queryFn: () => ws.get<{ items: MediaAsset[] }>(`/media?pageSize=100${filter ? `&kind=${filter}` : ''}`), enabled: open });
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, busy } = useUpload();
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Media library" description="Private files are only delivered to people with access, through expiring links." wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-40" aria-label="Filter by type">
          <option value="">All files</option>
          <option value="VIDEO">Videos</option>
          <option value="AUDIO">Audio</option>
          <option value="DOCUMENT">Documents</option>
          <option value="IMAGE">Images</option>
        </Select>
        <input ref={fileRef} type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const a = await upload(f, 'PRIVATE'); if (a) { onPick(a); onOpenChange(false); } } e.target.value = ''; }} />
        <Button variant="outline" size="sm" loading={busy} onClick={() => fileRef.current?.click()}><Upload /> Upload new</Button>
      </div>
      {q.isPending ? <Spinner /> : (
        <div className="grid max-h-[50vh] gap-2 overflow-y-auto sm:grid-cols-2">
          {q.data?.items.length === 0 && <p className="text-sm text-muted-foreground">No files yet.</p>}
          {q.data?.items.map((a) => (
            <button key={a.id} onClick={() => { onPick(a); onOpenChange(false); }} className={cn('flex items-center gap-3 rounded-md border p-3 text-left text-sm hover:border-primary hover:bg-muted [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-muted-foreground')}>
              {kindIcon(a.kind)}
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.filename}</span><span className="text-xs text-muted-foreground">{fileSize(a.sizeBytes)} · {a.visibility.toLowerCase()}</span></span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
