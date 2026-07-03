import { getPortalEmployee } from '@/lib/portal-user';
import { createClient } from '@/lib/supabase-server';
import Link from 'next/link';

const TYPE_LABEL: Record<string, string> = { leave: 'Leave', expense: 'Expense', grievance: 'Grievance', asset: 'Asset' };
const STATUS_STYLE: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
  closed:   'bg-gray-100 text-gray-500',
};

export default async function RequestsPage() {
  // Shared with layout — zero extra network calls
  const employee = await getPortalEmployee();
  if (!employee) return null;

  const supabase = await createClient();
  const { data: requests } = await supabase
    .from('hr_requests')
    .select('*')
    .eq('employee_id', employee.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">My Requests</h1>
        <Link href="/portal/requests/new"
          className="px-4 py-2 bg-brand text-white text-sm font-semibold rounded-full hover:bg-brand-dark transition-colors">
          + New Request
        </Link>
      </div>

      {(!requests || requests.length === 0) ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-16">
          <p className="text-gray-400 mb-3">No requests yet.</p>
          <Link href="/portal/requests/new" className="text-brand font-semibold text-sm hover:underline">
            Raise your first request →
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Title</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Type</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Date</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Admin Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {requests.map(req => (
                <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900">{req.title}</p>
                    <p className="text-xs text-gray-400 sm:hidden capitalize mt-0.5">{TYPE_LABEL[req.type]}</p>
                  </td>
                  <td className="px-5 py-3.5 hidden sm:table-cell capitalize text-gray-600">{TYPE_LABEL[req.type]}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_STYLE[req.status]}`}>{req.status}</span>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell text-gray-400 text-xs">
                    {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-gray-500 text-xs max-w-[200px] truncate">
                    {req.admin_notes ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
