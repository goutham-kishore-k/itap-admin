'use server';

import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdminId } from '@/lib/require-admin';

export async function fetchNavCounts(): Promise<{ requests: number; timesheets: number; contacts: number }> {
  await requireAdminId();
  const admin = createAdminClient();
  const [{ count: rc }, { data: tsRows }, { count: cc }] = await Promise.all([
    admin.from('hr_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('timesheet_entries').select('employee_id').eq('status', 'submitted'),
    admin.from('contact_requests').select('id', { count: 'exact', head: true }).eq('status', 'new'),
  ]);
  const timesheets = new Set(tsRows?.map(r => r.employee_id) ?? []).size;
  return { requests: rc ?? 0, timesheets, contacts: cc ?? 0 };
}
