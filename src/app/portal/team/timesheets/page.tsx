'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { TimesheetEntry } from '@/types';

function fmt(d: Date) { return d.toISOString().split('T')[0]; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function getWeekStart(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  submitted: 'bg-blue-50 text-blue-700',
  approved:  'bg-green-50 text-green-700',
  rejected:  'bg-red-50 text-red-700',
};

interface EmpGroup {
  empId: string;
  name: string;
  totalHours: number;
  submittedHours: number;
  entries: TimesheetEntry[];
}

type Tab = 'pending' | 'week';

export default function TeamTimesheetsPage() {
  const [tab, setTab]             = useState<Tab>('pending');
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [groups, setGroups]       = useState<EmpGroup[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [acting, setActing]       = useState<string | null>(null);
  const [myEmpId, setMyEmpId]     = useState<string | null>(null);

  const weekEnd = addDays(weekStart, 6);

  // Load own employee ID (used for reviewed_by and to exclude own entries)
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('employees').select('id').eq('user_id', user.id).single()
        .then(({ data }) => setMyEmpId(data?.id ?? null));
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    // RLS automatically limits results to direct reports; we also exclude own entries
    let q = supabase.from('timesheet_entries')
      .select('*, employees!employee_id(id, full_name)')
      .order('date');

    if (tab === 'pending') {
      q = q.eq('status', 'submitted');
    } else {
      q = q.gte('date', fmt(weekStart)).lte('date', fmt(weekEnd));
    }

    if (myEmpId) q = q.neq('employee_id', myEmpId);

    const { data } = await q;
    const map = new Map<string, EmpGroup>();
    (data ?? []).forEach(e => {
      const emp = e.employees as { id: string; full_name: string } | null;
      if (!emp) return;
      if (!map.has(emp.id)) map.set(emp.id, { empId: emp.id, name: emp.full_name, totalHours: 0, submittedHours: 0, entries: [] });
      const g = map.get(emp.id)!;
      g.entries.push(e as TimesheetEntry);
      g.totalHours += Number(e.hours);
      if (e.status === 'submitted') g.submittedHours += Number(e.hours);
    });
    setGroups(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
    setLoading(false);
  }, [tab, weekStart, myEmpId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (myEmpId !== null) load(); }, [load, myEmpId]);

  async function approveEntry(entryId: string) {
    setActing(entryId);
    const supabase = createClient();
    await supabase.from('timesheet_entries').update({
      status: 'approved',
      reviewed_by: myEmpId,
      reviewed_at: new Date().toISOString(),
    }).eq('id', entryId);
    setActing(null);
    load();
  }

  async function rejectEntry(entryId: string) {
    setActing(entryId);
    const supabase = createClient();
    await supabase.from('timesheet_entries').update({
      status: 'rejected',
      reviewed_by: myEmpId,
      reviewed_at: new Date().toISOString(),
    }).eq('id', entryId);
    setActing(null);
    load();
  }

  async function approveAll(group: EmpGroup) {
    const ids = group.entries.filter(e => e.status === 'submitted').map(e => e.id);
    if (!ids.length) return;
    setActing(group.empId);
    const supabase = createClient();
    await supabase.from('timesheet_entries').update({
      status: 'approved',
      reviewed_by: myEmpId,
      reviewed_at: new Date().toISOString(),
    }).in('id', ids);
    setActing(null);
    load();
  }

  async function rejectAll(group: EmpGroup) {
    const ids = group.entries.filter(e => e.status === 'submitted').map(e => e.id);
    if (!ids.length) return;
    setActing(group.empId + '-r');
    const supabase = createClient();
    await supabase.from('timesheet_entries').update({
      status: 'rejected',
      reviewed_by: myEmpId,
      reviewed_at: new Date().toISOString(),
    }).in('id', ids);
    setActing(null);
    load();
  }

  const totalPending = groups.reduce((s, g) => s + g.entries.filter(e => e.status === 'submitted').length, 0);

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-semibold rounded-full transition-all ${tab === t ? 'bg-ink text-white' : 'text-gray-500 hover:text-gray-900'}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Team Timesheets</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {tab === 'pending'
              ? `${totalPending} entr${totalPending !== 1 ? 'ies' : 'y'} awaiting your review`
              : `${groups.length} team member${groups.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {tab === 'week' && (
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekStart(w => addDays(w, -7))}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">← Prev</button>
            <span className="text-sm text-gray-600 font-medium whitespace-nowrap">
              {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
              {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <button onClick={() => setWeekStart(w => addDays(w, 7))}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">Next →</button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1 w-fit">
        <button className={tabCls('pending')} onClick={() => setTab('pending')}>
          Pending Review
          {totalPending > 0 && tab !== 'pending' && (
            <span className="ml-1.5 bg-brand text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{totalPending}</span>
          )}
        </button>
        <button className={tabCls('week')} onClick={() => setTab('week')}>By Week</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-14">
          <p className="text-gray-400 text-sm">
            {tab === 'pending' ? 'No timesheets awaiting your review.' : 'No timesheets for this week.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(g => {
            const isOpen    = expanded === g.empId;
            const submitted = g.entries.filter(e => e.status === 'submitted');
            const isActing  = acting === g.empId || acting === g.empId + '-r';

            return (
              <div key={g.empId} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 flex items-center gap-4">
                  <button className="flex-1 text-left" onClick={() => setExpanded(isOpen ? null : g.empId)}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{g.name}</span>
                      {submitted.length > 0 && (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                          {submitted.length} pending · {g.submittedHours.toFixed(1)}h
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{g.totalHours.toFixed(1)}h total · {g.entries.length} entr{g.entries.length !== 1 ? 'ies' : 'y'}</p>
                  </button>

                  {submitted.length > 0 && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => approveAll(g)} disabled={isActing}
                        className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors">
                        {acting === g.empId ? '…' : 'Approve All'}
                      </button>
                      <button onClick={() => rejectAll(g)} disabled={isActing}
                        className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors">
                        {acting === g.empId + '-r' ? '…' : 'Reject All'}
                      </button>
                    </div>
                  )}

                  <button onClick={() => setExpanded(isOpen ? null : g.empId)}>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-gray-50">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-50 bg-gray-50/50">
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Project</th>
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Hrs</th>
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Notes</th>
                          <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                          <th className="px-5 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {g.entries.map(e => (
                          <tr key={e.id} className="hover:bg-gray-50/30 transition-colors">
                            <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                              {new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </td>
                            <td className="px-5 py-3 font-medium text-gray-900">{e.project}</td>
                            <td className="px-5 py-3 font-semibold text-gray-700">{e.hours}h</td>
                            <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{e.notes ?? '—'}</td>
                            <td className="px-5 py-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[e.status]}`}>
                                {e.status}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              {e.status === 'submitted' && (
                                <div className="flex gap-1.5 justify-end">
                                  <button onClick={() => approveEntry(e.id)} disabled={!!acting}
                                    className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors">
                                    {acting === e.id ? '…' : 'Approve'}
                                  </button>
                                  <button onClick={() => rejectEntry(e.id)} disabled={!!acting}
                                    className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors">
                                    Reject
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
