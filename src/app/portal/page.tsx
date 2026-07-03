import { getPortalEmployee } from '@/lib/portal-user';
import { createClient } from '@/lib/supabase-server';
import Link from 'next/link';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
  closed:   'bg-gray-100 text-gray-500',
};

export default async function PortalHomePage() {
  // Shared with layout — no extra network call
  const employee = await getPortalEmployee();
  if (!employee) return null;

  const supabase = await createClient();

  const today      = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const weekStart  = (() => {
    const d = new Date(today);
    d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
    return d.toISOString().split('T')[0];
  })();

  // All queries fire in parallel — single round-trip wait
  const [
    { data: timesheets },
    { count: pendingReqs },
    { data: recentRequests },
  ] = await Promise.all([
    supabase.from('timesheet_entries').select('hours').eq('employee_id', employee.id).gte('date', weekStart),
    supabase.from('hr_requests').select('id', { count: 'exact', head: true }).eq('employee_id', employee.id).eq('status', 'pending'),
    supabase.from('hr_requests').select('id, type, title, status, created_at').eq('employee_id', employee.id).order('created_at', { ascending: false }).limit(4),
  ]);

  const weekHours = (timesheets ?? []).reduce((s, e) => s + Number(e.hours), 0);
  const dept      = (employee.departments as { name: string } | null)?.name;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {employee.full_name.split(' ')[0]}</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          {employee.designation ?? 'Employee'}{dept ? ` · ${dept}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Hours this week" value={weekHours.toFixed(1)} sub="logged" />
        <StatCard label="Pending requests" value={pendingReqs ?? 0} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Link href="/portal/timesheet"
          className="flex items-center gap-3 bg-brand text-white rounded-2xl p-4 hover:bg-brand-dark transition-colors">
          <span className="text-2xl">📋</span>
          <div><p className="font-semibold text-sm">Timesheet</p><p className="text-white/70 text-xs">Log your hours</p></div>
        </Link>
        <Link href="/portal/requests/new"
          className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 hover:border-gray-200 transition-colors">
          <span className="text-2xl">📝</span>
          <div><p className="font-semibold text-sm text-gray-900">New Request</p><p className="text-gray-400 text-xs">Leave, expense & more</p></div>
        </Link>
      </div>

      {(recentRequests ?? []).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900 text-sm">Recent Requests</h2>
            <Link href="/portal/requests" className="text-xs text-brand hover:underline font-medium">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {(recentRequests ?? []).map(r => (
              <div key={r.id} className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.title}</p>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">{r.type} · {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
