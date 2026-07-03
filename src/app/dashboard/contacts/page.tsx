'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ContactRequest } from '@/types';
import { fetchContactRequests, updateContactRequest } from './actions';

const STATUS_FILTER = ['new', 'contacted', 'closed', 'all'];

const STATUS_STYLE: Record<string, string> = {
  new:       'bg-amber-50 text-amber-700 border-amber-200',
  contacted: 'bg-blue-50 text-blue-600 border-blue-200',
  closed:    'bg-gray-100 text-gray-500 border-gray-200',
};

export default function ContactRequestsPage() {
  const [requests, setRequests]         = useState<ContactRequest[]>([]);
  const [loading, setLoading]           = useState(true);
  const [statusFilter, setStatusFilter] = useState('new');
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [notes, setNotes]               = useState<Record<string, string>>({});
  const [acting, setActing]             = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchContactRequests(statusFilter);
    setRequests(data);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function act(req: ContactRequest, status: 'new' | 'contacted' | 'closed') {
    setActing(req.id);
    const n = notes[req.id] ?? req.admin_notes ?? null;
    await updateContactRequest(req.id, status, n);
    setActing(null);
    setExpanded(null);
    load();
  }

  const filterBtn = (val: string, cur: string) =>
    `px-3 py-2 text-xs font-semibold rounded-full border transition-all ${val === cur ? 'bg-ink text-white border-ink' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Contact Requests</h1>
        <p className="text-sm text-gray-400 mt-0.5">{requests.length} result{requests.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-gray-400 font-medium">Status:</span>
        {STATUS_FILTER.map(v => (
          <button key={v} onClick={() => setStatusFilter(v)} className={filterBtn(v, statusFilter)}>
            {v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-14 text-gray-400 text-sm">
          No contact requests found.
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(req => {
            const isOpen = expanded === req.id;
            const fullName = `${req.first_name} ${req.last_name}`.trim();

            return (
              <div key={req.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <button
                  className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50/50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : req.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{fullName}</span>
                      {req.company && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{req.company}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {req.email} · {new Date(req.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize shrink-0 ${STATUS_STYLE[req.status]}`}>
                    {req.status}
                  </span>
                  <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-50 px-5 pb-5 pt-4 space-y-4">
                    <div className="space-y-1 text-xs">
                      {req.phone && (
                        <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Phone</span><span className="text-gray-700">{req.phone}</span></div>
                      )}
                      {req.service && (
                        <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Service</span><span className="text-gray-700">{req.service}</span></div>
                      )}
                    </div>
                    <div className="bg-gray-50 rounded-xl px-4 py-3">
                      <p className="text-xs font-semibold text-gray-400 mb-1">Message</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.message}</p>
                    </div>

                    <div className="space-y-3 pt-1">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Admin note (optional)</label>
                        <textarea
                          value={notes[req.id] ?? req.admin_notes ?? ''}
                          onChange={e => setNotes(n => ({ ...n, [req.id]: e.target.value }))}
                          rows={2} placeholder="Add an internal note…"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand resize-none"
                        />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <a href={`mailto:${req.email}`}
                          className="px-4 py-2 bg-ink text-white text-sm font-semibold rounded-full hover:bg-ink/90 transition-colors">
                          Reply by Email
                        </a>
                        {req.status !== 'contacted' && (
                          <button onClick={() => act(req, 'contacted')} disabled={!!acting}
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-full hover:bg-blue-700 disabled:opacity-50 transition-colors">
                            {acting === req.id ? '…' : 'Mark Contacted'}
                          </button>
                        )}
                        {req.status !== 'closed' && (
                          <button onClick={() => act(req, 'closed')} disabled={!!acting}
                            className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-full hover:bg-gray-200 disabled:opacity-50 transition-colors">
                            {acting === req.id ? '…' : 'Close'}
                          </button>
                        )}
                        {req.status !== 'new' && (
                          <button onClick={() => act(req, 'new')} disabled={!!acting}
                            className="px-4 py-2 bg-white border border-amber-300 text-amber-700 text-sm font-semibold rounded-full hover:bg-amber-50 disabled:opacity-50 transition-colors">
                            {acting === req.id ? '…' : 'Reopen as New'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
