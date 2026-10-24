import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date } from '@/lib/utils';
import { Select } from '@/components/ui/form';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { ConfirmButton } from '@/components/ui/dialog';
import { PageHeader, Pagination, QueryView, SearchInput, Table, Td } from '@/components/ui/misc';

export default function Users() {
  const { user } = useAuth();
  const isSuper = user?.platformRole === 'SUPER_ADMIN';
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['admin-users', q, role, page], queryFn: () => api.get(`/admin/users?page=${page}&q=${encodeURIComponent(q)}${role ? `&role=${role}` : ''}`) });
  const update = async (id: string, body: object) => {
    try {
      await api.patch(`/admin/users/${id}`, body);
      toast.success('Updated');
      list.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <>
      <PageHeader title="Users" description="Suspending a user ends all of their sessions immediately." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name or email" />
        <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="sm:w-44" aria-label="Role"><option value="">All roles</option><option value="USER">User</option><option value="SUPPORT">Support</option><option value="SUPER_ADMIN">Super admin</option></Select>
      </div>
      <QueryView q={list}>
        {(d) => (
          <>
            <Table head={['User', 'Platform role', 'Workspaces', 'Orders', 'Last login', 'Status', '']} empty={!d.items.length}>
              {d.items.map((u: any) => (
                <tr key={u.id}>
                  <Td>{u.name}<span className="block text-xs text-muted-foreground">{u.email}{!u.emailVerifiedAt && ' · unverified'}</span></Td>
                  <Td>
                    {isSuper && u.id !== user?.id ? (
                      <Select value={u.platformRole} onChange={(e) => update(u.id, { platformRole: e.target.value })} className="h-8 w-36" aria-label="Platform role">
                        <option value="USER">User</option>
                        <option value="SUPPORT">Support</option>
                        <option value="SUPER_ADMIN">Super admin</option>
                      </Select>
                    ) : <Badge variant="outline">{u.platformRole.toLowerCase()}</Badge>}
                  </Td>
                  <Td>{u._count.memberships}</Td>
                  <Td>{u._count.orders}</Td>
                  <Td className="text-muted-foreground">{date(u.lastLoginAt)}</Td>
                  <Td><StatusBadge status={u.status} /></Td>
                  <Td>{isSuper && u.id !== user?.id && (u.status === 'ACTIVE' ? <ConfirmButton title={`Suspend ${u.email}?`} description="They are signed out everywhere and cannot sign in." onConfirm={() => update(u.id, { status: 'SUSPENDED' })}>Suspend</ConfirmButton> : <ConfirmButton destructive={false} title="Reactivate this user?" onConfirm={() => update(u.id, { status: 'ACTIVE' })}>Reactivate</ConfirmButton>)}</Td>
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
