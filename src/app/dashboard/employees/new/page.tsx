'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { inviteEmployee } from '../actions';

interface Option { id: string; name?: string; full_name?: string; }

export default function NewEmployeePage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Option[]>([]);
  const [managers, setManagers] = useState<Option[]>([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name'),
    ]).then(([{ data: d }, { data: m }]) => {
      setDepartments(d ?? []);
      setManagers(m ?? []);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await inviteEmployee(new FormData(e.currentTarget));
      router.push('/dashboard/employees');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSending(false);
    }
  }

  const inp = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors bg-white';
  const lbl = 'block text-sm font-semibold text-gray-700 mb-1.5';

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/dashboard/employees" className="hover:text-gray-700 transition-colors">Employees</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Add Employee</span>
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Add Employee</h1>
      <p className="text-sm text-gray-500 mb-6">
        Set a temporary password and share it with the employee directly. They can change it after their first login.
      </p>

      {error && (
        <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
          <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-4">Personal Info</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={lbl}>Full Name <span className="text-red-400">*</span></label>
              <input name="full_name" className={inp} placeholder="Jane Smith" required />
            </div>
            <div>
              <label className={lbl}>Email <span className="text-red-400">*</span></label>
              <input name="email" type="email" className={inp} placeholder="jane@itaptechnologies.com" required />
            </div>
            <div>
              <label className={lbl}>Temporary Password <span className="text-red-400">*</span></label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className={inp + ' pr-16'}
                  placeholder="Min. 6 characters"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-medium"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div>
              <label className={lbl}>Phone <span className="font-normal text-gray-400">(optional)</span></label>
              <input name="phone" className={inp} placeholder="+1 555 000 0000" />
            </div>
            <div>
              <label className={lbl}>Hire Date <span className="font-normal text-gray-400">(optional)</span></label>
              <input name="hire_date" type="date" className={inp} />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
          <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-4">Role & Reporting</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={lbl}>Designation <span className="font-normal text-gray-400">(optional)</span></label>
              <input name="designation" className={inp} placeholder="e.g. Senior Engineer" />
            </div>
            <div>
              <label className={lbl}>Role</label>
              <select name="role" className={inp}>
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="hr_admin">HR Admin</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Department</label>
              <select name="department_id" className={inp}>
                <option value="">— None —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Reports to (Manager)</label>
              <select name="manager_id" className={inp}>
                <option value="">— None —</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          </div>
        </section>

        <div className="flex gap-3 flex-wrap">
          <button type="submit" disabled={sending}
            className="px-6 py-2.5 bg-brand text-white font-semibold rounded-full text-sm hover:bg-brand-dark disabled:opacity-60 transition-colors">
            {sending ? 'Creating account…' : 'Create Account'}
          </button>
          <Link href="/dashboard/employees"
            className="px-6 py-2.5 bg-white border border-gray-200 text-gray-600 font-semibold rounded-full text-sm hover:border-gray-300 transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
