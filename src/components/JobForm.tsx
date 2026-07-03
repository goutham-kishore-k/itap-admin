'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import type { CareerPosition } from '@/types';
import ArrayField from './ArrayField';

const DEPARTMENTS = ['Engineering', 'Delivery', 'Marketing'];
const TYPES = ['Full-time', 'Contract', 'Part-time'];
const CATEGORIES = [
  '',
  'Full-stack development',
  'DevOps and cloud engineering',
  'Data engineering',
  'AI and machine learning',
  'QA automation',
  'Solution architecture',
];
const WORK_ARRANGEMENTS = ['Remote', 'In-person', 'Hybrid'];

interface FormValues {
  title: string;
  department: string;
  location: string;
  type: string;
  category: string;
  work_arrangement: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  nice_to_haves: string[];
  salary_range: string;
  is_active: boolean;
}

function init(data?: CareerPosition): FormValues {
  return {
    title: data?.title ?? '',
    department: data?.department ?? 'Engineering',
    location: data?.location ?? 'TX, Remote',
    type: data?.type ?? 'Full-time',
    category: data?.category ?? '',
    work_arrangement: data?.work_arrangement ?? 'Remote',
    description: data?.description ?? '',
    responsibilities: data?.responsibilities ?? [],
    requirements: data?.requirements ?? [],
    nice_to_haves: data?.nice_to_haves ?? [],
    salary_range: data?.salary_range ?? '',
    is_active: data?.is_active ?? true,
  };
}

const input = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors bg-white';
const label = 'block text-sm font-semibold text-gray-700 mb-1.5';

export default function JobForm({ initialData }: { initialData?: CareerPosition }) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(init(initialData));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = !!initialData;

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues(v => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.title.trim() || !values.description.trim()) {
      setError('Title and description are required.');
      return;
    }
    setError('');
    setSaving(true);

    const supabase = createClient();
    const payload = {
      ...values,
      salary_range: values.salary_range.trim() || null,
      responsibilities: values.responsibilities.filter(Boolean),
      requirements: values.requirements.filter(Boolean),
      nice_to_haves: values.nice_to_haves.filter(Boolean),
    };

    const { error: err } = isEdit
      ? await supabase.from('career_positions').update(payload).eq('id', initialData!.id)
      : await supabase.from('career_positions').insert(payload);

    if (err) {
      setError(err.message);
      setSaving(false);
    } else {
      router.push('/dashboard/jobs');
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
        <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-4">Position details</h2>

        <div>
          <label className={label}>Title <span className="text-red-400">*</span></label>
          <input className={input} value={values.title} onChange={e => set('title', e.target.value)}
            placeholder="e.g. Senior Software Engineer" required />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={label}>Department</label>
            <select className={input} value={values.department} onChange={e => set('department', e.target.value)}>
              {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Location</label>
            <input className={input} value={values.location} onChange={e => set('location', e.target.value)}
              placeholder="e.g. TX, Remote" />
          </div>
          <div>
            <label className={label}>Employment type</label>
            <select className={input} value={values.type} onChange={e => set('type', e.target.value)}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Work arrangement</label>
            <select className={input} value={values.work_arrangement} onChange={e => set('work_arrangement', e.target.value)}>
              {WORK_ARRANGEMENTS.map(w => <option key={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Category</label>
            <select className={input} value={values.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c || '— None —'}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>
              Salary range <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input className={input} value={values.salary_range} onChange={e => set('salary_range', e.target.value)}
              placeholder="e.g. $130,000 – $160,000" />
          </div>
        </div>

        <div>
          <label className={label}>Description <span className="text-red-400">*</span></label>
          <textarea className={input + ' resize-none'} rows={3} value={values.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Brief summary of the role..." required />
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
        <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-4">Role details</h2>
        <ArrayField
          label="What you'll do (Responsibilities)"
          items={values.responsibilities}
          onChange={v => set('responsibilities', v)}
          placeholder="Add a responsibility…"
        />
        <ArrayField
          label="What we're looking for (Requirements)"
          items={values.requirements}
          onChange={v => set('requirements', v)}
          placeholder="Add a requirement…"
        />
        <ArrayField
          label="Nice to have"
          items={values.nice_to_haves}
          onChange={v => set('nice_to_haves', v)}
          placeholder="Add a nice-to-have…"
        />
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-4 mb-5">Visibility</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={values.is_active}
            onClick={() => set('is_active', !values.is_active)}
            className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${values.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${values.is_active ? 'translate-x-4' : ''}`} />
          </button>
          <p className="text-sm font-semibold text-gray-700">
            {values.is_active ? 'Active — visible on site' : 'Filled — hidden from site'}
          </p>
        </div>
      </section>

      <div className="flex items-center gap-3 pb-8">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-brand text-white font-semibold rounded-full text-sm hover:bg-brand-dark disabled:opacity-60 transition-colors"
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Posting'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/dashboard/jobs')}
          className="px-6 py-2.5 bg-white text-gray-600 font-semibold rounded-full text-sm border border-gray-200 hover:border-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
