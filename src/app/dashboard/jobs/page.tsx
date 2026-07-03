'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import type { CareerPosition } from '@/types';

export default function JobPostingsPage() {
  const [positions, setPositions] = useState<CareerPosition[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
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
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Title</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 hidden md:table-cell">Dept</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 hidden lg:table-cell">Type</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {positions.map(pos => (
                <tr key={pos.id} className="hover:bg-gray-50/70 transition-colors">
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
