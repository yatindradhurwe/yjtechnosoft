import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { date } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { EmptyState, PageHeader, QueryView } from '@/components/ui/misc';

export default function Certificates() {
  const q = useQuery({ queryKey: ['certificates'], queryFn: () => api.get('/learn/certificates') });
  const [open, setOpen] = useState<any>(null);
  return (
    <>
      <PageHeader title="Certificates" description="Every certificate has a public verification link." />
      <QueryView q={q}>
        {(d) =>
          d.certificates.length === 0 ? (
            <EmptyState icon={<Award />} title="No certificates yet" description="Complete a course with certificates enabled to earn one." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {d.certificates.map((c: any) => (
                <button key={c.id} onClick={() => setOpen(c)} className="rounded-xl border bg-card p-5 text-left shadow-sm hover:border-primary">
                  <Award className="mb-2 h-6 w-6 text-warning" />
                  <p className="font-semibold">{c.courseTitle}</p>
                  <p className="text-sm text-muted-foreground">Issued {date(c.issuedAt)} · ID {c.verificationCode}</p>
                </button>
              ))}
            </div>
          )
        }
      </QueryView>
      {open && (
        <Modal open onOpenChange={() => setOpen(null)} title="Certificate" wide footer={<Button onClick={() => window.print()}><Printer /> Print / save as PDF</Button>}>
          <div className="rounded-lg border-4 border-double border-primary/50 p-10 text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Certificate of completion</p>
            <p className="mt-6 text-sm">This certifies that</p>
            <p className="mt-2 font-display text-3xl font-bold">{open.recipientName}</p>
            <p className="mt-4 text-sm">has successfully completed</p>
            <p className="mt-2 text-xl font-semibold">{open.courseTitle}</p>
            <p className="mt-8 text-xs text-muted-foreground">Issued {date(open.issuedAt)} · Verify at {location.origin}/verify/{open.verificationCode}</p>
          </div>
        </Modal>
      )}
    </>
  );
}
