import { FormEvent, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Flag, Hash, Megaphone, MessageCircle, MoreHorizontal, Pin, Send, Trash2, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRoom } from '@/lib/realtime';
import { cn, relative } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/form';
import { Menu, MenuItem } from '@/components/ui/menu';
import { Badge } from '@/components/ui/badge';
import { ErrorState, QueryView, Spinner } from '@/components/ui/misc';

const EMOJI = ['👍', '❤️', '🎉', '🔥', '👏', '😂'];

function ReportDialog({ target, onClose }: { target: { entityType: string; entityId: string }; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal open onOpenChange={onClose} title="Report content" footer={<Button onClick={async () => { try { await api.post('/community/report', { ...target, reason }); toast.success('Thanks – a moderator will review it'); onClose(); } catch (e) { toast.error(errorMessage(e)); } }} disabled={reason.length < 3}>Report</Button>}>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What's wrong with this post?" aria-label="Reason" />
    </Modal>
  );
}

function Comments({ post, tenantId }: { post: any; tenantId: string }) {
  const q = useQuery({ queryKey: ['comments', post.id], queryFn: () => api.get(`/community/posts/${post.id}/comments`) });
  const [body, setBody] = useState('');
  const [report, setReport] = useState<any>(null);
  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      {q.data?.comments.map((c: any) => (
        <div key={c.id} className="flex gap-2 text-sm">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs">{c.author?.name?.[0]}</span>
          <div className="flex-1 rounded-lg bg-muted px-3 py-2">
            <p className="text-xs font-semibold">{c.author?.name} <span className="font-normal text-muted-foreground">{relative(c.createdAt)}</span>{c.status === 'HIDDEN' && <Badge variant="destructive" className="ml-1">hidden</Badge>}</p>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </div>
          <Menu trigger={<Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Comment actions"><MoreHorizontal /></Button>}>
            {c.canEdit ? <MenuItem destructive onSelect={async () => { await api.del(`/community/comments/${c.id}`); q.refetch(); }}><Trash2 /> Delete</MenuItem> : <MenuItem onSelect={() => setReport({ entityType: 'comment', entityId: c.id })}><Flag /> Report</MenuItem>}
            {!c.canEdit && <MenuItem onSelect={async () => { await api.post('/community/block', { tenantId, userId: c.authorId, blocked: true }); toast.success('Blocked'); q.refetch(); }}><UserX /> Block author</MenuItem>}
          </Menu>
        </div>
      ))}
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); try { await api.post(`/community/posts/${post.id}/comments`, { body }); setBody(''); q.refetch(); } catch (err) { toast.error(errorMessage(err)); } }}>
        <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment…" aria-label="Comment" required />
        <Button type="submit" size="icon" aria-label="Send comment"><Send /></Button>
      </form>
      {report && <ReportDialog target={report} onClose={() => setReport(null)} />}
    </div>
  );
}

function Feed({ channel, role, tenantId, onMessage }: { channel: any; role: any; tenantId: string; onMessage: (conversationId: string) => void }) {
  const q = useQuery({ queryKey: ['posts', channel.id], queryFn: () => api.get(`/community/channels/${channel.id}/posts`) });
  useRoom('channel', channel.id, ['post:new', 'comment:new'], () => q.refetch());
  const [body, setBody] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);
  const canPost = channel.type === 'FEED' || role.staff;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/community/channels/${channel.id}/posts`, { body });
      setBody('');
      q.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      {canPost && (
        <Card><CardContent className="pt-5">
          <form onSubmit={submit} className="space-y-2">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={channel.type === 'ANNOUNCEMENT' ? 'Share an announcement…' : 'Share something with the community…'} aria-label="New post" required />
            <div className="flex justify-end"><Button type="submit" size="sm">Post</Button></div>
          </form>
        </CardContent></Card>
      )}
      <QueryView q={q}>
        {(d) =>
          d.posts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No posts yet. Start the conversation!</p>
          ) : (
            d.posts.map((p: any) => (
              <Card key={p.id} className={cn(p.pinned && 'border-primary/50')}>
                <CardContent className="pt-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{p.author?.name?.[0]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{p.author?.name} <span className="font-normal text-muted-foreground">· {relative(p.createdAt)}</span>{p.pinned && <Badge className="ml-2"><Pin className="h-3 w-3" /> pinned</Badge>}{p.status === 'HIDDEN' && <Badge variant="destructive" className="ml-1">hidden</Badge>}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{p.body}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-1">
                        {EMOJI.map((em) => {
                          const r = p.reactions.find((x: any) => x.emoji === em);
                          return (
                            <button key={em} onClick={async () => { await api.post(`/community/posts/${p.id}/reactions`, { emoji: em }); q.refetch(); }} className={cn('rounded-full border px-2 py-0.5 text-sm', r?.mine && 'border-primary bg-accent')} aria-pressed={!!r?.mine} aria-label={`React ${em}`}>
                              {em}{r ? ` ${r.count}` : ''}
                            </button>
                          );
                        })}
                        <Button size="sm" variant="ghost" onClick={() => setOpen(open === p.id ? null : p.id)}><MessageCircle /> {p.comments}</Button>
                      </div>
                      {open === p.id && <Comments post={p} tenantId={tenantId} />}
                    </div>
                    <Menu trigger={<Button size="icon" variant="ghost" aria-label="Post actions"><MoreHorizontal /></Button>}>
                      {(role.moderator || role.staff) && <MenuItem onSelect={async () => { await api.patch(`/community/posts/${p.id}`, { pinned: !p.pinned }); q.refetch(); }}><Pin /> {p.pinned ? 'Unpin' : 'Pin'}</MenuItem>}
                      {(role.moderator || role.staff) && <MenuItem onSelect={async () => { await api.patch(`/community/posts/${p.id}`, { status: p.status === 'HIDDEN' ? 'VISIBLE' : 'HIDDEN' }); q.refetch(); }}>{p.status === 'HIDDEN' ? 'Unhide' : 'Hide'}</MenuItem>}
                      {(p.canEdit || role.moderator) && <MenuItem destructive onSelect={async () => { await api.del(`/community/posts/${p.id}`); q.refetch(); }}><Trash2 /> Delete</MenuItem>}
                      {!p.canEdit && <MenuItem onSelect={async () => { try { const r = await api.post(`/community/messages/${tenantId}`, { userIds: [p.authorId] }); onMessage(r.conversation.id); } catch (e) { toast.error(errorMessage(e)); } }}><MessageCircle /> Message author</MenuItem>}
                      {!p.canEdit && <MenuItem onSelect={() => setReport({ entityType: 'post', entityId: p.id })}><Flag /> Report</MenuItem>}
                      {!p.canEdit && <MenuItem onSelect={async () => { await api.post('/community/block', { tenantId, userId: p.authorId, blocked: true }); toast.success('You will no longer see posts from this member'); q.refetch(); }}><UserX /> Block author</MenuItem>}
                    </Menu>
                  </div>
                </CardContent>
              </Card>
            ))
          )
        }
      </QueryView>
      {report && <ReportDialog target={report} onClose={() => setReport(null)} />}
    </div>
  );
}

function Messages({ tenantId, initial }: { tenantId: string; initial?: string | null }) {
  const { user } = useAuth();
  const list = useQuery({ queryKey: ['convs', tenantId], queryFn: () => api.get(`/community/messages/${tenantId}`), refetchInterval: 30_000 });
  const [active, setActive] = useState<string | null>(initial ?? null);
  const conv = useQuery({ queryKey: ['conv', active], queryFn: () => api.get(`/community/conversations/${active}`), enabled: !!active });
  useRoom('conversation', active ?? undefined, ['message:new'], () => { conv.refetch(); list.refetch(); });
  const [body, setBody] = useState('');
  return (
    <div className="grid h-[60vh] gap-4 md:grid-cols-[240px_1fr]">
      <div className="space-y-1 overflow-y-auto">
        {list.data?.conversations.length === 0 && <p className="text-sm text-muted-foreground">No conversations yet. Start one from a member's post.</p>}
        {list.data?.conversations.map((c: any) => (
          <button key={c.id} onClick={() => setActive(c.id)} className={cn('w-full rounded-md p-2 text-left text-sm', active === c.id ? 'bg-accent' : 'hover:bg-muted')}>
            <span className={cn('block truncate', c.unread && 'font-semibold')}>{c.title ?? c.participants.filter((p: any) => p?.id !== user?.id).map((p: any) => p?.name).join(', ')}</span>
            <span className="block truncate text-xs text-muted-foreground">{c.lastMessage?.body}</span>
          </button>
        ))}
      </div>
      <Card className="flex flex-col">
        {!active ? <p className="m-auto text-sm text-muted-foreground">Select a conversation</p> : (
          <>
            <CardContent className="flex-1 space-y-2 overflow-y-auto pt-5">
              {conv.isPending ? <Spinner /> : conv.data?.messages.map((m: any) => (
                <div key={m.id} className={cn('max-w-[75%] rounded-lg px-3 py-2 text-sm', m.senderId === user?.id ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted')}>{m.body}</div>
              ))}
            </CardContent>
            <form className="flex gap-2 border-t p-3" onSubmit={async (e) => { e.preventDefault(); try { await api.post(`/community/conversations/${active}`, { body }); setBody(''); conv.refetch(); } catch (err) { toast.error(errorMessage(err)); } }}>
              <Input value={body} onChange={(e) => setBody(e.target.value)} required aria-label="Message" />
              <Button type="submit" size="icon" aria-label="Send"><Send /></Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}

export default function CommunityApp() {
  const { communityId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const q = useQuery({ queryKey: ['community', communityId], queryFn: () => api.get(`/community/${communityId}`), retry: false });
  const view = params.get('view') ?? 'feed';
  const channelId = params.get('channel');
  if (q.isError) return <div className="container max-w-lg py-20"><ErrorState error={q.error} /><div className="mt-4 text-center"><Button asChild variant="outline"><Link to="/learn">Back</Link></Button></div></div>;
  return (
    <div className="container py-6">
      <QueryView q={q}>
        {(d) => {
          const channels = d.community.channels;
          const current = channels.find((c: any) => c.id === channelId) ?? channels.find((c: any) => c.type === 'FEED') ?? channels[0];
          return (
            <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
              <aside className="space-y-4">
                <Link to="/learn" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Back</Link>
                <h1 className="text-xl font-bold">{d.community.name}</h1>
                <nav className="space-y-1" aria-label="Channels">
                  {channels.map((c: any) => (
                    <button key={c.id} onClick={() => setParams({ channel: c.id })} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm', view === 'feed' && current?.id === c.id ? 'bg-accent font-medium' : 'hover:bg-muted')}>
                      {c.type === 'ANNOUNCEMENT' ? <Megaphone className="h-4 w-4" /> : <Hash className="h-4 w-4" />}{c.name}
                    </button>
                  ))}
                  <button onClick={() => setParams({ view: 'messages' })} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm', view === 'messages' ? 'bg-accent font-medium' : 'hover:bg-muted')}><MessageCircle className="h-4 w-4" /> Messages</button>
                </nav>
              </aside>
              <main className="min-w-0">
                {view === 'messages' ? <Messages tenantId={d.community.tenantId} initial={params.get('c')} /> : current ? <Feed key={current.id} channel={current} role={d.role} tenantId={d.community.tenantId} onMessage={(c) => setParams({ view: 'messages', c })} /> : <p>No channels.</p>}
              </main>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
