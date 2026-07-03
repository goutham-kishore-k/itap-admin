import { createAdminClient } from '@/lib/supabase-admin';
import Link from 'next/link';

const TYPE_LABEL: Record<string, string> = {
  leave: 'Leave', expense: 'Expense', grievance: 'Grievance', asset: 'Asset',
};

function StatCard({
  label, value, sub, href, color,
}: {
  label: string; value: number | string; sub: string; href: string;
  color: 'brand' | 'blue' | 'amber' | 'green';
}) {
  const ring: Record<string, string> = {
    brand: 'bg-brand/8 text-brand',
    blue:  'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-green-50 text-green-700',
  };
  const dot: Record<string, string> = {
    brand: 'bg-brand',
    blue:  'bg-blue-500',
    amber: 'bg-amber-500',
    green: 'bg-green-500',
  };
  return (
    <Link href={href}
      className="bg-white rounded-2xl border border-gray-100 px-5 py-5 hover:shadow-sm hover:border-gray-200 transition-all group block">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-black text-gray-900 mt-1.5 tracking-tight">{value}</p>
          <p className="text-xs text-gray-400 mt-1">{sub}</p>
        </div>
        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot[color]}`} />
      </div>
      <p className={`text-xs font-semibold mt-4 inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${ring[color]}`}>
        View all
        <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 6h8M6 2l4 4-4 4"/>
        </svg>
      </p>
    </Link>
  );
}

export default async function DashboardPage() {
  const admin = createAdminClient();

  const [
    { count: empCount },
    { count: pendingTimesheets },
    { count: pendingRequests },
    { count: activeJobs },
    { data: recentTimesheets },
    { data: recentRequests },
  ] = await Promise.all([
    admin.from('employees').select('id', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('timesheet_entries').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
    admin.from('hr_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('career_positions').select('id', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('timesheet_entries')
      .select('id, date, project, hours, employees!employee_id(full_name)')
      .eq('status', 'submitted')
      .order('created_at', { ascending: false })
      .limit(6),
    admin.from('hr_requests')
      .select('id, type, title, created_at, employees!employee_id(full_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  function relativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <div className="space-y-7">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-gray-900 tracking-tight">Overview</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Active Employees"
          value={empCount ?? 0}
          sub="On the team"
          href="/dashboard/employees"
          color="green"
        />
        <StatCard
          label="Pending Timesheets"
          value={pendingTimesheets ?? 0}
          sub="Awaiting review"
          href="/dashboard/timesheets"
          color="blue"
        />
        <StatCard
          label="HR Requests"
          value={pendingRequests ?? 0}
          sub="Need action"
          href="/dashboard/requests"
          color="amber"
        />
        <StatCard
          label="Open Positions"
          value={activeJobs ?? 0}
          sub="Active listings"
          href="/dashboard/jobs"
          color="brand"
        />
      </div>

      {/* Recent activity */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Recent timesheets */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Submitted Timesheets</h2>
              <p className="text-xs text-gray-400 mt-0.5">Pending your review</p>
            </div>
            {(pendingTimesheets ?? 0) > 0 && (
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                {pendingTimesheets}
              </span>
            )}
          </div>

          {!recentTimesheets?.length ? (
            <div className="px-5 py-10 text-center text-xs text-gray-400">No pending timesheets</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentTimesheets.map((e) => {
                const emp = e.employees as unknown as { full_name: string } | null;
                return (
                  <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-gray-50/50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{emp?.full_name ?? '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{e.project}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900">{e.hours}h</p>
                      <p className="text-xs text-gray-400">{new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="px-5 py-3 border-t border-gray-50">
            <Link href="/dashboard/timesheets"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              Review all timesheets →
            </Link>
          </div>
        </div>

        {/* Recent requests */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50">
            <div>
              <h2 className="text-sm font-bold text-gray-900">HR Requests</h2>
              <p className="text-xs text-gray-400 mt-0.5">Pending approval</p>
            </div>
            {(pendingRequests ?? 0) > 0 && (
              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                {pendingRequests}
              </span>
            )}
          </div>

          {!recentRequests?.length ? (
            <div className="px-5 py-10 text-center text-xs text-gray-400">No pending requests</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentRequests.map((r) => {
                const emp = r.employees as unknown as { full_name: string } | null;
                return (
                  <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-gray-50/50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{emp?.full_name ?? '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {TYPE_LABEL[r.type] ?? r.type}
                      </span>
                      <p className="text-xs text-gray-400 mt-1">{relativeTime(r.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="px-5 py-3 border-t border-gray-50">
            <Link href="/dashboard/requests"
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 transition-colors">
              Review all requests →
            </Link>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/employees/new"
            className="px-4 py-2 bg-ink text-white text-xs font-semibold rounded-full hover:bg-ink/90 transition-colors">
            + Add Employee
          </Link>
          <Link href="/dashboard/new"
            className="px-4 py-2 bg-brand text-white text-xs font-semibold rounded-full hover:bg-brand-dark transition-colors">
            + New Job Posting
          </Link>
          <Link href="/dashboard/timesheets"
            className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full hover:bg-gray-200 transition-colors">
            Review Timesheets
          </Link>
          <Link href="/dashboard/requests"
            className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full hover:bg-gray-200 transition-colors">
            Review Requests
          </Link>
          <Link href="/dashboard/org"
            className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full hover:bg-gray-200 transition-colors">
            View Org Chart
          </Link>
        </div>
      </div>
    </div>
  );
}
