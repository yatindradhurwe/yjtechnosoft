import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { TabPanel, Tabs } from '@/components/ui/menu';
import { PageHeader, Pagination, QueryView, Table, Td } from '@/components/ui/misc';

function Webhooks() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin-webhooks', status, page], queryFn: () => api.get(`/admin/webhooks?page=${page}${status ? `&status=${status}` : ''}`) });
  return (
    <>
      <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="mb-3 w-44" aria-label="Status"><option value="">All</option>{['PROCESSED', 'IGNORED', 'FAILED', 'RECEIVED'].map((s) => <option key={s}>{s}</option>)}</Select>
      <QueryView q={q}>
        {(d) => (
          <>
            <Table head={['Received', 'Provider', 'Event', 'Status', 'Attempts', 'Error']} empty={!d.items.length}>
              {d.items.map((w: any) => <tr key={w.id}><Td className="whitespace-nowrap text-muted-foreground">{dateTime(w.receivedAt)}</Td><Td>{w.provider}</Td><Td className="font-mono text-xs">{w.type}<span className="block text-muted-foreground">{w.eventId}</span></Td><Td><StatusBadge status={w.status} /></Td><Td>{w.attempts}</Td><Td className="max-w-xs truncate text-xs text-destructive">{w.error}</Td></tr>)}
            </Table>
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            <p className="mt-2 text-xs text-muted-foreground">Failed events are retried automatically when the provider redelivers them.</p>
          </>
        )}
      </QueryView>
    </>
  );
}

function Jobs() {
  const { user } = useAuth();
  const [status, setStatus] = useState('FAILED');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin-jobs', status, page], queryFn: () => api.get(`/admin/jobs?page=${page}${status ? `&status=${status}` : ''}`) });
  return (
    <QueryView q={q}>
      {(d) => (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-44" aria-label="Status"><option value="">All</option>{['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'].map((s) => <option key={s}>{s}</option>)}</Select>
            <span className="text-sm text-muted-foreground">{Object.entries(d.counts).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(' · ')}</span>
          </div>
          <Table head={['Created', 'Job', 'Status', 'Attempts', 'Next run', 'Error', '']} empty={!d.items.length}>
            {d.items.map((j: any) => (
              <tr key={j.id}>
                <Td className="whitespace-nowrap text-muted-foreground">{dateTime(j.createdAt)}</Td>
                <Td className="font-mono text-xs">{j.name}</Td>
                <Td><StatusBadge status={j.status} /></Td>
                <Td>{j.attempts}/{j.maxAttempts}</Td>
                <Td className="text-xs">{dateTime(j.runAt)}</Td>
                <Td className="max-w-xs truncate text-xs text-destructive">{j.lastError}</Td>
                <Td>{user?.platformRole === 'SUPER_ADMIN' && j.status === 'FAILED' && <Button size="sm" variant="outline" onClick={async () => { try { await api.post(`/admin/jobs/${j.id}/retry`); toast.success('Queued for retry'); q.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Retry</Button>}</Td>
              </tr>
            ))}
          </Table>
          <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
        </>
      )}
    </QueryView>
  );
}

export default function Operations() {
  const [tab, setTab] = useState('webhooks');
  return (
    <>
      <PageHeader title="Webhooks & background jobs" />
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: 'webhooks', label: 'Payment webhooks' }, { value: 'jobs', label: 'Background jobs' }]}>
        <TabPanel value="webhooks"><Webhooks /></TabPanel>
        <TabPanel value="jobs"><Jobs /></TabPanel>
      </Tabs>
    </>
  );
}
