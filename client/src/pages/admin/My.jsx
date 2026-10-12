import { useState } from 'react';
import { Clock, CalendarOff, Plus, Banknote, FileSignature, Eye, Download, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errMsg, openPdf } from '../../lib/api';
import useFetch from '../../lib/useFetch';
import { fmtDate, MONTHS, money, today } from '../../lib/utils';
import { PageHeader, StatusBadge, EmptyState, PageLoader } from '../../components/ui';
import DataTable from '../../components/ui/DataTable';
import { AttendanceCalendar, ApplyLeaveModal } from './Hr';
import { CheckInCard } from './Dashboard';

export function MyAttendance() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const { data, reload } = useFetch('/hr/attendance/my', { month });
  const { data: t, reload: reloadToday } = useFetch('/hr/attendance/today');
  return (
    <div className="space-y-6">
      <PageHeader title="My Attendance" icon={Clock} actions={<input type="month" className="input w-48" value={month} onChange={(e) => setMonth(e.target.value)} />} />
      <CheckInCard today={t?.attendance} onChange={() => { reload(); reloadToday(); }} />
      {data ? <AttendanceCalendar rows={data.data} holidays={data.holidays} month={month} /> : <PageLoader />}
    </div>
  );
}

export function MyLeaves() {
  const { data, loading, reload } = useFetch('/hr/leaves', { mine: 1 });
  const { data: bal, reload: reloadBal } = useFetch('/hr/leaves/balance');
  const [apply, setApply] = useState(false);
  const cancel = async (r) => {
    try {
      await api.patch(`/hr/leaves/${r.id}/cancel`);
      toast.success('Leave request cancelled');
      reload();
      reloadBal();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div>
      <PageHeader title="My Leaves" icon={CalendarOff} actions={<button className="btn-primary" onClick={() => setApply(true)}><Plus className="h-4 w-4" /> Apply leave</button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(bal || []).map((l) => (
          <div key={l.id} className="card p-5">
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: l.color }} /><p className="text-sm font-semibold text-navy-900">{l.name}</p></div>
            <p className="mt-3 font-display text-3xl font-bold text-navy-900">{Number(l.is_paid) ? l.remaining : l.used}<span className="text-base font-medium text-slate-400">{Number(l.is_paid) ? ` / ${Number(l.days_per_year)}` : ' taken (unpaid)'}</span></p>
            <p className="mt-1 text-xs text-slate-500">{l.used} used · {l.pending} pending</p>
          </div>
        ))}
      </div>
      <DataTable
        loading={loading}
        rows={data?.data}
        columns={[
          { key: 'leave_type', label: 'Type' },
          { key: 'dates', label: 'Dates', render: (r) => `${fmtDate(r.from_date)} – ${fmtDate(r.to_date)}` },
          { key: 'days', label: 'Days' },
          { key: 'reason', label: 'Reason', render: (r) => <span className="whitespace-normal">{r.reason}</span> },
          { key: 'status', label: 'Status', render: (r) => <div><StatusBadge status={r.status} />{r.remarks && <p className="mt-1 text-xs text-slate-500">{r.remarks}</p>}</div> },
          { key: 'a', label: '', render: (r) => r.status === 'pending' && <button className="btn-ghost btn-sm text-red-600" onClick={() => cancel(r)}><X className="h-4 w-4" /> Cancel</button> },
        ]}
        empty={<EmptyState icon={CalendarOff} title="No leave requests yet" />}
      />
      <ApplyLeaveModal open={apply} onClose={() => setApply(false)} onSaved={() => { reload(); reloadBal(); }} />
    </div>
  );
}

export function MyPayslips() {
  const { data, loading } = useFetch('/hr/payslips', { mine: 1 });
  return (
    <div>
      <PageHeader title="My Payslips" icon={Banknote} />
      <DataTable
        loading={loading}
        rows={data?.data}
        columns={[
          { key: 'm', label: 'Month', render: (r) => <b>{MONTHS[r.month - 1]} {r.year}</b> },
          { key: 'days', label: 'Paid days', render: (r) => `${Number(r.paid_days)} / ${Number(r.working_days)}` },
          { key: 'gross', label: 'Gross', render: (r) => money(r.gross) },
          { key: 'net_pay', label: 'Net pay', render: (r) => <b className="text-emerald-700">{money(r.net_pay)}</b> },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'a', label: '', render: (r) => <div className="flex justify-end gap-1"><button className="btn-ghost btn-sm" onClick={() => openPdf('payslip', r.id)}><Eye className="h-4 w-4" /> View</button><button className="btn-ghost btn-sm" onClick={() => openPdf('payslip', r.id, true)}><Download className="h-4 w-4" /></button></div> },
        ]}
        empty={<EmptyState icon={Banknote} title="No payslips yet" />}
      />
    </div>
  );
}

export function MyLetters() {
  const { data, loading } = useFetch('/recruitment/letters', { mine: 1 });
  return (
    <div>
      <PageHeader title="My Letters" subtitle="Offer, joining, experience and other letters issued to you" icon={FileSignature} />
      <DataTable
        loading={loading}
        rows={data?.data}
        columns={[
          { key: 'title', label: 'Letter', render: (r) => <b>{r.title}</b> },
          { key: 'letter_no', label: 'Reference' },
          { key: 'issue_date', label: 'Date', render: (r) => fmtDate(r.issue_date) },
          { key: 'a', label: '', render: (r) => <div className="flex justify-end gap-1"><button className="btn-ghost btn-sm" onClick={() => openPdf('letter', r.id)}><Eye className="h-4 w-4" /> View</button><button className="btn-ghost btn-sm" onClick={() => openPdf('letter', r.id, true)}><Download className="h-4 w-4" /></button></div> },
        ]}
        empty={<EmptyState icon={FileSignature} title="No letters yet" />}
      />
    </div>
  );
}
