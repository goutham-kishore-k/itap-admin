'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import {
  approvePeriod, rejectPeriod, revertApproval,
} from '@/app/dashboard/timesheets/actions';
import { fetchTeamPendingBatches, type TeamPendingBatch } from './actions';

// ─── date helpers ─────────────────────────────────────────────────────────────

function displayDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function displayBatchPeriod(b: TeamPendingBatch) {
  const s = new Date(b.periodStart + 'T12:00:00');
  const e = new Date(b.periodEnd   + 'T12:00:00');
  if (b.periodType === 'monthly') return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function displayPeriod(row: ApprovalRow) {
  const s = new Date(row.period_start + 'T12:00:00');
  const e = new Date(row.period_end   + 'T12:00:00');
  if (row.period_type === 'daily')
    return s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (row.period_type === 'monthly')
    return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// A batch's own identity — an employee can have more than one pending
// submission at once (e.g. a custom range and a separate month both awaiting
// review), so actions/expansion state key off this, not just employee id.
function batchKey(b: TeamPendingBatch) {
  return `${b.empId}:${b.periodStart}:${b.periodEnd}`;
}

// ─── types ────────────────────────────────────────────────────────────────────

type Tab = 'review' | 'history';

interface ApprovalRow {
  id: string;
  short_id: string;
  employee_id: string;
  emp_name: string;
  period_type: 'daily' | 'monthly' | 'range';
  period_start: string;
  period_end: string;
  total_hours: number;
  entry_count: number;
  status: 'approved' | 'reverted';
  notes: string | null;
  approved_by_name: string | null;
  approved_at: string;
  reverted_by_name: string | null;
  reverted_at: string | null;
}

interface DirectReport { id: string; full_name: string; }

const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  submitted: 'bg-blue-50 text-blue-700',
  approved:  'bg-green-50 text-green-700',
  rejected:  'bg-red-50 text-red-700',
};

// ─── component ────────────────────────────────────────────────────────────────

export default function TeamTimesheetsPage() {
  const [tab, setTab]                 = useState<Tab>('review');
  const [reports, setReports]         = useState<DirectReport[]>([]);
  const [batches, setBatches]         = useState<TeamPendingBatch[]>([]);
  const [loading, setLoading]         = useState(false);

  // Export modal state
  const [showExport, setShowExport]       = useState(false);
  const [exportEmpId, setExportEmpId]     = useState('');
  const [exportFrom, setExportFrom]       = useState('');
  const [exportTo, setExportTo]           = useState('');

  // History tab state
  const [approvals, setApprovals]         = useState<ApprovalRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [histEmpFilter, setHistEmpFilter] = useState('all');
  const [histStatus, setHistStatus]       = useState('all');
  const [reverting, setReverting]         = useState<string | null>(null);
  const [revertConfirm, setRevertConfirm] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

  // Per-batch action state
  const [acting, setActing]               = useState<string | null>(null);
  const [rejectingBatch, setRejectingBatch] = useState<string | null>(null);
  const [rejectReason, setRejectReason]   = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [lastApproved, setLastApproved]   = useState<Record<string, string>>({});

  function toggleExpand(key: string) {
    setExpandedBatches(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Load direct reports (for the employee filter/export dropdowns + "team members" count)
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: emp } = await supabase.from('employees').select('id').eq('user_id', user.id).single();
      if (!emp) return;
      const { data: reps } = await supabase
        .from('employees').select('id, full_name')
        .eq('manager_id', emp.id).eq('is_active', true).order('full_name');
      setReports(reps ?? []);
    });
  }, []);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchTeamPendingBatches();
      setBatches(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (tab === 'review') loadBatches(); }, [loadBatches, tab]);

  const loadHistory = useCallback(async () => {
    if (!reports.length) return;
    setLoadingHistory(true);
    const supabase = createClient();
    const reportIds = reports.map(r => r.id);

    let q = supabase
      .from('timesheet_approvals')
      .select(`*, employees!employee_id(full_name), approver:approved_by(full_name), reverter:reverted_by(full_name)`)
      .in('employee_id', reportIds)
      .order('approved_at', { ascending: false });

    if (histEmpFilter !== 'all') q = q.eq('employee_id', histEmpFilter);
    if (histStatus !== 'all')    q = q.eq('status', histStatus);

    const { data } = await q;
    setApprovals((data ?? []).map(r => ({
      id:               r.id,
      short_id:         'TS-' + r.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
      employee_id:      r.employee_id,
      emp_name:         (r.employees as unknown as { full_name: string } | null)?.full_name ?? '—',
      period_type:      r.period_type,
      period_start:     r.period_start,
      period_end:       r.period_end,
      total_hours:      Number(r.total_hours),
      entry_count:      r.entry_count,
      status:           r.status,
      notes:            r.notes,
      approved_by_name: (r.approver as unknown as { full_name: string } | null)?.full_name ?? null,
      approved_at:      r.approved_at,
      reverted_by_name: (r.reverter as unknown as { full_name: string } | null)?.full_name ?? null,
      reverted_at:      r.reverted_at ?? null,
    })));
    setLoadingHistory(false);
  }, [reports, histEmpFilter, histStatus]);

  useEffect(() => { if (tab === 'history' && reports.length) loadHistory(); }, [loadHistory, tab, reports]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredBatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return q ? batches.filter(b => b.empName.toLowerCase().includes(q)) : batches;
  }, [batches, searchQuery]);

  const employeesWithPending = useMemo(() => new Set(batches.map(b => b.empId)).size, [batches]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleApprove(batch: TeamPendingBatch) {
    const key = batchKey(batch);
    const submitted = batch.entries.filter(e => e.status === 'submitted');
    if (!submitted.length) return;
    setActing(key);
    const approvalId = await approvePeriod(
      batch.empId, batch.periodType, batch.periodStart, batch.periodEnd,
      submitted.map(e => e.id), batch.totalHours, approvalNotes || null,
    );
    const shortId = 'TS-' + approvalId.replace(/-/g, '').slice(0, 8).toUpperCase();
    setLastApproved(prev => ({ ...prev, [key]: shortId }));
    setApprovalNotes('');
    setActing(null);
    loadBatches();
  }

  async function handleReject(batch: TeamPendingBatch) {
    if (!rejectReason.trim()) return;
    const key = batchKey(batch);
    const submitted = batch.entries.filter(e => e.status === 'submitted');
    if (!submitted.length) return;
    setActing(key);
    await rejectPeriod(
      batch.empId, batch.periodType, batch.periodStart, batch.periodEnd,
      submitted.map(e => e.id), rejectReason.trim(),
    );
    setRejectingBatch(null);
    setRejectReason('');
    setActing(null);
    loadBatches();
  }

  async function handleRevert(approvalId: string) {
    setReverting(approvalId);
    await revertApproval(approvalId);
    setReverting(null);
    setRevertConfirm(null);
    loadHistory();
  }

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-semibold rounded-full transition-all ${tab === t ? 'bg-ink text-white' : 'text-gray-500 hover:text-gray-900'}`;
  const filterBtn = (v: string, cur: string) =>
    `px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${v === cur ? 'bg-ink text-white border-ink' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Team Timesheets</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {reports.length} direct report{reports.length !== 1 ? 's' : ''}
            {batches.length > 0 && ` · ${batches.length} submission${batches.length !== 1 ? 's' : ''} awaiting review`}
          </p>
        </div>
        {reports.length > 0 && (
          <button onClick={() => {
            const now = new Date();
            const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
            setExportFrom(`${y}-${m}-01`);
            setExportTo(now.toISOString().split('T')[0]);
            setExportEmpId(reports[0]?.id ?? '');
            setShowExport(true);
          }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-white border border-gray-200 text-gray-700 rounded-full hover:border-gray-300 transition-colors shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            Export PDF
          </button>
        )}
      </div>

      {/* Export modal */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Export Timesheet Report</h2>
              <button onClick={() => setShowExport(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Employee</label>
                <select value={exportEmpId} onChange={e => setExportEmpId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
                  {reports.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">From</label>
                  <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">To</label>
                  <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white" />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                disabled={!exportEmpId || !exportFrom || !exportTo || exportFrom > exportTo}
                onClick={() => {
                  window.open(`/api/report/timesheet?empId=${exportEmpId}&from=${exportFrom}&to=${exportTo}`, '_blank');
                  setShowExport(false);
                }}
                className="flex-1 py-2.5 bg-brand text-white text-sm font-semibold rounded-full hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Generate PDF
              </button>
              <button onClick={() => setShowExport(false)}
                className="px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-semibold rounded-full hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1 w-fit">
        <button className={tabCls('review')}  onClick={() => setTab('review')}>Review</button>
        <button className={tabCls('history')} onClick={() => setTab('history')}>Approval History</button>
      </div>

      {tab === 'review' && (<>

      {/* Simple stats — period-agnostic, since a batch is whatever an employee
          actually submitted (any month/range), not a fixed calendar window */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border px-5 py-4 bg-gray-50 border-gray-200 text-gray-500">
            <p className="text-2xl font-black">{reports.length}</p>
            <p className="text-xs font-semibold mt-0.5 opacity-80">Team members</p>
          </div>
          <div className="rounded-2xl border px-5 py-4 bg-blue-50 border-blue-200 text-blue-700">
            <p className="text-2xl font-black">{batches.length}</p>
            <p className="text-xs font-semibold mt-0.5 opacity-80">Pending submissions</p>
          </div>
          <div className="rounded-2xl border px-5 py-4 bg-amber-50 border-amber-200 text-amber-700">
            <p className="text-2xl font-black">{employeesWithPending}</p>
            <p className="text-xs font-semibold mt-0.5 opacity-80">Members with pending items</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search team member by name…"
          className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand bg-white" />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        )}
      </div>

      {/* Pending submissions */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-32 bg-gray-200 rounded" />
                    <div className="h-3 w-20 bg-gray-100 rounded" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-6 w-16 bg-gray-100 rounded-full" />
                  <div className="h-8 w-20 bg-gray-100 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-14 text-gray-400 text-sm">
          {searchQuery ? `No team members matching "${searchQuery}"` : 'Nothing awaiting review right now.'}
        </div>
      ) : (
        <div className="space-y-3">
          {searchQuery && (
            <p className="text-xs text-gray-400">
              Showing {filteredBatches.length} of {batches.length} submission{batches.length !== 1 ? 's' : ''}
            </p>
          )}
          {filteredBatches.map(b => {
            const key             = batchKey(b);
            const isActing        = acting === key;
            const isRejecting     = rejectingBatch === key;
            const isExpanded      = expandedBatches.has(key);
            const approvedShortId = lastApproved[key];

            return (
              <div key={key} className="bg-white rounded-2xl border border-blue-200 overflow-hidden transition-all">

                {/* Collapsed header */}
                <button onClick={() => toggleExpand(key)}
                  className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors text-left">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-blue-100 text-blue-700">
                    {b.empName.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{b.empName}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full capitalize">{b.periodType}</span>
                      <span className="text-[10px] text-gray-400">{displayBatchPeriod(b)}</span>
                      {approvedShortId && (
                        <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">✓ {approvedShortId}</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 mr-2">
                    <p className="text-xl font-black text-gray-900 leading-none">
                      {b.totalHours.toFixed(1)}<span className="text-sm font-semibold text-gray-400 ml-0.5">h</span>
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{b.entries.length} entr{b.entries.length !== 1 ? 'ies' : 'y'}</p>
                  </div>

                  <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <>
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm border-t border-gray-100">
                      <thead>
                        <tr className="border-b border-gray-50 bg-gray-50/50">
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Project</th>
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Hrs</th>
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Notes</th>
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {b.entries.map(e => (
                          <tr key={e.id} className="hover:bg-gray-50/30 transition-colors">
                            <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap text-xs">{displayDate(e.date)}</td>
                            <td className="px-5 py-2.5 font-medium text-gray-900">{e.project}</td>
                            <td className="px-5 py-2.5 font-semibold text-gray-700">{e.hours}h</td>
                            <td className="px-5 py-2.5 text-gray-400 hidden md:table-cell text-xs">{e.notes ?? '—'}</td>
                            <td className="px-5 py-2.5">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[e.status]}`}>
                                {e.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>

                    <div className="px-5 py-4 border-t border-gray-50 space-y-3">
                      {isRejecting ? (
                        <div className="space-y-2 bg-red-50 border border-red-100 rounded-xl p-4">
                          <label className="block text-xs font-semibold text-red-700">Rejection reason <span className="text-red-500">*</span></label>
                          <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                            rows={2} autoFocus placeholder="Explain why these entries are being rejected…"
                            className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:border-red-400 bg-white resize-none" />
                          <div className="flex gap-2">
                            <button onClick={() => handleReject(b)} disabled={!rejectReason.trim() || isActing}
                              className="px-4 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-full hover:bg-red-700 disabled:opacity-50 transition-colors">
                              {isActing ? '…' : 'Confirm Reject'}
                            </button>
                            <button onClick={() => { setRejectingBatch(null); setRejectReason(''); }}
                              className="px-4 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-semibold rounded-full hover:border-gray-300 transition-colors">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-semibold text-gray-400 mb-1">Approval note (optional)</label>
                            <input value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)}
                              placeholder="e.g. Reviewed and confirmed"
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleApprove(b)} disabled={isActing}
                              className="px-4 py-2 bg-green-600 text-white text-xs font-semibold rounded-full hover:bg-green-700 disabled:opacity-50 transition-colors">
                              {isActing ? '…' : 'Approve'}
                            </button>
                            <button onClick={() => { setRejectingBatch(key); setRejectReason(''); }} disabled={isActing}
                              className="px-4 py-2 bg-white border border-red-200 text-red-600 text-xs font-semibold rounded-full hover:bg-red-50 disabled:opacity-50 transition-colors">
                              Reject
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      </>)}

      {/* ── HISTORY TAB ─────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <select value={histEmpFilter} onChange={e => setHistEmpFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
              <option value="all">All team members</option>
              {reports.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
            </select>
            <div className="flex gap-1.5">
              {['all', 'approved', 'reverted'].map(s => (
                <button key={s} onClick={() => setHistStatus(s)} className={filterBtn(s, histStatus)}>
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {loadingHistory ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 border border-gray-100 rounded-xl gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-gray-100 shrink-0" />
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-28 bg-gray-200 rounded" />
                      <div className="h-3 w-20 bg-gray-100 rounded" />
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <div className="h-5 w-14 bg-gray-100 rounded-full" />
                    <div className="h-5 w-10 bg-gray-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : approvals.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 text-center py-14 text-gray-400 text-sm">
              No approvals found.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Approval ID</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Employee</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Period</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Hrs / Entries</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Approved by</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {approvals.map(a => {
                    const isReverting    = reverting === a.id;
                    const confirmingThis = revertConfirm === a.id;
                    return (
                      <tr key={a.id} className={`hover:bg-gray-50/30 transition-colors ${a.status === 'reverted' ? 'opacity-60' : ''}`}>
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs font-bold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-lg">{a.short_id}</span>
                          {a.notes && <p className="text-[10px] text-gray-400 mt-0.5 max-w-[120px] truncate" title={a.notes}>{a.notes}</p>}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-gray-900">{a.emp_name}</td>
                        <td className="px-5 py-3.5">
                          <span className="text-gray-700">{displayPeriod(a)}</span>
                          <p className="text-[10px] text-gray-400 mt-0.5 capitalize">{a.period_type}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-semibold text-gray-900">{a.total_hours.toFixed(1)}h</span>
                          <span className="text-gray-400 text-xs ml-1">· {a.entry_count} entr{a.entry_count !== 1 ? 'ies' : 'y'}</span>
                        </td>
                        <td className="px-5 py-3.5 hidden lg:table-cell text-gray-500 text-xs">
                          <p>{a.approved_by_name ?? '—'}</p>
                          <p className="text-gray-400">{new Date(a.approved_at).toLocaleDateString()}</p>
                          {a.reverted_at && (
                            <p className="text-amber-600 mt-0.5">Reverted {new Date(a.reverted_at).toLocaleDateString()} by {a.reverted_by_name}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
                            a.status === 'approved' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {a.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {a.status === 'approved' && (
                            confirmingThis ? (
                              <div className="flex items-center gap-2 justify-end">
                                <span className="text-xs text-gray-500">Revert approval?</span>
                                <button onClick={() => handleRevert(a.id)} disabled={isReverting}
                                  className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50">
                                  {isReverting ? '…' : 'Yes, revert'}
                                </button>
                                <button onClick={() => setRevertConfirm(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => setRevertConfirm(a.id)}
                                className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors">
                                Revert
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
