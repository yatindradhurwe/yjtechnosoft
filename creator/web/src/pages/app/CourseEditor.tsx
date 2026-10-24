import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowDown, ArrowUp, Eye, FileText, GripVertical, ListChecks, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { date, toLocalInput } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ConfirmButton, Modal } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { TabPanel, Tabs } from '@/components/ui/menu';
import { PageHeader, QueryView, Table, Td } from '@/components/ui/misc';
import { MediaPicker, UploadButton } from '@/components/app/MediaPicker';
import { useWs } from './workspace';

interface Lesson {
  id: string;
  title: string;
  type: string;
  body: string | null;
  embedUrl: string | null;
  mediaAssetId: string | null;
  durationSec: number | null;
  isPreview: boolean;
  published: boolean;
  dripDays: number | null;
  availableAt: string | null;
  quiz: { passPct: number; questions: { prompt: string; type: 'SINGLE' | 'MULTIPLE'; options: string[]; correct: number[]; points: number }[] } | null;
  resources: { id: string; title: string; mediaAssetId: string }[];
}
interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

function LessonDialog({ lesson, dripMode, onClose }: { lesson: Lesson; dripMode: string; onClose: () => void }) {
  const ws = useWs();
  const qc = useQueryClient();
  const [f, setF] = useState(lesson);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<null | 'media' | 'resource'>(null);
  const set = <K extends keyof Lesson>(k: K, v: Lesson[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await ws.patch(`/courses/lessons/${f.id}`, {
        title: f.title,
        type: f.type,
        body: f.body,
        embedUrl: f.embedUrl || null,
        mediaAssetId: f.mediaAssetId,
        durationSec: f.durationSec,
        isPreview: f.isPreview,
        published: f.published,
        dripDays: f.dripDays,
        availableAt: f.availableAt ? new Date(f.availableAt).toISOString() : null,
      });
      if (f.type === 'QUIZ' && f.quiz?.questions.length) await ws.put(`/courses/lessons/${f.id}/quiz`, f.quiz);
      qc.invalidateQueries({ queryKey: ['course'] });
      toast.success('Lesson saved');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const quiz = f.quiz ?? { passPct: 70, questions: [] };
  const setQuiz = (q: NonNullable<Lesson['quiz']>) => set('quiz', q);

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title="Edit lesson" wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Title"><Input required value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Type">
            <Select value={f.type} onChange={(e) => set('type', e.target.value)}>
              {['VIDEO', 'AUDIO', 'TEXT', 'PDF', 'EMBED', 'QUIZ', 'ASSIGNMENT'].map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}
            </Select>
          </Field>
        </div>
        {['VIDEO', 'AUDIO', 'PDF'].includes(f.type) && (
          <Field label="File" hint="Delivered through short-lived, account-bound links. Downloads of videos are not offered.">
            <div className="flex items-center gap-2">
              <Input readOnly value={f.mediaAssetId ? 'File attached' : 'No file'} />
              <Button type="button" variant="outline" onClick={() => setPicker('media')}>Choose</Button>
              {f.mediaAssetId && <Button type="button" variant="ghost" onClick={() => set('mediaAssetId', null)}>Remove</Button>}
            </div>
          </Field>
        )}
        {f.type === 'EMBED' && <Field label="Embed URL" hint="YouTube, Vimeo, Loom or Google Docs embed link"><Input value={f.embedUrl ?? ''} onChange={(e) => set('embedUrl', e.target.value)} placeholder="https://www.youtube.com/embed/…" /></Field>}
        <Field label={f.type === 'ASSIGNMENT' ? 'Assignment instructions' : 'Lesson notes / text'}><Textarea rows={6} value={f.body ?? ''} onChange={(e) => set('body', e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Duration (minutes)"><Input type="number" min={0} value={f.durationSec ? Math.round(f.durationSec / 60) : ''} onChange={(e) => set('durationSec', e.target.value ? Number(e.target.value) * 60 : null)} /></Field>
          {dripMode === 'DAYS_AFTER_ENROLLMENT' && <Field label="Unlock after (days)"><Input type="number" min={0} value={f.dripDays ?? ''} onChange={(e) => set('dripDays', e.target.value ? Number(e.target.value) : null)} /></Field>}
          {dripMode === 'FIXED_DATE' && <Field label="Available from"><Input type="datetime-local" value={toLocalInput(f.availableAt)} onChange={(e) => set('availableAt', e.target.value || null)} /></Field>}
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.isPreview} onChange={(v) => set('isPreview', v)} label="Free preview" /> Free preview</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.published} onChange={(v) => set('published', v)} label="Published" /> Published</label>
        </div>

        {f.type === 'QUIZ' && (
          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 text-sm font-semibold">Quiz</legend>
            <Field label="Pass mark (%)"><Input type="number" min={0} max={100} value={quiz.passPct} onChange={(e) => setQuiz({ ...quiz, passPct: Number(e.target.value) })} className="w-32" /></Field>
            {quiz.questions.map((q, qi) => (
              <div key={qi} className="space-y-2 rounded-md border bg-muted/30 p-3">
                <div className="flex gap-2">
                  <Input value={q.prompt} onChange={(e) => setQuiz({ ...quiz, questions: quiz.questions.map((x, i) => (i === qi ? { ...x, prompt: e.target.value } : x)) })} placeholder={`Question ${qi + 1}`} aria-label={`Question ${qi + 1}`} />
                  <Select value={q.type} onChange={(e) => setQuiz({ ...quiz, questions: quiz.questions.map((x, i) => (i === qi ? { ...x, type: e.target.value as 'SINGLE' | 'MULTIPLE', correct: x.correct.slice(0, 1) } : x)) })} className="w-36" aria-label="Question type">
                    <option value="SINGLE">One answer</option>
                    <option value="MULTIPLE">Many answers</option>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setQuiz({ ...quiz, questions: quiz.questions.filter((_, i) => i !== qi) })} aria-label="Delete question"><Trash2 /></Button>
                </div>
                {q.options.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input
                      type={q.type === 'SINGLE' ? 'radio' : 'checkbox'}
                      name={`q${qi}`}
                      checked={q.correct.includes(oi)}
                      onChange={(e) => setQuiz({ ...quiz, questions: quiz.questions.map((x, i) => (i === qi ? { ...x, correct: q.type === 'SINGLE' ? [oi] : e.target.checked ? [...x.correct, oi] : x.correct.filter((c) => c !== oi) } : x)) })}
                      aria-label={`Mark option ${oi + 1} correct`}
                    />
                    <Input value={o} onChange={(e) => setQuiz({ ...quiz, questions: quiz.questions.map((x, i) => (i === qi ? { ...x, options: x.options.map((y, j) => (j === oi ? e.target.value : y)) } : x)) })} placeholder={`Option ${oi + 1}`} aria-label={`Option ${oi + 1}`} />
                    <Button type="button" variant="ghost" size="icon" disabled={q.options.length <= 2} onClick={() => setQuiz({ ...quiz, questions: quiz.questions.map((x, i) => (i === qi ? { ...x, options: x.options.filter((_, j) => j !== oi), correct: x.correct.filter((c) => c !== oi).map((c) => (c > oi ? c - 1 : c)) } : x)) })} aria-label="Remove option"><Trash2 /></Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="ghost" onClick={() => setQuiz({ ...quiz, questions: quiz.questions.map((x, i) => (i === qi ? { ...x, options: [...x.options, ''] } : x)) })}><Plus /> Option</Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setQuiz({ ...quiz, questions: [...quiz.questions, { prompt: '', type: 'SINGLE', options: ['', ''], correct: [0], points: 1 }] })}><Plus /> Add question</Button>
          </fieldset>
        )}

        <fieldset className="space-y-2 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">Downloadable resources</legend>
          {lesson.resources.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2"><Paperclip className="h-4 w-4" /> {r.title}</span>
              <Button type="button" size="sm" variant="ghost" onClick={async () => { await ws.del(`/courses/lessons/${lesson.id}/resources/${r.id}`); qc.invalidateQueries({ queryKey: ['course'] }); }}>Remove</Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setPicker('resource')}><Plus /> Attach a file</Button>
        </fieldset>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save lesson</Button>
        </div>
      </form>
      <MediaPicker
        open={!!picker}
        onOpenChange={(v) => !v && setPicker(null)}
        kind={picker === 'media' ? (f.type === 'PDF' ? 'DOCUMENT' : (f.type as 'VIDEO' | 'AUDIO')) : undefined}
        onPick={async (a) => {
          if (picker === 'media') set('mediaAssetId', a.id);
          else {
            try {
              await ws.post(`/courses/lessons/${lesson.id}/resources`, { mediaAssetId: a.id, title: a.filename });
              qc.invalidateQueries({ queryKey: ['course'] });
              toast.success('Resource attached');
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }
        }}
      />
    </Modal>
  );
}

function Curriculum({ courseId, modules, dripMode }: { courseId: string; modules: Module[]; dripMode: string }) {
  const ws = useWs();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [drag, setDrag] = useState<{ lessonId: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['course', courseId] });
  const canWrite = ws.can('courses.write');

  const saveOrder = async (next: Module[]) => {
    try {
      await ws.put(`/courses/${courseId}/curriculum/order`, { modules: next.map((m) => ({ id: m.id, lessonIds: m.lessons.map((l) => l.id) })) });
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const moveLesson = (lessonId: string, toModule: string, toIndex: number) => {
    const next = modules.map((m) => ({ ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) }));
    const lesson = modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId)!;
    const target = next.find((m) => m.id === toModule)!;
    target.lessons.splice(Math.max(0, Math.min(toIndex, target.lessons.length)), 0, lesson);
    saveOrder(next);
  };

  const moveModule = (i: number, d: number) => {
    const next = [...modules];
    const [m] = next.splice(i, 1);
    next.splice(i + d, 0, m);
    saveOrder(next);
  };

  const addLesson = async (moduleId: string) => {
    try {
      const r = await ws.post(`/courses/modules/${moduleId}/lessons`, { title: 'New lesson', type: 'TEXT' });
      await refresh();
      setEditing({ ...r.lesson, quiz: null, resources: [] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      {modules.map((m, mi) => (
        <Card key={m.id} onDragOver={(e) => e.preventDefault()} onDrop={() => drag && moveLesson(drag.lessonId, m.id, m.lessons.length)}>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Input
              defaultValue={m.title}
              disabled={!canWrite}
              onBlur={async (e) => { if (e.target.value !== m.title) { await ws.patch(`/courses/modules/${m.id}`, { title: e.target.value }); refresh(); } }}
              className="h-9 max-w-md border-transparent font-semibold hover:border-input"
              aria-label="Module title"
            />
            {canWrite && (
              <div className="ml-auto flex gap-1">
                <Button size="icon" variant="ghost" disabled={mi === 0} onClick={() => moveModule(mi, -1)} aria-label="Move module up"><ArrowUp /></Button>
                <Button size="icon" variant="ghost" disabled={mi === modules.length - 1} onClick={() => moveModule(mi, 1)} aria-label="Move module down"><ArrowDown /></Button>
                <ConfirmButton variant="ghost" size="icon" title="Delete this module?" description="All lessons in it will be deleted too." confirmLabel="Delete" onConfirm={async () => { try { await ws.del(`/courses/modules/${m.id}`); refresh(); } catch (e) { toast.error(errorMessage(e)); } }}>
                  <Trash2 />
                </ConfirmButton>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-1">
            {m.lessons.length === 0 && <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">Drop lessons here or add one.</p>}
            {m.lessons.map((l, li) => (
              <div
                key={l.id}
                draggable={canWrite}
                onDragStart={() => setDrag({ lessonId: l.id })}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.stopPropagation(); if (drag && drag.lessonId !== l.id) moveLesson(drag.lessonId, m.id, li); setDrag(null); }}
                className="flex items-center gap-2 rounded-md border bg-background px-2 py-2 text-sm"
              >
                {canWrite && <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" aria-hidden />}
                <span className="flex-1 truncate">{l.title}</span>
                <Badge variant="outline">{l.type.toLowerCase()}</Badge>
                {l.isPreview && <Badge variant="success"><Eye className="h-3 w-3" /> preview</Badge>}
                {!l.published && <Badge variant="secondary">hidden</Badge>}
                {canWrite && (
                  <>
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={li === 0} onClick={() => moveLesson(l.id, m.id, li - 1)} aria-label="Move lesson up"><ArrowUp /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={li === m.lessons.length - 1} onClick={() => moveLesson(l.id, m.id, li + 1)} aria-label="Move lesson down"><ArrowDown /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(l)} aria-label="Edit lesson"><Pencil /></Button>
                    <ConfirmButton variant="ghost" size="icon" title={`Delete "${l.title}"?`} description="Student progress for this lesson will be removed." confirmLabel="Delete" onConfirm={async () => { await ws.del(`/courses/lessons/${l.id}`); refresh(); }}>
                      <Trash2 />
                    </ConfirmButton>
                  </>
                )}
              </div>
            ))}
            {canWrite && <Button size="sm" variant="ghost" onClick={() => addLesson(m.id)}><Plus /> Add lesson</Button>}
          </CardContent>
        </Card>
      ))}
      {canWrite && <Button variant="outline" onClick={async () => { await ws.post(`/courses/${courseId}/modules`, { title: `Module ${modules.length + 1}` }); refresh(); }}><Plus /> Add module</Button>}
      {editing && <LessonDialog lesson={editing} dripMode={dripMode} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Details({ course, onSaved }: { course: any; onSaved: () => void }) {
  const ws = useWs();
  const [f, setF] = useState(course);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(course), [course]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await ws.patch(`/courses/${course.id}`, { title: f.title, subtitle: f.subtitle || null, description: f.description || null, coverUrl: f.coverUrl || null, category: f.category || null, level: f.level || null, dripMode: f.dripMode, certificateEnabled: f.certificateEnabled, slug: f.slug });
      toast.success('Course saved');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="grid max-w-3xl gap-4">
      <Field label="Title"><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Subtitle"><Input value={f.subtitle ?? ''} onChange={(e) => setF({ ...f, subtitle: e.target.value })} /></Field>
      <Field label="Description"><Textarea rows={6} value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <Field label="Cover image URL">
        <div className="flex gap-2"><Input value={f.coverUrl ?? ''} onChange={(e) => setF({ ...f, coverUrl: e.target.value })} /><UploadButton onUploaded={(a) => setF({ ...f, coverUrl: a.url })} /></div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="URL slug"><Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></Field>
        <Field label="Category"><Input value={f.category ?? ''} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
        <Field label="Level">
          <Select value={f.level ?? ''} onChange={(e) => setF({ ...f, level: e.target.value })}>
            <option value="">Not set</option>
            {['Beginner', 'Intermediate', 'Advanced', 'All levels'].map((l) => <option key={l}>{l}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Drip schedule" hint="Server-enforced: students cannot open locked lessons.">
        <Select value={f.dripMode} onChange={(e) => setF({ ...f, dripMode: e.target.value })}>
          <option value="NONE">Everything unlocked</option>
          <option value="SEQUENTIAL">In order – finish each lesson to unlock the next</option>
          <option value="DAYS_AFTER_ENROLLMENT">Days after enrolment (set per lesson)</option>
          <option value="FIXED_DATE">On fixed dates (set per lesson)</option>
        </Select>
      </Field>
      <Checkbox checked={f.certificateEnabled} onChange={(v) => setF({ ...f, certificateEnabled: v })} label="Issue a certificate on completion" description="Includes a public verification ID." />
      <div><Button type="submit" loading={busy} disabled={!ws.can('courses.write')}>Save details</Button></div>
    </form>
  );
}

function Students({ courseId }: { courseId: string }) {
  const ws = useWs();
  const [email, setEmail] = useState('');
  const q = useQuery({ queryKey: ['course-students', courseId], queryFn: () => ws.get(`/courses/${courseId}/students?pageSize=100`) });
  return (
    <div className="space-y-4">
      {ws.can('customers.write') && (
        <form className="flex max-w-lg gap-2" onSubmit={async (e) => { e.preventDefault(); try { await ws.post(`/courses/${courseId}/enroll`, { email }); toast.success('Student enrolled'); setEmail(''); q.refetch(); } catch (err) { toast.error(errorMessage(err)); } }}>
          <Input type="email" required placeholder="student@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Student email" />
          <Button type="submit">Enrol for free</Button>
        </form>
      )}
      <QueryView q={q}>
        {(d) => (
          <Table head={['Student', 'Progress', 'Status', 'Enrolled', '']} empty={!d.items.length}>
            {d.items.map((e: any) => (
              <tr key={e.id}>
                <Td>{e.user.name}<span className="block text-xs text-muted-foreground">{e.user.email}</span></Td>
                <Td><div className="h-2 w-28 rounded-full bg-muted"><div className="h-2 rounded-full bg-[var(--brand)]" style={{ width: `${e.progressPct}%` }} /></div><span className="text-xs text-muted-foreground">{e.progressPct}%</span></Td>
                <Td><StatusBadge status={e.status} /></Td>
                <Td className="text-muted-foreground">{date(e.enrolledAt)}</Td>
                <Td>{ws.can('customers.write') && <ConfirmButton title="Remove free access?" description="Only access granted manually is removed; purchases stay." onConfirm={async () => { await ws.del(`/courses/${courseId}/students/${e.user.id}`); q.refetch(); }}>Remove</ConfirmButton>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </QueryView>
    </div>
  );
}

function Submissions({ courseId }: { courseId: string }) {
  const ws = useWs();
  const q = useQuery({ queryKey: ['submissions', courseId], queryFn: () => ws.get(`/courses/${courseId}/submissions`) });
  const [grading, setGrading] = useState<any>(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  return (
    <QueryView q={q}>
      {(d) => (
        <>
          <Table head={['Student', 'Assignment', 'Submitted', 'Status', '']} empty={!d.items.length}>
            {d.items.map((s: any) => (
              <tr key={s.id}>
                <Td>{s.user?.name}<span className="block text-xs text-muted-foreground">{s.user?.email}</span></Td>
                <Td>{s.assignment.lesson.title}</Td>
                <Td>{date(s.createdAt)}</Td>
                <Td><StatusBadge status={s.status} />{s.score !== null && <span className="ml-2 text-xs">{s.score}/{s.assignment.maxScore}</span>}</Td>
                <Td><Button size="sm" variant="outline" onClick={() => { setGrading(s); setScore(s.score ?? ''); setFeedback(s.feedback ?? ''); }}>Review</Button></Td>
              </tr>
            ))}
          </Table>
          {grading && (
            <Modal open onOpenChange={() => setGrading(null)} title={`Review: ${grading.assignment.lesson.title}`} wide footer={
              <>
                <Button variant="outline" onClick={() => setGrading(null)}>Cancel</Button>
                <Button onClick={async () => { try { await ws.patch(`/courses/submissions/${grading.id}`, { score: Number(score), feedback }); toast.success('Graded – the student has been notified'); setGrading(null); q.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Save grade</Button>
              </>
            }>
              <div className="space-y-4">
                <div className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm">{grading.text}</div>
                <Field label={`Score (out of ${grading.assignment.maxScore})`}><Input type="number" min={0} max={grading.assignment.maxScore} value={score} onChange={(e) => setScore(e.target.value)} /></Field>
                <Field label="Feedback"><Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} /></Field>
              </div>
            </Modal>
          )}
        </>
      )}
    </QueryView>
  );
}

export default function CourseEditor() {
  const { courseId = '' } = useParams();
  const ws = useWs();
  const qc = useQueryClient();
  const [tab, setTab] = useState('curriculum');
  const [schedule, setSchedule] = useState('');
  const q = useQuery({ queryKey: ['course', courseId], queryFn: () => ws.get(`/courses/${courseId}`) });

  const setStatus = async (status: string, publishAt?: string) => {
    try {
      await ws.post(`/courses/${courseId}/status`, { status, publishAt });
      toast.success(`Course ${status.toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      qc.invalidateQueries({ queryKey: ['courses'] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <QueryView q={q}>
      {(d) => (
        <>
          <PageHeader
            back={<Link to=".." relative="path" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Courses</Link>}
            title={<span className="flex items-center gap-3">{d.course.title} <StatusBadge status={d.course.status} /></span>}
            description={<>{d.stats.enrollments} students · {d.stats.completed} completed{d.course.publishAt && d.course.status === 'SCHEDULED' && <> · goes live {date(d.course.publishAt)}</>}</>}
            actions={
              ws.can('courses.write') && (
                <>
                  <Button asChild variant="outline"><Link to={`/learn/course/${courseId}`} target="_blank"><Eye /> Preview as student</Link></Button>
                  {d.course.status !== 'PUBLISHED' ? <Button onClick={() => setStatus('PUBLISHED')}>Publish</Button> : <Button variant="outline" onClick={() => setStatus('UNPUBLISHED')}>Unpublish</Button>}
                </>
              )
            }
          />
          {d.products.length === 0 && d.course.status === 'PUBLISHED' && (
            <div className="mb-4 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
              This course is published but not for sale yet. <Link to={`../../products?newFor=${courseId}`} relative="path" className="font-medium underline">Create a product for it</Link>.
            </div>
          )}
          <Tabs value={tab} onValueChange={setTab} tabs={[{ value: 'curriculum', label: <span className="flex items-center gap-1.5"><ListChecks className="h-4 w-4" /> Curriculum</span> }, { value: 'details', label: <span className="flex items-center gap-1.5"><FileText className="h-4 w-4" /> Details</span> }, { value: 'students', label: 'Students' }, { value: 'submissions', label: 'Assignments' }, { value: 'publishing', label: 'Publishing' }]}>
            <TabPanel value="curriculum"><Curriculum courseId={courseId} modules={d.modules} dripMode={d.course.dripMode} /></TabPanel>
            <TabPanel value="details"><Details course={d.course} onSaved={() => qc.invalidateQueries({ queryKey: ['course', courseId] })} /></TabPanel>
            <TabPanel value="students"><Students courseId={courseId} /></TabPanel>
            <TabPanel value="submissions"><Submissions courseId={courseId} /></TabPanel>
            <TabPanel value="publishing">
              <Card className="max-w-xl">
                <CardContent className="space-y-4 pt-5">
                  <p className="text-sm text-muted-foreground">Current status: <StatusBadge status={d.course.status} /></p>
                  <div className="flex items-end gap-2">
                    <Field label="Schedule publishing"><Input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} /></Field>
                    <Button variant="outline" disabled={!schedule} onClick={() => setStatus('SCHEDULED', new Date(schedule).toISOString())}>Schedule</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setStatus('DRAFT')}>Move to draft</Button>
                    <Button variant="outline" onClick={() => setStatus('ARCHIVED')}>Archive</Button>
                    <ConfirmButton variant="destructive" size="md" title="Delete this course?" description="Only possible when no students are enrolled. This cannot be undone." confirmLabel="Delete course" onConfirm={async () => { try { await ws.del(`/courses/${courseId}`); toast.success('Course deleted'); history.back(); } catch (e) { toast.error(errorMessage(e)); } }}>
                      Delete course
                    </ConfirmButton>
                  </div>
                </CardContent>
              </Card>
            </TabPanel>
          </Tabs>
        </>
      )}
    </QueryView>
  );
}
