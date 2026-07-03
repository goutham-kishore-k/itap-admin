'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { TimesheetEntry } from '@/types';

function getWeekStart(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}
function fmt(d: Date) { return d.toISOString().split('T')[0]; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function displayDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const STATUS_STYLE: Record<string, string> = {
  draft:      'bg-gray-100 text-gray-500',
  submitted:  'bg-blue-50 text-blue-700',
  approved:   'bg-green-50 text-green-700',
  rejected:   'bg-red-50 text-red-700',
};

interface AddForm { project_id: string; hours: string; notes: string; }
interface ProjectOption { id: string; name: string; code: string | null; }

function weekStatus(entries: TimesheetEntry[]) {
  if (!entries.length) return 'empty';
  const statuses = new Set(entries.map(e => e.status));
  if (statuses.has('rejected'))   return 'rejected';
  if (statuses.has('draft'))      return statuses.size === 1 ? 'all_draft' : 'mixed';
  if (statuses.has('submitted'))  return statuses.size === 1 ? 'all_submitted' : 'mixed';
  if (statuses.size === 1 && statuses.has('approved')) return 'all_approved';
  return 'mixed';
}

export default function TimesheetPage() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [entries, setEntries]     = useState<TimesheetEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [projects, setProjects]   = useState<ProjectOption[]>([]);
  const [adding, setAdding]       = useState<string | null>(null);
  const [form, setForm]           = useState<AddForm>({ project_id: '', hours: '', notes: '' });
  const [editing, setEditing]     = useState<string | null>(null); // entry id being edited
  const [editForm, setEditForm]   = useState<AddForm>({ project_id: '', hours: '', notes: '' });
  const [saving, setSaving]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recalling, setRecalling]   = useState(false);
  const [reopening, setReopening] = useState(false);
  const [error, setError]         = useState('');

  // Copy from previous week
  const [copyPreview, setCopyPreview]   = useState<TimesheetEntry[] | null>(null);
  const [copyLoading, setCopyLoading]   = useState(false);
  const [copyConfirming, setCopyConfirming] = useState(false);

  const days   = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 6);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: emp } = await supabase.from('employees').select('id').eq('user_id', user.id).single();
    if (!emp) return;
    setEmployeeId(emp.id);
    const [{ data: entries }, { data: assigned }] = await Promise.all([
      supabase.from('timesheet_entries')
        .select('*').eq('employee_id', emp.id)
        .gte('date', fmt(weekStart)).lte('date', fmt(weekEnd))
        .order('created_at'),
      supabase.from('project_assignments')
        .select('projects!project_id(id, name, code, status)')
        .eq('employee_id', emp.id),
    ]);
    setEntries(entries ?? []);
    setProjects(
      (assigned ?? [])
        .map((r: any) => r.projects)
        .filter((p: any) => p && p.status === 'active') as ProjectOption[]
    );
    setLoading(false);
  }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function addEntry(date: string) {
    if (!form.project_id) { setError('Please select a project'); return; }
    if (!form.hours)      { setError('Hours are required'); return; }
    const hours = parseFloat(form.hours);
    if (isNaN(hours) || hours <= 0 || hours > 24) { setError('Hours must be between 0 and 24'); return; }
    setSaving(true); setError('');
    const selectedProject = projects.find(p => p.id === form.project_id);
    const supabase = createClient();
    const { error: err } = await supabase.from('timesheet_entries').insert({
      employee_id: employeeId,
      date,
      project_id: form.project_id,
      project: selectedProject?.name ?? '',
      hours,
      notes: form.notes.trim() || null,
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setForm({ project_id: '', hours: '', notes: '' });
    setAdding(null);
    setSaving(false);
    load();
  }

  async function deleteEntry(id: string) {
    const supabase = createClient();
    await supabase.from('timesheet_entries').delete().eq('id', id).eq('status', 'draft');
    load();
  }

  function startEdit(entry: TimesheetEntry) {
    const proj = projects.find(p => p.name === entry.project);
    setEditForm({
      project_id: proj?.id ?? '',
      hours: String(entry.hours),
      notes: entry.notes ?? '',
    });
    setEditing(entry.id);
  }

  async function saveEdit(id: string) {
    if (!editForm.project_id) { setError('Please select a project'); return; }
    const hours = parseFloat(editForm.hours);
    if (isNaN(hours) || hours <= 0 || hours > 24) { setError('Hours must be between 0 and 24'); return; }
    setError('');
    setSaving(true);
    const selectedProject = projects.find(p => p.id === editForm.project_id);
    const supabase = createClient();
    await supabase.from('timesheet_entries').update({
      project_id: editForm.project_id,
      project:    selectedProject?.name ?? '',
      hours,
      notes:      editForm.notes.trim() || null,
    }).eq('id', id).eq('status', 'draft');
    setSaving(false);
    setEditing(null);
    load();
  }

  async function submitWeek() {
    const draftIds = entries.filter(e => e.status === 'draft').map(e => e.id);
    if (!draftIds.length) return;
    setSubmitting(true);
    const supabase = createClient();
    await supabase.from('timesheet_entries').update({ status: 'submitted' }).in('id', draftIds);
    setSubmitting(false);
    load();
  }

  async function recallWeek() {
    const submittedIds = entries.filter(e => e.status === 'submitted').map(e => e.id);
    if (!submittedIds.length) return;
    setRecalling(true);
    const supabase = createClient();
    await supabase.from('timesheet_entries').update({ status: 'draft' }).in('id', submittedIds);
    setRecalling(false);
    load();
  }

  async function reopenRejected() {
    const rejectedIds = entries.filter(e => e.status === 'rejected').map(e => e.id);
    if (!rejectedIds.length) return;
    setReopening(true);
    const supabase = createClient();
    await supabase.from('timesheet_entries').update({
      status: 'draft',
      reviewed_by: null,
      reviewed_at: null,
    }).in('id', rejectedIds);
    setReopening(false);
    load();
  }

  async function loadCopyPreview() {
    if (!employeeId) return;
    setCopyLoading(true);
    setCopyPreview(null);
    const prevStart = addDays(weekStart, -7);
    const prevEnd   = addDays(weekStart, -1);
    const supabase  = createClient();
    const { data } = await supabase
      .from('timesheet_entries')
      .select('*')
      .eq('employee_id', employeeId)
      .gte('date', fmt(prevStart))
      .lte('date', fmt(prevEnd))
      .order('date').order('created_at');
    setCopyPreview(data ?? []);
    setCopyLoading(false);
  }

  async function confirmCopy() {
    if (!copyPreview?.length || !employeeId) return;
    setCopyConfirming(true);
    const supabase = createClient();
    const rows = copyPreview.map(e => {
      // Shift date by +7 days to land on same weekday in current week
      const newDate = fmt(addDays(new Date(e.date + 'T12:00:00'), 7));
      return {
        employee_id: employeeId,
        date:        newDate,
        project:     e.project,
        hours:       e.hours,
        notes:       e.notes ?? null,
        status:      'draft',
      };
    });
    await supabase.from('timesheet_entries').insert(rows);
    setCopyPreview(null);
    setCopyConfirming(false);
    load();
  }

  const totalHours   = entries.reduce((s, e) => s + Number(e.hours), 0);
  const status       = weekStatus(entries);
  const hasDrafts    = entries.some(e => e.status === 'draft');
  // Lock the whole week once any entry has been submitted or approved
  const weekIsLocked = entries.some(e => e.status === 'submitted' || e.status === 'approved');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Timesheet</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(w => addDays(w, -7))}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">← Prev</button>
          <span className="text-sm text-gray-600 font-medium">
            {displayDate(weekStart)} – {displayDate(weekEnd)}
          </span>
          <button onClick={() => setWeekStart(w => addDays(w, 7))}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">Next →</button>
        </div>
      </div>

      {/* Week status banner */}
      {!loading && status !== 'empty' && status !== 'all_draft' && (
        <div className={`rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${
          status === 'all_approved'   ? 'bg-green-50 border border-green-200' :
          status === 'all_submitted'  ? 'bg-blue-50 border border-blue-200' :
          status === 'rejected'       ? 'bg-red-50 border border-red-200' :
          'bg-gray-50 border border-gray-200'
        }`}>
          <div>
            {status === 'all_approved' && (
              <p className="text-sm font-semibold text-green-800">Week approved ✓</p>
            )}
            {status === 'all_submitted' && (
              <>
                <p className="text-sm font-semibold text-blue-800">Week submitted — awaiting approval</p>
                <p className="text-xs text-blue-600 mt-0.5">Your manager will review your entries.</p>
              </>
            )}
            {status === 'mixed' && entries.some(e => e.status === 'submitted') && !entries.some(e => e.status === 'approved') && (
              <p className="text-sm font-semibold text-gray-700">Some entries submitted — awaiting approval</p>
            )}
            {status === 'rejected' && (
              <>
                <p className="text-sm font-semibold text-red-800">Some entries were rejected</p>
                {(() => {
                  const reasons = [...new Set(
                    entries
                      .filter(e => e.status === 'rejected' && e.rejection_reason)
                      .map(e => e.rejection_reason!)
                  )];
                  return reasons.length > 0 ? (
                    <div className="mt-1 space-y-0.5">
                      {reasons.map((r, i) => (
                        <p key={i} className="text-xs text-red-700 font-medium">Reason: {r}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-red-600 mt-0.5">Reopen to edit and resubmit.</p>
                  );
                })()}
              </>
            )}
            {status === 'mixed' && (
              <p className="text-sm font-semibold text-gray-700">Week has mixed statuses</p>
            )}
          </div>
          {(status === 'all_submitted' || (status === 'mixed' && entries.some(e => e.status === 'submitted') && !entries.some(e => e.status === 'approved'))) && (
            <button onClick={recallWeek} disabled={recalling}
              className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-full hover:bg-blue-700 disabled:opacity-60 transition-colors shrink-0">
              {recalling ? 'Recalling…' : 'Recall submission'}
            </button>
          )}
          {status === 'rejected' && (
            <button onClick={reopenRejected} disabled={reopening}
              className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-full hover:bg-red-700 disabled:opacity-60 transition-colors shrink-0">
              {reopening ? 'Reopening…' : 'Reopen for editing'}
            </button>
          )}
        </div>
      )}

      {/* Copy from last week — preview panel */}
      {copyPreview !== null && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-900">Copy from last week</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {copyPreview.length === 0
                  ? 'No entries found in the previous week.'
                  : `${copyPreview.length} entr${copyPreview.length === 1 ? 'y' : 'ies'} will be copied as drafts into this week.`}
              </p>
            </div>
            <button onClick={() => setCopyPreview(null)}
              className="text-amber-400 hover:text-amber-600 text-lg leading-none">×</button>
          </div>
          {copyPreview.length > 0 && (
            <div className="divide-y divide-amber-100 rounded-xl overflow-hidden border border-amber-100">
              {copyPreview.map(e => {
                const newDate = fmt(addDays(new Date(e.date + 'T12:00:00'), 7));
                return (
                  <div key={e.id} className="bg-white px-3 py-2 flex items-center gap-3 text-sm">
                    <span className="text-gray-500 w-24 shrink-0">{displayDate(new Date(newDate + 'T12:00:00'))}</span>
                    <span className="flex-1 font-medium text-gray-800 truncate">{e.project}</span>
                    {e.notes && <span className="text-gray-400 text-xs truncate max-w-[120px]">{e.notes}</span>}
                    <span className="text-gray-700 font-semibold shrink-0">{e.hours}h</span>
                  </div>
                );
              })}
            </div>
          )}
          {copyPreview.length > 0 && (
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCopyPreview(null)}
                className="px-4 py-1.5 text-sm border border-amber-200 text-amber-800 rounded-full hover:bg-amber-100 transition-colors">
                Cancel
              </button>
              <button onClick={confirmCopy} disabled={copyConfirming}
                className="px-4 py-1.5 text-sm bg-amber-500 text-white font-semibold rounded-full hover:bg-amber-600 disabled:opacity-60 transition-colors">
                {copyConfirming ? 'Copying…' : 'Confirm copy'}
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {days.map(day => {
            const dateStr    = fmt(day);
            const dayEntries = entries.filter(e => e.date === dateStr);
            const isToday    = fmt(new Date()) === dateStr;
            const isOpen     = adding === dateStr;
            return (
              <div key={dateStr}
                className={`bg-white rounded-2xl border overflow-hidden ${isToday ? 'border-brand/30' : 'border-gray-100'}`}>
                <div className={`px-4 py-3 flex items-center justify-between ${isToday ? 'bg-brand/5' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700">{displayDate(day)}</span>
                    {isToday && (
                      <span className="text-[10px] font-semibold text-brand bg-brand/10 px-2 py-0.5 rounded-full">Today</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {dayEntries.length > 0 && (
                      <span className="text-xs text-gray-400">{dayEntries.reduce((s, e) => s + Number(e.hours), 0)}h</span>
                    )}
                    {!weekIsLocked && (
                      <button
                        onClick={() => { setAdding(isOpen ? null : dateStr); setError(''); setForm({ project_id: '', hours: '', notes: '' }); }}
                        className="text-xs font-semibold text-brand hover:text-brand-dark transition-colors">
                        {isOpen ? 'Cancel' : '+ Add'}
                      </button>
                    )}
                  </div>
                </div>

                {dayEntries.length > 0 && (
                  <div className="divide-y divide-gray-50">
                    {dayEntries.map(entry => (
                      <div key={entry.id}>
                        {editing === entry.id ? (
                          <div className="px-4 py-3 bg-brand/5 border-t border-brand/10 space-y-2">
                            {error && <p className="text-xs text-red-600">{error}</p>}
                            <div className="flex gap-2 flex-wrap">
                              <select
                                value={editForm.project_id}
                                onChange={e => setEditForm(f => ({ ...f, project_id: e.target.value }))}
                                className="flex-1 min-w-[160px] px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand bg-white">
                                <option value="">Select project…</option>
                                {projects.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
                                ))}
                              </select>
                              <input
                                value={editForm.hours}
                                onChange={e => setEditForm(f => ({ ...f, hours: e.target.value }))}
                                placeholder="Hours" type="number" min="0.5" max="24" step="0.5"
                                className="w-20 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand" />
                              <input
                                value={editForm.notes}
                                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                                placeholder="Notes (optional)"
                                className="flex-1 min-w-[120px] px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand" />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => { setEditing(null); setError(''); }}
                                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">
                                Cancel
                              </button>
                              <button onClick={() => saveEdit(entry.id)} disabled={saving}
                                className="px-4 py-1.5 bg-brand text-white text-xs font-semibold rounded-lg hover:bg-brand-dark disabled:opacity-60 transition-colors">
                                {saving ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={`px-4 py-2.5 flex items-start gap-3 ${
                            entry.status === 'rejected' ? 'bg-red-50/40' : ''
                          }`}>
                            <div className="flex-1 min-w-0 pt-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-gray-900">{entry.project}</span>
                                {entry.notes && <span className="text-xs text-gray-400">{entry.notes}</span>}
                              </div>
                              {entry.status === 'rejected' && entry.rejection_reason && (
                                <p className="text-xs text-red-600 font-medium mt-0.5">
                                  Rejection reason: {entry.rejection_reason}
                                </p>
                              )}
                            </div>
                            <span className="text-sm font-semibold text-gray-700 shrink-0">{entry.hours}h</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize shrink-0 ${STATUS_STYLE[entry.status]}`}>
                              {entry.status}
                            </span>
                            {entry.status === 'draft' && (
                              <>
                                <button onClick={() => { startEdit(entry); setAdding(null); setError(''); }}
                                  className="text-gray-300 hover:text-brand transition-colors text-xs font-semibold shrink-0">
                                  Edit
                                </button>
                                <button onClick={() => deleteEntry(entry.id)}
                                  className="text-gray-300 hover:text-red-400 transition-colors text-sm shrink-0">×</button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {isOpen && (
                  <div className="px-4 py-3 border-t border-gray-50 bg-gray-50/50">
                    {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
                    <div className="flex gap-2 flex-wrap">
                      <select
                        value={form.project_id}
                        onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                        className="flex-1 min-w-[160px] px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand bg-white">
                        <option value="">Select project…</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.code ? ` (${p.code})` : ''}
                          </option>
                        ))}
                      </select>
                      <input value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                        placeholder="Hours" type="number" min="0.5" max="24" step="0.5"
                        className="w-20 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand" />
                      <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Notes (optional)"
                        className="flex-1 min-w-[120px] px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand" />
                      <button onClick={() => addEntry(dateStr)} disabled={saving}
                        className="px-4 py-1.5 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-dark disabled:opacity-60 transition-colors">
                        {saving ? '…' : 'Add'}
                      </button>
                    </div>
                    {projects.length === 0 && (
                      <p className="text-xs text-amber-600 mt-2">No active projects found. Ask an admin to create projects first.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 gap-3 flex-wrap">
        <span className="text-sm text-gray-500">
          Total: <strong className="text-gray-900">{totalHours.toFixed(1)}h</strong>
        </span>
        <div className="flex items-center gap-2">
          {!weekIsLocked && copyPreview === null && (
            <button onClick={loadCopyPreview} disabled={copyLoading}
              className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-full hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-60 transition-colors">
              {copyLoading ? 'Loading…' : '↩ Copy from last week'}
            </button>
          )}
          {hasDrafts && !weekIsLocked && (
            <button onClick={submitWeek} disabled={submitting}
              className="px-5 py-2 bg-ink text-white text-sm font-semibold rounded-full hover:bg-gray-800 disabled:opacity-60 transition-colors">
              {submitting ? 'Submitting…' : 'Submit Week for Approval'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
