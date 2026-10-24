import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Flag, Heart, Lock, MessageCircle, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, relative } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/form';
import { EmptyState, Spinner } from '@/components/ui/misc';
import { useStore } from './StoreApp';

function Comments({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { store } = useStore();
  const { user } = useAuth();
  const [list, setList] = useState<any[] | null>(null);
  const [body, setBody] = useState('');
  const load = () => api.get(`/store/${store.slug}/feed/${postId}/comments`).then((r) => setList(r.comments)).catch((e) => toast.error(errorMessage(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title="Comments">
      <div className="space-y-3">
        {list === null ? <Spinner /> : list.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet.</p> : list.map((c) => <div key={c.id} className="text-sm"><span className="font-semibold">{c.user?.name}</span> {c.body}<span className="block text-xs text-muted-foreground">{relative(c.createdAt)}</span></div>)}
        {user ? (
          <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); try { await api.post(`/store/${store.slug}/feed/${postId}/comments`, { body }); setBody(''); load(); } catch (err) { toast.error(errorMessage(err)); } }}>
            <Input value={body} onChange={(e) => setBody(e.target.value)} required aria-label="Comment" />
            <Button type="submit">Post</Button>
          </form>
        ) : <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="text-sm text-primary">Sign in to comment</Link>}
      </div>
    </Modal>
  );
}

function VideoCard({ post }: { post: any }) {
  const { store } = useStore();
  const { user } = useAuth();
  const ref = useRef<HTMLVideoElement>(null);
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [comments, setComments] = useState(false);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState('');
  const viewed = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Autoplay only the video that is on screen; count one view per viewer
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        el.play().catch(() => undefined);
        if (!viewed.current) {
          viewed.current = true;
          api.post(`/store/${store.slug}/feed/${post.id}/view`).catch(() => undefined);
        }
      } else el.pause();
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [post.id, store.slug]);

  return (
    <section className="relative mx-auto flex h-[calc(100vh-8rem)] max-w-md snap-start items-center justify-center" aria-label={post.caption ?? 'Video'}>
      <div className="relative h-full w-full overflow-hidden rounded-2xl bg-black">
        {post.locked ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <Lock className="h-10 w-10" />
            <p>{post.visibility === 'MEMBERS' ? 'Members-only video' : 'Available to buyers'}</p>
            <Button asChild variant="secondary"><Link to={user ? `/s/${store.slug}/community` : `/login?next=${encodeURIComponent(location.pathname)}`}>{user ? 'Join to watch' : 'Sign in'}</Link></Button>
          </div>
        ) : (
          <video ref={ref} src={post.videoUrl} poster={post.thumbnailUrl ?? undefined} loop playsInline muted className="h-full w-full object-contain" onClick={(e) => { const v = e.currentTarget; v.muted = !v.muted; }} controlsList="nodownload" />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pr-16 text-white">
          <p className="text-sm font-semibold">{post.author?.name}</p>
          {post.caption && <p className="text-sm">{post.caption}</p>}
          <p className="text-xs opacity-70">{relative(post.createdAt)} · {post.views} views</p>
        </div>
        <div className="absolute bottom-4 right-3 flex flex-col items-center gap-4 text-white">
          <button aria-label={liked ? 'Unlike' : 'Like'} aria-pressed={liked} onClick={async () => { if (!user) return toast.message('Sign in to like videos'); const r = await api.post(`/store/${store.slug}/feed/${post.id}/like`); setLiked(r.liked); setLikes((n: number) => n + (r.liked ? 1 : -1)); }} className="flex flex-col items-center text-xs">
            <Heart className={cn('h-7 w-7', liked && 'fill-red-500 text-red-500')} />{likes}
          </button>
          <button aria-label="Comments" onClick={() => setComments(true)} className="flex flex-col items-center text-xs"><MessageCircle className="h-7 w-7" />{post.comments}</button>
          <button aria-label="Share" onClick={() => { navigator.clipboard.writeText(`${location.origin}/s/${store.slug}/feed`); toast.success('Link copied'); }}><Share2 className="h-6 w-6" /></button>
          {user && <button aria-label="Report" onClick={() => setReport(true)}><Flag className="h-5 w-5" /></button>}
        </div>
      </div>
      {comments && <Comments postId={post.id} onClose={() => setComments(false)} />}
      {report && (
        <Modal open onOpenChange={setReport} title="Report video" footer={<Button disabled={reason.length < 3} onClick={async () => { try { await api.post(`/store/${store.slug}/feed/${post.id}/report`, { reason }); toast.success('Reported'); setReport(false); } catch (e) { toast.error(errorMessage(e)); } }}>Report</Button>}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
        </Modal>
      )}
    </section>
  );
}

export default function FeedPage() {
  const { store } = useStore();
  const { user } = useAuth();
  const q = useInfiniteQuery({
    queryKey: ['feed', store.slug, user?.id],
    queryFn: ({ pageParam }) => api.get(`/store/${store.slug}/feed${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (last: any) => (last.items.length === 10 ? last.items[9].createdAt : undefined),
  });
  const items = q.data?.pages.flatMap((p: any) => p.items) ?? [];
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage());
    io.observe(el);
    return () => io.disconnect();
  }, [q]);
  if (q.isPending) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!items.length) return <div className="container py-16"><EmptyState title="No videos yet" /></div>;
  return (
    <div className="h-[calc(100vh-8rem)] snap-y snap-mandatory overflow-y-auto py-2">
      {items.map((p: any) => <VideoCard key={p.id} post={p} />)}
      <div ref={sentinel} className="h-4" />
    </div>
  );
}
