import { useState } from 'react';
import toast from 'react-hot-toast';
import { Ban, CheckCircle2, Clock, EyeOff, Flag, MessageCircle, MessagesSquare, Pencil, Pin, PinOff, Plus, RotateCcw, Trash2, Users } from 'lucide-react';
import api, { errMsg } from '../../lib/api';
import useFetch from '../../lib/useFetch';
import { asset, cn, fmtDate } from '../../lib/utils';
import { Avatar, EmptyState, Field, Modal, PageHeader, PageLoader, Pagination, SearchInput, StatCard, StatusBadge, Switch, Tabs, useConfirm } from '../../components/ui';

const BASE = '/community/admin';

/** Runs an admin action, shows its result and refreshes */
function useAction(after) {
  return async (fn, successText) => {
    try {
      const res = await fn();
      toast.success(successText || res.data?.message || 'Done');
      await after();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
}

function IconBtn({ title, onClick, icon: I, danger }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className={cn('rounded-lg p-2', danger ? 'text-slate-400 hover:bg-red-50 hover:text-red-600' : 'text-slate-500 hover:bg-slate-100 hover:text-brand-700')}>
      <I className="h-4 w-4" />
    </button>
  );
}

function ListShell({ url, filters, statuses, placeholder, empty, onChanged, children }) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(filters ?? '');
  const { data, loading, error, reload } = useFetch(url, { page, q, status });
  const refresh = async () => {
    await reload();
    await onChanged?.();
  };
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        {placeholder && <SearchInput className="min-w-[200px] flex-1" placeholder={placeholder} value={q} onChange={(v) => { setQ(v); setPage(1); }} />}
        {statuses && (
          <select className="input !w-auto" aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            {statuses.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        )}
      </div>
      {error ? (
        <p className="p-6 text-center text-sm text-red-600">{error}</p>
      ) : !data && loading ? (
        <PageLoader />
      ) : !data?.data?.length ? (
        <EmptyState title={empty} />
      ) : (
        <div className="divide-y divide-slate-100">{data.data.map((row) => children(row, refresh))}</div>
      )}
      <Pagination page={page} total={data?.total} limit={data?.limit} onChange={setPage} />
    </div>
  );
}

function Posts({ onChanged }) {
  const confirm = useConfirm();
  return (
    <ListShell
      url={`${BASE}/posts`}
      placeholder="Search posts, names or emails…"
      empty="No posts found"
      statuses={[['', 'All statuses'], ['published', 'Published'], ['pending', 'Pending approval'], ['hidden', 'Hidden']]}
      onChanged={onChanged}
    >
      {(p, refresh) => <PostRow key={p.id} p={p} refresh={refresh} confirm={confirm} />}
    </ListShell>
  );
}

function PostRow({ p, refresh, confirm }) {
  const run = useAction(refresh);
  const update = (data, text) => run(() => api.put(`${BASE}/posts/${p.id}`, data), text);
  const remove = async () => {
    if (await confirm({ title: 'Delete this post?', text: 'The post, its comments and its media files are permanently deleted.' })) run(() => api.delete(`${BASE}/posts/${p.id}`));
  };
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
      <Avatar src={p.member_avatar} name={p.member_name} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <b className="text-navy-900">{p.member_name}</b>
          <StatusBadge status={p.status} />
          {p.is_pinned && <span className="badge bg-amber-50 text-amber-700">Pinned</span>}
          {p.category_name && <span className="text-xs text-slate-500">{p.category_emoji} {p.category_name}</span>}
          <span className="text-xs text-slate-400">{fmtDate(p.created_at)}</span>
        </p>
        {p.content && <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-slate-700 [overflow-wrap:anywhere]">{p.mood} {p.content}</p>}
        {p.media.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {p.media.map((m) => m.type === 'video'
              ? <video key={m.url} src={asset(m.url)} controls preload="metadata" className="h-24 rounded-lg bg-black" />
              : <a key={m.url} href={asset(m.url)} target="_blank" rel="noreferrer"><img src={asset(m.url)} alt="" loading="lazy" className="h-16 w-16 rounded-lg object-cover" /></a>)}
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">{p.likes_count} like(s) · {p.comments_count} comment(s) · {p.shares_count} share(s) · <a href={`/community/post/${p.id}`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">View</a></p>
      </div>
      <div className="flex shrink-0">
        {p.status !== 'published' && <IconBtn title={p.status === 'pending' ? 'Approve' : 'Publish again'} icon={p.status === 'pending' ? CheckCircle2 : RotateCcw} onClick={() => update({ status: 'published' }, 'Post published')} />}
        {p.status !== 'hidden' && <IconBtn title="Hide from community" icon={EyeOff} onClick={() => update({ status: 'hidden' }, 'Post hidden')} />}
        <IconBtn title={p.is_pinned ? 'Unpin' : 'Pin to top'} icon={p.is_pinned ? PinOff : Pin} onClick={() => update({ is_pinned: !p.is_pinned }, p.is_pinned ? 'Post unpinned' : 'Post pinned')} />
        <IconBtn danger title="Delete" icon={Trash2} onClick={remove} />
      </div>
    </div>
  );
}

function CommentRow({ c, refresh, confirm }) {
  const run = useAction(refresh);
  const remove = async () => {
    if (await confirm({ title: 'Delete this comment?', text: 'Its replies are deleted too.' })) run(() => api.delete(`${BASE}/comments/${c.id}`));
  };
  return (
    <div className="flex items-start gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <b className="text-navy-900">{c.member_name}</b>
          <StatusBadge status={c.status} />
          {c.parent_id && <span className="text-xs text-slate-500">Reply</span>}
          <span className="text-xs text-slate-400">{fmtDate(c.created_at)}</span>
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 [overflow-wrap:anywhere]">{c.content}</p>
        <a href={`/community/post/${c.post_id}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-brand-700 hover:underline">View post</a>
      </div>
      <div className="flex shrink-0">
        {c.status === 'hidden'
          ? <IconBtn title="Show again" icon={RotateCcw} onClick={() => run(() => api.put(`${BASE}/comments/${c.id}`, { status: 'published' }))} />
          : <IconBtn title="Hide" icon={EyeOff} onClick={() => run(() => api.put(`${BASE}/comments/${c.id}`, { status: 'hidden' }))} />}
        <IconBtn danger title="Delete" icon={Trash2} onClick={remove} />
      </div>
    </div>
  );
}

function MemberRow({ m, refresh, confirm }) {
  const run = useAction(refresh);
  const ban = async () => {
    if (await confirm({ title: `Ban ${m.name}?`, text: 'They are logged out and their posts and comments disappear from the community until reactivated.', confirmText: 'Ban' })) run(() => api.put(`${BASE}/members/${m.id}`, { status: 'banned' }));
  };
  const remove = async () => {
    if (await confirm({ title: `Delete ${m.name}?`, text: 'The account and all of their posts, comments and media are permanently deleted.' })) run(() => api.delete(`${BASE}/members/${m.id}`));
  };
  return (
    <div className="flex items-center gap-3 p-4">
      <Avatar src={m.avatar} name={m.name} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm"><b className="text-navy-900">{m.name}</b> <StatusBadge status={m.status} /></p>
        <p className="truncate text-xs text-slate-500">{m.email}</p>
        <p className="text-xs text-slate-400">{m.posts} posts · {m.comments} comments · Joined {fmtDate(m.created_at)}</p>
      </div>
      <div className="flex shrink-0">
        {m.status === 'banned'
          ? <IconBtn title="Reactivate" icon={RotateCcw} onClick={() => run(() => api.put(`${BASE}/members/${m.id}`, { status: 'active' }))} />
          : <IconBtn title="Ban" icon={Ban} onClick={ban} />}
        <IconBtn danger title="Delete" icon={Trash2} onClick={remove} />
      </div>
    </div>
  );
}

function ReportRow({ r, refresh }) {
  const run = useAction(refresh);
  const postId = r.post_id || r.comment_post_id;
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <b className="text-navy-900">{r.post_id ? 'Post' : 'Comment'} by {r.author_name || 'unknown'}</b>
          <StatusBadge status={r.status} />
          <span className="text-xs text-slate-400">{fmtDate(r.created_at)}</span>
        </p>
        <p className="mt-1 line-clamp-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm text-slate-700 [overflow-wrap:anywhere]">{r.content || '(photo or video only)'}</p>
        <p className="mt-1 text-xs text-slate-500">Reported by {r.reporter_name}{r.reason ? `: ${r.reason}` : ''}</p>
        {postId && <a href={`/community/post/${postId}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-brand-700 hover:underline">View post</a>}
      </div>
      {r.status === 'open' && (
        <div className="flex shrink-0 gap-2">
          <button className="btn-outline btn-sm" onClick={() => run(() => api.put(`${BASE}/reports/${r.id}`, {}))}>Dismiss</button>
          <button className="btn-danger btn-sm" onClick={() => run(() => api.put(`${BASE}/reports/${r.id}`, { hide_content: true }))}>Hide content</button>
        </div>
      )}
    </div>
  );
}

function Categories({ onChanged }) {
  const confirm = useConfirm();
  const { data, reload, loading } = useFetch(`${BASE}/categories`);
  const [edit, setEdit] = useState(null);
  const refresh = async () => {
    await reload();
    await onChanged?.();
  };
  const run = useAction(refresh);
  const save = async (e) => {
    e.preventDefault();
    await run(() => (edit.id ? api.put(`${BASE}/categories/${edit.id}`, edit) : api.post(`${BASE}/categories`, edit)), 'Category saved');
    setEdit(null);
  };
  const remove = async (c) => {
    if (await confirm({ title: `Delete ${c.name}?`, text: 'Its posts stay in the community without a topic.' })) run(() => api.delete(`${BASE}/categories/${c.id}`));
  };
  if (loading && !data) return <PageLoader />;
  return (
    <div className="card overflow-hidden">
      <div className="flex justify-end border-b border-slate-100 p-3">
        <button className="btn-primary btn-sm" onClick={() => setEdit({ name: '', emoji: '', sort_order: data?.data?.length || 0, status: 'active' })}><Plus className="h-4 w-4" /> Add topic</button>
      </div>
      <div className="divide-y divide-slate-100">
        {data?.data?.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-4">
            <span className="text-2xl">{c.emoji || '💬'}</span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm"><b className="text-navy-900">{c.name}</b> <StatusBadge status={c.status} /></p>
              <p className="text-xs text-slate-500">{c.posts} posts · Order {c.sort_order}</p>
            </div>
            <IconBtn title="Edit" icon={Pencil} onClick={() => setEdit(c)} />
            <IconBtn danger title="Delete" icon={Trash2} onClick={() => remove(c)} />
          </div>
        ))}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit topic' : 'Add topic'} size="max-w-md">
        {edit && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Name" required><input className="input" required maxLength={80} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Emoji"><input className="input" maxLength={16} value={edit.emoji || ''} onChange={(e) => setEdit({ ...edit, emoji: e.target.value })} /></Field>
              <Field label="Order"><input className="input" type="number" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></Field>
            </div>
            <Switch checked={edit.status === 'active'} onChange={(v) => setEdit({ ...edit, status: v ? 'active' : 'inactive' })} label="Show this topic in the community" />
            <button className="btn-primary w-full">Save</button>
          </form>
        )}
      </Modal>
    </div>
  );
}

function SettingsTab({ overview, onChanged }) {
  const run = useAction(onChanged);
  return (
    <div className="card p-5">
      <Switch
        checked={!!overview?.require_approval}
        onChange={(v) => run(() => api.put(`${BASE}/settings`, { require_approval: v }), v ? 'New posts now need approval' : 'New posts now publish immediately')}
        label="Approve new posts before they appear"
      />
      <p className="mt-2 text-sm text-slate-500">When this is on, new posts wait in the Posts tab under Pending approval. When it is off, posts appear immediately and you moderate them afterwards.</p>
    </div>
  );
}

export default function CommunityAdmin() {
  const confirm = useConfirm();
  const [tab, setTab] = useState('posts');
  const { data: o, reload } = useFetch(`${BASE}/overview`);
  const tabs = [
    { value: 'posts', label: 'Posts', count: o?.pending || undefined },
    { value: 'comments', label: 'Comments' },
    { value: 'members', label: 'Members' },
    { value: 'reports', label: 'Reports', count: o?.reports || undefined },
    { value: 'topics', label: 'Topics' },
    { value: 'settings', label: 'Settings' },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Community" subtitle="Moderate posts, comments, members and reports" icon={MessagesSquare} actions={<a href="/community" target="_blank" rel="noreferrer" className="btn-outline">Open community</a>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Members" value={o?.members ?? '–'} icon={Users} />
        <StatCard label="Posts" value={o?.posts ?? '–'} icon={MessagesSquare} />
        <StatCard label="Comments" value={o?.comments ?? '–'} icon={MessageCircle} />
        <StatCard label="Pending" value={o?.pending ?? '–'} icon={Clock} onClick={() => setTab('posts')} />
        <StatCard label="Open reports" value={o?.reports ?? '–'} icon={Flag} onClick={() => setTab('reports')} />
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'posts' && <Posts onChanged={reload} />}
      {tab === 'comments' && (
        <ListShell url={`${BASE}/comments`} placeholder="Search comments or names…" empty="No comments found" statuses={[['', 'All statuses'], ['published', 'Published'], ['hidden', 'Hidden']]} onChanged={reload}>
          {(c, refresh) => <CommentRow key={c.id} c={c} refresh={refresh} confirm={confirm} />}
        </ListShell>
      )}
      {tab === 'members' && (
        <ListShell url={`${BASE}/members`} placeholder="Search name or email…" empty="No members yet" statuses={[['', 'All members'], ['active', 'Active'], ['banned', 'Banned']]} onChanged={reload}>
          {(m, refresh) => <MemberRow key={m.id} m={m} refresh={refresh} confirm={confirm} />}
        </ListShell>
      )}
      {tab === 'reports' && (
        <ListShell url={`${BASE}/reports`} filters="open" empty="No reports here" statuses={[['open', 'Open'], ['resolved', 'Resolved']]} onChanged={reload}>
          {(r, refresh) => <ReportRow key={r.id} r={r} refresh={refresh} />}
        </ListShell>
      )}
      {tab === 'topics' && <Categories onChanged={reload} />}
      {tab === 'settings' && <SettingsTab overview={o} onChanged={reload} />}
    </div>
  );
}
