'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import {
  approvePeriod, rejectPeriod, revertApproval,
} from '@/app/dashboard/timesheets/actions';

// ─── date helpers ─────────────────────────────────────────────────────────────

function fmtDate(d: Date) { return d.toISOString().split('T')[0]; }

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

function weekValueToRange(value: string) {
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

function displayDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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

// ─── types ────────────────────────────────────────────────────────────────────

type StatFilter = 'submitted' | 'approved' | 'notStarted' | null;
type Tab = 'review' | 'history';

interface ApprovalRow {
  id: string;
  short_id: string;
  employee_id: string;
  emp_name: string;
  period_type: 'daily' | 'weekly' | 'monthly';
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

interface EntryRow {
  id: string;
  employee_id: string;
  emp_name: string;
  date: string;
  project: string;
  hours: number;
  notes: string | null;
  rejection_reason: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  approval_id: string | null;
}

interface DirectReport { id: string; full_name: string; }

const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  submitted: 'bg-blue-50 text-blue-700',
  approved:  'bg-green-50 text-green-700',
  rejected:  'bg-red-50 text-red-700',
};

// ─── stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, active, onClick }: {
  label: string; value: number | string; sub?: string;
  color: 'blue' | 'green' | 'amber' | 'gray' | 'red';
  active?: boolean; onClick?: () => void;
}) {
  const colors = {
    blue:  'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    gray:  'bg-gray-50 border-gray-200 text-gray-500',
    red:   'bg-red-50 border-red-200 text-red-700',
  };
  const rings = {
    blue:  'ring-2 ring-blue-400 ring-offset-1',
    green: 'ring-2 ring-green-400 ring-offset-1',
    amber: 'ring-2 ring-amber-400 ring-offset-1',
    gray:  'ring-2 ring-gray-400 ring-offset-1',
    red:   'ring-2 ring-red-400 ring-offset-1',
  };
  return (
    <button onClick={onClick}
      className={`rounded-2xl border px-5 py-4 text-left w-full transition-all
        ${colors[color]}
        ${onClick ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}
        ${active ? rings[color] : ''}`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs font-semibold mt-0.5 opacity-80">{label}</p>
      {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
      {active && <p className="text-[10px] font-bold mt-1 opacity-70">↓ filtering below</p>}
    </button>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function TeamTimesheetsPage() {
  const [tab, setTab]                 = useState<Tab>('review');
  const [myEmpId, setMyEmpId]         = useState<string | null>(null);
  const [reports, setReports]         = useState<DirectReport[]>([]);
  const [entries, setEntries]         = useState<EntryRow[]>([]);
  const [loading, setLoading]         = useState(false);

  const periodType = 'weekly' as const;
  const [periodValue, setPeriodValue] = useState(() => todayWeek());

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
  const [statFilter, setStatFilter]   = useState<StatFilter>(null);
  const [expandedEmps, setExpandedEmps] = useState<Set<string>>(new Set());

  // Per-group action state
  const [acting, setActing]               = useState<string | null>(null);
  const [rejectingEmp, setRejectingEmp]   = useState<string | null>(null);
  const [rejectReason, setRejectReason]   = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [lastApproved, setLastApproved]   = useState<Record<string, string>>({});
  const [revertConfirmGroup, setRevertConfirmGroup] = useState<string | null>(null);

  function toggleExpand(empId: string) {
    setExpandedEmps(prev => {
      const next = new Set(prev);
      next.has(empId) ? next.delete(empId) : next.add(empId);
      return next;
    });
  }

  function toggleStatFilter(f: StatFilter) {
    setStatFilter(prev => prev === f ? null : f);
  }

  // Load own employee ID + direct reports
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: emp } = await supabase.from('employees').select('id').eq('user_id', user.id).single();
      if (!emp) return;
      setMyEmpId(emp.id);
      const { data: reps } = await supabase
        .from('employees').select('id, full_name')
        .eq('manager_id', emp.id).eq('is_active', true).order('full_name');
      setReports(reps ?? []);
    });
  }, []);

  const loadEntries = useCallback(async () => {
    if (!myEmpId) return;
    setLoading(true);
    const { start, end } = weekValueToRange(periodValue);
    const supabase = createClient();
    const { data } = await supabase
      .from('timesheet_entries')
      .select('*, employees!employee_id(id, full_name)')
      .gte('date', start).lte('date', end)
      .neq('employee_id', myEmpId)
      .order('date').order('created_at');
    setEntries((data ?? []).map(e => {
      const emp = e.employees as unknown as { id: string; full_name: string } | null;
      return {
        id:               e.id,
        employee_id:      e.employee_id,
        emp_name:         emp?.full_name ?? '(unknown)',
        date:             e.date,
        project:          e.project,
        hours:            Number(e.hours),
        notes:            e.notes ?? null,
        rejection_reason: (e as Record<string, unknown>).rejection_reason as string | null ?? null,
        status:           e.status,
        approval_id:      e.approval_id ?? null,
      };
    }));
    setLoading(false);
  }, [myEmpId, periodValue]);

  useEffect(() => { if (tab === 'review') loadEntries(); }, [loadEntries, tab]);

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

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const submittedEmpIds = new Set(entries.filter(e => e.status === 'submitted').map(e => e.employee_id));
    const approvedEmpIds  = new Set(entries.filter(e => e.status === 'approved').map(e => e.employee_id));
    const hasEntriesIds   = new Set(entries.map(e => e.employee_id));
    const notStartedEmps  = reports.filter(r => !hasEntriesIds.has(r.id));
    return {
      total:           reports.length,
      submitted:       submittedEmpIds.size,
      approved:        approvedEmpIds.size,
      pendingApprovals: submittedEmpIds.size,
      notStarted:      notStartedEmps.length,
      submittedEmpIds,
      approvedEmpIds,
      notStartedEmps,
    };
  }, [reports, entries]);

  // ── Groups ────────────────────────────────────────────────────────────────

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
    let base = groups;
    if (statFilter === 'submitted') base = base.filter(g => stats.submittedEmpIds.has(g.empId));
    else if (statFilter === 'approved') base = base.filter(g => stats.approvedEmpIds.has(g.empId));
    const q = searchQuery.trim().toLowerCase();
    return q ? base.filter(g => g.name.toLowerCase().includes(q)) : base;
  }, [groups, searchQuery, statFilter, stats.submittedEmpIds, stats.approvedEmpIds]);

  const notStartedFiltered = useMemo(() => {
    if (statFilter !== 'notStarted') return [];
    const q = searchQuery.trim().toLowerCase();
    return q ? stats.notStartedEmps.filter(e => e.full_name.toLowerCase().includes(q)) : stats.notStartedEmps;
  }, [statFilter, stats.notStartedEmps, searchQuery]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleApprove(empId: string, empEntries: EntryRow[]) {
    const submitted = empEntries.filter(e => e.status === 'submitted');
    if (!submitted.length) return;
    setActing(empId);
    const { start, end } = weekValueToRange(periodValue);
    const totalHours = submitted.reduce((s, e) => s + e.hours, 0);
    const approvalId = await approvePeriod(empId, 'weekly', start, end, submitted.map(e => e.id), totalHours, approvalNotes || null);
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

  async function handleRevert(approvalId: string) {
    setReverting(approvalId);
    await revertApproval(approvalId);
    setReverting(null);
    setRevertConfirm(null);
    loadHistory();
  }

  async function handleRevertGroup(empId: string, approvalIds: string[]) {
    setActing(empId);
    for (const id of approvalIds) await revertApproval(id);
    setRevertConfirmGroup(null);
    setActing(null);
    loadEntries();
  }

  const periodLabel = 'this week';

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
            {stats.pendingApprovals > 0 && ` · ${stats.pendingApprovals} week${stats.pendingApprovals !== 1 ? 's' : ''} awaiting review`}
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

      {/* Week picker */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Week</label>
          <input type="week" value={periodValue} onChange={e => setPeriodValue(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white" />
        </div>
      </div>

      {/* Stat cards */}
      {!loading && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Team members"    value={stats.total}      color="gray"
              active={statFilter === null} onClick={() => setStatFilter(null)} />
            <StatCard label="Submitted"       value={stats.submitted}  color="blue"  sub="awaiting review"
              active={statFilter === 'submitted'} onClick={() => toggleStatFilter('submitted')} />
            <StatCard label="Approved"        value={stats.approved}   color="green"
              active={statFilter === 'approved'} onClick={() => toggleStatFilter('approved')} />
            <StatCard label="Pending approval" value={stats.pendingApprovals} color="amber" sub="weeks awaiting review"
              active={statFilter === 'submitted'} onClick={() => toggleStatFilter('submitted')} />
            <StatCard label="Not started"     value={stats.notStarted} color={stats.notStarted > 0 ? 'red' : 'gray'} sub="no entries logged"
              active={statFilter === 'notStarted'} onClick={() => toggleStatFilter('notStarted')} />
          </div>
          {statFilter && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Showing: <strong className="text-gray-800">
                {statFilter === 'submitted' ? 'Submitted / Pending' : statFilter === 'approved' ? 'Approved' : 'Not started'}
              </strong></span>
              <button onClick={() => setStatFilter(null)} className="text-gray-400 hover:text-gray-700 font-semibold">× clear</button>
            </div>
          )}
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

      {/* Entries */}
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
      ) : statFilter === 'notStarted' ? (
        notStartedFiltered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 text-center py-14 text-gray-400 text-sm">
            {searchQuery ? `No team members matching "${searchQuery}"` : 'All team members have entries this period.'}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">{notStartedFiltered.length} team member{notStartedFiltered.length !== 1 ? 's' : ''} with no entries</p>
            {notStartedFiltered.map(emp => (
              <div key={emp.id} className="bg-white rounded-2xl border border-red-100 px-5 py-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-sm font-bold shrink-0">
                  {emp.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">{emp.full_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">No entries logged this period</p>
                </div>
                <span className="text-xs font-semibold bg-red-50 text-red-600 px-2.5 py-1 rounded-full border border-red-100">Not started</span>
              </div>
            ))}
          </div>
        )
      ) : filteredGroups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-14 text-gray-400 text-sm">
          {searchQuery ? `No team members matching "${searchQuery}"` : statFilter ? 'No team members in this category.' : 'No timesheet entries for this period.'}
        </div>
      ) : (
        <div className="space-y-3">
          {(searchQuery || statFilter) && (
            <p className="text-xs text-gray-400">
              Showing {filteredGroups.length} of {groups.length} team member{groups.length !== 1 ? 's' : ''}
            </p>
          )}
          {filteredGroups.map(g => {
            const submitted        = g.entries.filter(e => e.status === 'submitted');
            const approved         = g.entries.filter(e => e.status === 'approved');
            const rejected         = g.entries.filter(e => e.status === 'rejected');
            const draft            = g.entries.filter(e => e.status === 'draft');
            const approvalIds      = [...new Set(approved.map(e => e.approval_id).filter((id): id is string => Boolean(id)))];
            const isActing         = acting === g.empId;
            const isRejecting      = rejectingEmp === g.empId;
            const isRevertingGroup = revertConfirmGroup === g.empId;
            const approvedId       = lastApproved[g.empId];
            const isExpanded       = expandedEmps.has(g.empId);
            const hasPending       = submitted.length > 0;

            return (
              <div key={g.empId} className={`bg-white rounded-2xl border overflow-hidden transition-all ${hasPending ? 'border-blue-200' : 'border-gray-100'}`}>

                {/* Collapsed header */}
                <button onClick={() => toggleExpand(g.empId)}
                  className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors text-left">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${hasPending ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {g.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{g.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {submitted.length > 0 && (
                        <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{submitted.length} pending</span>
                      )}
                      {approved.length > 0 && (
                        <span className="text-[10px] font-semibold bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{approved.length} approved</span>
                      )}
                      {rejected.length > 0 && (
                        <span className="text-[10px] font-semibold bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{rejected.length} rejected</span>
                      )}
                      {draft.length > 0 && (
                        <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{draft.length} draft</span>
                      )}
                      {approvedId && (
                        <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">✓ {approvedId}</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 mr-2">
                    <p className="text-xl font-black text-gray-900 leading-none">
                      {g.totalHours.toFixed(1)}<span className="text-sm font-semibold text-gray-400 ml-0.5">h</span>
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{periodLabel}</p>
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
                    </div>

                    {(submitted.length > 0 || approvalIds.length > 0) && (
                      <div className="px-5 py-4 border-t border-gray-50 space-y-3">
                        {submitted.length > 0 && (
                          isRejecting ? (
                            <div className="space-y-2 bg-red-50 border border-red-100 rounded-xl p-4">
                              <label className="block text-xs font-semibold text-red-700">Rejection reason <span className="text-red-500">*</span></label>
                              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
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
                                  {isActing ? '…' : 'Approve Week'}
                                </button>
                                <button onClick={() => { setRejectingEmp(g.empId); setRejectReason(''); }} disabled={isActing}
                                  className="px-4 py-2 bg-white border border-red-200 text-red-600 text-xs font-semibold rounded-full hover:bg-red-50 disabled:opacity-50 transition-colors">
                                  Reject Week
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
