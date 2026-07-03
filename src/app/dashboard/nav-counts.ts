'use server';

import { createAdminClient } from '@/lib/supabase-admin';

export async function fetchNavCounts(): Promise<{ requests: number; timesheets: number }> {
  const admin = createAdminClient();
  const [{ count: rc }, { data: tsRows }] = await Promise.all([
    admin.from('hr_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('timesheet_entries').select('employee_id').eq('status', 'submitted'),
  ]);
  const timesheets = new Set(tsRows?.map(r => r.employee_id) ?? []).size;
  return { requests: rc ?? 0, timesheets };
}
