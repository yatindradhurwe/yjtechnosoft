import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { date } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, PageHeader, Pagination, QueryView, SearchInput, Table, Td } from '@/components/ui/misc';
import { useWs } from './workspace';

export default function Courses() {
  const ws = useWs();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useQuery({ queryKey: ['courses', ws.slug, q, status, page], queryFn: () => ws.get(`/courses?page=${page}&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`) });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await ws.post('/courses', { title });
      nav(r.course.id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Courses" description="Build curricula, then sell them through products." actions={ws.can('courses.write') && <Button onClick={() => setOpen(true)}><Plus /> New course</Button>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search courses" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sm:w-44" aria-label="Status">
          <option value="">All statuses</option>
          {['DRAFT', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </Select>
      </div>
      <QueryView q={list}>
        {(d) =>
          d.total === 0 && !q && !status ? (
            <EmptyState icon={<GraduationCap />} title="No courses yet" description="Create your first course, add lessons, and publish it." action={ws.can('courses.write') && <Button onClick={() => setOpen(true)}><Plus /> Create a course</Button>} />
          ) : (
            <>
              <Table head={['Course', 'Status', 'Lessons', 'Students', 'Updated']} empty={d.items.length === 0}>
                {d.items.map((c: any) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <Td><Link to={c.id} className="font-medium hover:underline">{c.title}</Link></Td>
                    <Td><StatusBadge status={c.status} /></Td>
                    <Td>{c._count.lessons}</Td>
                    <Td>{c._count.enrollments}</Td>
                    <Td className="text-muted-foreground">{date(c.updatedAt)}</Td>
                  </tr>
                ))}
              </Table>
              <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
            </>
          )
        }
      </QueryView>
      <Modal open={open} onOpenChange={setOpen} title="New course">
        <form onSubmit={create} className="space-y-4">
          <Field label="Course title"><Input autoFocus required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 30-day Yoga Foundations" /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={busy}>Create</Button></div>
        </form>
      </Modal>
    </>
  );
}
