import { createAdminClient } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';

// Shared by every hr_admin-only server action (timesheet approve/reject/revert,
// PDF report generation, etc). Server Actions are independently callable RPC
// endpoints regardless of which page rendered the button that triggers them, so
// each action must verify the caller's role itself rather than relying on
// page-level gating (e.g. the /dashboard layout redirect) alone.
export async function requireAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  const admin = createAdminClient();
  const { data } = await admin.from('employees').select('id, role').eq('user_id', user.id).single();
  if (!data || data.role !== 'hr_admin') throw new Error('Not authorized.');
  return data.id;
}
