'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchEmployees, fetchEntries, fetchApprovals,
  approvePeriod, rejectPeriod, revertApproval,
  type EmpOption, type EntryRow, type ApprovalRow,
} from './actions';

// ─── date helpers ────────────────────────────────────────────────────────────

function fmtDate(d: Date) { return d.toISOString().split('T')[0]; }
function today() { return fmtDate(new Date()); }

function todayMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayWeek() {
  const d = new Date();
  const jan4 = new Date(Date.UTC(d.getFullYear(), 0, 4));
  const dayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - dayNum);
  const diff = d.getTime() - week1Mon.getTime();
  const week = Math.floor(diff / 604800000) + 1;
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weekValueToRange(value: string): { start: string; end: string } {
  const [yearStr, wStr] = value.split('-W');
  const year = parseInt(yearStr), week = parseInt(wStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayNum = (jan4.getUTCDay() + 6) % 7;
  const mon = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - dayNum + (week - 1) * 7);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return { start: fmtDate(mon), end: fmtDate(sun) };
}

function monthValueToRange(value: string): { start: string; end: string } {
  const [y, m] = value.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last  = new Date(Date.UTC(y, m, 0));
  return { start: fmtDate(first), end: fmtDate(last) };
}

function getPeriodRange(type: PeriodType, value: string): { start: string; end: string } {
  if (type === 'daily')  return { start: value, end: value };
  if (type === 'weekly') return weekValueToRange(value);
  return monthValueToRange(value);
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

function displayDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── constants ───────────────────────────────────────────────────────────────

type PeriodType = 'daily' | 'weekly' | 'monthly';
type Tab = 'review' | 'history';

const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  submitted: 'bg-blue-50 text-blue-700',
  approved:  'bg-green-50 text-green-700',
  rejected:  'bg-red-50 text-red-700',
};

// ─── stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: {
  label: string; value: number | string; sub?: string;
  color: 'blue' | 'green' | 'amber' | 'gray' | 'red';
}) {
  const colors = {
    blue:  'bg-blue-50 border-blue-100 text-blue-700',
    green: 'bg-green-50 border-green-100 text-green-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    gray:  'bg-gray-50 border-gray-100 text-gray-500',
    red:   'bg-red-50 border-red-100 text-red-700',
  };
  return (
    <div className={`rounded-2xl border px-5 py-4 ${colors[color]}`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs font-semibold mt-0.5 opacity-80">{label}</p>
      {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function TimesheetsPage() {
  const [tab, setTab] = useState<Tab>('review');

  // Review tab state
  const [employees, setEmployees]     = useState<EmpOption[]>([]);
  const [periodType, setPeriodType]   = useState<PeriodType>('weekly');
  const [periodValue, setPeriodValue] = useState(() => todayWeek());
  const [entries, setEntries]         = useState<EntryRow[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Per-group action state
  const [acting, setActing]             = useState<string | null>(null);
  const [rejectingEmp, setRejectingEmp] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [lastApproved, setLastApproved] = useState<Record<string, string>>({});
  const [revertConfirmGroup, setRevertConfirmGroup] = useState<string | null>(null);

  // History tab state
  const [approvals, setApprovals]       = useState<ApprovalRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [histEmp, setHistEmp]           = useState('all');
  const [histStatus, setHistStatus]     = useState('all');
  const [reverting, setReverting]       = useState<string | null>(null);
  const [revertConfirm, setRevertConfirm] = useState<string | null>(null);

  useEffect(() => { fetchEmployees().then(setEmployees); }, []);

  const loadEntries = useCallback(async () => {
    setLoadingEntries(true);
    const { start, end } = getPeriodRange(periodType, periodValue);
    const rows = await fetchEntries('all', start, end);
    setEntries(rows);
    setLoadingEntries(false);
  }, [periodType, periodValue]);

  useEffect(() => { if (tab === 'review') loadEntries(); }, [loadEntries, tab]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const rows = await fetchApprovals(histEmp, histStatus);
    setApprovals(rows);
    setLoadingHistory(false);
  }, [histEmp, histStatus]);

  useEffect(() => { if (tab === 'history') loadHistory(); }, [loadHistory, tab]);

  // ── Stats derived from entries + employees list ───────────────────────────
  const stats = useMemo(() => {
    const submittedEmpIds = new Set(entries.filter(e => e.status === 'submitted').map(e => e.employee_id));
    const approvedEmpIds  = new Set(entries.filter(e => e.status === 'approved').map(e => e.employee_id));
    const hasEntriesIds   = new Set(entries.map(e => e.employee_id));
    const pendingCount    = entries.filter(e => e.status === 'submitted').length;
    const notStarted      = employees.filter(e => !hasEntriesIds.has(e.id)).length;
    return {
      total:        employees.length,
      submitted:    submittedEmpIds.size,
      approved:     approvedEmpIds.size,
      pending:      pendingCount,
      notStarted,
    };
  }, [employees, entries]);

  // ── Group entries by employee ─────────────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, { empId: string; name: string; entries: EntryRow[]; totalHours: number; submittedHours: number }>();
    entries.forEach(e => {
      if (!map.has(e.employee_id))
        map.set(e.employee_id, { empId: e.employee_id, name: e.emp_name, entries: [], totalHours: 0, submittedHours: 0 });
      const g = map.get(e.employee_id)!;
      g.entries.push(e);
      g.totalHours += e.hours;
      if (e.status === 'submitted') g.submittedHours += e.hours;
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return q ? groups.filter(g => g.name.toLowerCase().includes(q)) : groups;
  }, [groups, searchQuery]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleApprove(empId: string, empEntries: EntryRow[]) {
    const submitted = empEntries.filter(e => e.status === 'submitted');
    if (!submitted.length) return;
    setActing(empId);
    const { start, end } = getPeriodRange(periodType, periodValue);
    const totalHours = submitted.reduce((s, e) => s + e.hours, 0);
    const approvalId = await approvePeriod(empId, periodType, start, end, submitted.map(e => e.id), totalHours, approvalNotes || null);
    const shortId = 'TS-' + approvalId.replace(/-/g, '').slice(0, 8).toUpperCase();
    setLastApproved(prev => ({ ...prev, [empId]: shortId }));
    setApprovalNotes('');
    setActing(null);
    loadEntries();
  }

  async function handleReject(empId: string, empEntries: EntryRow[]) {
    if (!rejectReason.trim()) return;
    const submitted = empEntries.filter(e => e.status === 'submitted');
    if (!submitted.length) return;
    setActing(empId);
    await rejectPeriod(submitted.map(e => e.id), rejectReason.trim());
    setRejectingEmp(null);
    setRejectReason('');
    setActing(null);
    loadEntries();
  }

  async function handleRevertGroup(empId: string, approvalIds: string[]) {
    setActing(empId);
    for (const id of approvalIds) await revertApproval(id);
    setRevertConfirmGroup(null);
    setActing(null);
    loadEntries();
  }

  async function handleRevert(approvalId: string) {
    setReverting(approvalId);
    await revertApproval(approvalId);
    setReverting(null);
    setRevertConfirm(null);
    loadHistory();
  }

  function changePeriodType(t: PeriodType) {
    setPeriodType(t);
    if (t === 'daily')   setPeriodValue(today());
    if (t === 'weekly')  setPeriodValue(todayWeek());
    if (t === 'monthly') setPeriodValue(todayMonth());
  }

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-semibold rounded-full transition-all ${tab === t ? 'bg-ink text-white' : 'text-gray-500 hover:text-gray-900'}`;
  const filterBtn = (v: string, cur: string) =>
    `px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${v === cur ? 'bg-ink text-white border-ink' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`;
  const periodInputType = periodType === 'daily' ? 'date' : periodType === 'weekly' ? 'week' : 'month';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Timesheets</h1>
        <p className="text-sm text-gray-400 mt-0.5">Review and approve employee timesheets</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1 w-fit">
        <button className={tabCls('review')}  onClick={() => setTab('review')}>Review</button>
        <button className={tabCls('history')} onClick={() => setTab('history')}>Approval History</button>
      </div>

      {/* ── REVIEW TAB ──────────────────────────────────────────────────── */}
      {tab === 'review' && (
        <div className="space-y-4">
          {/* Period filters */}
          <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Period</label>
              <div className="flex gap-1">
                {(['daily', 'weekly', 'monthly'] as PeriodType[]).map(t => (
                  <button key={t} onClick={() => changePeriodType(t)}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all capitalize ${periodType === t ? 'bg-ink text-white border-ink' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 capitalize">{periodType}</label>
              <input type={periodInputType} value={periodValue} onChange={e => setPeriodValue(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white" />
            </div>
          </div>

          {/* Stats cards */}
          {!loadingEntries && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Total employees"    value={stats.total}     color="gray" />
              <StatCard label="Submitted"          value={stats.submitted} color="blue"  sub="awaiting review" />
              <StatCard label="Approved"           value={stats.approved}  color="green" />
              <StatCard label="Pending entries"    value={stats.pending}   color="amber" sub="entries to review" />
              <StatCard label="Not started"        value={stats.notStarted} color={stats.notStarted > 0 ? 'red' : 'gray'} sub="no entries logged" />
            </div>
          )}

          {/* Search bar */}
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search employee by name…"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand bg-white"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">
                ×
              </button>
            )}
          </div>

          {/* Entries */}
          {loadingEntries ? (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 text-center py-14 text-gray-400 text-sm">
              {searchQuery ? `No employees matching "${searchQuery}"` : 'No timesheet entries for this period.'}
            </div>
          ) : (
            <div className="space-y-4">
              {searchQuery && filteredGroups.length > 0 && (
                <p className="text-xs text-gray-400">
                  Showing {filteredGroups.length} of {groups.length} employee{groups.length !== 1 ? 's' : ''}
                </p>
              )}
              {filteredGroups.map(g => {
                const submitted       = g.entries.filter(e => e.status === 'submitted');
                const approved        = g.entries.filter(e => e.status === 'approved');
                const approvalIds     = [...new Set(approved.map(e => e.approval_id).filter((id): id is string => Boolean(id)))];
                const isActing        = acting === g.empId;
                const isRejecting     = rejectingEmp === g.empId;
                const isRevertingGroup = revertConfirmGroup === g.empId;
                const approvedId      = lastApproved[g.empId];
                const allApproved     = g.entries.length > 0 && g.entries.every(e => e.status === 'approved');

                return (
                  <div key={g.empId} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-50">
                      <div>
                        <span className="text-sm font-bold text-gray-900">{g.name}</span>
                        <span className="text-xs text-gray-400 ml-3">
                          {g.totalHours.toFixed(1)}h total
                          {submitted.length > 0 && ` · ${submitted.length} entr${submitted.length !== 1 ? 'ies' : 'y'} (${g.submittedHours.toFixed(1)}h) pending`}
                        </span>
                      </div>
                      {approvedId && (
                        <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                          ✓ {approvedId}
                        </span>
                      )}
                      {allApproved && !approvedId && (
                        <span className="text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">All approved</span>
                      )}
                    </div>

                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-50 bg-gray-50/30">
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Project</th>
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Hrs</th>
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Notes</th>
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {g.entries.map(e => (
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

                    {(submitted.length > 0 || approvalIds.length > 0) && (
                      <div className="px-5 py-4 border-t border-gray-50 space-y-3">
                        {submitted.length > 0 && (
                          isRejecting ? (
                            <div className="space-y-2 bg-red-50 border border-red-100 rounded-xl p-4">
                              <label className="block text-xs font-semibold text-red-700">Rejection reason <span className="text-red-500">*</span></label>
                              <textarea
                                value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                                rows={2} autoFocus placeholder="Explain why these entries are being rejected…"
                                className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:border-red-400 bg-white resize-none" />
                              <div className="flex gap-2">
                                <button onClick={() => handleReject(g.empId, g.entries)} disabled={!rejectReason.trim() || isActing}
                                  className="px-4 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-full hover:bg-red-700 disabled:opacity-50 transition-colors">
                                  {isActing ? '…' : 'Confirm Reject'}
                                </button>
                                <button onClick={() => { setRejectingEmp(null); setRejectReason(''); }}
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
                                <button onClick={() => handleApprove(g.empId, g.entries)} disabled={isActing}
                                  className="px-4 py-2 bg-green-600 text-white text-xs font-semibold rounded-full hover:bg-green-700 disabled:opacity-50 transition-colors">
                                  {isActing ? '…' : `Approve ${submitted.length > 1 ? `${submitted.length} entries` : 'entry'}`}
                                </button>
                                <button onClick={() => { setRejectingEmp(g.empId); setRejectReason(''); }} disabled={isActing}
                                  className="px-4 py-2 bg-white border border-red-200 text-red-600 text-xs font-semibold rounded-full hover:bg-red-50 disabled:opacity-50 transition-colors">
                                  Reject
                                </button>
                              </div>
                            </div>
                          )
                        )}

                        {approvalIds.length > 0 && (
                          isRevertingGroup ? (
                            <div className="flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                              <span className="text-xs text-amber-800 font-medium flex-1">
                                Revert {approved.length} approved entr{approved.length !== 1 ? 'ies' : 'y'}? They'll go back to submitted.
                              </span>
                              <button onClick={() => handleRevertGroup(g.empId, approvalIds)} disabled={isActing}
                                className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 whitespace-nowrap">
                                {isActing ? '…' : 'Yes, revert'}
                              </button>
                              <button onClick={() => setRevertConfirmGroup(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-400">{approved.length} entr{approved.length !== 1 ? 'ies' : 'y'} approved</span>
                              <button onClick={() => setRevertConfirmGroup(g.empId)} disabled={isActing}
                                className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50">
                                Revert Approval
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY TAB ─────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <select value={histEmp} onChange={e => setHistEmp(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
              <option value="all">All employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
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
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : approvals.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 text-center py-14 text-gray-400 text-sm">
              No approvals found.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
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
