'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  fetchEmployees, fetchPendingSubmissions, fetchApprovals, revertApproval, fetchEntries,
  type EmpOption, type ApprovalRow, type PendingSubmission,
} from './actions';
import {
  getMonthStart, getMonthEnd, addMonths, fmt,
  dayStatus, monthGridCells, DAY_CELL_STYLE, WEEKDAY_HEADERS,
} from '@/lib/calendar-utils';

// ─── date helpers ────────────────────────────────────────────────────────────

function displayPeriod(row: ApprovalRow) {
  const s = new Date(row.period_start + 'T12:00:00');
  const e = new Date(row.period_end   + 'T12:00:00');
  if (row.period_type === 'daily')
    return s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (row.period_type === 'monthly')
    return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function displaySubmissionRange(p: PendingSubmission) {
  const s = new Date(p.periodStart + 'T12:00:00');
  const e = new Date(p.periodEnd   + 'T12:00:00');
  if (p.periodType === 'monthly') return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// ─── constants ───────────────────────────────────────────────────────────────

type Tab = 'review' | 'history';

const PERIOD_TYPE_BADGE: Record<PendingSubmission['periodType'], string> = {
  monthly: 'bg-purple-50 text-purple-700',
  range:   'bg-amber-50 text-amber-700',
};

// ─── stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: {
  label: string; value: number | string; sub?: string;
  color: 'blue' | 'green' | 'amber' | 'gray' | 'red';
}) {
  const colors = {
    blue:  'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    gray:  'bg-gray-50 border-gray-200 text-gray-500',
    red:   'bg-red-50 border-red-200 text-red-700',
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
  const [employees, setEmployees] = useState<EmpOption[]>([]);

  // Review tab — queue of everyone with pending submissions
  const [pending, setPending] = useState<PendingSubmission[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [pickerOpen, setPickerOpen]   = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<EmpOption | null>(null);

  // Small calendar shown alongside the list once an employee is selected
  const [calMonth, setCalMonth]     = useState<Date | null>(null);
  const [calEntries, setCalEntries] = useState<{ date: string; status: string }[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // That employee's already-approved timesheets — shown below the pending list
  const [approvedForEmp, setApprovedForEmp] = useState<ApprovalRow[]>([]);
  const [loadingApprovedForEmp, setLoadingApprovedForEmp] = useState(false);

  // History tab state
  const [approvals, setApprovals]       = useState<ApprovalRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [histEmp, setHistEmp]           = useState('all');
  const [histStatus, setHistStatus]     = useState('all');
  const [reverting, setReverting]       = useState<string | null>(null);
  const [revertConfirm, setRevertConfirm] = useState<string | null>(null);

  // Export modal state
  const [showExport, setShowExport]   = useState(false);
  const [exportEmpId, setExportEmpId] = useState('');
  const [exportFrom, setExportFrom]   = useState('');
  const [exportTo, setExportTo]       = useState('');

  useEffect(() => { fetchEmployees().then(setEmployees); }, []);

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    const rows = await fetchPendingSubmissions();
    setPending(rows);
    setLoadingPending(false);
  }, []);

  useEffect(() => { if (tab === 'review') loadPending(); }, [loadPending, tab]);

  // Default the small calendar to the month of the employee's first pending item
  useEffect(() => {
    if (!selectedEmp) { setCalMonth(null); setCalEntries([]); return; }
    const firstBatch = pending.find(p => p.empId === selectedEmp.id);
    const anchor = firstBatch ? new Date(firstBatch.periodStart + 'T12:00:00') : new Date();
    setCalMonth(getMonthStart(anchor));
  }, [selectedEmp, pending]);

  useEffect(() => {
    if (!selectedEmp || !calMonth) return;
    setCalLoading(true);
    fetchEntries(selectedEmp.id, fmt(calMonth), fmt(getMonthEnd(calMonth))).then(rows => {
      setCalEntries(rows);
      setCalLoading(false);
    });
  }, [selectedEmp, calMonth]);

  useEffect(() => {
    if (!selectedEmp) { setApprovedForEmp([]); return; }
    setLoadingApprovedForEmp(true);
    fetchApprovals(selectedEmp.id, 'approved').then(rows => {
      setApprovedForEmp(rows);
      setLoadingApprovedForEmp(false);
    });
  }, [selectedEmp]);

  const hoveredBatch = useMemo(() => {
    if (!hoveredDate) return null;
    return pending.find(p => hoveredDate >= p.periodStart && hoveredDate <= p.periodEnd) ?? null;
  }, [hoveredDate, pending]);

  const hoveredApproval = useMemo(() => {
    if (!hoveredDate) return null;
    return approvedForEmp.find(a => hoveredDate >= a.period_start && hoveredDate <= a.period_end) ?? null;
  }, [hoveredDate, approvedForEmp]);

  const filteredPending = useMemo(() => {
    if (selectedEmp) return pending.filter(p => p.empId === selectedEmp.id);
    const q = searchQuery.trim().toLowerCase();
    return q ? pending.filter(p => p.empName.toLowerCase().includes(q)) : pending;
  }, [pending, searchQuery, selectedEmp]);

  const totalPendingHours = useMemo(() => pending.reduce((s, p) => s + p.totalHours, 0), [pending]);

  const pendingCountByEmp = useMemo(() => {
    const m = new Map<string, number>();
    pending.forEach(p => m.set(p.empId, (m.get(p.empId) ?? 0) + 1));
    return m;
  }, [pending]);

  const employeeOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = q ? employees.filter(e => e.full_name.toLowerCase().includes(q)) : employees;
    return base.slice(0, 30);
  }, [employees, searchQuery]);

  function selectEmployee(emp: EmpOption) {
    setSelectedEmp(emp);
    setSearchQuery(emp.full_name);
    setPickerOpen(false);
  }

  function clearSelection() {
    setSelectedEmp(null);
    setSearchQuery('');
  }

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const rows = await fetchApprovals(histEmp, histStatus);
    setApprovals(rows);
    setLoadingHistory(false);
  }, [histEmp, histStatus]);

  useEffect(() => { if (tab === 'history') loadHistory(); }, [loadHistory, tab]);

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
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Timesheets</h1>
          <p className="text-sm text-gray-400 mt-0.5">Review and approve employee timesheets</p>
        </div>
        {employees.length > 0 && (
          <button onClick={() => {
            const now = new Date();
            const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
            setExportFrom(`${y}-${m}-01`);
            setExportTo(now.toISOString().split('T')[0]);
            setExportEmpId(employees[0]?.id ?? '');
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
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
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

      {/* ── REVIEW TAB ──────────────────────────────────────────────────── */}
      {tab === 'review' && (
        <div className="space-y-4">
          {!loadingPending && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Awaiting approval" value={pending.length} color="amber" sub="employees" />
              <StatCard label="Total hours"       value={totalPendingHours.toFixed(1)} color="blue" sub="pending review" />
              <StatCard label="Total employees"   value={employees.length} color="gray" />
            </div>
          )}

          {/* Employee picker / search */}
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSelectedEmp(null); setPickerOpen(true); }}
              onFocus={() => setPickerOpen(true)}
              onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
              placeholder="Search or pick an employee…"
              className="w-full pl-10 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand bg-white"
            />
            {(searchQuery || selectedEmp) && (
              <button onClick={clearSelection}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">
                ×
              </button>
            )}
            {pickerOpen && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                {employeeOptions.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-gray-400">No employees found</p>
                ) : (
                  employeeOptions.map(emp => (
                    <button key={emp.id}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => selectEmployee(emp)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2.5 transition-colors">
                      <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                        {emp.full_name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-gray-800 flex-1 truncate">{emp.full_name}</span>
                      {(pendingCountByEmp.get(emp.id) ?? 0) > 0 && (
                        <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full shrink-0">
                          {pendingCountByEmp.get(emp.id)}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Queue (+ small calendar alongside once an employee is picked) */}
          <div className={selectedEmp ? 'grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-start' : ''}>
            {loadingPending ? (
              <div className="flex justify-center py-12">
                <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredPending.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 text-center py-14 text-gray-400 text-sm">
                {selectedEmp ? `No timesheets submitted by ${selectedEmp.full_name}.`
                  : searchQuery ? `No employees matching "${searchQuery}"`
                  : 'No timesheets awaiting approval.'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPending.map(p => {
                  const isHighlighted = hoveredBatch != null
                    && hoveredBatch.empId === p.empId
                    && hoveredBatch.periodStart === p.periodStart
                    && hoveredBatch.periodEnd === p.periodEnd;
                  return (
                    <Link key={`${p.empId}-${p.periodStart}`}
                      href={`/dashboard/timesheets/review/${p.empId}?from=${p.periodStart}&to=${p.periodEnd}&type=${p.periodType}&name=${encodeURIComponent(p.empName)}`}
                      className={`bg-white rounded-2xl border px-5 py-4 flex items-center gap-4 transition-all ${
                        isHighlighted ? 'border-brand ring-1 ring-brand shadow-sm' : 'border-blue-200 hover:border-blue-300 hover:shadow-sm'
                      }`}>
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                        {p.empName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{p.empName}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${PERIOD_TYPE_BADGE[p.periodType]}`}>
                            {p.periodType}
                          </span>
                          <span className="text-xs text-gray-400">{displaySubmissionRange(p)}</span>
                          <span className="text-xs text-gray-400">· {p.entryCount} entr{p.entryCount !== 1 ? 'ies' : 'y'}</span>
                          {p.timesheetId && (
                            <span className="text-xs font-mono font-bold text-gray-400">{p.timesheetId}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-black text-gray-900 leading-none">
                          {p.totalHours.toFixed(1)}<span className="text-sm font-semibold text-gray-400 ml-0.5">h</span>
                        </p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  );
                })}
              </div>
            )}

            {selectedEmp && (
              <div className="bg-white rounded-2xl border border-gray-100 p-3 lg:sticky lg:top-4">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => setCalMonth(m => m && getMonthStart(addMonths(m, -1)))}
                    className="text-gray-400 hover:text-gray-700 px-1.5 text-sm">←</button>
                  <p className="text-xs font-semibold text-gray-700">
                    {calMonth?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </p>
                  <button onClick={() => setCalMonth(m => m && getMonthStart(addMonths(m, 1)))}
                    className="text-gray-400 hover:text-gray-700 px-1.5 text-sm">→</button>
                </div>
                {calLoading || !calMonth ? (
                  <div className="flex justify-center py-8">
                    <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-7 gap-1 mb-1">
                      {WEEKDAY_HEADERS.map(w => (
                        <div key={w} className="text-center text-[8px] font-semibold text-gray-400">{w[0]}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {monthGridCells(calMonth).map(cell => {
                        const cellStr  = fmt(cell);
                        const mStart   = fmt(calMonth);
                        const mEnd     = fmt(getMonthEnd(calMonth));
                        const inMonth  = cellStr >= mStart && cellStr <= mEnd;
                        const cellEntries = inMonth ? calEntries.filter(e => e.date === cellStr) : [];
                        const cStatus  = dayStatus(cellEntries);
                        const isHoverSrc = hoveredDate === cellStr;
                        return (
                          <div key={cellStr}
                            onMouseEnter={() => cellEntries.length > 0 && setHoveredDate(cellStr)}
                            onMouseLeave={() => setHoveredDate(null)}
                            className={`aspect-square rounded flex items-center justify-center text-[9px] font-medium border transition-colors ${
                              !inMonth ? 'opacity-0 pointer-events-none' :
                              isHoverSrc ? 'border-brand ring-1 ring-brand text-gray-700' : `${DAY_CELL_STYLE[cStatus]} text-gray-500`
                            }`}>
                            {inMonth && cell.getDate()}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Already-approved timesheets for the selected employee */}
          {selectedEmp && (
            <div className="pt-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Approved timesheets — {selectedEmp.full_name}
              </p>
              {loadingApprovedForEmp ? (
                <div className="flex justify-center py-8">
                  <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                </div>
              ) : approvedForEmp.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 text-center py-8 text-gray-400 text-sm">
                  No approved timesheets yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {approvedForEmp.map(a => {
                    const isHighlighted = hoveredApproval?.id === a.id;
                    return (
                    <Link key={a.id}
                      href={`/dashboard/timesheets/review/${a.employee_id}?from=${a.period_start}&to=${a.period_end}&type=${a.period_type}&name=${encodeURIComponent(a.emp_name)}`}
                      className={`bg-white rounded-2xl border px-5 py-3.5 flex items-center gap-4 transition-all ${
                        isHighlighted ? 'border-green-400 ring-1 ring-green-400 shadow-sm opacity-100' : 'border-green-100 hover:border-green-200 hover:shadow-sm opacity-90'
                      }`}>
                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold shrink-0">
                        ✓
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize bg-green-50 text-green-700">
                            {a.period_type}
                          </span>
                          <span className="text-xs text-gray-500">{displayPeriod(a)}</span>
                          <span className="text-xs text-gray-400">· {a.entry_count} entr{a.entry_count !== 1 ? 'ies' : 'y'}</span>
                        </div>
                        {a.approved_by_name && (
                          <p className="text-[11px] text-gray-400 mt-1">Approved by {a.approved_by_name}</p>
                        )}
                      </div>
                      <p className="text-lg font-black text-gray-900 leading-none shrink-0">
                        {a.total_hours.toFixed(1)}<span className="text-xs font-semibold text-gray-400 ml-0.5">h</span>
                      </p>
                    </Link>
                  );
                  })}
                </div>
              )}
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
