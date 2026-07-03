'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { HrRequest } from '@/types';

const TYPE_LABEL: Record<string, string> = { leave: 'Leave', expense: 'Expense', grievance: 'Grievance', asset: 'Asset' };
const TYPE_FILTER   = ['all', 'leave', 'expense', 'grievance', 'asset'];
const STATUS_FILTER = ['all', 'pending', 'approved', 'rejected', 'closed'];

const STATUS_STYLE: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  closed:   'bg-gray-100 text-gray-500 border-gray-200',
};

function DetailRow({ label, value }: { label: string; value: unknown }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-400 w-28 shrink-0">{label}</span>
      <span className="text-gray-700">{String(value)}</span>
    </div>
  );
}

function RequestDetails({ req }: { req: HrRequest }) {
  const d = req.details;
  if (req.type === 'leave') return (
    <div className="space-y-1">
      <DetailRow label="Leave type" value={d.leave_type_name as string} />
      <DetailRow label="From"       value={d.start_date as string} />
      <DetailRow label="To"         value={d.end_date as string} />
      <DetailRow label="Reason"     value={d.reason as string} />
    </div>
  );
  if (req.type === 'expense') return (
    <div className="space-y-1">
      <DetailRow label="Category"    value={d.category as string} />
      <DetailRow label="Amount"      value={`$${d.amount}`} />
      <DetailRow label="Description" value={d.description as string} />
    </div>
  );
  if (req.type === 'grievance') return (
    <div className="space-y-1">
      <DetailRow label="Description" value={d.description as string} />
    </div>
  );
  if (req.type === 'asset') return (
    <div className="space-y-1">
      <DetailRow label="Asset"         value={d.asset_type as string} />
      <DetailRow label="Quantity"      value={d.quantity as number} />
      <DetailRow label="Justification" value={d.justification as string} />
    </div>
  );
  return null;
}

export default function TeamRequestsPage() {
  const [requests, setRequests]     = useState<HrRequest[]>([]);
  const [loading, setLoading]       = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [notes, setNotes]           = useState<Record<string, string>>({});
  const [acting, setActing]         = useState<string | null>(null);
  const [myEmpId, setMyEmpId]       = useState<string | null>(null);

  // Load own employee ID to exclude own requests
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('employees').select('id').eq('user_id', user.id).single()
        .then(({ data }) => setMyEmpId(data?.id ?? null));
    });
  }, []);

  const load = useCallback(async () => {
    if (!myEmpId) return;
    setLoading(true);
    const supabase = createClient();

    // RLS limits to direct reports; also exclude own requests
    let q = supabase.from('hr_requests')
      .select('*, employees!employee_id(id, full_name, designation)')
      .neq('employee_id', myEmpId)
      .order('created_at', { ascending: false });

    if (typeFilter !== 'all')   q = q.eq('type', typeFilter);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);

    const { data } = await q;
    setRequests((data ?? []) as HrRequest[]);
    setLoading(false);
  }, [myEmpId, typeFilter, statusFilter]);

  useEffect(() => { if (myEmpId) load(); }, [load, myEmpId]);

  async function act(req: HrRequest, status: 'approved' | 'rejected' | 'closed') {
    setActing(req.id);
    const supabase = createClient();
    await supabase.from('hr_requests').update({
      status,
      admin_notes: notes[req.id] ?? null,
      reviewed_by: myEmpId,
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id);
    setActing(null);
    setExpanded(null);
    load();
  }

  const filterBtn = (val: string, cur: string) =>
    `px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${val === cur ? 'bg-ink text-white border-ink' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Team Requests</h1>
        <p className="text-sm text-gray-400 mt-0.5">{requests.length} result{requests.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-400 font-medium">Type:</span>
          {TYPE_FILTER.map(v => (
            <button key={v} onClick={() => setTypeFilter(v)} className={filterBtn(v, typeFilter)}>
              {v === 'all' ? 'All' : TYPE_LABEL[v]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-400 font-medium">Status:</span>
          {STATUS_FILTER.map(v => (
            <button key={v} onClick={() => setStatusFilter(v)} className={filterBtn(v, statusFilter)}>
              {v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-14 text-gray-400 text-sm">
          No requests found.
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(req => {
            const emp    = req.employees as { full_name: string; designation: string | null } | null;
            const isOpen = expanded === req.id;
            return (
              <div key={req.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <button
                  className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50/50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : req.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{req.title}</span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{TYPE_LABEL[req.type]}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {emp?.full_name}{emp?.designation ? ` · ${emp.designation}` : ''} · {new Date(req.created_at).toLocaleDateString()}
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
                    <RequestDetails req={req} />

                    {req.status === 'pending' && (
                      <div className="space-y-3 pt-2">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Note for employee (optional)</label>
                          <textarea
                            value={notes[req.id] ?? ''}
                            onChange={e => setNotes(n => ({ ...n, [req.id]: e.target.value }))}
                            rows={2} placeholder="Add a note…"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand resize-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => act(req, 'approved')} disabled={!!acting}
                            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-full hover:bg-green-700 disabled:opacity-50 transition-colors">
                            {acting === req.id ? '…' : 'Approve'}
                          </button>
                          <button onClick={() => act(req, 'rejected')} disabled={!!acting}
                            className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-full hover:bg-red-700 disabled:opacity-50 transition-colors">
                            Reject
                          </button>
                          <button onClick={() => act(req, 'closed')} disabled={!!acting}
                            className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-full hover:bg-gray-200 disabled:opacity-50 transition-colors">
                            Close
                          </button>
                        </div>
                      </div>
                    )}

                    {req.admin_notes && (
                      <div className="bg-gray-50 rounded-lg px-4 py-3">
                        <p className="text-xs font-semibold text-gray-400 mb-1">Note</p>
                        <p className="text-sm text-gray-700">{req.admin_notes}</p>
                      </div>
                    )}
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
