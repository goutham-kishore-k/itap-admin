'use server';

import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdminId } from '@/lib/require-admin';
import { notifyEmployee } from '@/lib/notify';
import { getOrCreateTimesheetId } from '@/lib/timesheets';
import { shortTimesheetId } from '@/lib/timesheet-id-format';
import type { TimesheetAttachment } from '@/types';

// ─── exported types ──────────────────────────────────────────────────────────

export interface EmpOption { id: string; full_name: string; }

export interface PendingSubmission {
  empId: string;
  empName: string;
  entryCount: number;
  totalHours: number;
  periodStart: string;
  periodEnd: string;
  periodType: 'weekly' | 'monthly' | 'range';
  timesheetId: string | null; // short display form (TSH-XXXXXXXX) — null for legacy batches with no linked timesheets row
}

export interface EntryRow {
  id: string;
  employee_id: string;
  emp_name: string;
  date: string;
  project: string;
  hours: number;
  notes: string | null;
  rejection_reason: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  approval_id: string | null;
  timesheet_id: string | null;
}

export interface ApprovalRow {
  id: string;
  short_id: string;       // TS-XXXXXXXX
  employee_id: string;
  emp_name: string;
  period_type: 'daily' | 'weekly' | 'monthly' | 'range';
  period_start: string;
  period_end: string;
  total_hours: number;
  entry_count: number;
  status: 'approved' | 'reverted';
  notes: string | null;
  approved_by_name: string | null;
  approved_at: string;
  reverted_by_name: string | null;
  reverted_at: string | null;
}

// ─── queries ─────────────────────────────────────────────────────────────────

export async function fetchEmployees(): Promise<EmpOption[]> {
  await requireAdminId();
  const admin = createAdminClient();
  const { data } = await admin
    .from('employees')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name');
  return (data ?? []) as EmpOption[];
}

export async function fetchEntries(
  employeeId: string,           // 'all' or a uuid
  periodStart: string,          // YYYY-MM-DD
  periodEnd: string,            // YYYY-MM-DD
): Promise<EntryRow[]> {
  await requireAdminId();
  const admin = createAdminClient();
  let q = admin
    .from('timesheet_entries')
    .select('*, employees!employee_id(id, full_name)')
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .order('date')
    .order('created_at');

  if (employeeId !== 'all') q = q.eq('employee_id', employeeId);

  const { data } = await q;
  return (data ?? []).map(e => {
    const emp = e.employees as unknown as { id: string; full_name: string } | null;
    return {
      id:          e.id,
      employee_id: e.employee_id,
      emp_name:    emp?.full_name ?? '(unknown)',
      date:        e.date,
      project:     e.project,
      hours:       Number(e.hours),
      notes:            e.notes,
      rejection_reason: e.rejection_reason ?? null,
      status:           e.status,
      approval_id:      e.approval_id ?? null,
      timesheet_id:     e.timesheet_id ?? null,
    };
  });
}

function lastDayOfMonthStr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().split('T')[0];
}

// One row per distinct submission batch — an employee can have more than one
// pending item at once (e.g. week 1 submitted and still awaiting review, a
// later month submitted separately while some other day is still draft).
// Batches are grouped by submitted_at: a single bulk "Submit" click stamps
// every affected row with the exact same timestamp, so entries sharing that
// timestamp are unambiguously one batch — regardless of how close their dates
// happen to be to some other, unrelated submission.
//
// Rows from before submitted_at existed (or any other edge case leaving it
// null) fall back to date-gap clustering so they don't just vanish from the
// queue; this is a heuristic and only applies to that legacy data.
const BATCH_GAP_THRESHOLD_DAYS = 5;

interface PendingRow { date: string; hours: number; submittedAt: string | null; timesheetId: string | null; }
interface TimesheetRow { period_type: PendingSubmission['periodType']; period_start: string; period_end: string; }

// Prefers the real timesheet identity — every row in one submitted_at batch
// shares the same timesheet_id once tagged at creation (autofill/draft-save/
// copy all stamp it via getOrCreateTimesheetId), so `timesheetsById` gives
// the exact period boundaries the employee actually used. Only falls back to
// inferring from the entries' own date span for legacy rows created before
// entries carried a timesheet_id — that inference breaks silently whenever a
// weekend gets skipped (the autofill default), so it's a last resort, not
// the primary path.
function buildBatch(
  empId: string, empName: string, rows: PendingRow[],
  timesheetsById: Map<string, TimesheetRow>,
): PendingSubmission {
  const linkedId = rows.find(r => r.timesheetId)?.timesheetId;
  const linked = linkedId ? timesheetsById.get(linkedId) : undefined;
  if (linked) {
    return {
      empId, empName,
      entryCount:  rows.length,
      totalHours:  rows.reduce((s, r) => s + r.hours, 0),
      periodStart: linked.period_start,
      periodEnd:   linked.period_end,
      periodType:  linked.period_type,
      timesheetId: shortTimesheetId(linkedId!),
    };
  }

  const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
  const periodStart = sorted[0].date;
  const periodEnd = sorted[sorted.length - 1].date;
  const spanDays = Math.round((new Date(periodEnd + 'T12:00:00').getTime() - new Date(periodStart + 'T12:00:00').getTime()) / 86400000) + 1;
  const isFullMonth = periodStart.endsWith('-01') && periodEnd === lastDayOfMonthStr(periodStart);
  const periodType: PendingSubmission['periodType'] =
    spanDays <= 7 ? 'weekly' : isFullMonth ? 'monthly' : 'range';
  return {
    empId,
    empName,
    entryCount: rows.length,
    totalHours: rows.reduce((s, r) => s + r.hours, 0),
    periodStart,
    periodEnd,
    periodType,
    timesheetId: null,
  };
}

export async function fetchPendingSubmissions(): Promise<PendingSubmission[]> {
  await requireAdminId();
  const admin = createAdminClient();
  const { data } = await admin
    .from('timesheet_entries')
    .select('employee_id, date, hours, submitted_at, timesheet_id, employees!employee_id(full_name)')
    .eq('status', 'submitted')
    .order('date');

  const byEmp = new Map<string, { empName: string; rows: PendingRow[] }>();
  (data ?? []).forEach(e => {
    const emp = e.employees as unknown as { full_name: string } | null;
    if (!byEmp.has(e.employee_id)) {
      byEmp.set(e.employee_id, { empName: emp?.full_name ?? '(unknown)', rows: [] });
    }
    byEmp.get(e.employee_id)!.rows.push({
      date: e.date, hours: Number(e.hours),
      submittedAt: e.submitted_at ?? null,
      timesheetId: e.timesheet_id ?? null,
    });
  });

  // One batch fetch for every distinct timesheet referenced, instead of a
  // query per submission batch.
  const allTimesheetIds = [...new Set(
    [...byEmp.values()].flatMap(g => g.rows.map(r => r.timesheetId)).filter((id): id is string => Boolean(id))
  )];
  const timesheetsById = new Map<string, TimesheetRow>();
  if (allTimesheetIds.length) {
    const { data: timesheets } = await admin
      .from('timesheets')
      .select('id, period_type, period_start, period_end')
      .in('id', allTimesheetIds);
    (timesheets ?? []).forEach(t => timesheetsById.set(t.id, {
      period_type: t.period_type as PendingSubmission['periodType'],
      period_start: t.period_start,
      period_end: t.period_end,
    }));
  }

  const result: PendingSubmission[] = [];

  byEmp.forEach((g, empId) => {
    const withTimestamp = g.rows.filter(r => r.submittedAt);
    const withoutTimestamp = g.rows.filter(r => !r.submittedAt);

    const byTimestamp = new Map<string, PendingRow[]>();
    withTimestamp.forEach(r => {
      const key = r.submittedAt!;
      if (!byTimestamp.has(key)) byTimestamp.set(key, []);
      byTimestamp.get(key)!.push(r);
    });
    byTimestamp.forEach(rows => result.push(buildBatch(empId, g.empName, rows, timesheetsById)));

    // Legacy fallback — gap-cluster whatever has no submitted_at
    const sortedLegacy = withoutTimestamp.slice().sort((a, b) => a.date.localeCompare(b.date));
    let batch: PendingRow[] = [];
    const flush = () => { if (batch.length) result.push(buildBatch(empId, g.empName, batch, timesheetsById)); batch = []; };
    sortedLegacy.forEach(row => {
      if (batch.length > 0) {
        const prev = new Date(batch[batch.length - 1].date + 'T12:00:00');
        const cur  = new Date(row.date + 'T12:00:00');
        const gapDays = Math.round((cur.getTime() - prev.getTime()) / 86400000);
        if (gapDays > BATCH_GAP_THRESHOLD_DAYS) flush();
      }
      batch.push(row);
    });
    flush();
  });

  return result.sort((a, b) => a.empName.localeCompare(b.empName) || a.periodStart.localeCompare(b.periodStart));
}

export async function fetchApprovals(
  employeeId: string,   // 'all' or uuid
  statusFilter: string, // 'all' | 'approved' | 'reverted'
): Promise<ApprovalRow[]> {
  await requireAdminId();
  const admin = createAdminClient();
  let q = admin
    .from('timesheet_approvals')
    .select(`
      *,
      employees!employee_id(full_name),
      approver:approved_by(full_name),
      reverter:reverted_by(full_name)
    `)
    .order('approved_at', { ascending: false });

  if (employeeId !== 'all') q = q.eq('employee_id', employeeId);
  if (statusFilter !== 'all') q = q.eq('status', statusFilter);

  const { data } = await q;
  return (data ?? []).map(r => ({
    id:               r.id,
    short_id:         'TS-' + r.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
    employee_id:      r.employee_id,
    emp_name:         (r.employees as unknown as { full_name: string } | null)?.full_name ?? '—',
    period_type:      r.period_type,
    period_start:     r.period_start,
    period_end:       r.period_end,
    total_hours:      Number(r.total_hours),
    entry_count:      r.entry_count,
    status:           r.status,
    notes:            r.notes,
    approved_by_name: (r.approver as unknown as { full_name: string } | null)?.full_name ?? null,
    approved_at:      r.approved_at,
    reverted_by_name: (r.reverter as unknown as { full_name: string } | null)?.full_name ?? null,
    reverted_at:      r.reverted_at ?? null,
  }));
}

// ─── mutations ───────────────────────────────────────────────────────────────

async function getReviewerName(admin: ReturnType<typeof createAdminClient>, reviewerId: string): Promise<string> {
  const { data } = await admin.from('employees').select('full_name').eq('id', reviewerId).single();
  return data?.full_name ?? 'the admin team';
}

const PERIOD_TYPE_LABEL: Record<'daily' | 'weekly' | 'monthly' | 'range', string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', range: 'Custom range',
};

// Shared "what's in this email" block for the approve/reject notification —
// employee name, the distinct project(s) covered, total hours, and the period.
async function buildNotificationDetails(
  admin:       ReturnType<typeof createAdminClient>,
  employeeId:  string,
  periodType:  'daily' | 'weekly' | 'monthly' | 'range',
  periodStart: string,
  periodEnd:   string,
  entryIds:    string[],
  status:      'Approved' | 'Rejected',
) {
  const [{ data: emp }, { data: rows }] = await Promise.all([
    admin.from('employees').select('full_name').eq('id', employeeId).single(),
    admin.from('timesheet_entries').select('project, hours').in('id', entryIds),
  ]);
  const projects = [...new Set((rows ?? []).map(r => r.project).filter(Boolean))];
  const hours = (rows ?? []).reduce((s, r) => s + Number(r.hours), 0);

  // 'daily' predates the timesheets table (only weekly/monthly/range are
  // valid there) and isn't produced by any current UI — guard it rather than
  // let a stray value break the notification.
  let timesheetId = '—';
  if (periodType !== 'daily') {
    try {
      const id = await getOrCreateTimesheetId(admin, employeeId, periodType, periodStart, periodEnd);
      timesheetId = shortTimesheetId(id);
    } catch {
      // Best-effort — the email still sends without it.
    }
  }

  return {
    employeeName: emp?.full_name ?? '—',
    project:      projects.length ? projects.join(', ') : '—',
    hours:        `${hours.toFixed(1)}h`,
    period:       `${periodStart} – ${periodEnd} (${PERIOD_TYPE_LABEL[periodType]})`,
    status,
    timesheetId,
  };
}

export async function approvePeriod(
  employeeId:  string,
  periodType:  'daily' | 'weekly' | 'monthly' | 'range',
  periodStart: string,
  periodEnd:   string,
  entryIds:    string[],
  totalHours:  number,
  notes:       string | null,
): Promise<string> {
  if (!entryIds.length) throw new Error('No entries to approve.');
  const reviewerId = await requireAdminId();
  const admin      = createAdminClient();

  // Create the approval record
  const { data: approval, error } = await admin
    .from('timesheet_approvals')
    .insert({
      employee_id:  employeeId,
      period_type:  periodType,
      period_start: periodStart,
      period_end:   periodEnd,
      total_hours:  totalHours,
      entry_count:  entryIds.length,
      status:       'approved',
      notes:        notes || null,
      approved_by:  reviewerId,
      approved_at:  new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !approval) throw new Error(error?.message ?? 'Failed to create approval.');

  // Stamp all entries
  await admin
    .from('timesheet_entries')
    .update({
      status:      'approved',
      approval_id: approval.id,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .in('id', entryIds);

  const [reviewerName, details] = await Promise.all([
    getReviewerName(admin, reviewerId),
    buildNotificationDetails(admin, employeeId, periodType, periodStart, periodEnd, entryIds, 'Approved'),
  ]);
  await notifyEmployee({
    employeeId,
    type:  'timesheet_approved',
    title: 'Timesheet approved',
    body:  `Your ${periodType} timesheet (${periodStart} – ${periodEnd}) — ${totalHours.toFixed(1)}h — was approved by ${reviewerName}.`,
    link:  '/portal/timesheet',
    details,
  });

  return approval.id;
}

export async function rejectPeriod(
  employeeId:  string,
  periodType:  'daily' | 'weekly' | 'monthly' | 'range',
  periodStart: string,
  periodEnd:   string,
  entryIds:    string[],
  reason:      string,
): Promise<void> {
  if (!entryIds.length) return;
  const reviewerId = await requireAdminId();
  const admin      = createAdminClient();
  await admin
    .from('timesheet_entries')
    .update({
      status:           'rejected',
      rejection_reason: reason?.trim() || null,
      reviewed_by:      reviewerId,
      reviewed_at:      new Date().toISOString(),
    })
    .in('id', entryIds);

  const [reviewerName, details] = await Promise.all([
    getReviewerName(admin, reviewerId),
    buildNotificationDetails(admin, employeeId, periodType, periodStart, periodEnd, entryIds, 'Rejected'),
  ]);
  await notifyEmployee({
    employeeId,
    type:  'timesheet_rejected',
    title: 'Timesheet rejected',
    body:  `Your ${periodType} timesheet (${periodStart} – ${periodEnd}) was rejected by ${reviewerName}${reason?.trim() ? `: ${reason.trim()}` : '.'}`,
    link:  '/portal/timesheet',
    details,
  });
}

// ─── attachments ─────────────────────────────────────────────────────────────

// Scoped to the exact timesheet being reviewed via its timesheets.id — not a
// date-range guess, which previously let an employee's attachments from
// every other month/week they'd ever uploaded to show up here too (fetch was
// only filtered by employee_id). No matching timesheets row means nothing
// was ever uploaded to this exact period, so there's nothing to fetch.
export async function fetchAttachments(
  employeeId:  string,
  periodType:  'daily' | 'weekly' | 'monthly' | 'range',
  periodStart: string,
  periodEnd:   string,
): Promise<TimesheetAttachment[]> {
  await requireAdminId();
  const admin = createAdminClient();

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

export async function getAttachmentDownloadUrl(attachmentId: string): Promise<string> {
  await requireAdminId();
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('timesheet_attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .single();
  if (!row) throw new Error('Attachment not found.');
  const { data, error } = await admin.storage.from('timesheet-attachments').createSignedUrl(row.storage_path, 300);
  if (error || !data) throw new Error(error?.message ?? 'Failed to create download link.');
  return data.signedUrl;
}

export async function revertApproval(approvalId: string): Promise<void> {
  const reviewerId = await requireAdminId();
  const admin      = createAdminClient();

  // Revert all linked entries back to submitted. Stamp a fresh submitted_at so
  // this reverted batch is treated as its own distinct pending item in the
  // admin queue, not accidentally merged with some other unrelated submission
  // that happens to sit nearby in date terms.
  await admin
    .from('timesheet_entries')
    .update({
      status:       'submitted',
      approval_id:  null,
      reviewed_by:  null,
      reviewed_at:  null,
      submitted_at: new Date().toISOString(),
    })
    .eq('approval_id', approvalId);

  // Mark approval as reverted
  await admin
    .from('timesheet_approvals')
    .update({
      status:      'reverted',
      reverted_by: reviewerId,
      reverted_at: new Date().toISOString(),
    })
    .eq('id', approvalId);
}
