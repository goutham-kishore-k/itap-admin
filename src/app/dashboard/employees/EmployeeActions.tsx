'use client';

import { useState } from 'react';
import Link from 'next/link';
import { setTempPassword } from './actions';

type Mode = 'idle' | 'form' | 'saving' | 'done' | 'error';

export default function EmployeeActions({
  id, userId, isPending,
}: {
  id: string;
  userId: string | null;
  isPending: boolean;
}) {
  const [mode, setMode] = useState<Mode>('idle');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleSave() {
    if (!userId) return;
    setMode('saving');
    try {
      await setTempPassword(userId, password);
      setMode('done');
      setMsg('Password updated!');
      setPassword('');
      setShow(false);
      setTimeout(() => setMode('idle'), 4000);
    } catch (err) {
      setMode('error');
      setMsg(err instanceof Error ? err.message : 'Failed');
      setTimeout(() => setMode('idle'), 5000);
    }
  }

  if (mode === 'done') return <span className="text-xs text-green-600 font-semibold">{msg}</span>;
  if (mode === 'error') return <span className="text-xs text-red-600 font-semibold">{msg}</span>;

  if (mode === 'form' || mode === 'saving') {
    return (
      <div className="flex items-center gap-2 justify-end flex-wrap">
        <div className="relative">
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            type={show ? 'text' : 'password'}
            placeholder="New password (min 6)"
            className="pl-3 pr-12 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-brand w-44"
          />
          <button type="button" onClick={() => setShow(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-600 font-medium">
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        <button onClick={handleSave} disabled={mode === 'saving' || password.length < 6}
          className="text-xs font-semibold text-white bg-brand px-3 py-1.5 rounded-lg hover:bg-brand-dark disabled:opacity-50 transition-colors">
          {mode === 'saving' ? '…' : 'Save'}
        </button>
        <button onClick={() => { setMode('idle'); setPassword(''); }}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5 flex-wrap">
      <Link href={`/dashboard/employees/${id}`}
        className="text-xs font-semibold text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-all">
        Edit
      </Link>
      <button onClick={() => setMode('form')}
        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
          isPending
            ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
            : 'text-gray-600 bg-gray-50 border-gray-200 hover:bg-gray-100'
        }`}>
        {isPending ? 'Set Password' : 'Reset Password'}
      </button>
    </div>
  );
}
