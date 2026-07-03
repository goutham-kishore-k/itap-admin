import { createAdminClient } from '@/lib/supabase-admin';
import EmployeesTable, { type EmployeeRow } from './EmployeesTable';

export default async function EmployeesPage() {
  const admin = createAdminClient();

  const [{ data: employees }, { data: { users } }] = await Promise.all([
    admin.from('employees').select('*, departments(name), manager:manager_id(id, full_name)').order('full_name'),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const neverLoggedIn = new Set(users.filter(u => !u.last_sign_in_at).map(u => u.id));

  const rows: EmployeeRow[] = (employees ?? []).map(e => ({
    id:              e.id,
    full_name:       e.full_name,
    email:           e.email ?? null,
    designation:     e.designation ?? null,
    role:            e.role,
    is_active:       e.is_active,
    user_id:         e.user_id ?? null,
    department_name: (e.departments as unknown as { name: string } | null)?.name ?? null,
    manager_name:    (e.manager as { id: string; full_name: string } | null)?.full_name ?? null,
  }));

  const pendingUserIds = users.filter(u => !u.last_sign_in_at).map(u => u.id)
    .filter(uid => rows.some(r => r.user_id === uid));

  return <EmployeesTable employees={rows} pendingUserIds={pendingUserIds} />;
}
