import { getPortalEmployee } from '@/lib/portal-user';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import Link from 'next/link';

const REQUEST_STATUS_BADGE: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
  closed:   'bg-gray-100 text-gray-500',
};

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

  const [
    { data: weekEntries },
    { count: pendingReqs },
    { data: recentRequests },
    { data: manager },
  ] = await Promise.all([
    supabase.from('timesheet_entries')
      .select('hours, status')
      .eq('employee_id', employee.id).gte('date', weekStart).lte('date', weekEnd),
    supabase.from('hr_requests')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employee.id).eq('status', 'pending'),
    supabase.from('hr_requests')
      .select('id, type, title, status, created_at')
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: false }).limit(5),
    (employee as unknown as { manager_id?: string }).manager_id
      ? admin.from('employees')
          .select('full_name, designation')
          .eq('id', (employee as unknown as { manager_id: string }).manager_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const weekHours = (weekEntries ?? []).reduce((s, e) => s + Number(e.hours), 0);
  const dept = (employee.departments as unknown as { name: string } | null)?.name;

  const statuses = (weekEntries ?? []).map(e => e.status);
  const tsWeekStatus =
    statuses.length === 0                       ? 'none'      :
    statuses.every(s => s === 'approved')        ? 'approved'  :
    statuses.some(s => s === 'submitted')        ? 'submitted' :
    'draft';

  const tsStatusBadge: Record<string, string> = {
    none: 'text-gray-400', draft: 'text-amber-600', submitted: 'text-blue-600', approved: 'text-green-600',
  };
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">This week</p>
          <p className="text-3xl font-black text-gray-900 mt-1 tracking-tight">{weekHours.toFixed(1)}h</p>
          <p className={`text-xs font-semibold mt-1 ${tsStatusBadge[tsWeekStatus]}`}>
            {tsStatusLabel[tsWeekStatus]}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Requests</p>
          <p className="text-3xl font-black text-gray-900 mt-1 tracking-tight">{pendingReqs ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">pending</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/portal/timesheet"
          className="flex items-center gap-3 bg-brand text-white rounded-2xl p-4 hover:bg-brand-dark transition-colors">
          <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div>
            <p className="font-semibold text-sm">Timesheet</p>
            <p className="text-white/70 text-xs">Log your hours</p>
          </div>
        </Link>
        <Link href="/portal/requests/new"
          className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 hover:border-gray-200 transition-colors">
          <svg className="w-6 h-6 shrink-0 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div>
            <p className="font-semibold text-sm text-gray-900">New Request</p>
            <p className="text-gray-400 text-xs">Leave, expense & more</p>
          </div>
        </Link>
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

      {/* Recent requests */}
      {(recentRequests ?? []).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <h2 className="font-bold text-gray-900 text-sm">Recent Requests</h2>
            <Link href="/portal/requests" className="text-xs text-brand font-semibold hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {(recentRequests ?? []).map(r => (
              <div key={r.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{r.title}</p>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">
                    {r.type} · {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${REQUEST_STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-500'}`}>
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
