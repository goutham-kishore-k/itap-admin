'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { Employee } from '@/types';

export default function ProfilePage() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Password change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('employees')
        .select('*, departments(name), manager:manager_id(id, full_name)')
        .eq('user_id', user.id).single()
        .then(({ data }) => {
          setEmployee(data as Employee | null);
          setPhone(data?.phone ?? '');
          setLoading(false);
        });
    });
  }, []);

  async function changePassword() {
    if (newPassword.length < 6) { setPwdMsg({ type: 'err', text: 'Password must be at least 6 characters.' }); return; }
    if (newPassword !== confirmPassword) { setPwdMsg({ type: 'err', text: 'Passwords do not match.' }); return; }
    setPwdSaving(true); setPwdMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setPwdMsg({ type: 'err', text: error.message }); }
    else { setPwdMsg({ type: 'ok', text: 'Password changed successfully!' }); setNewPassword(''); setConfirmPassword(''); }
    setPwdSaving(false);
  }

  async function savePhone() {
    if (!employee) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from('employees').update({ phone: phone.trim() || null }).eq('id', employee.id);
    setEmployee(e => e ? { ...e, phone: phone.trim() || null } : e);
    setSaving(false);
    setEditing(false);
  }

  const dept = (employee?.departments as unknown as { name: string } | null)?.name;
  const manager = (employee?.manager as { id: string; full_name: string } | null);

  const ROLE_LABEL: Record<string, string> = { employee: 'Employee', manager: 'Manager', hr_admin: 'HR Admin' };

  if (loading) return (
    <div className="max-w-xl space-y-6 animate-pulse">
      <div className="h-6 w-28 bg-gray-200 rounded-lg" />
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {/* Avatar header */}
        <div className="bg-ink/80 px-6 py-8 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/20 shrink-0" />
          <div className="space-y-2">
            <div className="h-5 w-36 bg-white/20 rounded-lg" />
            <div className="h-3 w-24 bg-white/10 rounded" />
          </div>
        </div>
        {/* Field rows */}
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-6 py-3.5 flex items-center justify-between">
              <div className="h-3.5 w-20 bg-gray-100 rounded" />
              <div className="h-3.5 w-32 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
      {/* Password section */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 space-y-1.5">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-3 w-48 bg-gray-100 rounded" />
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="h-3.5 w-24 bg-gray-100 rounded" />
              <div className="h-10 bg-gray-100 rounded-lg" />
            </div>
            <div className="space-y-2">
              <div className="h-3.5 w-28 bg-gray-100 rounded" />
              <div className="h-10 bg-gray-100 rounded-lg" />
            </div>
          </div>
          <div className="h-9 w-36 bg-brand/20 rounded-full" />
        </div>
      </div>
    </div>
  );

  if (!employee) return <p className="text-gray-400 text-center py-16">Profile not found.</p>;

  const fields = [
    { label: 'Full Name', value: employee.full_name },
    { label: 'Email', value: employee.email },
    { label: 'Designation', value: employee.designation ?? '—' },
    { label: 'Department', value: dept ?? '—' },
    { label: 'Manager', value: manager?.full_name ?? '—' },
    { label: 'Role', value: ROLE_LABEL[employee.role] ?? employee.role },
    { label: 'Hire Date', value: employee.hire_date ? new Date(employee.hire_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
  ];

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">My Profile</h1>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="bg-ink px-6 py-8 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-brand flex items-center justify-center text-white text-xl font-bold">
            {employee.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
          </div>
          <div>
            <p className="text-white font-bold text-lg">{employee.full_name}</p>
            <p className="text-white/60 text-sm">{employee.designation ?? ROLE_LABEL[employee.role]}</p>
            {dept && <p className="text-white/40 text-xs mt-0.5">{dept}</p>}
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {fields.map(f => (
            <div key={f.label} className="px-6 py-3.5 flex items-center justify-between">
              <span className="text-sm text-gray-400 font-medium w-28 shrink-0">{f.label}</span>
              <span className="text-sm text-gray-900 font-medium text-right">{f.value}</span>
            </div>
          ))}

          <div className="px-6 py-3.5 flex items-center justify-between">
            <span className="text-sm text-gray-400 font-medium w-28 shrink-0">Phone</span>
            {editing ? (
              <div className="flex items-center gap-2">
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand w-40"
                  placeholder="+1 555 000 0000" />
                <button onClick={savePhone} disabled={saving}
                  className="text-xs font-semibold text-white bg-brand px-3 py-1.5 rounded-lg hover:bg-brand-dark disabled:opacity-60 transition-colors">
                  {saving ? '…' : 'Save'}
                </button>
                <button onClick={() => { setEditing(false); setPhone(employee.phone ?? ''); }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-900 font-medium">{employee.phone ?? '—'}</span>
                <button onClick={() => setEditing(true)} className="text-xs text-brand hover:underline font-medium">Edit</button>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Change password */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50">
          <h2 className="font-semibold text-gray-900 text-sm">Change Password</h2>
          <p className="text-xs text-gray-400 mt-0.5">Choose a strong password you&apos;ll remember.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          {pwdMsg && (
            <div className={`text-sm px-4 py-2.5 rounded-lg ${pwdMsg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {pwdMsg.text}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">New Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full px-3.5 py-2.5 pr-14 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand transition-colors"
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-medium">
                  {showPwd ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Confirm Password</label>
              <input
                type={showPwd ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand transition-colors"
              />
            </div>
          </div>
          <button onClick={changePassword} disabled={pwdSaving || !newPassword}
            className="px-5 py-2 bg-brand text-white text-sm font-semibold rounded-full hover:bg-brand-dark disabled:opacity-60 transition-colors">
            {pwdSaving ? 'Saving…' : 'Change Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
