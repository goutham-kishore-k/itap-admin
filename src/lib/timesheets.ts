import { createAdminClient } from '@/lib/supabase-admin';

// Finds (or creates on first use) the `timesheets` row identifying one
// employee's period — the stable id attachments/entries key off instead of
// loosely matching period_type/period_start/period_end on every read.
export async function getOrCreateTimesheetId(
  admin:       ReturnType<typeof createAdminClient>,
  employeeId:  string,
  periodType:  string,
  periodStart: string,
  periodEnd:   string,
): Promise<string> {
  const { data, error } = await admin
    .from('timesheets')
    .upsert(
      { employee_id: employeeId, period_type: periodType, period_start: periodStart, period_end: periodEnd },
      { onConflict: 'employee_id,period_type,period_start,period_end' },
    )
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to resolve timesheet.');
  return data.id;
}
