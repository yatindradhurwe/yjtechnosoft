import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { date, toLocalInput } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { PageHeader, QueryView, Table, Td } from '@/components/ui/misc';
import { useWs } from './workspace';

export default function Gamification() {
  const ws = useWs();
  const badges = useQuery({ queryKey: ['badges', ws.slug], queryFn: () => ws.get('/gamification/badges') });
  const board = useQuery({ queryKey: ['engage', ws.workspace.id], queryFn: () => ws.get(`/engage/${ws.workspace.id}`) });
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [b, setB] = useState({ name: '', description: '', icon: '🏅', ruleType: 'points_at_least', value: '100' });
  const [c, setC] = useState({ title: '', description: '', points: '20', startsAt: toLocalInput(new Date()), endsAt: toLocalInput(new Date(Date.now() + 7 * 86400_000)) });

  const createBadge = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await ws.post('/gamification/badges', { name: b.name, description: b.description || undefined, icon: b.icon, rule: b.ruleType === 'manual' ? null : { type: b.ruleType, value: Number(b.value) } });
      setBadgeOpen(false);
      badges.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const createChallenge = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await ws.post('/gamification/challenges', { title: c.title, description: c.description || undefined, points: Number(c.points), startsAt: new Date(c.startsAt).toISOString(), endsAt: new Date(c.endsAt).toISOString() });
      setChallengeOpen(false);
      board.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Rewards" description="Points are earned automatically: lessons (10), course completion (100), posts (2), habit check-ins (1) and challenges. Each is awarded once." actions={<><Button variant="outline" onClick={() => setChallengeOpen(true)}><Plus /> Challenge</Button><Button onClick={() => setBadgeOpen(true)}><Plus /> Badge</Button></>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Badges</CardTitle></CardHeader>
          <CardContent>
            <QueryView q={badges}>
              {(d) => (
                <div className="space-y-2">
                  {d.badges.length === 0 && <p className="text-sm text-muted-foreground">No badges yet.</p>}
                  {d.badges.map((x: any) => (
                    <div key={x.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                      <span><span className="mr-2 text-lg">{x.icon ?? <Award className="inline h-4 w-4" />}</span><strong>{x.name}</strong><span className="block text-xs text-muted-foreground">{x.rule ? `${x.rule.type === 'points_at_least' ? 'Reach' : 'Complete'} ${x.rule.value} ${x.rule.type === 'points_at_least' ? 'points' : 'courses'}` : 'Awarded manually'}</span></span>
                      <span className="text-muted-foreground">{x._count.awards} earned</span>
                    </div>
                  ))}
                </div>
              )}
            </QueryView>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Leaderboard (30 days)</CardTitle></CardHeader>
          <CardContent>
            <QueryView q={board}>
              {(d) => (
                <>
                  <Table head={['#', 'Member', 'Points']} empty={!d.leaderboard.length}>
                    {d.leaderboard.map((r: any) => <tr key={r.rank}><Td>{r.rank}</Td><Td>{r.user?.name}</Td><Td>{r.points}</Td></tr>)}
                  </Table>
                  <h4 className="mb-2 mt-6 text-sm font-semibold">Active challenges</h4>
                  {d.challenges.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
                  {d.challenges.map((x: any) => <p key={x.id} className="text-sm">{x.title} · {x.points} pts · until {date(x.endsAt)}</p>)}
                </>
              )}
            </QueryView>
          </CardContent>
        </Card>
      </div>
      <Modal open={badgeOpen} onOpenChange={setBadgeOpen} title="New badge">
        <form onSubmit={createBadge} className="space-y-3">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <Field label="Icon"><Input value={b.icon} onChange={(e) => setB({ ...b, icon: e.target.value })} maxLength={4} /></Field>
            <Field label="Name"><Input required value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} /></Field>
          </div>
          <Field label="Description"><Input value={b.description} onChange={(e) => setB({ ...b, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Earned when"><Select value={b.ruleType} onChange={(e) => setB({ ...b, ruleType: e.target.value })}><option value="points_at_least">Points reach</option><option value="courses_completed">Courses completed</option><option value="manual">Awarded manually</option></Select></Field>
            {b.ruleType !== 'manual' && <Field label="Threshold"><Input type="number" min={1} value={b.value} onChange={(e) => setB({ ...b, value: e.target.value })} /></Field>}
          </div>
          <div className="flex justify-end"><Button type="submit">Create badge</Button></div>
        </form>
      </Modal>
      <Modal open={challengeOpen} onOpenChange={setChallengeOpen} title="New challenge">
        <form onSubmit={createChallenge} className="space-y-3">
          <Field label="Title"><Input required value={c.title} onChange={(e) => setC({ ...c, title: e.target.value })} placeholder="7-day morning practice" /></Field>
          <Field label="Description"><Textarea value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Points"><Input type="number" min={1} value={c.points} onChange={(e) => setC({ ...c, points: e.target.value })} /></Field>
            <Field label="Starts"><Input type="datetime-local" value={c.startsAt} onChange={(e) => setC({ ...c, startsAt: e.target.value })} /></Field>
            <Field label="Ends"><Input type="datetime-local" value={c.endsAt} onChange={(e) => setC({ ...c, endsAt: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end"><Button type="submit">Create challenge</Button></div>
        </form>
      </Modal>
    </>
  );
}
