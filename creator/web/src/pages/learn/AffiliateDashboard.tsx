import { useQuery } from '@tanstack/react-query';
import { Copy, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, PageHeader, QueryView, StatCard, Table, Td } from '@/components/ui/misc';

export default function AffiliateDashboard() {
  const q = useQuery({ queryKey: ['affiliate-me'], queryFn: () => api.get('/affiliate') });
  return (
    <>
      <PageHeader title="Affiliate programs" description="Share your link. You earn a commission when someone buys within 30 days of clicking it." />
      <QueryView q={q}>
        {(d) =>
          d.programs.length === 0 ? (
            <EmptyState icon={<Gift />} title="You haven't joined any programs" description="Look for 'Become an affiliate' on a creator's storefront." />
          ) : (
            <div className="space-y-6">
              {d.programs.map((p: any) => (
                <Card key={p.id}>
                  <CardHeader className="flex-row items-center justify-between"><CardTitle>{p.tenant.name}</CardTitle><StatusBadge status={p.status} /></CardHeader>
                  <CardContent className="space-y-4">
                    {p.status === 'APPROVED' ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-3 text-sm">
                        <code className="flex-1 break-all">{p.link}</code>
                        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(p.link); toast.success('Link copied'); }}><Copy /> Copy</Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{p.status === 'PENDING' ? 'Waiting for the creator to approve your application.' : 'This program is not active for you.'}</p>
                    )}
                    <div className="grid gap-3 sm:grid-cols-4">
                      <StatCard label="Clicks" value={p.clicks} />
                      <StatCard label="Sales" value={p.conversions} />
                      <StatCard label="Pending" value={money(p.pending, 'INR')} />
                      <StatCard label="Paid" value={money(p.paid, 'INR')} hint={`Approved ${money(p.approved, 'INR')}`} />
                    </div>
                    <Table head={['Date', 'Commission', 'Status']} empty={!p.commissions.length}>
                      {p.commissions.map((c: any) => <tr key={c.id}><Td>{dateTime(c.createdAt)}</Td><Td>{money(c.amount, c.currency)}</Td><Td><StatusBadge status={c.status} /></Td></tr>)}
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        }
      </QueryView>
    </>
  );
}
