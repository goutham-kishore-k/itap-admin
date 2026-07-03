import { createAdminClient } from '@/lib/supabase-admin';
import OrgChart from '@/components/OrgChart';
import Link from 'next/link';

export default async function AdminOrgPage() {
  const admin = createAdminClient();

  const { data: employees } = await admin
    .from('employees')
    .select('*, departments(name)')
    .eq('is_active', true)
    .order('full_name');

  const mapped = (employees ?? []).map(e => ({
    ...e,
    department_id: e.department_id ?? null,
    manager_id: e.manager_id ?? null,
    dept_name: (e.departments as unknown as { name: string } | null)?.name,
  }));

  const noManager = mapped.filter(e => !e.manager_id);
  const unassigned = mapped.filter(e => !e.department_id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Org Chart</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {mapped.length} active employees · {noManager.length} at top level
          </p>
        </div>
        <Link href="/dashboard/employees"
          className="text-sm font-semibold text-brand hover:underline">
          Manage employees →
        </Link>
      </div>

      {unassigned.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <strong>{unassigned.length}</strong> employee{unassigned.length !== 1 ? 's' : ''} have no department assigned.{' '}
          <Link href="/dashboard/employees" className="underline font-medium">Assign departments →</Link>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <OrgChart employees={mapped} />
      </div>

      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-brand shrink-0" />
          <span className="text-gray-600">HR Admin</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-ink shrink-0" />
          <span className="text-gray-600">Manager</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-white border border-gray-200 shrink-0" />
          <span className="text-gray-600">Employee</span>
        </div>
      </div>
    </div>
  );
}
