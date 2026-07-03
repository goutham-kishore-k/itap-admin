'use server';

import { createAdminClient } from '@/lib/supabase-admin';
import { createClient }      from '@/lib/supabase-server';

// ─── helpers ────────────────────────────────────────────────────────────────

async function getReviewerId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin.from('employees').select('id').eq('user_id', user.id).single();
  return data?.id ?? null;
}

// ─── exported types ──────────────────────────────────────────────────────────

export interface EmpOption { id: string; full_name: string; }

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
}

export interface ApprovalRow {
  id: string;
  short_id: string;       // TS-XXXXXXXX
  employee_id: string;
  emp_name: string;
  period_type: 'daily' | 'weekly' | 'monthly';
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
    };
  });
}

export async function fetchApprovals(
  employeeId: string,   // 'all' or uuid
  statusFilter: string, // 'all' | 'approved' | 'reverted'
): Promise<ApprovalRow[]> {
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

export async function approvePeriod(
  employeeId:  string,
  periodType:  'daily' | 'weekly' | 'monthly',
  periodStart: string,
  periodEnd:   string,
  entryIds:    string[],
  totalHours:  number,
  notes:       string | null,
): Promise<string> {
  if (!entryIds.length) throw new Error('No entries to approve.');
  const admin      = createAdminClient();
  const reviewerId = await getReviewerId();

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

  return approval.id;
}

export async function rejectPeriod(
  entryIds: string[],
  reason:   string,
): Promise<void> {
  if (!entryIds.length) return;
  const admin      = createAdminClient();
  const reviewerId = await getReviewerId();
  await admin
    .from('timesheet_entries')
    .update({
      status:           'rejected',
      rejection_reason: reason?.trim() || null,
      reviewed_by:      reviewerId,
      reviewed_at:      new Date().toISOString(),
    })
    .in('id', entryIds);
}

export async function revertApproval(approvalId: string): Promise<void> {
  const admin      = createAdminClient();
  const reviewerId = await getReviewerId();

  // Revert all linked entries back to submitted
  await admin
    .from('timesheet_entries')
    .update({
      status:      'submitted',
      approval_id: null,
      reviewed_by: null,
      reviewed_at: null,
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
