import { getPortalEmployee } from '@/lib/portal-user';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import Link from 'next/link';
import NotificationsPanel from '@/components/NotificationsPanel';
import type { Notification } from '@/types';
import {
  getMonthStart, getMonthEnd, fmt, dayStatus, monthGridCells,
  DAY_CELL_STYLE, DAY_DOT_STYLE, WEEKDAY_HEADERS, type DayStatus,
} from '@/lib/calendar-utils';

export default async function PortalHomePage() {
  const employee = await getPortalEmployee();
  if (!employee) return null;

  const supabase = await createClient();
  const admin    = createAdminClient();

  const weekStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().split('T')[0];
  })();
  const weekEnd = (() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 6);
    return d.toISOString().split('T')[0];
  })();

  const monthAnchor = new Date();
  const monthStart  = fmt(getMonthStart(monthAnchor));
  const monthEnd    = fmt(getMonthEnd(monthAnchor));

  const [
    { data: weekEntries },
    { data: manager },
    { data: monthEntries },
    { data: notifications },
  ] = await Promise.all([
    supabase.from('timesheet_entries')
      .select('hours, status')
      .eq('employee_id', employee.id).gte('date', weekStart).lte('date', weekEnd),
    (employee as unknown as { manager_id?: string }).manager_id
      ? admin.from('employees')
          .select('full_name, designation')
          .eq('id', (employee as unknown as { manager_id: string }).manager_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase.from('timesheet_entries')
      .select('date, hours, status')
      .eq('employee_id', employee.id).gte('date', monthStart).lte('date', monthEnd),
    supabase.from('notifications')
      .select('*')
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: false })
      .limit(15),
  ]);

  const weekHours = (weekEntries ?? []).reduce((s, e) => s + Number(e.hours), 0);
  const dept = (employee.departments as unknown as { name: string } | null)?.name;

  const statuses = (weekEntries ?? []).map(e => e.status);
  const tsWeekStatus =
    statuses.length === 0                       ? 'none'      :
    statuses.every(s => s === 'approved')        ? 'approved'  :
    statuses.some(s => s === 'submitted')        ? 'submitted' :
    'draft';

  const tsStatusLabel: Record<string, string> = {
    none: 'No entries yet', draft: 'In progress', submitted: 'Submitted', approved: 'Approved',
  };

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">
          {greeting}, {employee.full_name.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {employee.designation ?? 'Employee'}{dept ? ` · ${dept}` : ''}
        </p>
      </div>

      {/* This week — Requests card hidden for now (re-add as a grid-cols-2 sibling when ready) */}
      <div className="grid grid-cols-1 gap-3">
        <Link href="/portal/timesheet"
          className="bg-brand text-white rounded-2xl p-5 hover:bg-brand-dark transition-colors">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">This week</p>
            <svg className="w-5 h-5 text-white/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <p className="text-3xl font-black mt-1 tracking-tight">{weekHours.toFixed(1)}h</p>
          <p className="text-xs font-semibold mt-1 text-white/90">{tsStatusLabel[tsWeekStatus]}</p>
        </Link>
      </div>

      {/* This month calendar + notifications */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 w-full max-w-lg shrink-0">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-gray-900 text-sm">
              {monthAnchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
            <Link href="/portal/timesheet" className="text-xs text-brand font-semibold hover:underline">Open timesheet</Link>
          </div>
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEKDAY_HEADERS.map(w => (
              <div key={w} className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {monthGridCells(monthAnchor).map(cell => {
              const cellStr     = fmt(cell);
              const inMonth     = cellStr >= monthStart && cellStr <= monthEnd;
              const cellEntries = inMonth ? (monthEntries ?? []).filter(e => e.date === cellStr) : [];
              const cStatus     = dayStatus(cellEntries);
              const isToday     = fmt(new Date()) === cellStr;
              const cellHours   = cellEntries.reduce((s, e) => s + Number(e.hours), 0);
              return (
                <Link
                  key={cellStr}
                  href="/portal/timesheet"
                  className={`relative aspect-square rounded-lg border p-1.5 flex flex-col items-start transition-colors ${
                    !inMonth ? 'opacity-0 pointer-events-none' : `${DAY_CELL_STYLE[cStatus]} hover:border-brand/50`
                  }`}>
                  <span className={`text-[11px] font-semibold ${isToday ? 'text-brand' : 'text-gray-600'}`}>
                    {cell.getDate()}
                  </span>
                  {inMonth && cStatus !== 'empty' && (
                    <span className="mt-auto flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${DAY_DOT_STYLE[cStatus]}`} />
                      <span className="text-sm font-bold text-gray-700">{cellHours}h</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50 flex-wrap">
            {(['empty', 'draft', 'submitted', 'approved', 'rejected'] as DayStatus[]).map(s => (
              <span key={s} className="flex items-center gap-1.5 text-[10px] text-gray-400 capitalize">
                <span className={`w-1.5 h-1.5 rounded-full ${DAY_DOT_STYLE[s]}`} />
                {s === 'empty' ? 'No entry' : s}
              </span>
            ))}
          </div>
        </div>

        <NotificationsPanel initial={(notifications ?? []) as Notification[]} />
      </div>

      {/* Manager info */}
      {manager && (
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-ink flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">
              {(manager as unknown as { full_name: string }).full_name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-400">Your manager</p>
            <p className="text-sm font-bold text-gray-900 truncate">{(manager as unknown as { full_name: string }).full_name}</p>
            {(manager as unknown as { designation?: string }).designation && (
              <p className="text-xs text-gray-400 truncate">{(manager as unknown as { designation: string }).designation}</p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
