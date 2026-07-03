import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import OrgChart from '@/components/OrgChart';

export default async function PortalOrgPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Use admin client for employees so RLS doesn't filter out managers/HR
  const [{ data: employees }, { data: me }] = await Promise.all([
    admin.from('employees').select('*, departments(name)').eq('is_active', true).order('full_name'),
    user
      ? admin.from('employees').select('id, manager_id').eq('user_id', user.id).maybeSingle()
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
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
        <p className="w-full text-[10px] font-semibold uppercase tracking-wider text-gray-400">Roles</p>
        <div className="flex items-center gap-1.5">
          <span className="inline-block text-[9px] font-bold uppercase bg-brand/10 text-brand px-2 py-0.5 rounded-full">HR Admin</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block text-[9px] font-bold uppercase bg-ink/10 text-ink px-2 py-0.5 rounded-full">Manager</span>
        </div>
        <p className="w-full text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-1">Your position</p>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full ring-2 ring-brand ring-offset-1 bg-white" />
          <span>You</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full ring-2 ring-violet-500 ring-offset-1 bg-white" />
          <span>Your manager</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full ring-2 ring-amber-400 ring-offset-1 bg-white" />
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
