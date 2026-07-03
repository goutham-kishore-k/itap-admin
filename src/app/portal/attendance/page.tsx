'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { AttendanceRecord } from '@/types';

function fmtDate(d: Date) { return d.toISOString().split('T')[0]; }
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function duration(clockIn: string, clockOut?: string | null) {
  const ms = new Date(clockOut ?? new Date()).getTime() - new Date(clockIn).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

const STATUS_STYLE: Record<string, string> = {
  present: 'bg-green-50 text-green-700',
  absent: 'bg-red-50 text-red-700',
  half_day: 'bg-amber-50 text-amber-700',
  wfh: 'bg-blue-50 text-blue-700',
  on_leave: 'bg-purple-50 text-purple-700',
};
const STATUS_LABEL: Record<string, string> = {
  present: 'Present', absent: 'Absent', half_day: 'Half Day', wfh: 'WFH', on_leave: 'On Leave',
};

export default function AttendancePage() {
  const today = fmtDate(new Date());
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [clocking, setClocking] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: emp } = await supabase.from('employees').select('id').eq('user_id', user.id).single();
    if (!emp) return;
    setEmployeeId(emp.id);

    const monthStart = fmtDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const [{ data: todayData }, { data: hist }] = await Promise.all([
      supabase.from('attendance').select('*').eq('employee_id', emp.id).eq('date', today).maybeSingle(),
      supabase.from('attendance').select('*').eq('employee_id', emp.id).gte('date', monthStart).order('date', { ascending: false }),
    ]);
    setTodayRecord(todayData ?? null);
    setHistory(hist ?? []);
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function clockIn() {
    if (!employeeId) return;
    setClocking(true);
    const supabase = createClient();
    const { data } = await supabase.from('attendance').upsert({
      employee_id: employeeId,
      date: today,
      clock_in: new Date().toISOString(),
      status: 'present',
    }, { onConflict: 'employee_id,date' }).select().single();
    setTodayRecord(data ?? null);
    setClocking(false);
    load();
  }

  async function clockOut() {
    if (!todayRecord) return;
    setClocking(true);
    const supabase = createClient();
    await supabase.from('attendance').update({ clock_out: new Date().toISOString() }).eq('id', todayRecord.id);
    setClocking(false);
    load();
  }

  const hasClockIn = !!todayRecord?.clock_in;
  const hasClockOut = !!todayRecord?.clock_out;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Attendance</h1>

      {/* Today card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Today</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          {todayRecord && (
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_STYLE[todayRecord.status]}`}>
              {STATUS_LABEL[todayRecord.status]}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-xs text-gray-400">Clock In</p>
              <p className="text-base font-semibold text-gray-900 mt-0.5">
                {todayRecord?.clock_in ? fmtTime(todayRecord.clock_in) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Clock Out</p>
              <p className="text-base font-semibold text-gray-900 mt-0.5">
                {todayRecord?.clock_out ? fmtTime(todayRecord.clock_out) : '—'}
              </p>
            </div>
            {hasClockIn && (
              <div>
                <p className="text-xs text-gray-400">Duration</p>
                <p className="text-base font-semibold text-gray-900 mt-0.5">
                  {duration(todayRecord!.clock_in!, hasClockOut ? todayRecord?.clock_out : null)}
                  {!hasClockOut && <span className="text-gray-400 text-xs ml-1">(ongoing)</span>}
                </p>
              </div>
            )}
            <div className="ml-auto">
              {!hasClockIn ? (
                <button onClick={clockIn} disabled={clocking}
                  className="px-6 py-2.5 bg-brand text-white font-semibold rounded-full text-sm hover:bg-brand-dark disabled:opacity-60 transition-colors">
                  {clocking ? 'Clocking in…' : 'Clock In'}
                </button>
              ) : !hasClockOut ? (
                <button onClick={clockOut} disabled={clocking}
                  className="px-6 py-2.5 bg-ink text-white font-semibold rounded-full text-sm hover:bg-gray-800 disabled:opacity-60 transition-colors">
                  {clocking ? 'Clocking out…' : 'Clock Out'}
                </button>
              ) : (
                <span className="text-sm text-gray-400 font-medium">Done for today ✓</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Monthly history */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="font-semibold text-gray-900 text-sm">
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
        </div>
        {history.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">No records yet this month.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">In</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Out</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Hours</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.map(rec => (
                <tr key={rec.id}>
                  <td className="px-5 py-3 text-gray-700 font-medium">
                    {new Date(rec.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{rec.clock_in ? fmtTime(rec.clock_in) : '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{rec.clock_out ? fmtTime(rec.clock_out) : '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{rec.clock_in && rec.clock_out ? duration(rec.clock_in, rec.clock_out) : '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[rec.status]}`}>{STATUS_LABEL[rec.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
