'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import type { LeaveType } from '@/types';

type RequestType = 'leave' | 'expense' | 'grievance' | 'asset';

const TYPE_OPTIONS: { value: RequestType; label: string; desc: string }[] = [
  { value: 'leave', label: 'Leave', desc: 'Annual, sick, WFH, unpaid' },
  { value: 'expense', label: 'Expense', desc: 'Reimbursement claim' },
  { value: 'grievance', label: 'Grievance', desc: 'Raise a concern' },
  { value: 'asset', label: 'Asset', desc: 'Equipment request' },
];

const EXPENSE_CATEGORIES = ['Travel', 'Meals & Entertainment', 'Equipment', 'Software', 'Training', 'Other'];
const ASSET_TYPES = ['Laptop', 'Monitor', 'Mobile Phone', 'Access Card', 'Headset', 'Other'];

export default function NewRequestPage() {
  const router = useRouter();
  const [type, setType] = useState<RequestType>('leave');
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Leave fields
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  // Expense fields
  const [expCategory, setExpCategory] = useState('Travel');
  const [expAmount, setExpAmount] = useState('');
  const [expDesc, setExpDesc] = useState('');

  // Grievance fields
  const [subject, setSubject] = useState('');
  const [gDesc, setGDesc] = useState('');

  // Asset fields
  const [assetType, setAssetType] = useState('Laptop');
  const [assetQty, setAssetQty] = useState('1');
  const [assetJustification, setAssetJustification] = useState('');

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.auth.getUser(),
      supabase.from('leave_types').select('*').eq('is_active', true),
    ]).then(([{ data: { user } }, { data: lt }]) => {
      if (user) supabase.from('employees').select('id').eq('user_id', user.id).single().then(({ data }) => setEmployeeId(data?.id ?? null));
      setLeaveTypes(lt ?? []);
      setLeaveTypeId(lt?.[0]?.id ?? '');
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId) return;
    setError(''); setSaving(true);

    let title = '';
    let details: Record<string, unknown> = {};

    if (type === 'leave') {
      if (!startDate || !endDate) { setError('Start and end dates are required.'); setSaving(false); return; }
      const lt = leaveTypes.find(l => l.id === leaveTypeId);
      title = `${lt?.name ?? 'Leave'} — ${startDate} to ${endDate}`;
      details = { leave_type_id: leaveTypeId, leave_type_name: lt?.name, start_date: startDate, end_date: endDate, reason };
    } else if (type === 'expense') {
      if (!expAmount || !expDesc) { setError('Amount and description are required.'); setSaving(false); return; }
      title = `${expCategory} Expense — $${expAmount}`;
      details = { category: expCategory, amount: parseFloat(expAmount), description: expDesc };
    } else if (type === 'grievance') {
      if (!subject || !gDesc) { setError('Subject and description are required.'); setSaving(false); return; }
      title = subject;
      details = { subject, description: gDesc };
    } else if (type === 'asset') {
      if (!assetJustification) { setError('Justification is required.'); setSaving(false); return; }
      title = `${assetType} Request (×${assetQty})`;
      details = { asset_type: assetType, quantity: parseInt(assetQty), justification: assetJustification };
    }

    const supabase = createClient();
    const { error: err } = await supabase.from('hr_requests').insert({
      employee_id: employeeId, type, title, details,
    });

    if (err) { setError(err.message); setSaving(false); }
    else router.push('/portal/requests');
  }

  const inp = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors';
  const lbl = 'block text-sm font-semibold text-gray-700 mb-1.5';

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Raise a Request</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        {TYPE_OPTIONS.map(opt => (
          <button key={opt.value} type="button" onClick={() => setType(opt.value)}
            className={`p-3 rounded-xl border text-left transition-all ${type === opt.value ? 'border-brand bg-brand/5' : 'border-gray-200 hover:border-gray-300'}`}>
            <p className={`text-sm font-semibold ${type === opt.value ? 'text-brand' : 'text-gray-700'}`}>{opt.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

        {type === 'leave' && (
          <>
            <div>
              <label className={lbl}>Leave Type</label>
              <select className={inp} value={leaveTypeId} onChange={e => setLeaveTypeId(e.target.value)}>
                {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}{lt.days_per_year > 0 ? ` (${lt.days_per_year} days/yr)` : ''}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={lbl}>From</label><input type="date" className={inp} value={startDate} onChange={e => setStartDate(e.target.value)} required /></div>
              <div><label className={lbl}>To</label><input type="date" className={inp} value={endDate} onChange={e => setEndDate(e.target.value)} required /></div>
            </div>
            <div><label className={lbl}>Reason <span className="font-normal text-gray-400">(optional)</span></label>
              <textarea className={inp + ' resize-none'} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Brief reason…" /></div>
          </>
        )}

        {type === 'expense' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={lbl}>Category</label>
                <select className={inp} value={expCategory} onChange={e => setExpCategory(e.target.value)}>
                  {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label className={lbl}>Amount (USD)</label>
                <input type="number" min="0" step="0.01" className={inp} value={expAmount} onChange={e => setExpAmount(e.target.value)} placeholder="0.00" required />
              </div>
            </div>
            <div><label className={lbl}>Description</label>
              <textarea className={inp + ' resize-none'} rows={3} value={expDesc} onChange={e => setExpDesc(e.target.value)} placeholder="What was this expense for?" required />
            </div>
          </>
        )}

        {type === 'grievance' && (
          <>
            <div><label className={lbl}>Subject</label>
              <input className={inp} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Brief subject" required />
            </div>
            <div><label className={lbl}>Description</label>
              <textarea className={inp + ' resize-none'} rows={4} value={gDesc} onChange={e => setGDesc(e.target.value)} placeholder="Describe the situation…" required />
            </div>
          </>
        )}

        {type === 'asset' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={lbl}>Asset Type</label>
                <select className={inp} value={assetType} onChange={e => setAssetType(e.target.value)}>
                  {ASSET_TYPES.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div><label className={lbl}>Quantity</label>
                <input type="number" min="1" className={inp} value={assetQty} onChange={e => setAssetQty(e.target.value)} required />
              </div>
            </div>
            <div><label className={lbl}>Justification</label>
              <textarea className={inp + ' resize-none'} rows={3} value={assetJustification} onChange={e => setAssetJustification(e.target.value)} placeholder="Why do you need this?" required />
            </div>
          </>
        )}

        <div className="flex gap-3 pt-2 flex-wrap">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-brand text-white font-semibold rounded-full text-sm hover:bg-brand-dark disabled:opacity-60 transition-colors">
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
          <button type="button" onClick={() => router.back()}
            className="px-6 py-2.5 bg-white border border-gray-200 text-gray-600 font-semibold rounded-full text-sm hover:border-gray-300 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
