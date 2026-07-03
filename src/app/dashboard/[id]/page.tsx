'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import type { CareerPosition } from '@/types';
import JobForm from '@/components/JobForm';

export default function EditPostingPage() {
  const params = useParams();
  const router = useRouter();
  const [position, setPosition] = useState<CareerPosition | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from('career_positions')
        .select('*')
        .eq('id', params.id as string)
        .single();
      if (!data) {
        router.push('/dashboard/jobs');
        return;
      }
      setPosition(data);
      setLoading(false);
    }
    load();
  }, [params.id, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/dashboard/jobs" className="hover:text-gray-700 transition-colors">Job Postings</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Edit</span>
      </div>
      <div className="flex items-center gap-2.5 mb-6">
        <h1 className="text-xl font-bold text-gray-900">{position?.title}</h1>
        {position && (
          <span className="font-mono text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-md">
            {position.job_id || '—'}
          </span>
        )}
      </div>
      {position && <JobForm initialData={position} />}
    </div>
  );
}
