'use server';

import { createAdminClient } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';
import type { ContactRequest } from '@/types';

export async function fetchContactRequests(statusFilter: string): Promise<ContactRequest[]> {
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
  const admin    = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let reviewedBy: string | null = null;
  if (user) {
    const { data: emp } = await admin.from('employees').select('id').eq('user_id', user.id).single();
    reviewedBy = emp?.id ?? null;
  }

  await admin.from('contact_requests').update({
    status,
    admin_notes: adminNotes,
    reviewed_by: status === 'new' ? null : reviewedBy,
    reviewed_at: status === 'new' ? null : new Date().toISOString(),
  }).eq('id', id);
}
