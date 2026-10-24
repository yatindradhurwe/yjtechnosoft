import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/utils';
import { Input } from '@/components/ui/form';
import { PageHeader, Pagination, QueryView, Table, Td } from '@/components/ui/misc';

export default function Audit() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin-audit', action, page], queryFn: () => api.get(`/admin/audit-logs?page=${page}&pageSize=50${action ? `&action=${encodeURIComponent(action)}` : ''}`) });
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of privileged and financial actions, including every Super Admin action." />
      <Input value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} placeholder="Filter by action prefix, e.g. admin. or payment." className="mb-4 max-w-sm" aria-label="Action filter" />
      <QueryView q={q}>
        {(d) => (
          <>
            <Table head={['When', 'Actor', 'Action', 'Entity', 'Workspace', 'IP', 'Details']} empty={!d.items.length}>
              {d.items.map((l: any) => (
                <tr key={l.id}>
                  <Td className="whitespace-nowrap text-muted-foreground">{dateTime(l.createdAt)}</Td>
                  <Td className="text-xs">{l.actor?.email ?? l.actorType.toLowerCase()}</Td>
                  <Td><code className="text-xs">{l.action}</code></Td>
                  <Td className="text-xs">{l.entityType} {l.entityId?.slice(0, 8)}</Td>
                  <Td className="text-xs">{l.tenantId?.slice(0, 8)}</Td>
                  <Td className="text-xs">{l.ip}</Td>
                  <Td className="max-w-xs truncate font-mono text-xs">{l.metadata ? JSON.stringify(l.metadata) : ''}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryView>
    </>
  );
}
