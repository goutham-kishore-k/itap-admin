import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import AdminNav from '@/components/AdminNav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  let { data: employee } = await admin
    .from('employees')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!employee) {
    await admin.from('employees').insert({
      user_id: user.id,
      full_name: (user.user_metadata?.full_name as string | undefined)
        ?? user.email?.split('@')[0]
        ?? 'Admin',
      email: user.email!,
      role: 'hr_admin',
    });
    const { data: created } = await admin
      .from('employees')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    employee = created;
  }

  if (employee && employee.role !== 'hr_admin') redirect('/portal');

  return (
    <div className="bg-gray-50 md:flex md:h-screen md:overflow-hidden">
      <AdminNav />
      <main className="flex-1 min-w-0 md:overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
