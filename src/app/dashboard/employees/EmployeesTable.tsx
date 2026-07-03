'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import EmployeeActions from './EmployeeActions';

const ROLE_BADGE: Record<string, string> = {
  hr_admin: 'bg-brand/10 text-brand',
  manager:  'bg-ink/10 text-ink',
  employee: 'bg-gray-100 text-gray-500',
};
const ROLE_LABEL: Record<string, string> = { hr_admin: 'HR Admin', manager: 'Manager', employee: 'Employee' };

export interface EmployeeRow {
  id: string;
  full_name: string;
  email: string | null;
  designation: string | null;
  role: string;
  is_active: boolean;
  user_id: string | null;
  department_name: string | null;
  manager_name: string | null;
}

interface Props {
  employees: EmployeeRow[];
  pendingUserIds: string[];
}

function Table({ rows, pendingSet }: { rows: EmployeeRow[]; pendingSet: Set<string> }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-50">
          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Designation</th>
          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Department</th>
          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Manager</th>
          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Role</th>
          <th className="px-5 py-3" />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map(emp => {
          const isPending = !!(emp.user_id && pendingSet.has(emp.user_id));
          return (
            <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{emp.full_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{emp.email}</p>
                  </div>
                  {isPending && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
                      Pending
                    </span>
                  )}
                </div>
              </td>
              <td className="px-5 py-3.5 hidden sm:table-cell text-gray-600">{emp.designation ?? '—'}</td>
              <td className="px-5 py-3.5 hidden md:table-cell text-gray-600">{emp.department_name ?? '—'}</td>
              <td className="px-5 py-3.5 hidden lg:table-cell text-gray-600">{emp.manager_name ?? '—'}</td>
              <td className="px-5 py-3.5">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${ROLE_BADGE[emp.role]}`}>
                  {ROLE_LABEL[emp.role]}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <EmployeeActions id={emp.id} userId={emp.user_id} isPending={isPending} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function EmployeesTable({ employees, pendingUserIds }: Props) {
  const [query, setQuery] = useState('');
  const pendingSet = useMemo(() => new Set(pendingUserIds), [pendingUserIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(e =>
      e.full_name.toLowerCase().includes(q) ||
      (e.email ?? '').toLowerCase().includes(q) ||
      (e.designation ?? '').toLowerCase().includes(q) ||
      (e.department_name ?? '').toLowerCase().includes(q) ||
      (e.manager_name ?? '').toLowerCase().includes(q)
    );
  }, [employees, query]);

  const active   = filtered.filter(e => e.is_active);
  const inactive = filtered.filter(e => !e.is_active);

  const totalActive   = employees.filter(e => e.is_active).length;
  const totalInactive = employees.filter(e => !e.is_active).length;
  const pendingCount  = employees.filter(e => e.is_active && e.user_id && pendingSet.has(e.user_id)).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalActive} active · {totalInactive} inactive
            {pendingCount > 0 && ` · ${pendingCount} invite pending`}
          </p>
        </div>
        <Link href="/dashboard/employees/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-full hover:bg-brand-dark transition-colors">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          Invite Employee
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, email, designation, department…"
          className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand bg-white"
        />
        {query && (
          <button onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">
            ×
          </button>
        )}
      </div>

      {query && (
        <p className="text-xs text-gray-400">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} for &quot;{query}&quot;
        </p>
      )}

      {employees.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-16">
          <p className="text-gray-400 mb-3">No employees yet.</p>
          <Link href="/dashboard/employees/new" className="text-brand font-semibold text-sm hover:underline">
            Invite your first employee →
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-14 text-gray-400 text-sm">
          No employees matching &quot;{query}&quot;
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">Active</span>
                <span className="text-xs text-gray-400">({active.length})</span>
              </div>
              <Table rows={active} pendingSet={pendingSet} />
            </div>
          )}
          {inactive.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">Inactive</span>
                <span className="text-xs text-gray-400">({inactive.length})</span>
              </div>
              <Table rows={inactive} pendingSet={pendingSet} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
