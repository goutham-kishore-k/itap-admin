import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReportEntry {
  date: string;
  project: string;
  hours: number;
  notes: string | null;
  status: string;
}

export interface ReportWeek {
  weekStartStr: string;
  weekEndStr: string;
  rows: ReportEntry[];
}

export interface TimesheetReportData {
  employee: {
    id: string;
    full_name: string;
    designation: string | null;
    email: string | null;
    deptName: string;
  };
  manager: { full_name: string; designation: string | null } | null;
  from: string;
  to: string;
  entries: ReportEntry[];
  weeks: ReportWeek[];
  totalHours: number;
  approvedHours: number;
  byProject: Map<string, number>;
  refNo: string;
  generatedAt: string;
}

function weekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}
function weekEnd(startStr: string): string {
  const d = new Date(startStr + 'T12:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
}

function groupByWeek(entries: ReportEntry[]): ReportWeek[] {
  const map = new Map<string, ReportEntry[]>();
  entries.forEach(e => {
    const key = weekStart(e.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => ({ weekStartStr: key, weekEndStr: weekEnd(key), rows }));
}

/**
 * Shared data-fetch/grouping logic for the timesheet report — used by both the
 * instant browser-preview route and the server-side Puppeteer PDF generator, so
 * both stay pixel-identical off one source of truth.
 */
export async function buildTimesheetReportData(
  supabase: SupabaseClient,
  params: { empId: string; from: string; to: string },
): Promise<TimesheetReportData | null> {
  const { empId, from, to } = params;

  const [{ data: employee }, { data: rawEntries }] = await Promise.all([
    supabase.from('employees')
      .select('id, full_name, designation, email, manager_id, departments(name)')
      .eq('id', empId).maybeSingle(),
    supabase.from('timesheet_entries')
      .select('date, project, hours, notes, status')
      .eq('employee_id', empId)
      .gte('date', from).lte('date', to)
      .order('date').order('created_at'),
  ]);

  if (!employee) return null;

  // The employee's actual reporting manager — not whoever happens to be
  // viewing/generating this report (an admin generating someone else's
  // report is not that employee's manager).
  const managerId = (employee as unknown as { manager_id: string | null }).manager_id;
  const { data: manager } = managerId
    ? await supabase.from('employees').select('id, full_name, designation').eq('id', managerId).maybeSingle()
    : { data: null };

  const entries: ReportEntry[] = (rawEntries ?? []).map((e: { date: string; project: string; hours: number; notes: string | null; status: string }) => ({
    date: e.date, project: e.project, hours: Number(e.hours), notes: e.notes ?? null, status: e.status,
  }));

  const totalHours    = entries.reduce((s, e) => s + e.hours, 0);
  const approvedHours = entries.filter(e => e.status === 'approved').reduce((s, e) => s + e.hours, 0);
  const weeks         = groupByWeek(entries);
  const byProject     = new Map<string, number>();
  entries.forEach(e => byProject.set(e.project, (byProject.get(e.project) ?? 0) + e.hours));

  const deptName    = (employee.departments as unknown as { name: string } | null)?.name ?? '—';
  const generatedAt = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const refNo       = `TS-${empId.replace(/-/g, '').slice(0, 6).toUpperCase()}-${from.replace(/-/g, '')}`;

  return {
    employee: {
      id: employee.id,
      full_name: employee.full_name,
      designation: employee.designation ?? null,
      email: employee.email ?? null,
      deptName,
    },
    manager: manager ? { full_name: manager.full_name, designation: manager.designation ?? null } : null,
    from, to,
    entries, weeks, totalHours, approvedHours, byProject, refNo, generatedAt,
  };
}
