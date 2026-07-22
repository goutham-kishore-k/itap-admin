'use server';

import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/supabase-admin';
import { getPortalEmployee } from '@/lib/portal-user';
import { getOrCreateTimesheetId } from '@/lib/timesheets';
import { shortTimesheetId } from '@/lib/timesheet-id-format';
import type { TimesheetAttachment, TimesheetPeriodTotal } from '@/types';

const ATTACHMENTS_BUCKET = 'timesheet-attachments';
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
];

async function requireEmployeeId(): Promise<string> {
  const emp = await getPortalEmployee();
  if (!emp) throw new Error('Not authenticated.');
  return emp.id;
}

// Client-callable counterpart of getOrCreateTimesheetId — the timesheet page
// writes drafts/copies straight from the browser client (RLS-scoped, can't
// write to `timesheets` itself), so it resolves the id via this action first
// and then stamps it onto the rows it inserts itself.
export async function resolveTimesheetId(periodType: string, periodStart: string, periodEnd: string): Promise<string> {
  const employeeId = await requireEmployeeId();
  const admin = createAdminClient();
  return getOrCreateTimesheetId(admin, employeeId, periodType, periodStart, periodEnd);
}

// ─── autofill ────────────────────────────────────────────────────────────────

export async function autofillPeriodEntries(
  periodType: string,
  periodStart: string,      // YYYY-MM-DD
  periodEnd: string,        // YYYY-MM-DD
  projectId: string,
  hoursPerDay: number,
  notes: string | null,
  skipWeekends: boolean,
): Promise<{ inserted: number; skipped: number }> {
  const employeeId = await requireEmployeeId();
  if (!projectId) throw new Error('Please select a project.');
  if (!(hoursPerDay > 0 && hoursPerDay <= 24)) throw new Error('Hours per day must be between 0 and 24.');
  if (periodStart > periodEnd) throw new Error('Invalid period range.');

  const admin = createAdminClient();
  const timesheetId = await getOrCreateTimesheetId(admin, employeeId, periodType, periodStart, periodEnd);

  const { data: project } = await admin.from('projects').select('id, name').eq('id', projectId).single();
  if (!project) throw new Error('Project not found.');

  const { data: existing } = await admin
    .from('timesheet_entries')
    .select('date')
    .eq('employee_id', employeeId)
    .gte('date', periodStart)
    .lte('date', periodEnd);
  const existingDates = new Set((existing ?? []).map(e => e.date));

  const rows: Record<string, unknown>[] = [];
  const cursor = new Date(periodStart + 'T12:00:00');
  const end    = new Date(periodEnd + 'T12:00:00');
  let skipped  = 0;
  while (cursor <= end) {
    const dow = cursor.getDay(); // 0 = Sun, 6 = Sat
    const dateStr = cursor.toISOString().split('T')[0];
    const isWeekend = dow === 0 || dow === 6;
    if ((skipWeekends && isWeekend) || existingDates.has(dateStr)) {
      skipped++;
    } else {
      rows.push({
        employee_id: employeeId,
        timesheet_id: timesheetId,
        date: dateStr,
        project_id: project.id,
        project: project.name,
        hours: hoursPerDay,
        notes: notes?.trim() || null,
        status: 'draft',
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (rows.length === 0) return { inserted: 0, skipped };

  const { error } = await admin.from('timesheet_entries').insert(rows);
  if (error) throw new Error(error.message);

  return { inserted: rows.length, skipped };
}

// ─── attachments ─────────────────────────────────────────────────────────────

export async function uploadTimesheetAttachment(formData: FormData): Promise<TimesheetAttachment> {
  const employeeId = await requireEmployeeId();
  const file        = formData.get('file') as File | null;
  const periodType  = formData.get('periodType') as string;
  const periodStart = formData.get('periodStart') as string;
  const periodEnd   = formData.get('periodEnd') as string;
  const notesRaw    = formData.get('notes') as string | null;

  if (!file || file.size === 0) throw new Error('Please choose a file.');
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('File is too large (10MB max).');
  if (!ALLOWED_MIME_TYPES.includes(file.type)) throw new Error('Unsupported file type. Use PDF, PNG, JPG, or TXT.');
  if (!['monthly', 'range'].includes(periodType)) throw new Error('Invalid period type.');
  if (!periodStart || !periodEnd) throw new Error('Invalid period range.');

  const admin = createAdminClient();
  const timesheetId = await getOrCreateTimesheetId(admin, employeeId, periodType, periodStart, periodEnd);

  const bytes = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${employeeId}/${periodStart}_${periodEnd}/${randomUUID()}-${safeName}`;

  const { error: uploadError } = await admin.storage.from(ATTACHMENTS_BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: row, error: insertError } = await admin
    .from('timesheet_attachments')
    .insert({
      employee_id:  employeeId,
      timesheet_id: timesheetId,
      period_type:  periodType,
      period_start: periodStart,
      period_end:   periodEnd,
      file_name:    file.name,
      storage_path: path,
      file_size:    file.size,
      mime_type:    file.type,
      notes:        notesRaw?.trim() || null,
      uploaded_by:  employeeId,
    })
    .select('*')
    .single();

  if (insertError || !row) {
    await admin.storage.from(ATTACHMENTS_BUCKET).remove([path]);
    throw new Error(insertError?.message ?? 'Failed to save attachment.');
  }

  return row as TimesheetAttachment;
}

export async function updateTimesheetAttachmentNotes(attachmentId: string, notes: string): Promise<void> {
  const employeeId = await requireEmployeeId();
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('timesheet_attachments')
    .select('id, employee_id')
    .eq('id', attachmentId)
    .single();
  if (!row || row.employee_id !== employeeId) throw new Error('Attachment not found.');

  await admin.from('timesheet_attachments').update({ notes: notes.trim() || null }).eq('id', attachmentId);
}

export async function listTimesheetAttachments(
  periodType:  string,
  periodStart: string,
  periodEnd:   string,
): Promise<TimesheetAttachment[]> {
  const employeeId = await requireEmployeeId();
  const admin = createAdminClient();

  // No timesheets row yet means nothing was ever uploaded to this exact
  // period — nothing to look up, and viewing shouldn't create one (only
  // uploading does, via getOrCreateTimesheetId).
  const { data: timesheet } = await admin
    .from('timesheets')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('period_type', periodType)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle();
  if (!timesheet) return [];

  const { data } = await admin
    .from('timesheet_attachments')
    .select('*')
    .eq('timesheet_id', timesheet.id)
    .order('created_at', { ascending: false });
  return (data ?? []) as TimesheetAttachment[];
}

export async function deleteTimesheetAttachment(attachmentId: string): Promise<void> {
  const employeeId = await requireEmployeeId();
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('timesheet_attachments')
    .select('id, employee_id, storage_path, period_start, period_end')
    .eq('id', attachmentId)
    .single();
  if (!row || row.employee_id !== employeeId) throw new Error('Attachment not found.');

  // Can't remove supporting evidence once any entry in that period has been
  // submitted or approved — mirrors the entry-level lock rules.
  const { data: lockedEntries } = await admin
    .from('timesheet_entries')
    .select('id')
    .eq('employee_id', employeeId)
    .gte('date', row.period_start)
    .lte('date', row.period_end)
    .in('status', ['submitted', 'approved'])
    .limit(1);
  if (lockedEntries && lockedEntries.length > 0) {
    throw new Error('This period has been submitted — recall it (or wait for a rejection) before removing attachments.');
  }

  await admin.storage.from(ATTACHMENTS_BUCKET).remove([row.storage_path]);
  await admin.from('timesheet_attachments').delete().eq('id', attachmentId);
}

export async function getTimesheetAttachmentUrl(attachmentId: string): Promise<string> {
  const employeeId = await requireEmployeeId();
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('timesheet_attachments')
    .select('employee_id, storage_path')
    .eq('id', attachmentId)
    .single();
  if (!row || row.employee_id !== employeeId) throw new Error('Attachment not found.');

  const { data, error } = await admin.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(row.storage_path, 300);
  if (error || !data) throw new Error(error?.message ?? 'Failed to create download link.');
  return data.signedUrl;
}

// ─── declared period total (one cumulative figure, not per file) ─────────────

export async function getPeriodTotal(
  periodType:  string,
  periodStart: string,
  periodEnd:   string,
): Promise<TimesheetPeriodTotal | null> {
  const employeeId = await requireEmployeeId();
  const admin = createAdminClient();
  const { data } = await admin
    .from('timesheet_period_totals')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('period_type', periodType)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle();
  return (data as TimesheetPeriodTotal | null) ?? null;
}

export async function setPeriodTotal(
  periodType:  string,
  periodStart: string,
  periodEnd:   string,
  totalHours:  number,
): Promise<TimesheetPeriodTotal> {
  const employeeId = await requireEmployeeId();
  if (isNaN(totalHours) || totalHours < 0) throw new Error('Total hours must be a positive number.');

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('timesheet_period_totals')
    .upsert({
      employee_id:  employeeId,
      period_type:  periodType,
      period_start: periodStart,
      period_end:   periodEnd,
      total_hours:  totalHours,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'employee_id,period_type,period_start,period_end' })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to save total hours.');
  return data as TimesheetPeriodTotal;
}

export async function clearPeriodTotal(
  periodType:  string,
  periodStart: string,
  periodEnd:   string,
): Promise<void> {
  const employeeId = await requireEmployeeId();
  const admin = createAdminClient();
  await admin
    .from('timesheet_period_totals')
    .delete()
    .eq('employee_id', employeeId)
    .eq('period_type', periodType)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd);
}

// ─── "My Timesheets" (all periods — draft through approved/rejected) ─────────

export interface MySubmission {
  timesheetId: string | null; // short display form (TSH-XXXXXXXX)
  periodType:  'monthly' | 'range';
  periodStart: string;
  periodEnd:   string;
  status:      'draft' | 'submitted' | 'approved' | 'rejected' | 'mixed';
  totalHours:  number;
  entryCount:  number;
  submittedAt: string | null;
  rejectionReasons: string[];
}

function lastDayOfMonthStr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().split('T')[0];
}

// One row per timesheet the employee has ever touched — draft, submitted,
// approved, or rejected — grouped the same way the admin queue groups
// pending ones: prefer the real timesheet_id (exact period, resolved in one
// batch query below), falling back to a submitted_at match, and only
// inferring from the entries' own date span as a last resort for legacy
// rows with neither.
export async function fetchMySubmissions(): Promise<MySubmission[]> {
  const employeeId = await requireEmployeeId();
  const admin = createAdminClient();

  const { data } = await admin
    .from('timesheet_entries')
    .select('date, hours, status, submitted_at, timesheet_id, rejection_reason')
    .eq('employee_id', employeeId)
    .order('date');

  if (!data || data.length === 0) return [];

  const timesheetIds = [...new Set(data.map(e => e.timesheet_id).filter((id): id is string => Boolean(id)))];
  const timesheetsById = new Map<string, { period_type: MySubmission['periodType']; period_start: string; period_end: string }>();
  if (timesheetIds.length) {
    const { data: timesheets } = await admin
      .from('timesheets')
      .select('id, period_type, period_start, period_end')
      .in('id', timesheetIds);
    (timesheets ?? []).forEach(t => timesheetsById.set(t.id, {
      period_type: t.period_type as MySubmission['periodType'],
      period_start: t.period_start,
      period_end: t.period_end,
    }));
  }

  const groups = new Map<string, typeof data>();
  data.forEach(e => {
    const key = e.timesheet_id ? `id:${e.timesheet_id}` : e.submitted_at ? `at:${e.submitted_at}` : `row:${e.date}:${Math.random()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  });

  const result: MySubmission[] = [];
  groups.forEach(rows => {
    const linkedId = rows.find(r => r.timesheet_id)?.timesheet_id ?? null;
    const linked = linkedId ? timesheetsById.get(linkedId) : undefined;

    let periodType: MySubmission['periodType'];
    let periodStart: string;
    let periodEnd: string;
    if (linked) {
      periodType = linked.period_type;
      periodStart = linked.period_start;
      periodEnd = linked.period_end;
    } else {
      const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
      periodStart = sorted[0].date;
      periodEnd = sorted[sorted.length - 1].date;
      const isFullMonth = periodStart.endsWith('-01') && periodEnd === lastDayOfMonthStr(periodStart);
      periodType = isFullMonth ? 'monthly' : 'range';
    }

    const statuses = new Set(rows.map(r => r.status));
    const status: MySubmission['status'] =
      statuses.has('rejected') ? 'rejected' :
      statuses.size === 1 && statuses.has('approved')  ? 'approved'  :
      statuses.size === 1 && statuses.has('submitted') ? 'submitted' :
      statuses.size === 1 && statuses.has('draft')     ? 'draft'     :
      'mixed';

    result.push({
      timesheetId: linkedId ? shortTimesheetId(linkedId) : null,
      periodType, periodStart, periodEnd, status,
      totalHours: rows.reduce((s, r) => s + Number(r.hours), 0),
      entryCount: rows.length,
      submittedAt: rows.find(r => r.submitted_at)?.submitted_at ?? null,
      rejectionReasons: [...new Set(rows.filter(r => r.rejection_reason).map(r => r.rejection_reason as string))],
    });
  });

  return result.sort((a, b) => b.periodStart.localeCompare(a.periodStart));
}
