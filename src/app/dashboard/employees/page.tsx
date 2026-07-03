import { createAdminClient } from '@/lib/supabase-admin';
import Link from 'next/link';
import EmployeeActions from './EmployeeActions';

const ROLE_BADGE: Record<string, string> = {
  hr_admin: 'bg-brand/10 text-brand',
  manager: 'bg-ink/10 text-ink',
  employee: 'bg-gray-100 text-gray-500',
};
const ROLE_LABEL: Record<string, string> = { hr_admin: 'HR Admin', manager: 'Manager', employee: 'Employee' };

export default async function EmployeesPage() {
  const admin = createAdminClient();

  const [{ data: employees }, { data: { users } }] = await Promise.all([
    admin.from('employees').select('*, departments(name), manager:manager_id(id, full_name)').order('full_name'),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  // Users who have never logged in = pending (invite not yet accepted)
  const neverLoggedIn = new Set(users.filter(u => !u.last_sign_in_at).map(u => u.id));

  const all = employees ?? [];
  const active = all.filter(e => e.is_active);
  const inactive = all.filter(e => !e.is_active);
  const pendingCount = active.filter(e => e.user_id && neverLoggedIn.has(e.user_id)).length;

  function renderTable(rows: typeof all, title: string) {
    if (!rows.length) return null;
    return (
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">{title}</span>
          <span className="text-xs text-gray-400">({rows.length})</span>
        </div>
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
              const isPending = !!(emp.user_id && neverLoggedIn.has(emp.user_id));
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
                  <td className="px-5 py-3.5 hidden md:table-cell text-gray-600">
                    {(emp.departments as { name: string } | null)?.name ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-gray-600">
                    {(emp.manager as { id: string; full_name: string } | null)?.full_name ?? '—'}
                  </td>
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
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {active.length} active · {inactive.length} inactive
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

      {all.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-16">
          <p className="text-gray-400 mb-3">No employees yet.</p>
          <Link href="/dashboard/employees/new" className="text-brand font-semibold text-sm hover:underline">
            Invite your first employee →
          </Link>
        </div>
      ) : (
        <>
          {renderTable(active, 'Active')}
          {renderTable(inactive, 'Inactive')}
        </>
      )}
    </div>
  );
}
