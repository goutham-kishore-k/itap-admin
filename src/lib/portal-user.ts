import { cache } from 'react';
import { createClient } from './supabase-server';

// Cached per-request: layout and every page share one getUser + employees call
export const getPortalEmployee = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('employees')
    .select('id, full_name, role, designation, manager_id, departments(name)')
    .eq('user_id', user.id)
    .maybeSingle();
  return data ?? null;
});
