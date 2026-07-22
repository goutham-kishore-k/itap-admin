'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import type { Employee, Department, TimesheetEntry } from '@/types';
import { updateEmployee, deleteEmployee } from '../actions';
import {
  getMonthStart, getMonthEnd, addMonths, fmt, displayDate,
  dayStatus, monthGridCells, DAY_CELL_STYLE, DAY_DOT_STYLE, WEEKDAY_HEADERS,
  type DayStatus,
} from '@/lib/calendar-utils';

export default function EditEmployeePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [managers, setManagers] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Timesheet calendar (view-only)
  const [calMonth, setCalMonth]     = useState(() => getMonthStart(new Date()));
  const [calEntries, setCalEntries] = useState<TimesheetEntry[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [hoverDate, setHoverDate]   = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from('employees').select('*').eq('id', id).single(),
      supabase.from('departments').select('id, name, created_at').order('name'),
      supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name'),
    ]).then(([{ data: emp }, { data: depts }, { data: mgrs }]) => {
      if (!emp) { router.push('/dashboard/employees'); return; }
      setEmployee(emp as Employee);
      setDepartments(depts ?? []);
      setManagers((mgrs ?? []).filter(m => m.id !== id));
      setLoading(false);
    });
  }, [id, router]);

  useEffect(() => {
    if (!id) return;
    setCalLoading(true);
    const supabase = createClient();
    supabase.from('timesheet_entries')
      .select('*')
      .eq('employee_id', id)
      .gte('date', fmt(calMonth))
      .lte('date', fmt(getMonthEnd(calMonth)))
      .then(({ data }) => {
        setCalEntries((data ?? []) as TimesheetEntry[]);
        setCalLoading(false);
      });
  }, [id, calMonth]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteEmployee(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
      setShowDelete(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    try {
      const formData = new FormData(e.currentTarget);
      await updateEmployee(id, formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>;

  const inp = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors bg-white';
  const lbl = 'block text-sm font-semibold text-gray-700 mb-1.5';

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/dashboard/employees" className="hover:text-gray-700 transition-colors">Employees</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Edit</span>
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">{employee?.full_name}</h1>

      {/* Timesheet calendar — view-only status per day */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Timesheet Calendar</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setCalMonth(m => getMonthStart(addMonths(m, -1)))}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">← Prev</button>
            <span className="text-sm font-medium text-gray-600 w-32 text-center">
              {calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={() => setCalMonth(m => getMonthStart(addMonths(m, 1)))}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">Next →</button>
          </div>
        </div>

        {calLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAY_HEADERS.map(w => (
                <div key={w} className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-1">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {monthGridCells(calMonth).map(cell => {
                const cellStr     = fmt(cell);
                const inMonth     = cellStr >= fmt(calMonth) && cellStr <= fmt(getMonthEnd(calMonth));
                const cellEntries = inMonth ? calEntries.filter(e => e.date === cellStr) : [];
                const cStatus     = dayStatus(cellEntries);
                const isToday     = fmt(new Date()) === cellStr;
                const cellHours   = cellEntries.reduce((s, e) => s + Number(e.hours), 0);
                return (
                  <div
                    key={cellStr}
                    onMouseEnter={() => inMonth && cellEntries.length > 0 && setHoverDate(cellStr)}
                    onMouseLeave={() => setHoverDate(null)}
                    className={`relative aspect-square rounded-lg border p-1.5 flex flex-col items-start ${
                      !inMonth ? 'opacity-0 pointer-events-none' : DAY_CELL_STYLE[cStatus]
                    }`}>
                    <span className={`text-xs font-semibold ${isToday ? 'text-brand' : 'text-gray-600'}`}>
                      {cell.getDate()}
                    </span>
                    {inMonth && cStatus !== 'empty' && (
                      <span className="mt-auto flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${DAY_DOT_STYLE[cStatus]}`} />
                        <span className="text-[9px] text-gray-400">{cellHours}h</span>
                      </span>
                    )}
                    {hoverDate === cellStr && (
                      <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 bg-white border border-gray-200 rounded-lg shadow-lg p-2 space-y-1">
                        <p className="text-[10px] font-semibold text-gray-500">{displayDate(cell)}</p>
                        {cellEntries.map(e => (
                          <div key={e.id} className="flex items-center justify-between text-[11px] gap-2">
                            <span className="text-gray-700 truncate">{e.project}</span>
                            <span className="text-gray-400 shrink-0 capitalize">{e.status}</span>
                            <span className="text-gray-700 font-medium shrink-0">{e.hours}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-50 flex-wrap">
              {(['empty', 'draft', 'submitted', 'approved', 'rejected'] as DayStatus[]).map(s => (
                <span key={s} className="flex items-center gap-1.5 text-[10px] text-gray-400 capitalize">
                  <span className={`w-1.5 h-1.5 rounded-full ${DAY_DOT_STYLE[s]}`} />
                  {s === 'empty' ? 'No entry' : s}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
          <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-4">Personal Info</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><label className={lbl}>Full Name</label><input name="full_name" className={inp} defaultValue={employee?.full_name} required /></div>
            <div><label className={lbl}>Phone</label><input name="phone" className={inp} defaultValue={employee?.phone ?? ''} placeholder="+1 555 000 0000" /></div>
            <div><label className={lbl}>Hire Date</label><input name="hire_date" type="date" className={inp} defaultValue={employee?.hire_date ?? ''} /></div>
          </div>
          <p className="text-xs text-gray-400">Email cannot be changed. Contact Supabase Auth to update it.</p>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
          <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-4">Role & Reporting</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><label className={lbl}>Designation</label><input name="designation" className={inp} defaultValue={employee?.designation ?? ''} placeholder="e.g. Senior Engineer" /></div>
            <div>
              <label className={lbl}>Role</label>
              <select name="role" className={inp} defaultValue={employee?.role}>
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="hr_admin">HR Admin</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Department</label>
              <select name="department_id" className={inp} defaultValue={employee?.department_id ?? ''}>
                <option value="">— None —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Reports to (Manager)</label>
              <select name="manager_id" className={inp} defaultValue={employee?.manager_id ?? ''}>
                <option value="">— None —</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-4 mb-5">Status</h2>
          <div className="flex items-center gap-3">
            <input type="hidden" name="is_active" value="false" />
            <input type="checkbox" id="is_active" name="is_active" value="true"
              defaultChecked={employee?.is_active}
              className="w-4 h-4 accent-brand" />
            <label htmlFor="is_active" className="text-sm font-semibold text-gray-700">Active — can log in to the portal</label>
          </div>
        </section>

        <div className="flex gap-3 pb-4 flex-wrap">
          <button type="submit" className="px-6 py-2.5 bg-brand text-white font-semibold rounded-full text-sm hover:bg-brand-dark transition-colors">Save Changes</button>
          <Link href="/dashboard/employees" className="px-6 py-2.5 bg-white border border-gray-200 text-gray-600 font-semibold rounded-full text-sm hover:border-gray-300 transition-colors">Cancel</Link>
          <button type="button" onClick={() => { setShowDelete(true); setConfirmName(''); }}
            className="ml-auto px-6 py-2.5 bg-white border border-red-200 text-red-600 font-semibold rounded-full text-sm hover:bg-red-50 hover:border-red-300 transition-colors">
            Delete Employee
          </button>
        </div>
      </form>

      {/* Delete confirmation modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Delete employee permanently?</h3>
                <p className="text-xs text-gray-400 mt-0.5">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              All timesheets, attendance, and requests for <strong>{employee?.full_name}</strong> will be deleted.
              Their login will be revoked immediately.
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Type <span className="text-gray-900 font-bold">{employee?.full_name}</span> to confirm
              </label>
              <input
                value={confirmName}
                onChange={e => setConfirmName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-colors"
                placeholder={employee?.full_name}
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleDelete}
                disabled={confirmName !== employee?.full_name || deleting}
                className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-full text-sm hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button
                onClick={() => setShowDelete(false)}
                disabled={deleting}
                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-600 font-semibold rounded-full text-sm hover:border-gray-300 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
