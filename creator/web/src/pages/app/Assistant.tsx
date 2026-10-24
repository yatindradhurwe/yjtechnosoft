import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bot, Copy, Send, Sparkles, User } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/form';
import { TabPanel, Tabs } from '@/components/ui/menu';
import { PageHeader } from '@/components/ui/misc';
import { useWs } from './workspace';

const KINDS: Record<string, string> = {
  course_outline: 'Course outline',
  lesson_draft: 'Lesson script',
  quiz: 'Quiz questions',
  email: 'Marketing email',
  whatsapp_template: 'WhatsApp template',
  product_description: 'Product description',
  launch_plan: 'Launch plan',
  pricing_ideas: 'Pricing & marketing ideas',
};

const SUGGESTIONS = ['How did sales do in the last 30 days?', 'Which learners have gone quiet, and what should I send them?', 'Which course has the lowest completion rate?', 'How active is my community this month?'];

function Chat() {
  const ws = useWs();
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; tools?: string[] }[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const send = async (text: string) => {
    if (!text.trim()) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const r = await ws.post('/ai/chat', { messages: next.map(({ role, content }) => ({ role, content })) });
      setMessages([...next, { role: 'assistant', content: r.reply, tools: r.toolsUsed }]);
    } catch (e) {
      toast.error(errorMessage(e));
      setMessages(messages);
      setInput(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex h-[65vh] flex-col">
      <CardContent className="flex-1 space-y-4 overflow-y-auto pt-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3 text-center">
            <Bot className="mx-auto h-8 w-8 text-primary" />
            <p className="text-sm text-muted-foreground">Ask about your business. The assistant reads your own data through read-only tools and never changes anything.</p>
            <div className="flex flex-wrap justify-center gap-2">{SUGGESTIONS.map((s) => <Button key={s} size="sm" variant="outline" onClick={() => send(s)}>{s}</Button>)}</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">{m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</span>
            <div className={cn('max-w-[80%] whitespace-pre-wrap rounded-lg px-4 py-2 text-sm', m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
              {m.content}
              {m.tools?.length ? <p className="mt-2 text-xs opacity-70">Looked at: {m.tools.join(', ').replace(/_/g, ' ')}</p> : null}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-muted-foreground">Thinking…</p>}
        <div ref={end} />
      </CardContent>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t p-3">
        <Textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder="Ask a question…" className="min-h-[40px]" aria-label="Message" />
        <Button type="submit" loading={busy} aria-label="Send"><Send /></Button>
      </form>
    </Card>
  );
}

function Generator() {
  const ws = useWs();
  const nav = useNavigate();
  const [kind, setKind] = useState('course_outline');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      setResult(await ws.post('/ai/generate', { kind, prompt }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const draft = result?.draft;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Draft with AI</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={run} className="space-y-3">
            <Field label="What do you need?"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Describe it"><Textarea required minLength={5} rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A six-week beginner yoga course for office workers with back pain…" /></Field>
            <Button type="submit" loading={busy}><Sparkles /> Generate</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle>Draft</CardTitle>{result && <span className="text-xs text-muted-foreground">{result.credits} credits used</span>}</CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!draft && <p className="text-muted-foreground">Your draft appears here. Review and edit it before using it.</p>}
          {draft && kind === 'course_outline' && (
            <>
              <h3 className="text-lg font-semibold">{draft.title}</h3>
              <p className="text-muted-foreground">{draft.description}</p>
              {draft.modules.map((m: any, i: number) => (
                <div key={i}><p className="font-medium">{m.title}</p><ul className="ml-5 list-disc text-muted-foreground">{m.lessons.map((l: any, j: number) => <li key={j}>{l.title}</li>)}</ul></div>
              ))}
              <Button onClick={async () => { try { const r = await ws.post('/ai/apply/course-outline', draft); toast.success('Draft course created – lessons are hidden until you publish them'); nav(`../courses/${r.course.id}`, { relative: 'path' }); } catch (e) { toast.error(errorMessage(e)); } }}>Create draft course from this</Button>
            </>
          )}
          {draft && kind === 'quiz' && (
            <ol className="ml-5 list-decimal space-y-2">
              {draft.questions.map((q: any, i: number) => <li key={i}>{q.prompt}<ul className="ml-4 text-muted-foreground">{q.options.map((o: string, j: number) => <li key={j}>{j === q.correct ? '✓ ' : '• '}{o}</li>)}</ul></li>)}
            </ol>
          )}
          {draft && !['course_outline', 'quiz'].includes(kind) && (
            <>
              {(draft.subject || draft.title) && <p className="font-semibold">{draft.subject ?? draft.title}</p>}
              <div className="whitespace-pre-wrap rounded-md bg-muted p-3">{draft.body}</div>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`${draft.subject ?? draft.title ?? ''}\n\n${draft.body}`); toast.success('Copied'); }}><Copy /> Copy</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Assistant() {
  const ws = useWs();
  const [tab, setTab] = useState('chat');
  const usage = useQuery({ queryKey: ['ai-usage', ws.slug], queryFn: () => ws.get('/ai/usage'), retry: false });
  return (
    <>
      <PageHeader title="AI assistant" description="Drafts and answers grounded in your own workspace. Nothing is created or sent without your approval." actions={usage.data && <span className="rounded-full bg-muted px-3 py-1 text-sm">{usage.data.balance} / {usage.data.monthlyAllowance} credits left this month</span>} />
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: 'chat', label: 'Ask about your business' }, { value: 'generate', label: 'Generate content' }]}>
        <TabPanel value="chat"><Chat /></TabPanel>
        <TabPanel value="generate"><Generator /></TabPanel>
      </Tabs>
    </>
  );
}
