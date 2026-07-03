import { redirect } from 'next/navigation';
import Image from 'next/image';
import { getPortalEmployee } from '@/lib/portal-user';
import PortalNav from '@/components/PortalNav';
import RouteProgress from '@/components/RouteProgress';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const employee = await getPortalEmployee();

  if (!employee) {
    // Not logged in or no employee record
    const { createClient } = await import('@/lib/supabase-server');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <Image src="/images/itap-logo.png" alt="iTAP" width={48} height={48} className="mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Account not set up</h2>
          <p className="text-gray-500 text-sm">Your account hasn&apos;t been added to the HR system yet. Please contact your HR admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 md:flex md:h-screen md:overflow-hidden">
      <RouteProgress />
      <PortalNav employeeName={employee.full_name} role={employee.role} />
      <main className="flex-1 min-w-0 md:overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
