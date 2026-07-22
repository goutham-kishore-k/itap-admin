'use server';

import { createAdminClient } from '@/lib/supabase-admin';
import { getPortalEmployee } from '@/lib/portal-user';

export async function updateMyPhone(phone: string): Promise<{ error?: string }> {
  const employee = await getPortalEmployee();
  if (!employee) return { error: 'Not authenticated.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('employees')
    .update({ phone: phone.trim() || null })
    .eq('id', employee.id);

  if (error) return { error: error.message };
  return {};
}
