import { createClient } from '@/lib/supabase-server';
import OrgChart from '@/components/OrgChart';

export default async function PortalOrgPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: employees }, { data: me }] = await Promise.all([
    supabase.from('employees').select('*, departments(name)').eq('is_active', true).order('full_name'),
    user
      ? supabase.from('employees').select('id, manager_id').eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const mapped = (employees ?? []).map(e => ({
    ...e,
    department_id: e.department_id ?? null,
    manager_id: e.manager_id ?? null,
    dept_name: (e.departments as unknown as { name: string } | null)?.name,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Org Chart</h1>
        <p className="text-sm text-gray-400 mt-0.5">{mapped.length} active employee{mapped.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-brand" />
          <span>You</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-violet-500" />
          <span>Your manager</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full border-2 border-amber-400 bg-white" />
          <span>Teammate</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <OrgChart
          employees={mapped}
          currentEmpId={me?.id ?? undefined}
          currentManagerId={me?.manager_id ?? undefined}
        />
      </div>
    </div>
  );
}
