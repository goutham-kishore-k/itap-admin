'use server';

import { createAdminClient } from '@/lib/supabase-admin';

export async function fetchNavCounts(): Promise<{ requests: number; timesheets: number }> {
  const admin = createAdminClient();
  const [{ count: rc }, { count: tc }] = await Promise.all([
    admin.from('hr_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('timesheet_entries').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
  ]);
  return { requests: rc ?? 0, timesheets: tc ?? 0 };
}
