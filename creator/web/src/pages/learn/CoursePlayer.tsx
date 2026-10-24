import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Award, CheckCircle2, ChevronLeft, ChevronRight, Circle, Download, Lock, Star } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn, date } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/form';
import { ErrorState, QueryView, Spinner } from '@/components/ui/misc';

interface OutlineLesson {
  id: string;
  title: string;
  type: string;
  durationSec: number | null;
  locked: boolean;
  lockReason: string | null;
  unlocksAt?: string;
  completed: boolean;
}

function Quiz({ lesson, onDone }: { lesson: any; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post(`/learn/lessons/${lesson.id}/quiz`, { answers });
      setResult(r);
      if (r.passed) {
        toast.success(`Passed with ${r.score}/${r.maxScore}!`);
        onDone();
      } else toast.error(`You scored ${r.score}/${r.maxScore}. You need ${r.passPct}% to pass.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-5">
      {lesson.quiz.questions.map((q: any, i: number) => (
        <fieldset key={q.id} className={cn('rounded-lg border p-4', result && (result.results[q.id] ? 'border-success' : 'border-destructive'))}>
          <legend className="px-1 font-medium">{i + 1}. {q.prompt}</legend>
          <div className="mt-2 space-y-2">
            {q.options.map((o: string, oi: number) => (
              <label key={oi} className="flex items-center gap-2 text-sm">
                <input
                  type={q.type === 'SINGLE' ? 'radio' : 'checkbox'}
                  name={q.id}
                  checked={(answers[q.id] ?? []).includes(oi)}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: q.type === 'SINGLE' ? [oi] : e.target.checked ? [...(answers[q.id] ?? []), oi] : (answers[q.id] ?? []).filter((x) => x !== oi) })}
                />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <Button type="submit" loading={busy}>{result ? 'Try again' : 'Submit answers'}</Button>
      {lesson.quiz.passPct > 0 && <p className="text-xs text-muted-foreground">Pass mark: {lesson.quiz.passPct}%</p>}
    </form>
  );
}

function Assignment({ lesson, submission, onDone }: { lesson: any; submission: any; onDone: () => void }) {
  const [text, setText] = useState(submission?.text ?? '');
  const [busy, setBusy] = useState(false);
  if (submission?.status === 'GRADED')
    return (
      <Card><CardContent className="space-y-2 pt-5 text-sm">
        <p className="font-semibold">Graded: {submission.score}/{lesson.assignment.maxScore}</p>
        {submission.feedback && <p className="whitespace-pre-wrap rounded-md bg-muted p-3">{submission.feedback}</p>}
        <p className="whitespace-pre-wrap text-muted-foreground">{submission.text}</p>
      </CardContent></Card>
    );
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await api.post(`/learn/lessons/${lesson.id}/assignment`, { text }); toast.success('Submitted – your instructor will review it'); onDone(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); } }}>
      <p className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm">{lesson.assignment.instructions}</p>
      <Textarea required rows={8} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your answer" placeholder="Write your answer…" />
      <Button type="submit" loading={busy}>{submission ? 'Resubmit' : 'Submit'}</Button>
    </form>
  );
}

function LessonView({ lessonId, onCompleted }: { lessonId: string; onCompleted: () => void }) {
  const q = useQuery({ queryKey: ['lesson', lessonId], queryFn: () => api.get(`/learn/lessons/${lessonId}`), retry: false });
  const lastSaved = useRef(0);
  if (q.isPending) return <div className="flex h-64 items-center justify-center"><Spinner /></div>;
  if (q.isError) {
    const locked = q.error instanceof ApiError && q.error.status === 403;
    return <div className="flex flex-col items-center gap-2 rounded-xl border p-10 text-center">{locked ? <Lock className="h-8 w-8 text-muted-foreground" /> : null}<p className="font-medium">{errorMessage(q.error)}</p></div>;
  }
  const { lesson, progress, submission } = q.data;
  const onTime = (t: number) => {
    // Save resume position at most every 15 seconds
    if (Math.abs(t - lastSaved.current) < 15) return;
    lastSaved.current = t;
    api.post(`/learn/lessons/${lesson.id}/progress`, { positionSec: Math.floor(t) }).catch(() => undefined);
  };
  return (
    <div className="space-y-6">
      {lesson.media && lesson.media.kind === 'VIDEO' && (
        <video
          key={lesson.id}
          src={lesson.media.url}
          controls
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          className="aspect-video w-full rounded-xl bg-black"
          onLoadedMetadata={(e) => { if (progress?.positionSec) e.currentTarget.currentTime = progress.positionSec; }}
          onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
          onEnded={async () => { await api.post(`/learn/lessons/${lesson.id}/progress`, { completed: true }).catch(() => undefined); onCompleted(); }}
        />
      )}
      {lesson.media && lesson.media.kind === 'AUDIO' && <audio src={lesson.media.url} controls controlsList="nodownload" className="w-full" onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)} />}
      {lesson.media && lesson.media.kind === 'DOCUMENT' && <iframe src={lesson.media.url} title={lesson.title} className="h-[75vh] w-full rounded-xl border" />}
      {lesson.embedUrl && (
        <div className="aspect-video overflow-hidden rounded-xl bg-black">
          <iframe src={lesson.embedUrl} title={lesson.title} className="h-full w-full" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" allow="encrypted-media; fullscreen" />
        </div>
      )}
      <h1 className="text-2xl font-bold">{lesson.title}</h1>
      {lesson.type === 'QUIZ' && lesson.quiz ? (
        <Quiz lesson={lesson} onDone={onCompleted} />
      ) : lesson.type === 'ASSIGNMENT' && lesson.assignment ? (
        <Assignment lesson={lesson} submission={submission} onDone={() => { q.refetch(); onCompleted(); }} />
      ) : (
        lesson.body && <div className="whitespace-pre-wrap leading-relaxed">{lesson.body}</div>
      )}
      {lesson.resources.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Resources</h2>
          {lesson.resources.map((r: any) => <a key={r.id} href={r.url} className="flex items-center gap-2 text-sm text-primary hover:underline"><Download className="h-4 w-4" /> {r.title}</a>)}
        </div>
      )}
      {!['QUIZ', 'ASSIGNMENT'].includes(lesson.type) && (
        <Button
          variant={progress?.completed ? 'outline' : 'default'}
          onClick={async () => {
            try {
              await api.post(`/learn/lessons/${lesson.id}/progress`, { completed: !progress?.completed });
              await q.refetch();
              onCompleted();
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }}
        >
          {progress?.completed ? <><CheckCircle2 /> Completed – mark as not done</> : 'Mark as complete'}
        </Button>
      )}
    </div>
  );
}

function Review({ courseId, existing }: { courseId: string; existing: any }) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? '');
  return (
    <Card><CardContent className="space-y-3 pt-5">
      <p className="text-sm font-semibold">Rate this course</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} stars`} onClick={() => setRating(n)}>
            <Star className={cn('h-6 w-6', n <= rating ? 'fill-warning text-warning' : 'text-muted-foreground')} />
          </button>
        ))}
      </div>
      <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did you think? (optional)" aria-label="Review" />
      <Button size="sm" disabled={!rating} onClick={async () => { try { await api.post(`/learn/courses/${courseId}/review`, { rating, body: body || undefined }); toast.success('Thanks for your review!'); } catch (e) { toast.error(errorMessage(e)); } }}>Save review</Button>
    </CardContent></Card>
  );
}

export default function CoursePlayer() {
  const { courseId = '', lessonId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['player', courseId], queryFn: () => api.get(`/learn/courses/${courseId}`), retry: false });
  const lessons: OutlineLesson[] = q.data ? q.data.modules.flatMap((m: any) => m.lessons) : [];
  const current = lessonId ?? lessons.find((l) => !l.completed && !l.locked)?.id ?? lessons[0]?.id;
  const idx = lessons.findIndex((l) => l.id === current);

  useEffect(() => {
    if (q.data && !lessonId && current) nav(`/learn/course/${courseId}/${current}`, { replace: true });
  }, [q.data, lessonId, current, courseId, nav]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['player', courseId] });
    qc.invalidateQueries({ queryKey: ['library'] });
  };

  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <QueryView q={q}>
      {(d) => (
        <div style={{ ['--brand' as string]: d.tenant.primaryColor }}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Link to="/learn" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Library</Link>
            <span className="text-sm text-muted-foreground">·</span>
            <span className="text-sm">{d.tenant.name}</span>
            {d.preview && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">Creator preview – drip locks not applied</span>}
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 space-y-6">
              {current ? <LessonView key={current} lessonId={current} onCompleted={refresh} /> : <p>This course has no lessons yet.</p>}
              <div className="flex justify-between">
                <Button variant="outline" disabled={idx <= 0} onClick={() => nav(`/learn/course/${courseId}/${lessons[idx - 1].id}`)}><ChevronLeft /> Previous</Button>
                <Button variant="outline" disabled={idx < 0 || idx >= lessons.length - 1 || lessons[idx + 1]?.locked} onClick={() => nav(`/learn/course/${courseId}/${lessons[idx + 1].id}`)}>Next <ChevronRight /></Button>
              </div>
              {d.enrollment && <Review courseId={courseId} existing={d.review} />}
            </div>
            <aside className="space-y-4">
              <Card><CardContent className="space-y-2 pt-5">
                <h2 className="font-sans font-semibold">{d.course.title}</h2>
                {d.enrollment && (
                  <>
                    <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-[var(--brand)]" style={{ width: `${d.enrollment.progressPct}%` }} /></div>
                    <p className="text-xs text-muted-foreground">{d.enrollment.progressPct}% complete</p>
                  </>
                )}
                {d.certificate && (
                  <Button asChild size="sm" className="w-full"><Link to={`/verify/${d.certificate.verificationCode}`}><Award /> View certificate</Link></Button>
                )}
              </CardContent></Card>
              <nav aria-label="Curriculum" className="space-y-4">
                {d.modules.map((m: any) => (
                  <div key={m.id}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.title}</p>
                    {m.lessons.map((l: OutlineLesson) => (
                      <button
                        key={l.id}
                        disabled={l.locked}
                        onClick={() => nav(`/learn/course/${courseId}/${l.id}`)}
                        className={cn('flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60', l.id === current ? 'bg-accent font-medium' : 'hover:bg-muted')}
                        aria-current={l.id === current ? 'page' : undefined}
                        title={l.locked ? (l.lockReason === 'previous_incomplete' ? 'Complete the previous lessons first' : `Unlocks ${date(l.unlocksAt)}`) : undefined}
                      >
                        {l.locked ? <Lock className="h-4 w-4 shrink-0" /> : l.completed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <span className="flex-1">{l.title}</span>
                        {l.durationSec ? <span className="text-xs text-muted-foreground">{Math.round(l.durationSec / 60)}m</span> : null}
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
            </aside>
          </div>
        </div>
      )}
    </QueryView>
  );
}
