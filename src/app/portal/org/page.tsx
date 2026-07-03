import { createClient } from '@/lib/supabase-server';
import OrgChart from '@/components/OrgChart';

export default async function PortalOrgPage() {
  const supabase = await createClient();

  const { data: employees } = await supabase
    .from('employees')
    .select('*, departments(name)')
    .eq('is_active', true)
    .order('full_name');

  const mapped = (employees ?? []).map(e => ({
    ...e,
    department_id: e.department_id ?? null,
    manager_id: e.manager_id ?? null,
    dept_name: (e.departments as { name: string } | null)?.name,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Org Chart</h1>
        <p className="text-sm text-gray-400 mt-0.5">{mapped.length} active employee{mapped.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <OrgChart employees={mapped} />
      </div>
    </div>
  );
}
