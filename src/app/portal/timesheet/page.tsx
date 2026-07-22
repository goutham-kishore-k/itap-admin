'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import type { TimesheetEntry, TimesheetAttachment } from '@/types';
import AttachmentViewerModal from '@/components/AttachmentViewerModal';
import { shortTimesheetId } from '@/lib/timesheet-id-format';
import {
  autofillPeriodEntries,
  resolveTimesheetId,
  uploadTimesheetAttachment,
  listTimesheetAttachments,
  deleteTimesheetAttachment,
  getTimesheetAttachmentUrl,
  updateTimesheetAttachmentNotes,
  getPeriodTotal,
  setPeriodTotal,
  clearPeriodTotal,
} from './actions';
import {
  getWeekStart, getMonthStart, getMonthEnd, addMonths, addDays, fmt, displayDate, daySpan,
  dayStatus, monthGridCells, DAY_CELL_STYLE, DAY_DOT_STYLE, WEEKDAY_HEADERS, type DayStatus,
} from '@/lib/calendar-utils';

type PeriodType = 'weekly' | 'monthly' | 'range';

const MAX_RANGE_DAYS = 92;

const STATUS_STYLE: Record<string, string> = {
  draft:      'bg-gray-100 text-gray-500',
  submitted:  'bg-blue-50 text-blue-700',
  approved:   'bg-green-50 text-green-700',
  rejected:   'bg-red-50 text-red-700',
};

const PERIOD_TABS: { value: PeriodType; label: string }[] = [
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'range',   label: 'Custom Range' },
];

interface AddForm { project_id: string; hours: string; notes: string; }
interface ProjectOption { id: string; name: string; code: string | null; }

function periodStatus(entries: TimesheetEntry[]) {
  if (!entries.length) return 'empty';
  const statuses = new Set(entries.map(e => e.status));
  if (statuses.has('rejected'))   return 'rejected';
  if (statuses.has('draft'))      return statuses.size === 1 ? 'all_draft' : 'mixed';
  if (statuses.has('submitted'))  return statuses.size === 1 ? 'all_submitted' : 'mixed';
  if (statuses.size === 1 && statuses.has('approved')) return 'all_approved';
  return 'mixed';
}

// Reads an optional ?type=&start=&end= triple (set by links from "My
// Timesheets") to open directly on that period instead of always defaulting
// to the current month — read once at mount, same as any other initial state.
function initialPeriodFromParams(searchParams: URLSearchParams): { type: PeriodType; start: Date; end: Date } | null {
  const type  = searchParams.get('type');
  const start = searchParams.get('start');
  const end   = searchParams.get('end');
  if (!type || !start || !end || !['weekly', 'monthly', 'range'].includes(type)) return null;
  return { type: type as PeriodType, start: new Date(start + 'T00:00:00'), end: new Date(end + 'T00:00:00') };
}

function TimesheetPageInner() {
  const searchParams = useSearchParams();
  const urlPeriod = initialPeriodFromParams(searchParams);

  const [periodType, setPeriodType] = useState<PeriodType>(urlPeriod?.type ?? 'monthly');
  const [periodStart, setPeriodStart] = useState(() => urlPeriod?.start ?? getMonthStart(new Date()));
  const [periodEnd, setPeriodEnd]     = useState(() => urlPeriod?.end   ?? getMonthEnd(new Date()));
  const [entries, setEntries]     = useState<TimesheetEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [projects, setProjects]   = useState<ProjectOption[]>([]);
  const [adding, setAdding]       = useState<string | null>(null);
  const [form, setForm]           = useState<AddForm>({ project_id: '', hours: '', notes: '' });
  const [editing, setEditing]     = useState<string | null>(null); // entry id being edited
  const [editForm, setEditForm]   = useState<AddForm>({ project_id: '', hours: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [recalling, setRecalling]   = useState(false);
  const [reopening, setReopening] = useState(false);
  const [error, setError]         = useState('');

  // Local-only draft edits — add/edit/delete/quick-edit only touch this in-memory
  // state until "Save Draft" is clicked, so we're not hitting the DB on every click.
  // savedSnapshot is the last-known DB state, used to diff what actually changed.
  const [savedSnapshot, setSavedSnapshot] = useState<TimesheetEntry[]>([]);
  const [dirty, setDirty]             = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Copy from previous period
  const [copyPreview, setCopyPreview]   = useState<TimesheetEntry[] | null>(null);
  const [copyLoading, setCopyLoading]   = useState(false);
  const [copyConfirming, setCopyConfirming] = useState(false);

  // Default-fields autofill (monthly/range)
  const [autofillOpen, setAutofillOpen]     = useState(false);
  const [autofillForm, setAutofillForm]     = useState({ projectId: '', hoursPerDay: '8', notes: '', skipWeekends: true });
  const [autofillSaving, setAutofillSaving] = useState(false);
  const [autofillMessage, setAutofillMessage] = useState('');

  // Attachments
  const [attachments, setAttachments]       = useState<TimesheetAttachment[]>([]);
  const [attachLoading, setAttachLoading]   = useState(false);
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachError, setAttachError]       = useState('');
  const [attachFile, setAttachFile]         = useState<File | null>(null);
  const [attachNotes, setAttachNotes]       = useState('');
  const [fileInputKey, setFileInputKey]     = useState(0);
  const [editingNoteId, setEditingNoteId]   = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [noteSaving, setNoteSaving]         = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<{ url: string; fileName: string; mimeType: string | null } | null>(null);

  // Declared total hours for the whole period (one cumulative figure, not per file)
  const [periodTotal, setPeriodTotalState]  = useState<number | null>(null);
  const [periodTotalInput, setPeriodTotalInput] = useState('');
  const [periodTotalSaving, setPeriodTotalSaving] = useState(false);
  const [periodTotalError, setPeriodTotalError]   = useState('');

  // Mismatch between logged hours and the declared period total
  const [submitError, setSubmitError] = useState('');

  // Month calendar (monthly view only) — which date's card is shown below the grid
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Quick inline hours edit directly in a calendar cell (single-entry draft days only)
  const [quickEditId, setQuickEditId]       = useState<string | null>(null);
  const [quickEditHours, setQuickEditHours] = useState('');

  // Drag-to-select a custom range directly on the calendar grid (range view only)
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [rangeHover, setRangeHover]   = useState<string | null>(null);
  const [rangeMoved, setRangeMoved]   = useState(false);

  useEffect(() => {
    if (periodType !== 'range') return;
    function onUp() {
      if (rangeAnchor && rangeHover && rangeMoved) commitRangeSelection(rangeAnchor, rangeHover);
      setRangeAnchor(null);
      setRangeHover(null);
      setRangeMoved(false);
    }
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [periodType, rangeAnchor, rangeHover, rangeMoved]); // eslint-disable-line react-hooks/exhaustive-deps

  const spanDays = daySpan(periodStart, periodEnd);
  const days = Array.from({ length: spanDays }, (_, i) => addDays(periodStart, i));
  const periodLabel = periodType === 'weekly' ? 'week' : periodType === 'monthly' ? 'month' : 'period';

  // Default the selected day to today (if it's within the visible period) whenever
  // the month/range changes — applies to both the monthly and custom-range calendars
  useEffect(() => {
    if (periodType !== 'monthly' && periodType !== 'range') return;
    const today = fmt(new Date());
    setSelectedDate(today >= fmt(periodStart) && today <= fmt(periodEnd) ? today : fmt(periodStart));
  }, [periodType, periodStart, periodEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Which calendar months to render for a custom range (a range can span multiple months)
  const rangeMonths = periodType === 'range' ? (() => {
    const months: Date[] = [];
    let cursor = getMonthStart(periodStart);
    const last = getMonthStart(periodEnd);
    while (cursor <= last) {
      months.push(cursor);
      cursor = getMonthStart(addMonths(cursor, 1));
    }
    return months;
  })() : [];

  // Warn before discarding local edits — since add/edit/delete no longer write to
  // the DB immediately, switching periods would otherwise lose them silently.
  function confirmDiscardIfDirty(): boolean {
    if (!dirty) return true;
    return window.confirm('You have unsaved changes in this period. Discard them and continue?');
  }

  function handlePeriodTypeChange(next: PeriodType) {
    if (!confirmDiscardIfDirty()) return;
    setPeriodType(next);
    resetTransientUiState();
    const today = new Date();
    if (next === 'weekly') {
      const s = getWeekStart(today);
      setPeriodStart(s); setPeriodEnd(addDays(s, 6));
    } else if (next === 'monthly') {
      setPeriodStart(getMonthStart(today)); setPeriodEnd(getMonthEnd(today));
    } else {
      const s = getWeekStart(today);
      setPeriodStart(s); setPeriodEnd(addDays(s, 6));
    }
  }

  // Clears per-cell UI state that's tied to whatever period was on screen —
  // called whenever the visible period changes so a stale open add/edit form
  // or in-progress quick-edit from the old dates doesn't linger invisibly.
  function resetTransientUiState() {
    setCopyPreview(null);
    setAdding(null);
    setEditing(null);
    setError('');
    setQuickEditId(null);
  }

  function goPrev() {
    if (!confirmDiscardIfDirty()) return;
    resetTransientUiState();
    if (periodType === 'weekly') {
      setPeriodStart(s => addDays(s, -7));
      setPeriodEnd(e => addDays(e, -7));
    } else if (periodType === 'monthly') {
      setPeriodStart(s => getMonthStart(addMonths(s, -1)));
      setPeriodEnd(e => getMonthEnd(addMonths(e, -1)));
    }
  }
  function goNext() {
    if (!confirmDiscardIfDirty()) return;
    resetTransientUiState();
    if (periodType === 'weekly') {
      setPeriodStart(s => addDays(s, 7));
      setPeriodEnd(e => addDays(e, 7));
    } else if (periodType === 'monthly') {
      setPeriodStart(s => getMonthStart(addMonths(s, 1)));
      setPeriodEnd(e => getMonthEnd(addMonths(e, 1)));
    }
  }

  function onRangeStartChange(value: string) {
    if (!value) return;
    if (!confirmDiscardIfDirty()) return;
    resetTransientUiState();
    const d = new Date(value + 'T00:00:00');
    let newEnd = periodEnd < d ? d : periodEnd;
    if (daySpan(d, newEnd) > MAX_RANGE_DAYS) newEnd = addDays(d, MAX_RANGE_DAYS - 1);
    setPeriodStart(d);
    setPeriodEnd(newEnd);
  }
  function onRangeEndChange(value: string) {
    if (!value) return;
    if (!confirmDiscardIfDirty()) return;
    resetTransientUiState();
    const d = new Date(value + 'T00:00:00');
    let newStart = d < periodStart ? d : periodStart;
    if (daySpan(newStart, d) > MAX_RANGE_DAYS) newStart = addDays(d, -(MAX_RANGE_DAYS - 1));
    setPeriodStart(newStart);
    setPeriodEnd(d);
  }

  // Commits a drag-selected (or single-click) span on the custom-range
  // calendar as the new period — same clamp/guard behavior as typing into
  // the two date inputs above, just driven by mouse position instead.
  function commitRangeSelection(aStr: string, bStr: string) {
    if (!confirmDiscardIfDirty()) return;
    resetTransientUiState();
    const a = new Date(aStr + 'T00:00:00');
    const b = new Date(bStr + 'T00:00:00');
    let start = a < b ? a : b;
    let end   = a < b ? b : a;
    if (daySpan(start, end) > MAX_RANGE_DAYS) end = addDays(start, MAX_RANGE_DAYS - 1);
    setPeriodStart(start);
    setPeriodEnd(end);
  }

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
        .gte('date', fmt(periodStart)).lte('date', fmt(periodEnd))
        .order('created_at'),
      supabase.from('project_assignments')
        .select('projects!project_id(id, name, code, status)')
        .eq('employee_id', emp.id),
    ]);
    setEntries(entries ?? []);
    setSavedSnapshot(entries ?? []);
    setDirty(false);
    setProjects(
      (assigned ?? [])
        .map((r: any) => r.projects)
        .filter((p: any) => p && p.status === 'active') as ProjectOption[]
    );
    setLoading(false);
  }, [periodStart, periodEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Auto-open the autofill setup panel for a fresh period with no entries yet
  useEffect(() => {
    if (!loading && entries.length === 0) setAutofillOpen(true);
  }, [loading, periodType, entries.length]);

  const loadAttachments = useCallback(async () => {
    setAttachLoading(true);
    try {
      const data = await listTimesheetAttachments(periodType, fmt(periodStart), fmt(periodEnd));
      setAttachments(data);
    } finally {
      setAttachLoading(false);
    }
  }, [periodType, periodStart, periodEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAttachments(); }, [loadAttachments]);

  const loadPeriodTotal = useCallback(async () => {
    const data = await getPeriodTotal(periodType, fmt(periodStart), fmt(periodEnd));
    setPeriodTotalState(data?.total_hours ?? null);
    setPeriodTotalInput(data?.total_hours != null ? String(data.total_hours) : '');
    setPeriodTotalError('');
  }, [periodType, periodStart, periodEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadPeriodTotal(); }, [loadPeriodTotal]);

  async function handleSavePeriodTotal() {
    const value = parseFloat(periodTotalInput);
    if (isNaN(value) || value < 0) { setPeriodTotalError('Enter a valid number of hours.'); return; }
    setPeriodTotalSaving(true);
    setPeriodTotalError('');
    try {
      const row = await setPeriodTotal(periodType, fmt(periodStart), fmt(periodEnd), value);
      setPeriodTotalState(row.total_hours);
      setSubmitError('');
    } catch (err) {
      setPeriodTotalError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setPeriodTotalSaving(false);
    }
  }

  async function handleClearPeriodTotal() {
    setPeriodTotalSaving(true);
    setPeriodTotalError('');
    try {
      await clearPeriodTotal(periodType, fmt(periodStart), fmt(periodEnd));
      setPeriodTotalState(null);
      setPeriodTotalInput('');
      setSubmitError('');
    } catch (err) {
      setPeriodTotalError(err instanceof Error ? err.message : 'Failed to clear.');
    } finally {
      setPeriodTotalSaving(false);
    }
  }

  async function runAutofill() {
    if (!autofillForm.projectId) { setAutofillMessage('Please select a project.'); return; }
    const hours = parseFloat(autofillForm.hoursPerDay);
    if (isNaN(hours) || hours <= 0 || hours > 24) { setAutofillMessage('Hours/day must be between 0 and 24.'); return; }
    setAutofillSaving(true);
    setAutofillMessage('');
    try {
      const result = await autofillPeriodEntries(
        periodType, fmt(periodStart), fmt(periodEnd), autofillForm.projectId, hours, autofillForm.notes, autofillForm.skipWeekends,
      );
      setAutofillMessage(
        `Added ${result.inserted} day${result.inserted === 1 ? '' : 's'}${result.skipped ? `, skipped ${result.skipped} already covered` : ''}.`
      );
      setAutofillOpen(false);
      load();
    } catch (err) {
      setAutofillMessage(err instanceof Error ? err.message : 'Failed to autofill.');
    } finally {
      setAutofillSaving(false);
    }
  }

  async function handleUploadAttachment() {
    if (!attachFile) { setAttachError('Please choose a file.'); return; }
    setAttachUploading(true);
    setAttachError('');
    try {
      const fd = new FormData();
      fd.append('file', attachFile);
      fd.append('periodType', periodType);
      fd.append('periodStart', fmt(periodStart));
      fd.append('periodEnd', fmt(periodEnd));
      if (attachNotes.trim()) fd.append('notes', attachNotes.trim());
      await uploadTimesheetAttachment(fd);
      await loadAttachments();
      setAttachFile(null);
      setAttachNotes('');
      setFileInputKey(k => k + 1); // remount the file input to clear its selected file
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Failed to upload file.');
    } finally {
      setAttachUploading(false);
    }
  }

  async function handleViewAttachment(a: TimesheetAttachment) {
    try {
      const url = await getTimesheetAttachmentUrl(a.id);
      setViewingAttachment({ url, fileName: a.file_name, mimeType: a.mime_type });
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Failed to open file.');
    }
  }

  async function handleDeleteAttachment(id: string) {
    try {
      await deleteTimesheetAttachment(id);
      await loadAttachments();
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Failed to delete file.');
    }
  }

  function startEditNote(a: TimesheetAttachment) {
    setEditingNoteId(a.id);
    setEditingNoteText(a.notes ?? '');
    setAttachError('');
  }

  async function handleSaveNote(id: string) {
    setNoteSaving(true);
    try {
      await updateTimesheetAttachmentNotes(id, editingNoteText);
      setEditingNoteId(null);
      await loadAttachments();
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Failed to save note.');
    } finally {
      setNoteSaving(false);
    }
  }

  // Adds a draft entry to local state only — nothing is written to the DB until
  // "Save Draft" (or Submit, which saves first) is clicked.
  function addEntry(date: string) {
    if (!form.project_id) { setError('Please select a project'); return; }
    if (!form.hours)      { setError('Hours are required'); return; }
    const hours = parseFloat(form.hours);
    if (isNaN(hours) || hours <= 0 || hours > 24) { setError('Hours must be between 0 and 24'); return; }
    const selectedProject = projects.find(p => p.id === form.project_id);
    const newEntry: TimesheetEntry = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      employee_id: employeeId ?? '',
      timesheet_id: null,
      date,
      project: selectedProject?.name ?? '',
      project_id: form.project_id,
      hours,
      notes: form.notes.trim() || null,
      rejection_reason: null,
      status: 'draft',
      approval_id: null,
      reviewed_by: null,
      reviewed_at: null,
      submitted_at: null,
      created_at: new Date().toISOString(),
    };
    setEntries(prev => [...prev, newEntry]);
    setForm({ project_id: '', hours: '', notes: '' });
    setAdding(null);
    setError('');
    setDirty(true);
  }

  function deleteEntry(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
    setDirty(true);
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

  function saveEdit(id: string) {
    if (!editForm.project_id) { setError('Please select a project'); return; }
    const hours = parseFloat(editForm.hours);
    if (isNaN(hours) || hours <= 0 || hours > 24) { setError('Hours must be between 0 and 24'); return; }
    const selectedProject = projects.find(p => p.id === editForm.project_id);
    setEntries(prev => prev.map(e => e.id === id ? {
      ...e,
      project_id: editForm.project_id,
      project:    selectedProject?.name ?? '',
      hours,
      notes:      editForm.notes.trim() || null,
    } : e));
    setError('');
    setEditing(null);
    setDirty(true);
  }

  function saveQuickHours(id: string) {
    const hours = parseFloat(quickEditHours);
    setQuickEditId(null);
    if (isNaN(hours) || hours <= 0 || hours > 24) return;
    setEntries(prev => prev.map(e => e.id === id ? { ...e, hours } : e));
    setDirty(true);
  }

  // Pushes local add/edit/delete changes for draft entries to the DB in one batch
  // (diffed against savedSnapshot, the last-known DB state), then re-syncs from the
  // server. Used by the explicit "Save Draft" button and by submit, which must
  // persist real rows before it can flip their status.
  async function persistDraftChanges(): Promise<TimesheetEntry[]> {
    const supabase = createClient();
    const toInsert = entries.filter(e => e.id.startsWith('temp-'));
    const toDelete = savedSnapshot.filter(se => se.status === 'draft' && !entries.some(e => e.id === se.id));
    const toUpdate = entries.filter(e => {
      if (e.id.startsWith('temp-')) return false;
      const orig = savedSnapshot.find(se => se.id === e.id);
      if (!orig) return false;
      return orig.project_id !== e.project_id || orig.hours !== e.hours || orig.notes !== e.notes;
    });

    if (toInsert.length) {
      const timesheetId = await resolveTimesheetId(periodType, fmt(periodStart), fmt(periodEnd));
      const { error: err } = await supabase.from('timesheet_entries').insert(
        toInsert.map(e => ({
          employee_id:  employeeId,
          timesheet_id: timesheetId,
          date:         e.date,
          project_id:   e.project_id,
          project:      e.project,
          hours:        e.hours,
          notes:        e.notes,
        }))
      );
      if (err) throw new Error(err.message);
    }
    for (const e of toUpdate) {
      const { error: err } = await supabase.from('timesheet_entries').update({
        project_id: e.project_id,
        project:    e.project,
        hours:      e.hours,
        notes:      e.notes,
      }).eq('id', e.id).eq('status', 'draft');
      if (err) throw new Error(err.message);
    }
    if (toDelete.length) {
      const { error: err } = await supabase.from('timesheet_entries')
        .delete().in('id', toDelete.map(e => e.id)).eq('status', 'draft');
      if (err) throw new Error(err.message);
    }

    const { data: fresh } = await supabase.from('timesheet_entries')
      .select('*').eq('employee_id', employeeId)
      .gte('date', fmt(periodStart)).lte('date', fmt(periodEnd))
      .order('created_at');
    const freshEntries = fresh ?? [];
    setEntries(freshEntries);
    setSavedSnapshot(freshEntries);
    setDirty(false);
    return freshEntries;
  }

  async function saveDraft() {
    setSavingDraft(true);
    setError('');
    try {
      await persistDraftChanges();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft.');
    } finally {
      setSavingDraft(false);
    }
  }

  async function submitPeriod() {
    if (!entries.some(e => e.status === 'draft')) return;

    // Total hours must be declared before submitting, and must match logged hours
    if (periodTotal == null) {
      setSubmitError(`Declare your total hours for this ${periodLabel} before submitting — see "Declared Total Hours" above.`);
      return;
    }
    if (Math.abs(totalHours - periodTotal) > 0.01) {
      setSubmitError(
        `Logged hours (${totalHours.toFixed(1)}h) don't match your declared total for this ${periodLabel} (${periodTotal.toFixed(1)}h). Fix your entries — or the declared total, if that's wrong — before submitting.`
      );
      return;
    }
    setSubmitError('');

    setSubmitting(true);
    try {
      // Local edits must land in the DB with real ids before their status can flip.
      const current = dirty ? await persistDraftChanges() : entries;
      const draftIds = current.filter(e => e.status === 'draft').map(e => e.id);
      if (draftIds.length) {
        const supabase = createClient();
        // One shared timestamp for the whole batch — this is what lets the admin
        // queue tell this submission apart from any other, regardless of how close
        // the actual dates are to another unrelated submission.
        await supabase.from('timesheet_entries')
          .update({ status: 'submitted', submitted_at: new Date().toISOString() })
          .in('id', draftIds);
      }
    } finally {
      setSubmitting(false);
      load();
    }
  }

  async function recallPeriod() {
    const submittedIds = entries.filter(e => e.status === 'submitted').map(e => e.id);
    if (!submittedIds.length) return;
    setRecalling(true);
    const supabase = createClient();
    await supabase.from('timesheet_entries').update({ status: 'draft', submitted_at: null }).in('id', submittedIds);
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
      submitted_at: null,
    }).in('id', rejectedIds);
    setReopening(false);
    load();
  }

  // Previous period's date range, matched to the current period's type/length
  function previousPeriodRange(): [Date, Date] {
    if (periodType === 'monthly') {
      const prevStart = getMonthStart(addMonths(periodStart, -1));
      const prevEnd   = getMonthEnd(addMonths(periodStart, -1));
      return [prevStart, prevEnd];
    }
    const prevEnd   = addDays(periodStart, -1);
    const prevStart = addDays(prevEnd, -(spanDays - 1));
    return [prevStart, prevEnd];
  }

  // Shifts a previous-period entry's date string onto the current period
  function shiftToCurrentPeriod(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00');
    return periodType === 'monthly' ? fmt(addMonths(d, 1)) : fmt(addDays(d, spanDays));
  }

  async function loadCopyPreview() {
    if (!employeeId) return;
    setCopyLoading(true);
    setCopyPreview(null);
    const [prevStart, prevEnd] = previousPeriodRange();
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
    const timesheetId = await resolveTimesheetId(periodType, fmt(periodStart), fmt(periodEnd));
    const rows = copyPreview.map(e => ({
      employee_id:  employeeId,
      timesheet_id: timesheetId,
      date:         shiftToCurrentPeriod(e.date),
      project:      e.project,
      project_id:   e.project_id,
      hours:        e.hours,
      notes:        e.notes ?? null,
      status:       'draft',
    }));
    await supabase.from('timesheet_entries').insert(rows);
    setCopyPreview(null);
    setCopyConfirming(false);
    load();
  }

  const totalHours   = entries.reduce((s, e) => s + Number(e.hours), 0);
  const status       = periodStatus(entries);
  const hasDrafts    = entries.some(e => e.status === 'draft');
  const timesheetId  = entries.find(e => e.timesheet_id)?.timesheet_id;
  const shortTimesheetIdDisplay = timesheetId ? shortTimesheetId(timesheetId) : null;
  // Period-wide flag — used only for actions that touch the whole period at once
  // (bulk copy-from-previous-period). Adding/editing entries is gated per day below,
  // since a submitted/approved day shouldn't block other days in the same period.
  const periodIsLocked = entries.some(e => e.status === 'submitted' || e.status === 'approved');

  // Renders a single day's entries + add/edit form. Used both for the weekly/range
  // day-list and for the monthly view's selected-day detail panel below the calendar.
  function renderDayCard(day: Date) {
    const dateStr    = fmt(day);
    const dayEntries = entries.filter(e => e.date === dateStr);
    const isToday    = fmt(new Date()) === dateStr;
    const isOpen     = adding === dateStr;
    // A day is locked once any of its own entries is submitted or approved — an
    // employee can keep adding/editing other days in the same period regardless.
    const dayLocked  = dayEntries.some(e => e.status === 'submitted' || e.status === 'approved');
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
            {!dayLocked && (
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
                      <button onClick={() => saveEdit(entry.id)}
                        className="px-4 py-1.5 bg-brand text-white text-xs font-semibold rounded-lg hover:bg-brand-dark transition-colors">
                        Save
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
              <button onClick={() => addEntry(dateStr)}
                className="px-4 py-1.5 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-dark transition-colors">
                Add
              </button>
            </div>
            {projects.length === 0 && (
              <p className="text-xs text-amber-600 mt-2">No active projects found. Ask an admin to create projects first.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Renders one month's calendar grid. Cells outside the calendar's own month are
  // invisible spacers (grid alignment only). Cells inside the month but outside the
  // currently selected period (only possible in custom-range mode, where a range can
  // fall mid-month) are shown for context but locked — no status, no interaction.
  function renderCalendarMonth(monthAnchor: Date, showLabel: boolean) {
    const mStart = fmt(getMonthStart(monthAnchor));
    const mEnd   = fmt(getMonthEnd(monthAnchor));
    return (
      <div key={mStart} className="bg-white rounded-2xl border border-gray-100 p-4 w-full">
        {showLabel && (
          <p className="text-sm font-semibold text-gray-500 mb-3">
            {monthAnchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        )}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {WEEKDAY_HEADERS.map(w => (
            <div key={w} className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wide py-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {monthGridCells(monthAnchor).map(cell => {
            const cellStr          = fmt(cell);
            const inDisplayedMonth = cellStr >= mStart && cellStr <= mEnd;
            const inRange          = cellStr >= fmt(periodStart) && cellStr <= fmt(periodEnd);
            const cellEntries      = inRange ? entries.filter(e => e.date === cellStr) : [];
            const cStatus          = dayStatus(cellEntries);
            // A cell is locked once its own entries are submitted/approved — other
            // cells in the same period stay addable/editable regardless.
            const cellLocked       = cStatus === 'submitted' || cStatus === 'approved';
            const isToday          = fmt(new Date()) === cellStr;
            const isSelected       = selectedDate === cellStr;
            const cellHours        = cellEntries.reduce((s, e) => s + Number(e.hours), 0);
            // Quick inline hours edit only makes sense for a single-entry draft day —
            // multi-entry days still route through the day card below the calendar.
            const canQuickEdit     = cStatus === 'draft' && cellEntries.length === 1;
            const isQuickEditing   = canQuickEdit && quickEditId === cellEntries[0].id;

            // Custom-range drag-select preview — the span currently being
            // dragged, shown live before mouseup commits it as the new period.
            const inDragPreview = periodType === 'range' && rangeAnchor != null && rangeHover != null && (() => {
              const lo = rangeAnchor < rangeHover ? rangeAnchor : rangeHover;
              const hi = rangeAnchor < rangeHover ? rangeHover : rangeAnchor;
              return cellStr >= lo && cellStr <= hi;
            })();
            const dragHandlers = periodType === 'range' ? {
              onMouseDown: (e: React.MouseEvent) => {
                e.preventDefault(); // avoid native text-selection while dragging across cells
                setRangeAnchor(cellStr);
                setRangeHover(cellStr);
                setRangeMoved(false);
              },
              onMouseEnter: () => {
                if (!rangeAnchor) return;
                setRangeHover(cellStr);
                if (cellStr !== rangeAnchor) setRangeMoved(true);
              },
            } : {};

            if (!inDisplayedMonth) {
              return <div key={cellStr} className="aspect-square opacity-0 pointer-events-none" />;
            }

            if (!inRange) {
              return (
                <div key={cellStr}
                  {...dragHandlers}
                  className={`aspect-square rounded-lg border p-1.5 flex items-center justify-center select-none ${
                    periodType === 'range' ? 'cursor-pointer' : ''
                  } ${inDragPreview ? 'border-brand bg-brand/10' : 'border-gray-100 bg-gray-50'}`}>
                  <span className="text-xs font-medium text-gray-300">{cell.getDate()}</span>
                </div>
              );
            }

            return (
              <div
                key={cellStr}
                role="button"
                tabIndex={0}
                {...dragHandlers}
                onClick={() => {
                  if (isQuickEditing) return;
                  setSelectedDate(cellStr);
                  setError('');
                  if (cellLocked) { setAdding(null); setEditing(null); return; }
                  if (cStatus === 'empty') {
                    setEditing(null);
                    setAdding(cellStr); setForm({ project_id: '', hours: '', notes: '' });
                  } else if (cellEntries.length === 1) {
                    // Single-entry day — jump straight into editing it instead of
                    // making the user click through to a separate "Edit" button.
                    setAdding(null);
                    startEdit(cellEntries[0]);
                  } else {
                    setAdding(null); setEditing(null);
                  }
                }}
                className={`group relative aspect-square rounded-lg border p-2 pt-6 flex flex-col items-center cursor-pointer hover:border-brand/50 transition-colors select-none ${
                  inDragPreview ? 'border-brand ring-1 ring-brand bg-brand/10' :
                  isSelected ? 'border-brand ring-1 ring-brand' : DAY_CELL_STYLE[cStatus]
                }`}>
                <span className={`absolute top-1.5 left-2 text-sm font-semibold ${isToday ? 'text-brand' : 'text-gray-400'}`}>
                  {cell.getDate()}
                </span>
                {cStatus !== 'empty' && (
                  <div className="flex flex-col items-center gap-1">
                    {isQuickEditing ? (
                      <input
                        autoFocus
                        type="number" min="0.5" max="24" step="0.5"
                        value={quickEditHours}
                        onChange={e => setQuickEditHours(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onBlur={() => saveQuickHours(cellEntries[0].id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); saveQuickHours(cellEntries[0].id); }
                          if (e.key === 'Escape') { e.preventDefault(); setQuickEditId(null); }
                        }}
                        className="w-14 text-center text-sm font-bold leading-none px-0.5 py-0 border-0 ring-1 ring-brand/30 focus:ring-1 focus:ring-brand/30 rounded focus:outline-none bg-white"
                      />
                    ) : (
                      <span
                        className={`text-sm font-bold leading-none ${
                          canQuickEdit ? 'text-gray-800 hover:text-brand cursor-pointer' : 'text-gray-700'
                        }`}
                        onClick={e => {
                          if (!canQuickEdit) return;
                          e.stopPropagation();
                          setSelectedDate(cellStr);
                          startEdit(cellEntries[0]);
                          setQuickEditId(cellEntries[0].id);
                          setQuickEditHours(String(cellEntries[0].hours));
                        }}>
                        {cellHours}h
                      </span>
                    )}
                    <span className={`w-1.5 h-1.5 rounded-full ${DAY_DOT_STYLE[cStatus]}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">Timesheet</h1>
        <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1 w-fit">
          {PERIOD_TABS.map(t => (
            <button key={t.value} onClick={() => handlePeriodTypeChange(t.value)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                periodType === t.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center flex-wrap gap-3">
        {periodType === 'range' ? (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={fmt(periodStart)} onChange={e => onRangeStartChange(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand bg-white" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={fmt(periodEnd)} onChange={e => onRangeEndChange(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand bg-white" />
            <span className="text-xs text-gray-400">Max {MAX_RANGE_DAYS} days</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={goPrev}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">← Prev</button>
            <span className="text-sm text-gray-600 font-medium">
              {displayDate(periodStart)} – {displayDate(periodEnd)}
            </span>
            <button onClick={goNext}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">Next →</button>
          </div>
        )}
      </div>

      {/* Period status banner */}
      {!loading && status !== 'empty' && status !== 'all_draft' && (
        <div className={`rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${
          status === 'all_approved'   ? 'bg-green-50 border border-green-200' :
          status === 'all_submitted'  ? 'bg-blue-50 border border-blue-200' :
          status === 'rejected'       ? 'bg-red-50 border border-red-200' :
          'bg-gray-50 border border-gray-200'
        }`}>
          <div>
            {status === 'all_approved' && (
              <p className="text-sm font-semibold text-green-800">Period approved ✓</p>
            )}
            {status === 'all_submitted' && (
              <>
                <p className="text-sm font-semibold text-blue-800">Period submitted — awaiting approval</p>
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
              <p className="text-sm font-semibold text-gray-700">Period has mixed statuses</p>
            )}
            {shortTimesheetIdDisplay && (
              <p className="text-xs font-mono font-bold text-gray-400 mt-1">{shortTimesheetIdDisplay}</p>
            )}
          </div>
          {(status === 'all_submitted' || (status === 'mixed' && entries.some(e => e.status === 'submitted') && !entries.some(e => e.status === 'approved'))) && (
            <button onClick={recallPeriod} disabled={recalling}
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

      {/* Copy from previous period — preview panel */}
      {copyPreview !== null && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-900">Copy from previous {periodLabel}</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {copyPreview.length === 0
                  ? `No entries found in the previous ${periodLabel}.`
                  : `${copyPreview.length} entr${copyPreview.length === 1 ? 'y' : 'ies'} will be copied as drafts into this ${periodLabel}.`}
              </p>
            </div>
            <button onClick={() => setCopyPreview(null)}
              className="text-amber-400 hover:text-amber-600 text-lg leading-none">×</button>
          </div>
          {copyPreview.length > 0 && (
            <div className="divide-y divide-amber-100 rounded-xl overflow-hidden border border-amber-100">
              {copyPreview.map(e => {
                const newDate = shiftToCurrentPeriod(e.date);
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

      {/* Default-fields autofill panel */}
      {autofillOpen && (
        <div className="bg-brand/5 border border-brand/20 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Set up this {periodLabel}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Set defaults once and fill every working day — you can still edit or delete any day afterward.
              </p>
            </div>
            <button onClick={() => setAutofillOpen(false)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>
          {autofillMessage && <p className="text-xs text-gray-600">{autofillMessage}</p>}
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Project</label>
              <select
                value={autofillForm.projectId}
                onChange={e => setAutofillForm(f => ({ ...f, projectId: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand bg-white">
                <option value="">Select project…</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Hrs/day</label>
              <input
                value={autofillForm.hoursPerDay}
                onChange={e => setAutofillForm(f => ({ ...f, hoursPerDay: e.target.value }))}
                type="number" min="0.5" max="24" step="0.5"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand" />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Notes (optional)</label>
              <input
                value={autofillForm.notes}
                onChange={e => setAutofillForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand" />
            </div>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={autofillForm.skipWeekends}
                onChange={e => setAutofillForm(f => ({ ...f, skipWeekends: e.target.checked }))} />
              Skip weekends
            </label>
            <button onClick={runAutofill} disabled={autofillSaving}
              className="px-4 py-1.5 bg-brand text-white text-sm font-semibold rounded-full hover:bg-brand-dark disabled:opacity-60 transition-colors">
              {autofillSaving ? 'Generating…' : 'Generate days'}
            </button>
          </div>
        </div>
      )}

      {/* Unsaved local changes — add/edit/delete stay in memory until this is clicked */}
      {dirty && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <span className="text-xs font-medium text-amber-700">You have unsaved changes in this {periodLabel}</span>
          <button onClick={saveDraft} disabled={savingDraft}
            className="px-4 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-full hover:bg-amber-700 disabled:opacity-60 transition-colors shrink-0">
            {savingDraft ? 'Saving…' : 'Save as Draft'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: Math.min(days.length, 7) }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between bg-gray-50">
                <div className="h-4 w-28 bg-gray-200 rounded" />
                <div className="h-4 w-8 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : periodType === 'monthly' || periodType === 'range' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-4">
            {/* Fixed width so a wider cell (e.g. the quick-edit input) can never
                grow the whole grid — only this wrapper's own containing block
                decides the size, content inside never feeds back into it. */}
            <div className="w-full max-w-lg shrink-0">
              {periodType === 'monthly'
                ? renderCalendarMonth(periodStart, false)
                : rangeMonths.map(m => renderCalendarMonth(m, true))}
            </div>

            {/* Edit panel — sits beside the calendar, driven by whichever cell was clicked.
                Kept narrow/portrait; wraps below the calendar if there's no room beside it. */}
            <div className="w-72 max-w-full shrink-0">
              {selectedDate ? renderDayCard(new Date(selectedDate + 'T12:00:00')) : (
                <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm text-gray-400">
                  Select a day on the calendar to add or edit an entry.
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap px-1">
            {(['empty', 'draft', 'submitted', 'approved', 'rejected'] as DayStatus[]).map(s => (
              <span key={s} className="flex items-center gap-1.5 text-[10px] text-gray-400 capitalize">
                <span className={`w-1.5 h-1.5 rounded-full ${DAY_DOT_STYLE[s]}`} />
                {s === 'empty' ? 'To be filled' : s}
              </span>
            ))}
            {periodType === 'range' && (
              <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                Outside selected range
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {days.map(renderDayCard)}
        </div>
      )}

      {/* Attachments */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-900">Attachments</p>
        {attachError && <p className="text-xs text-red-600">{attachError}</p>}
        {periodIsLocked && (
          <p className="text-xs text-amber-600">This {periodLabel} has been submitted — recall it to add or change attachments.</p>
        )}
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1">File</label>
            <input key={fileInputKey} type="file" disabled={attachUploading || periodIsLocked}
              onChange={e => { setAttachFile(e.target.files?.[0] ?? null); setAttachError(''); }}
              accept=".pdf,.png,.jpg,.jpeg,.txt"
              className="w-full text-xs text-gray-500 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand/10 file:text-brand file:text-xs file:font-semibold disabled:opacity-50" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Note (optional)</label>
            <input value={attachNotes} onChange={e => setAttachNotes(e.target.value)} disabled={periodIsLocked}
              placeholder="e.g. Client-signed copy for week 1"
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand disabled:opacity-50 disabled:bg-gray-50" />
          </div>
          <button onClick={handleUploadAttachment} disabled={!attachFile || attachUploading || periodIsLocked}
            className="px-4 py-1.5 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {attachUploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
        {attachLoading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : attachments.length === 0 ? (
          <p className="text-xs text-gray-400">No files attached to this {periodLabel} yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {attachments.map(a => (
                <div key={a.id} className="py-2 space-y-1">
                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    <span className="flex-1 min-w-0 truncate text-gray-800">{a.file_name}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {a.file_size ? `${(a.file_size / 1024).toFixed(0)} KB` : ''}
                    </span>
                    <button onClick={() => handleViewAttachment(a)}
                      className="text-xs font-semibold text-brand hover:text-brand-dark transition-colors shrink-0">View</button>
                    {!periodIsLocked && (
                      <button onClick={() => handleDeleteAttachment(a.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors text-sm shrink-0">×</button>
                    )}
                  </div>
                  {editingNoteId === a.id ? (
                    <div className="flex items-center gap-2">
                      <input value={editingNoteText} onChange={e => setEditingNoteText(e.target.value)}
                        autoFocus placeholder="Add a note…"
                        className="flex-1 px-2.5 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-brand" />
                      <button onClick={() => handleSaveNote(a.id)} disabled={noteSaving}
                        className="text-xs font-semibold text-brand hover:text-brand-dark transition-colors shrink-0">
                        {noteSaving ? '…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingNoteId(null)}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0">Cancel</button>
                    </div>
                  ) : periodIsLocked ? (
                    a.notes && <p className="text-xs text-gray-500 italic">{a.notes}</p>
                  ) : (
                    <button onClick={() => startEditNote(a)} className="text-left w-full">
                      {a.notes ? (
                        <p className="text-xs text-gray-500 italic">{a.notes}</p>
                      ) : (
                        <p className="text-xs text-gray-300 hover:text-gray-400 transition-colors">+ Add note</p>
                      )}
                    </button>
                  )}
                </div>
            ))}
          </div>
        )}
      </div>

      {/* Declared total hours — one cumulative figure for the whole period,
          checked against logged hours before submit (independent of file count) */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-900">Declared Total Hours</p>
        <p className="text-xs text-gray-400">
          Enter the total hours across all your uploaded documents for this {periodLabel} (e.g. 5 weekly files at 40h each = 200). We'll check it against your logged hours before you submit.
        </p>
        {periodTotalError && <p className="text-xs text-red-600">{periodTotalError}</p>}
        {periodIsLocked && (
          <p className="text-xs text-amber-600">This {periodLabel} has been submitted — recall it to change the declared total.</p>
        )}
        <div className="flex gap-2 items-end flex-wrap">
          <div className="w-36">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Total hours</label>
            <input value={periodTotalInput} onChange={e => setPeriodTotalInput(e.target.value)} disabled={periodIsLocked}
              type="number" min="0" step="0.5" placeholder="e.g. 200"
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand disabled:opacity-50 disabled:bg-gray-50" />
          </div>
          <button onClick={handleSavePeriodTotal} disabled={!periodTotalInput.trim() || periodTotalSaving || periodIsLocked}
            className="px-4 py-1.5 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {periodTotalSaving ? 'Saving…' : 'Save'}
          </button>
          {periodTotal != null && (
            <button onClick={handleClearPeriodTotal} disabled={periodTotalSaving || periodIsLocked}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40">
              Clear
            </button>
          )}
        </div>
        {periodTotal != null && (() => {
          const matches = Math.abs(totalHours - periodTotal) <= 0.01;
          return (
            <div className={`flex items-center justify-between text-xs pt-2 border-t border-gray-50 ${
              matches ? 'text-green-700' : 'text-red-600'
            }`}>
              <span className="font-semibold">Declared: {periodTotal.toFixed(1)}h</span>
              <span>{matches ? '✓ matches logged hours' : `≠ logged ${totalHours.toFixed(1)}h`}</span>
            </div>
          );
        })()}
      </div>

      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-red-700">{submitError}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 gap-3 flex-wrap">
        <span className="text-sm text-gray-500">
          Total: <strong className="text-gray-900">{totalHours.toFixed(1)}h</strong>
        </span>
        <div className="flex items-center gap-2">
          {!autofillOpen && (
            <button onClick={() => setAutofillOpen(true)}
              className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-full hover:border-brand/30 hover:text-brand transition-colors">
              ⚙ Autofill {periodLabel}
            </button>
          )}
          {!periodIsLocked && copyPreview === null && (
            <button onClick={loadCopyPreview} disabled={copyLoading}
              className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-full hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-60 transition-colors">
              {copyLoading ? 'Loading…' : `↩ Copy from previous ${periodLabel}`}
            </button>
          )}
          {hasDrafts && (
            <div className="flex flex-col items-end gap-1">
              <button onClick={submitPeriod} disabled={submitting || periodTotal == null}
                title={periodTotal == null ? 'Declare your total hours before submitting' : undefined}
                className="px-5 py-2 bg-ink text-white text-sm font-semibold rounded-full hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {submitting ? 'Submitting…' : `Submit ${periodLabel === 'week' ? 'Week' : periodLabel === 'month' ? 'Month' : 'Period'} for Approval`}
              </button>
              {periodTotal == null && (
                <p className="text-sm font-medium text-amber-600">Declare total hours above to enable submitting</p>
              )}
            </div>
          )}
        </div>
      </div>

      {viewingAttachment && (
        <AttachmentViewerModal
          url={viewingAttachment.url}
          fileName={viewingAttachment.fileName}
          mimeType={viewingAttachment.mimeType}
          onClose={() => setViewingAttachment(null)}
        />
      )}
    </div>
  );
}

export default function TimesheetPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-gray-400">Loading…</div>}>
      <TimesheetPageInner />
    </Suspense>
  );
}
