import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Hash, Megaphone, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { relative } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton, Modal } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { TabPanel, Tabs } from '@/components/ui/menu';
import { EmptyState, PageHeader, QueryView, StatCard } from '@/components/ui/misc';
import { useWs } from './workspace';

function Reports() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['reports', ws.slug], queryFn: () => ws.get('/community-admin/reports') });
  const act = async (id: string, action: string) => {
    try {
      await ws.post(`/community-admin/reports/${id}`, { action });
      toast.success('Done');
      q.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <QueryView q={q}>
      {(d) =>
        d.reports.length === 0 ? (
          <EmptyState title="Nothing to review" description="Reported posts and comments appear here." />
        ) : (
          <div className="space-y-3">
            {d.reports.map((r: any) => (
              <Card key={r.id}>
                <CardContent className="space-y-2 pt-5 text-sm">
                  <div className="flex justify-between"><Badge variant="warning">{r.entityType}</Badge><span className="text-xs text-muted-foreground">{relative(r.createdAt)}</span></div>
                  <p className="rounded-md bg-muted p-3">{r.content?.body ?? '(deleted)'}</p>
                  <p className="text-muted-foreground">Reason: {r.reason}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => act(r.id, 'dismiss')}>Dismiss</Button>
                    <Button size="sm" variant="outline" onClick={() => act(r.id, 'hide')}>Hide content</Button>
                    <ConfirmButton title="Hide and ban the author?" description="The author loses access to your community and DMs." confirmLabel="Ban" onConfirm={() => act(r.id, 'ban_author')}>Hide & ban author</ConfirmButton>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      }
    </QueryView>
  );
}

export default function CommunityAdmin() {
  const ws = useWs();
  const q = useQuery({ queryKey: ['communities', ws.slug], queryFn: () => ws.get('/community-admin') });
  const stats = useQuery({ queryKey: ['community-stats', ws.slug], queryFn: () => ws.get('/community-admin/analytics') });
  const [tab, setTab] = useState('spaces');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', description: '', access: 'FREE' });
  const [channel, setChannel] = useState<{ communityId: string; name: string; type: string } | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await ws.post('/community-admin', f);
      setOpen(false);
      q.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Community" description="Free or paid spaces with channels, posts, comments and direct messages." actions={<Button onClick={() => setOpen(true)}><Plus /> New community</Button>} />
      {stats.data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <StatCard label="Posts (30d)" value={stats.data.posts30d} />
          <StatCard label="Comments (30d)" value={stats.data.comments30d} />
          <StatCard label="Reactions (30d)" value={stats.data.reactions30d} />
          <StatCard label="Active members (30d)" value={stats.data.activeMembers30d} />
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: 'spaces', label: 'Spaces' }, { value: 'reports', label: 'Moderation queue' }]}>
        <TabPanel value="spaces">
          <QueryView q={q}>
            {(d) =>
              d.items.length === 0 ? (
                <EmptyState icon={<Users />} title="No community yet" description="Create a space for your students. Make it paid by attaching it to a membership product." action={<Button onClick={() => setOpen(true)}><Plus /> Create community</Button>} />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {d.items.map((c: any) => (
                    <Card key={c.id}>
                      <CardHeader className="flex-row items-start justify-between">
                        <div><CardTitle>{c.name}</CardTitle><p className="text-sm text-muted-foreground">{c.description}</p></div>
                        <Badge variant={c.access === 'PAID' ? 'warning' : 'success'}>{c.access === 'PAID' ? 'Paid' : 'Free'}</Badge>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {c.channels.map((ch: any) => (
                          <div key={ch.id} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">{ch.type === 'ANNOUNCEMENT' ? <Megaphone className="h-4 w-4" /> : <Hash className="h-4 w-4" />}{ch.name}</span>
                            <ConfirmButton variant="ghost" size="icon" title={`Delete #${ch.name}?`} description="All posts in this channel are deleted." onConfirm={async () => { await ws.del(`/community-admin/channels/${ch.id}`); q.refetch(); }}><Trash2 /></ConfirmButton>
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-2 pt-2">
                          <Button size="sm" variant="outline" onClick={() => setChannel({ communityId: c.id, name: '', type: 'FEED' })}><Plus /> Channel</Button>
                          <Button asChild size="sm" variant="outline"><Link to={`/community/${c.id}`}><ExternalLink /> Open</Link></Button>
                          {c.access === 'PAID' && <Button asChild size="sm" variant="ghost"><Link to="../products" relative="path">Sell access</Link></Button>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            }
          </QueryView>
        </TabPanel>
        <TabPanel value="reports"><Reports /></TabPanel>
      </Tabs>
      <Modal open={open} onOpenChange={setOpen} title="New community">
        <form onSubmit={create} className="space-y-3">
          <Field label="Name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Access" hint="Paid: only people who bought a membership product that includes this community.">
            <Select value={f.access} onChange={(e) => setF({ ...f, access: e.target.value })}><option value="FREE">Free for anyone who joins</option><option value="PAID">Paid members only</option></Select>
          </Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Create</Button></div>
        </form>
      </Modal>
      {channel && (
        <Modal open onOpenChange={() => setChannel(null)} title="New channel">
          <form onSubmit={async (e) => { e.preventDefault(); try { await ws.post(`/community-admin/${channel.communityId}/channels`, { name: channel.name, type: channel.type }); setChannel(null); q.refetch(); } catch (err) { toast.error(errorMessage(err)); } }} className="space-y-3">
            <Field label="Name"><Input required value={channel.name} onChange={(e) => setChannel({ ...channel, name: e.target.value })} /></Field>
            <Field label="Type"><Select value={channel.type} onChange={(e) => setChannel({ ...channel, type: e.target.value })}><option value="FEED">Discussion – members can post</option><option value="ANNOUNCEMENT">Announcements – team only</option></Select></Field>
            <div className="flex justify-end"><Button type="submit">Create channel</Button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
