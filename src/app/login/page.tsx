'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    searchParams.get('error') === 'link_expired'
      ? 'Your invite link has expired. Ask your HR admin to re-send the invite.'
      : ''
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !data.user) {
      setError(authError?.message ?? 'Sign in failed');
      setLoading(false);
      return;
    }
    const { data: emp } = await supabase
      .from('employees')
      .select('role')
      .eq('user_id', data.user.id)
      .maybeSingle();

    const dest = emp?.role === 'hr_admin' || !emp ? '/dashboard' : '/portal';
    router.push(dest);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/images/itap-logo.png" alt="iTAP" width={56} height={56} className="mx-auto mb-4" />
          <h1 className="text-white text-2xl font-bold tracking-tight">iTAP</h1>
          <p className="text-white/50 text-sm mt-1">Sign in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 shadow-2xl">
          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
              autoComplete="email" //placeholder="you@itaptechnologies.com"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors" />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              autoComplete="current-password" //placeholder="••••••••"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-brand text-white font-semibold rounded-lg text-sm transition-colors hover:bg-brand-dark disabled:opacity-60 disabled:cursor-not-allowed">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
