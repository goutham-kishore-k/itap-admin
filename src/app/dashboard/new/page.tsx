import Link from 'next/link';
import JobForm from '@/components/JobForm';

export default function NewPostingPage() {
  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/dashboard/jobs" className="hover:text-gray-700 transition-colors">Job Postings</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">New Posting</span>
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">New Job Posting</h1>
      <JobForm />
    </div>
  );
}
