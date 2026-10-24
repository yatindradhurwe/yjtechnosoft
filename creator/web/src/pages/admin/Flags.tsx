import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ConfirmButton, Modal } from '@/components/ui/dialog';
import { Field, Input, Switch, Textarea } from '@/components/ui/form';
import { PageHeader, QueryView, Table, Td } from '@/components/ui/misc';

export default function Flags() {
  const q = useQuery({ queryKey: ['admin-flags'], queryFn: () => api.get('/admin/feature-flags') });
  const [f, setF] = useState<any>(null);
  const save = async (e?: FormEvent, flag = f) => {
    e?.preventDefault();
    try {
      await api.put(`/admin/feature-flags/${flag.key}`, { description: flag.description || null, enabled: flag.enabled, rolloutPercent: Number(flag.rolloutPercent), tenantAllowlist: (typeof flag.tenantAllowlist === 'string' ? flag.tenantAllowlist.split(/[\s,]+/) : flag.tenantAllowlist).filter(Boolean) });
      setF(null);
      q.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <>
      <PageHeader title="Feature flags" description="Roll features out to a percentage of workspaces or an allowlist." actions={<Button onClick={() => setF({ key: '', description: '', enabled: false, rolloutPercent: 100, tenantAllowlist: '' })}><Plus /> New flag</Button>} />
      <QueryView q={q}>
        {(d) => (
          <Table head={['Flag', 'Enabled', 'Rollout', 'Allowlist', '']} empty={!d.flags.length}>
            {d.flags.map((fl: any) => (
              <tr key={fl.key}>
                <Td><code>{fl.key}</code><span className="block text-xs text-muted-foreground">{fl.description}</span></Td>
                <Td><Switch checked={fl.enabled} label={`Toggle ${fl.key}`} onChange={(v) => save(undefined, { ...fl, enabled: v })} /></Td>
                <Td>{fl.rolloutPercent}%</Td>
                <Td>{fl.tenantAllowlist.length}</Td>
                <Td><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setF({ ...fl, tenantAllowlist: fl.tenantAllowlist.join('\n') })}>Edit</Button><ConfirmButton title={`Delete ${fl.key}?`} onConfirm={async () => { await api.del(`/admin/feature-flags/${fl.key}`); q.refetch(); }}>Delete</ConfirmButton></div></Td>
              </tr>
            ))}
          </Table>
        )}
      </QueryView>
      {f && (
        <Modal open onOpenChange={() => setF(null)} title={f.id ? `Edit ${f.key}` : 'New flag'}>
          <form onSubmit={save} className="space-y-3">
            <Field label="Key"><Input required pattern="[a-z0-9_.\-]{2,60}" disabled={!!f.id} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} /></Field>
            <Field label="Description"><Input value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <Field label="Rollout %"><Input type="number" min={0} max={100} value={f.rolloutPercent} onChange={(e) => setF({ ...f, rolloutPercent: e.target.value })} /></Field>
            <Field label="Workspace allowlist (IDs)"><Textarea rows={3} value={f.tenantAllowlist} onChange={(e) => setF({ ...f, tenantAllowlist: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label="Enabled" /> Enabled</label>
            <div className="flex justify-end"><Button type="submit">Save</Button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
