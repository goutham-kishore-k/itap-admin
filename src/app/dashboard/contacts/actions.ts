'use server';

import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdminId } from '@/lib/require-admin';
import type { ContactRequest } from '@/types';

export async function fetchContactRequests(statusFilter: string): Promise<ContactRequest[]> {
  await requireAdminId();
  const admin = createAdminClient();
  let q = admin.from('contact_requests').select('*').order('created_at', { ascending: false });
  if (statusFilter !== 'all') q = q.eq('status', statusFilter);
  const { data } = await q;
  return (data ?? []) as ContactRequest[];
}

export async function updateContactRequest(
  id: string,
  status: 'new' | 'contacted' | 'closed',
  adminNotes: string | null,
) {
  const reviewerId = await requireAdminId();
  const admin = createAdminClient();

  await admin.from('contact_requests').update({
    status,
    admin_notes: adminNotes,
    reviewed_by: status === 'new' ? null : reviewerId,
    reviewed_at: status === 'new' ? null : new Date().toISOString(),
  }).eq('id', id);
}
