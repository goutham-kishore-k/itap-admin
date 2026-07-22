'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchMySubmissions, type MySubmission } from '../actions';

const STATUS_STYLE: Record<MySubmission['status'], string> = {
  draft:     'bg-gray-50 text-gray-500 border-gray-200',
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  approved:  'bg-green-50 text-green-700 border-green-200',
  rejected:  'bg-red-50 text-red-700 border-red-200',
  mixed:     'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_LABEL: Record<MySubmission['status'], string> = {
  draft:     'Draft',
  submitted: 'Awaiting approval',
  approved:  'Approved',
  rejected:  'Rejected',
  mixed:     'Mixed',
};

function displayPeriod(s: MySubmission): string {
  const start = new Date(s.periodStart + 'T12:00:00');
  const end   = new Date(s.periodEnd   + 'T12:00:00');
  if (s.periodType === 'monthly') return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export default function TimesheetHistoryPage() {
  const [submissions, setSubmissions] = useState<MySubmission[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    fetchMySubmissions().then(rows => { setSubmissions(rows); setLoading(false); });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Timesheets</h1>
          <p className="text-sm text-gray-400 mt-0.5">Every timesheet you've started, most recent first.</p>
        </div>
        <Link href="/portal/timesheet"
          className="px-4 py-2 bg-brand text-white text-sm font-semibold rounded-full hover:bg-brand-dark transition-colors">
          + New Submission
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 h-20" />
          ))}
        </div>
      ) : submissions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-14">
          <p className="text-sm text-gray-400">You haven&apos;t started a timesheet yet.</p>
          <Link href="/portal/timesheet" className="text-sm font-semibold text-brand hover:underline mt-2 inline-block">
            Start a new submission
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map(s => (
            <Link key={`${s.periodStart}-${s.periodEnd}-${s.timesheetId ?? s.submittedAt}`}
              href={`/portal/timesheet?type=${s.periodType}&start=${s.periodStart}&end=${s.periodEnd}`}
              className="block bg-white rounded-2xl border border-gray-100 px-5 py-4 hover:border-brand/30 hover:shadow-sm transition-all">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">
                      {s.periodType}
                    </span>
                    <p className="text-sm font-bold text-gray-900">{displayPeriod(s)}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs text-gray-400">{s.entryCount} entr{s.entryCount !== 1 ? 'ies' : 'y'}</span>
                    {s.submittedAt && (
                      <span className="text-xs text-gray-400">
                        · Submitted {new Date(s.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                    {s.timesheetId && <span className="text-xs font-mono font-bold text-gray-400">· {s.timesheetId}</span>}
                  </div>
                  {s.status === 'rejected' && s.rejectionReasons.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {s.rejectionReasons.map((r, i) => (
                        <p key={i} className="text-xs text-red-700 font-medium">Reason: {r}</p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0 flex items-center gap-3">
                  <div>
                    <p className="text-xl font-black text-gray-900 leading-none">
                      {s.totalHours.toFixed(1)}<span className="text-sm font-semibold text-gray-400 ml-0.5">h</span>
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${STATUS_STYLE[s.status]}`}>
                    {STATUS_LABEL[s.status]}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
