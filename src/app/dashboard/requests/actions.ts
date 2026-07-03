'use server';

import { createAdminClient } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';
import type { HrRequest } from '@/types';

export async function fetchRequests(typeFilter: string, statusFilter: string): Promise<HrRequest[]> {
  const admin = createAdminClient();
  let q = admin
    .from('hr_requests')
    .select('*, employees!employee_id(id, full_name, designation)')
    .order('created_at', { ascending: false });
  if (typeFilter !== 'all')   q = q.eq('type', typeFilter);
  if (statusFilter !== 'all') q = q.eq('status', statusFilter);
  const { data } = await q;
  return (data ?? []) as HrRequest[];
}

export async function updateRequest(
  id: string,
  status: 'pending' | 'approved' | 'rejected' | 'closed',
  adminNotes: string | null,
) {
  const admin      = createAdminClient();
  const supabase   = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let reviewedBy: string | null = null;
  if (user) {
    const { data: emp } = await admin.from('employees').select('id').eq('user_id', user.id).single();
    reviewedBy = emp?.id ?? null;
  }

  await admin.from('hr_requests').update({
    status,
    admin_notes:  adminNotes,
    reviewed_by:  status === 'pending' ? null : reviewedBy,
    reviewed_at:  status === 'pending' ? null : new Date().toISOString(),
  }).eq('id', id);
}
