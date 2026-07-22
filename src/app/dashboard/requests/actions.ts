'use server';

import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdminId } from '@/lib/require-admin';
import type { HrRequest } from '@/types';

export async function fetchRequests(typeFilter: string, statusFilter: string): Promise<HrRequest[]> {
  await requireAdminId();
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
  const reviewerId = await requireAdminId();
  const admin = createAdminClient();

  await admin.from('hr_requests').update({
    status,
    admin_notes:  adminNotes,
    reviewed_by:  status === 'pending' ? null : reviewerId,
    reviewed_at:  status === 'pending' ? null : new Date().toISOString(),
  }).eq('id', id);
}
