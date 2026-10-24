import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { date } from '@/lib/utils';
import { Spinner } from '@/components/ui/misc';

export default function CertificateVerify() {
  const { code } = useParams();
  const q = useQuery({ queryKey: ['cert', code], queryFn: () => api.get(`/public/certificates/${code}`), retry: false });
  return (
    <div className="container max-w-xl py-20">
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <div className="rounded-xl border p-8 text-center">
          <XCircle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-3 text-2xl font-bold">Certificate not found</h1>
          <p className="mt-1 text-muted-foreground">No certificate matches the ID {code}.</p>
        </div>
      ) : (
        <div className="rounded-xl border p-8 text-center">
          <BadgeCheck className="mx-auto h-10 w-10 text-success" />
          <h1 className="mt-3 text-2xl font-bold">Verified certificate</h1>
          <p className="mt-4 text-lg">
            <strong>{q.data.certificate.recipientName}</strong> completed <strong>{q.data.certificate.courseTitle}</strong>
          </p>
          <p className="mt-1 text-muted-foreground">
            Issued by {q.data.issuer.name} on {date(q.data.certificate.issuedAt)} · ID {q.data.certificate.verificationCode}
          </p>
        </div>
      )}
    </div>
  );
}
