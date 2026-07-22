import { createAdminClient } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';

// Broader than requireAdminId — used by approve/reject/revert, which both the
// hr_admin dashboard and a manager's Team Timesheets page call. hr_admin can
// review anyone; a manager only their own direct reports (verified against
// manager_id, not just role, so a manager can't approve an arbitrary
// employee's timesheet by guessing an id).
export async function requireReviewerId(targetEmployeeId: string): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  const admin = createAdminClient();
  const { data: reviewer } = await admin.from('employees').select('id, role, is_active').eq('user_id', user.id).single();
  if (!reviewer || !reviewer.is_active) throw new Error('Not authorized.');

  if (reviewer.role === 'hr_admin') return reviewer.id;

  if (reviewer.role === 'manager') {
    const { data: target } = await admin.from('employees').select('manager_id').eq('id', targetEmployeeId).single();
    if (target?.manager_id === reviewer.id) return reviewer.id;
  }

  throw new Error("Not authorized to review this employee's timesheet.");
}
