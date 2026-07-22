import { createAdminClient } from '@/lib/supabase-admin';
import Link from 'next/link';

function StatCard({
  label, value, sub, href, color,
}: {
  label: string; value: number | string; sub: string; href: string;
  color: 'brand' | 'blue' | 'amber' | 'green' | 'purple';
}) {
  const ring: Record<string, string> = {
    brand:  'bg-brand/8 text-brand',
    blue:   'bg-blue-50 text-blue-600',
    amber:  'bg-amber-50 text-amber-700',
    green:  'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
  };
  const dot: Record<string, string> = {
    brand:  'bg-brand',
    blue:   'bg-blue-500',
    amber:  'bg-amber-500',
    green:  'bg-green-500',
    purple: 'bg-purple-500',
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

function getWeekBounds(dateStr: string): { start: string; end: string; label: string } {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  const mon = new Date(d);
  mon.setDate(d.getDate() - dow);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (x: Date) => x.toISOString().split('T')[0];
  const label =
    mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' – ' +
    sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { start: fmt(mon), end: fmt(sun), label };
}

export default async function DashboardPage() {
  const admin = createAdminClient();

  const [
    { count: empCount },
    { data: pendingEntries },
    { count: activeJobs },
    { count: newContacts },
  ] = await Promise.all([
    admin.from('employees').select('id', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('timesheet_entries')
      .select('employee_id, date, hours, employees!employee_id(full_name)')
      .eq('status', 'submitted')
      .order('date', { ascending: false }),
    admin.from('career_positions').select('id', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('contact_requests').select('id', { count: 'exact', head: true }).eq('status', 'new'),
  ]);

  // ── Group submitted entries by (employee × week) ──────────────────────────
  type PersonWeek = {
    empId: string; name: string;
    weekStart: string; weekLabel: string;
    totalHours: number; entryCount: number;
  };
  const groupMap = new Map<string, PersonWeek>();

  for (const e of pendingEntries ?? []) {
    const emp = e.employees as unknown as { full_name: string } | null;
    const { start, label } = getWeekBounds(e.date);
    const key = `${e.employee_id}::${start}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        empId: e.employee_id, name: emp?.full_name ?? '—',
        weekStart: start, weekLabel: label,
        totalHours: 0, entryCount: 0,
      });
    }
    const g = groupMap.get(key)!;
    g.totalHours += Number(e.hours);
    g.entryCount++;
  }

  // Sort: newest week first, then alphabetically by name
  const allGroups = Array.from(groupMap.values())
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.name.localeCompare(b.name));

  // Roll up into week buckets for display (cap at 3 weeks)
  const weekBuckets: { weekStart: string; weekLabel: string; people: PersonWeek[] }[] = [];
  for (const g of allGroups) {
    const last = weekBuckets[weekBuckets.length - 1];
    if (!last || last.weekStart !== g.weekStart) {
      if (weekBuckets.length === 3) break;
      weekBuckets.push({ weekStart: g.weekStart, weekLabel: g.weekLabel, people: [g] });
    } else {
      last.people.push(g);
    }
  }

  const pendingEmpCount = new Set(allGroups.map(g => g.empId)).size;

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
          value={pendingEmpCount}
          sub={pendingEmpCount === 1 ? 'employee awaiting review' : 'employees awaiting review'}
          href="/dashboard/timesheets"
          color="blue"
        />
        <StatCard
          label="Open Positions"
          value={activeJobs ?? 0}
          sub="Active listings"
          href="/dashboard/jobs"
          color="brand"
        />
        <StatCard
          label="Contact Requests"
          value={newContacts ?? 0}
          sub="New submissions"
          href="/dashboard/contacts"
          color="purple"
        />
      </div>

      {/* Recent activity */}
      <div className="grid gap-4">

        {/* Submitted timesheets — by person, grouped by week */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Submitted Timesheets</h2>
              <p className="text-xs text-gray-400 mt-0.5">Pending your review</p>
            </div>
            {pendingEmpCount > 0 && (
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                {pendingEmpCount} {pendingEmpCount === 1 ? 'person' : 'people'}
              </span>
            )}
          </div>

          {weekBuckets.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-gray-400">No pending timesheets</div>
          ) : (
            <div>
              {weekBuckets.map(wk => (
                <div key={wk.weekStart}>
                  {/* Week header */}
                  <div className="px-5 py-2 bg-gray-50/70 border-b border-gray-50 flex items-center justify-between">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      Week of {wk.weekLabel}
                    </p>
                    <span className="text-[11px] text-gray-400">
                      {wk.people.length} {wk.people.length === 1 ? 'person' : 'people'}
                    </span>
                  </div>
                  {/* People rows */}
                  <div className="divide-y divide-gray-50">
                    {wk.people.map(p => (
                      <div key={p.empId} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-gray-50/50 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                          <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-gray-900">{p.totalHours.toFixed(1)}h</p>
                          <p className="text-[11px] text-gray-400">{p.entryCount} {p.entryCount === 1 ? 'entry' : 'entries'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="px-5 py-3 border-t border-gray-50">
            <Link href="/dashboard/timesheets"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              Review all timesheets →
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
          <Link href="/dashboard/contacts"
            className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full hover:bg-gray-200 transition-colors">
            Review Contact Requests
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
