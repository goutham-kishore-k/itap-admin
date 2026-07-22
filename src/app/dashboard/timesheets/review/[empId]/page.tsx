'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  fetchEntries, approvePeriod, rejectPeriod, revertApproval,
  fetchAttachments, getAttachmentDownloadUrl,
  type EntryRow,
} from '../../actions';
import type { TimesheetAttachment } from '@/types';
import {
  getMonthStart, getMonthEnd, addMonths, fmt, displayDate,
  dayStatus, monthGridCells, DAY_CELL_STYLE, DAY_DOT_STYLE, WEEKDAY_HEADERS, type DayStatus,
} from '@/lib/calendar-utils';
import AttachmentViewerModal from '@/components/AttachmentViewerModal';
import { shortTimesheetId } from '@/lib/timesheet-id-format';

const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  submitted: 'bg-blue-50 text-blue-700',
  approved:  'bg-green-50 text-green-700',
  rejected:  'bg-red-50 text-red-700',
};

function displayAttachmentPeriod(a: TimesheetAttachment) {
  const s = new Date(a.period_start + 'T12:00:00');
  const e = new Date(a.period_end   + 'T12:00:00');
  if (a.period_type === 'monthly') return s.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function monthsInRange(fromStr: string, toStr: string): Date[] {
  const from = new Date(fromStr + 'T12:00:00');
  const to   = new Date(toStr + 'T12:00:00');
  const months: Date[] = [];
  let cursor = getMonthStart(from);
  const last = getMonthStart(to);
  while (cursor <= last) {
    months.push(cursor);
    cursor = getMonthStart(addMonths(cursor, 1));
  }
  return months;
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ReviewDetailInner() {
  const { empId } = useParams<{ empId: string }>();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') ?? '';
  const to   = searchParams.get('to') ?? '';
  const periodType = (searchParams.get('type') ?? 'range') as 'daily' | 'weekly' | 'monthly' | 'range';
  const empName = searchParams.get('name') ?? 'Employee';

  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [attachments, setAttachments] = useState<TimesheetAttachment[]>([]);
  const [attachLoading, setAttachLoading] = useState(true);

  const [acting, setActing] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [lastApprovedId, setLastApprovedId] = useState<string | null>(null);
  const [revertConfirming, setRevertConfirming] = useState(false);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [viewingAttachment, setViewingAttachment] = useState<{ url: string; fileName: string; mimeType: string | null } | null>(null);

  const loadEntries = useCallback(async () => {
    if (!empId || !from || !to) return;
    setLoading(true);
    const rows = await fetchEntries(empId, from, to);
    setEntries(rows);
    setLoading(false);
  }, [empId, from, to]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  useEffect(() => {
    if (!empId || !from || !to) return;
    setAttachLoading(true);
    fetchAttachments(empId, periodType, from, to).then(rows => { setAttachments(rows); setAttachLoading(false); });
  }, [empId, periodType, from, to]);

  async function handleViewAttachment(a: TimesheetAttachment) {
    const url = await getAttachmentDownloadUrl(a.id);
    setViewingAttachment({ url, fileName: a.file_name, mimeType: a.mime_type });
  }

  const submitted   = entries.filter(e => e.status === 'submitted');
  const approved    = entries.filter(e => e.status === 'approved');
  const rejected    = entries.filter(e => e.status === 'rejected');
  const draft       = entries.filter(e => e.status === 'draft');
  const approvalIds = [...new Set(approved.map(e => e.approval_id).filter((id): id is string => Boolean(id)))];
  const totalHours  = entries.reduce((s, e) => s + e.hours, 0);
  const timesheetId = entries.find(e => e.timesheet_id)?.timesheet_id;
  const shortTimesheetIdDisplay = timesheetId ? shortTimesheetId(timesheetId) : null;

  const spanDays = from && to
    ? Math.round((new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / 86400000) + 1
    : 0;
  const isWeeklyView = spanDays > 0 && spanDays <= 7;
  const periodNoun = periodType === 'weekly' ? 'Week' : periodType === 'monthly' ? 'Month' : 'Period';

  async function handleApprove() {
    if (!submitted.length) return;
    setActing(true);
    const hours = submitted.reduce((s, e) => s + e.hours, 0);
    const approvalId = await approvePeriod(empId, periodType, from, to, submitted.map(e => e.id), hours, approvalNotes || null);
    setLastApprovedId('TS-' + approvalId.replace(/-/g, '').slice(0, 8).toUpperCase());
    setApprovalNotes('');
    setActing(false);
    loadEntries();
  }

  async function handleReject() {
    if (!rejectReason.trim() || !submitted.length) return;
    setActing(true);
    await rejectPeriod(empId, periodType, from, to, submitted.map(e => e.id), rejectReason.trim());
    setIsRejecting(false);
    setRejectReason('');
    setActing(false);
    loadEntries();
  }

  async function handleRevert() {
    setActing(true);
    for (const id of approvalIds) await revertApproval(id);
    setRevertConfirming(false);
    setActing(false);
    loadEntries();
  }

  if (!from || !to) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 text-center py-14 text-gray-400 text-sm">
        Missing period range. <Link href="/dashboard/timesheets" className="text-brand font-semibold hover:underline">Back to queue</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <Link href="/dashboard/timesheets" className="text-sm text-gray-400 hover:text-gray-700 transition-colors inline-flex items-center gap-1">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 19l-7-7 7-7" />
        </svg>
        Back to queue
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-base font-bold shrink-0">
            {empName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{empName}</h1>
            <p className="text-sm text-gray-400 mt-0.5 capitalize">
              {periodType} · {displayDate(new Date(from + 'T12:00:00'))} – {displayDate(new Date(to + 'T12:00:00'))}
            </p>
            {shortTimesheetIdDisplay && (
              <p className="text-xs font-mono font-bold text-gray-400 mt-0.5">{shortTimesheetIdDisplay}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-gray-900 leading-none">{totalHours.toFixed(1)}<span className="text-sm font-semibold text-gray-400 ml-0.5">h</span></p>
          <p className="text-xs text-gray-400 mt-1">{entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}</p>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* Status chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {submitted.length > 0 && <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{submitted.length} pending</span>}
            {approved.length > 0 && <span className="text-[10px] font-semibold bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{approved.length} approved</span>}
            {rejected.length > 0 && <span className="text-[10px] font-semibold bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{rejected.length} rejected</span>}
            {draft.length > 0 && <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{draft.length} draft</span>}
            {lastApprovedId && <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">✓ {lastApprovedId}</span>}
          </div>

          {isWeeklyView ? (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/50">
                    <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Project</th>
                    <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Hrs</th>
                    <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Notes</th>
                    <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50/30 transition-colors">
                      <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap text-xs">{displayDate(new Date(e.date + 'T12:00:00'))}</td>
                      <td className="px-5 py-2.5 font-medium text-gray-900">{e.project}</td>
                      <td className="px-5 py-2.5 font-semibold text-gray-700">{e.hours}h</td>
                      <td className="px-5 py-2.5 text-gray-400 hidden md:table-cell text-xs">{e.notes ?? '—'}</td>
                      <td className="px-5 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[e.status]}`}>{e.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-3">
              {monthsInRange(from, to).map(monthAnchor => {
                const mStart = fmt(getMonthStart(monthAnchor));
                const mEnd   = fmt(getMonthEnd(monthAnchor));
                return (
                  <div key={mStart} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <p className="text-xs font-semibold text-gray-500 mb-2">
                      {monthAnchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </p>
                    <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                      {WEEKDAY_HEADERS.map(w => (
                        <div key={w} className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-1">{w}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {monthGridCells(monthAnchor).map(cell => {
                        const cellStr          = fmt(cell);
                        const inDisplayedMonth = cellStr >= mStart && cellStr <= mEnd;
                        const inRange          = cellStr >= from && cellStr <= to;
                        const cellEntries      = inRange ? entries.filter(e => e.date === cellStr) : [];
                        const cStatus          = dayStatus(cellEntries);
                        const cellHours        = cellEntries.reduce((s, e) => s + Number(e.hours), 0);

                        if (!inDisplayedMonth) return <div key={cellStr} className="aspect-square opacity-0 pointer-events-none" />;

                        if (!inRange) {
                          return (
                            <div key={cellStr}
                              className="aspect-square rounded-lg border border-gray-100 bg-gray-50 p-1 flex items-center justify-center">
                              <span className="text-[10px] font-medium text-gray-300">{cell.getDate()}</span>
                            </div>
                          );
                        }

                        return (
                          <div key={cellStr}
                            onMouseEnter={() => cellEntries.length > 0 && setHoverDate(cellStr)}
                            onMouseLeave={() => setHoverDate(null)}
                            className={`relative aspect-square rounded-lg border p-1 flex flex-col items-center justify-center ${DAY_CELL_STYLE[cStatus]}`}>
                            <span className="absolute top-1 left-1.5 text-[10px] font-semibold text-gray-400">{cell.getDate()}</span>
                            {cStatus !== 'empty' && (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-sm font-bold text-gray-700 leading-none">{cellHours}h</span>
                                <span className={`w-1.5 h-1.5 rounded-full ${DAY_DOT_STYLE[cStatus]}`} />
                              </div>
                            )}
                            {hoverDate === cellStr && cellEntries.length > 0 && (
                              <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 bg-white border border-gray-200 rounded-lg shadow-lg p-2 space-y-1">
                                <p className="text-[10px] font-semibold text-gray-500">{displayDate(cell)}</p>
                                {cellEntries.map(e => (
                                  <div key={e.id} className="flex items-center justify-between text-[11px] gap-2">
                                    <span className="text-gray-700 truncate">{e.project}</span>
                                    <span className="text-gray-400 shrink-0 capitalize">{e.status}</span>
                                    <span className="text-gray-700 font-medium shrink-0">{e.hours}h</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-4 flex-wrap px-1">
                {(['empty', 'draft', 'submitted', 'approved', 'rejected'] as DayStatus[]).map(s => (
                  <span key={s} className="flex items-center gap-1.5 text-[10px] text-gray-400 capitalize">
                    <span className={`w-1.5 h-1.5 rounded-full ${DAY_DOT_STYLE[s]}`} />
                    {s === 'empty' ? 'No entry' : s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Attachments */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Attachments</p>
            {attachLoading ? (
              <p className="text-xs text-gray-400">Loading…</p>
            ) : attachments.length === 0 ? (
              <p className="text-xs text-gray-400">No files uploaded by this employee.</p>
            ) : (
              <div className="space-y-1.5">
                {attachments.map(a => (
                  <div key={a.id} className="space-y-0.5">
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex-1 min-w-0 truncate text-gray-700">{a.file_name}</span>
                      <span className="text-gray-400 shrink-0">{displayAttachmentPeriod(a)}</span>
                      <button onClick={() => handleViewAttachment(a)}
                        className="font-semibold text-brand hover:text-brand-dark shrink-0">View</button>
                    </div>
                    {a.notes && <p className="text-[11px] text-gray-400 italic">{a.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          {(submitted.length > 0 || approvalIds.length > 0) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              {submitted.length > 0 && (
                isRejecting ? (
                  <div className="space-y-2 bg-red-50 border border-red-100 rounded-xl p-4">
                    <label className="block text-xs font-semibold text-red-700">Rejection reason <span className="text-red-500">*</span></label>
                    <textarea
                      value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                      rows={2} autoFocus placeholder="Explain why these entries are being rejected…"
                      className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:border-red-400 bg-white resize-none" />
                    <div className="flex gap-2">
                      <button onClick={handleReject} disabled={!rejectReason.trim() || acting}
                        className="px-4 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-full hover:bg-red-700 disabled:opacity-50 transition-colors">
                        {acting ? '…' : 'Confirm Reject'}
                      </button>
                      <button onClick={() => { setIsRejecting(false); setRejectReason(''); }}
                        className="px-4 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-semibold rounded-full hover:border-gray-300 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs font-semibold text-gray-400 mb-1">Approval note (optional)</label>
                      <input value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)}
                        placeholder="e.g. Reviewed and confirmed"
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleApprove} disabled={acting}
                        className="px-4 py-2 bg-green-600 text-white text-xs font-semibold rounded-full hover:bg-green-700 disabled:opacity-50 transition-colors">
                        {acting ? '…' : `Approve ${periodNoun}`}
                      </button>
                      <button onClick={() => { setIsRejecting(true); setRejectReason(''); }} disabled={acting}
                        className="px-4 py-2 bg-white border border-red-200 text-red-600 text-xs font-semibold rounded-full hover:bg-red-50 disabled:opacity-50 transition-colors">
                        {`Reject ${periodNoun}`}
                      </button>
                    </div>
                  </div>
                )
              )}

              {approvalIds.length > 0 && (
                revertConfirming ? (
                  <div className="flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                    <span className="text-xs text-amber-800 font-medium flex-1">
                      Revert {approved.length} approved entr{approved.length !== 1 ? 'ies' : 'y'}? They'll go back to submitted.
                    </span>
                    <button onClick={handleRevert} disabled={acting}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 whitespace-nowrap">
                      {acting ? '…' : 'Yes, revert'}
                    </button>
                    <button onClick={() => setRevertConfirming(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{approved.length} entr{approved.length !== 1 ? 'ies' : 'y'} approved</span>
                    <button onClick={() => setRevertConfirming(true)} disabled={acting}
                      className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50">
                      Revert Approval
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </>
      )}

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

export default function ReviewDetailPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ReviewDetailInner />
    </Suspense>
  );
}
