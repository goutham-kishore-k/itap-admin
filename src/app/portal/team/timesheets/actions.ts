'use server';

import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

export interface TeamPendingEntry {
  id: string;
  date: string;
  project: string;
  hours: number;
  notes: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
}

export interface TeamPendingBatch {
  empId: string;
  empName: string;
  periodType: 'monthly' | 'range';
  periodStart: string;
  periodEnd: string;
  entries: TeamPendingEntry[];
  totalHours: number;
}

async function requireManagerId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  const admin = createAdminClient();
  const { data } = await admin.from('employees').select('id, role, is_active').eq('user_id', user.id).single();
  if (!data || (data.role !== 'manager' && data.role !== 'hr_admin') || !data.is_active) throw new Error('Not authorized.');
  return data.id;
}

function lastDayOfMonthStr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().split('T')[0];
}

// One row per pending submission from a direct report — grouped by the real
// timesheet_id (exact period) when available, falling back to a shared
// submitted_at, and treating anything with neither as its own singleton
// batch (only possible for legacy rows predating both).
//
// Uses the RLS-scoped client, not the service-role one: the ts_select policy
// already restricts a manager to their own subordinates' rows, so there's no
// need to separately look up and filter by direct-report ids here.
export async function fetchTeamPendingBatches(): Promise<TeamPendingBatch[]> {
  const managerId = await requireManagerId();
  const supabase = await createClient();

  const { data } = await supabase
    .from('timesheet_entries')
    .select('id, employee_id, date, project, hours, notes, status, timesheet_id, submitted_at, employees!employee_id(full_name)')
    .eq('status', 'submitted')
    .neq('employee_id', managerId)
    .order('date');

  if (!data || data.length === 0) return [];

  const timesheetIds = [...new Set(data.map(e => e.timesheet_id).filter((id): id is string => Boolean(id)))];
  const timesheetsById = new Map<string, { period_type: string; period_start: string; period_end: string }>();
  if (timesheetIds.length) {
    const { data: timesheets } = await supabase
      .from('timesheets')
      .select('id, period_type, period_start, period_end')
      .in('id', timesheetIds);
    (timesheets ?? []).forEach(t => timesheetsById.set(t.id, t));
  }

  const groups = new Map<string, typeof data>();
  data.forEach(e => {
    const key = `${e.employee_id}:${e.timesheet_id ? 'id:' + e.timesheet_id : e.submitted_at ? 'at:' + e.submitted_at : 'row:' + e.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  });

  const result: TeamPendingBatch[] = [];
  groups.forEach(rows => {
    const first = rows[0];
    const emp = first.employees as unknown as { full_name: string } | null;
    const linkedId = rows.find(r => r.timesheet_id)?.timesheet_id;
    const linked = linkedId ? timesheetsById.get(linkedId) : undefined;

    let periodType: TeamPendingBatch['periodType'];
    let periodStart: string;
    let periodEnd: string;
    if (linked) {
      periodType = linked.period_type === 'monthly' ? 'monthly' : 'range';
      periodStart = linked.period_start;
      periodEnd = linked.period_end;
    } else {
      const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
      periodStart = sorted[0].date;
      periodEnd = sorted[sorted.length - 1].date;
      const isFullMonth = periodStart.endsWith('-01') && periodEnd === lastDayOfMonthStr(periodStart);
      periodType = isFullMonth ? 'monthly' : 'range';
    }

    result.push({
      empId: first.employee_id,
      empName: emp?.full_name ?? '(unknown)',
      periodType, periodStart, periodEnd,
      entries: rows.map(r => ({
        id: r.id, date: r.date, project: r.project, hours: Number(r.hours),
        notes: r.notes ?? null, status: r.status,
      })),
      totalHours: rows.reduce((s, r) => s + Number(r.hours), 0),
    });
  });

  return result.sort((a, b) => a.empName.localeCompare(b.empName) || a.periodStart.localeCompare(b.periodStart));
}
