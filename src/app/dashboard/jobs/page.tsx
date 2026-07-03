'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import type { CareerPosition } from '@/types';

export default function JobPostingsPage() {
  const [positions, setPositions] = useState<CareerPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchPositions = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('career_positions')
      .select('*')
      .order('created_at', { ascending: false });
    setPositions(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPositions(); }, [fetchPositions]);

  async function toggleActive(pos: CareerPosition) {
    const supabase = createClient();
    await supabase.from('career_positions').update({ is_active: !pos.is_active }).eq('id', pos.id);
    fetchPositions();
  }

  async function deletePosition(pos: CareerPosition) {
    if (!window.confirm(`Delete "${pos.title}"? This cannot be undone.`)) return;
    const supabase = createClient();
    await supabase.from('career_positions').delete().eq('id', pos.id);
    fetchPositions();
  }

  const activeCount = positions.filter(p => p.is_active).length;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? positions.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.job_id ?? '').toLowerCase().includes(q) ||
        p.department.toLowerCase().includes(q))
    : positions;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Job Postings</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {positions.length} total · {activeCount} active · {positions.length - activeCount} filled
          </p>
        </div>
        <Link href="/dashboard/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-full hover:bg-brand-dark transition-colors">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          New Posting
        </Link>
      </div>

      <div className="relative max-w-sm">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title, Job ID, or department…"
          className="w-full pl-10 pr-3.5 py-2.5 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors bg-white"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : positions.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
          <p className="text-gray-400 mb-3">No job postings yet.</p>
          <Link href="/dashboard/new" className="text-brand font-semibold text-sm hover:underline">
            Create your first posting →
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
          <p className="text-gray-400">No postings match &ldquo;{search}&rdquo;.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Job ID</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Title</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 hidden md:table-cell">Dept</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 hidden lg:table-cell">Type</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(pos => (
                <tr key={pos.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-4">
                    <span className="font-mono text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-md whitespace-nowrap">{pos.job_id || '—'}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-semibold text-gray-900">{pos.title}</span>
                    <span className="block text-xs text-gray-400 mt-0.5">{pos.location} · {pos.work_arrangement}</span>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell text-gray-600">{pos.department}</td>
                  <td className="px-5 py-4 hidden lg:table-cell text-gray-500">{pos.type}</td>
                  <td className="px-5 py-4">
                    {pos.is_active ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />Filled
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <Link href={`/dashboard/${pos.id}`}
                        className="text-xs font-semibold text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-all">
                        Edit
                      </Link>
                      <button onClick={() => toggleActive(pos)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                          pos.is_active
                            ? 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100'
                            : 'text-green-700 border-green-200 bg-green-50 hover:bg-green-100'
                        }`}>
                        {pos.is_active ? 'Mark Filled' : 'Reopen'}
                      </button>
                      <button onClick={() => deletePosition(pos)}
                        className="text-xs font-semibold text-red-600 px-3 py-1.5 rounded-lg border border-red-100 bg-red-50 hover:bg-red-100 transition-all">
                        Delete
                      </button>
                    </div>
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
