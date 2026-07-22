import type { TimesheetReportData } from './timesheet-report-data';

function fmtLong(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
function fmtShort(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtDay(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function esc(s: string | null | undefined) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const STATUS_LABEL: Record<string, string> = { approved: 'Approved', submitted: 'Submitted', rejected: 'Rejected', draft: 'Draft' };

/**
 * Shared HTML-string renderer for the timesheet report. Used both for the instant
 * browser-preview route (includePrintScript: true, unchanged behavior) and as the
 * input fed to Puppeteer's page.setContent() for server-side PDF generation
 * (includePrintScript: false — no client-side print trigger needed headlessly).
 */
export function renderTimesheetReportHtml(
  data: TimesheetReportData,
  opts: { includePrintScript?: boolean } = {},
): string {
  const { includePrintScript = true } = opts;
  const { employee, manager, from, to, entries, weeks, totalHours, approvedHours, byProject, refNo, generatedAt } = data;

  let cumulative = 0;
  const weekRows = weeks.map((week, wi) => {
    const weekHours = week.rows.reduce((s, e) => s + e.hours, 0);

    const entryRows = week.rows.map((e, ri) => {
      cumulative += e.hours;
      return `
      <tr class="${ri % 2 === 0 ? 'even' : 'odd'}">
        <td class="indent">${esc(fmtDay(e.date))}</td>
        <td class="bold">${esc(e.project)}</td>
        <td class="muted">${esc(e.notes || '—')}</td>
        <td class="right bold">${e.hours.toFixed(1)}</td>
        <td class="right muted">${cumulative.toFixed(1)}</td>
        <td>${esc(STATUS_LABEL[e.status] ?? e.status)}</td>
      </tr>`;
    }).join('');

    return `
      <tr class="week-header">
        <td colspan="6">
          Week ${wi + 1}&nbsp;&nbsp;·&nbsp;&nbsp;${esc(fmtShort(week.weekStartStr))} – ${esc(fmtShort(week.weekEndStr))}
          <span class="week-total">${weekHours.toFixed(1)} h this week</span>
        </td>
      </tr>
      ${entryRows}
      <tr class="subtotal-row">
        <td colspan="3" class="right italic">Week ${wi + 1} subtotal</td>
        <td class="right navy bold">${weekHours.toFixed(1)}</td>
        <td class="right navy bold">${cumulative.toFixed(1)}</td>
        <td></td>
      </tr>`;
  }).join('');

  const projectRows = Array.from(byProject.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([proj, hrs]) => `
      <div class="proj-row">
        <span>${esc(proj)}</span>
        <span class="bold">${hrs.toFixed(1)} h</span>
      </div>`).join('');

  const printScript = includePrintScript
    ? `<script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 800);
    });
  </script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Timesheet – ${esc(employee.full_name)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #111; background: #fff; }

    .page { max-width: 750px; margin: 0 auto; padding: 28px 24px; }

    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #1e3a5f; padding-bottom: 14px; margin-bottom: 20px; }
    .co-name { font-size: 20px; font-weight: 900; color: #1e3a5f; letter-spacing: 1px; }
    .co-tag  { font-size: 10px; color: #6b7280; margin-top: 3px; }
    .doc-title { text-align: right; }
    .doc-name  { font-size: 15px; font-weight: 800; color: #1e3a5f; text-transform: uppercase; letter-spacing: 2px; }
    .ref-line  { font-size: 10px; color: #9ca3af; margin-top: 3px; }

    /* Info grid */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #d1d5db; margin-bottom: 20px; }
    .info-col  { padding: 10px 14px; }
    .info-col:first-child { border-right: 1px solid #d1d5db; }
    .info-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    .info-row   { display: flex; gap: 6px; margin-bottom: 4px; line-height: 1.5; }
    .info-label { font-size: 10px; color: #6b7280; min-width: 90px; flex-shrink: 0; }
    .info-value { font-size: 11px; font-weight: 600; color: #111; }

    /* Section label */
    .section-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; margin-bottom: 6px; }

    /* Table */
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px; }
    th { background: #1e3a5f; color: #fff; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; }
    th.right { text-align: right; }
    td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; }
    td.right { text-align: right; }
    td.bold { font-weight: 600; }
    td.muted { color: #6b7280; }
    td.italic { font-style: italic; color: #6b7280; font-size: 10px; }
    td.navy { color: #1e3a5f; font-size: 12px; }
    td.indent { padding-left: 20px; white-space: nowrap; }
    tr.even td { background: #fff; }
    tr.odd  td { background: #f8fafc; }

    /* Week header */
    tr.week-header td { background: #e8edf5; border-top: 2px solid #1e3a5f; border-bottom: 1px solid #c7d2e8; font-weight: 800; font-size: 10px; color: #1e3a5f; letter-spacing: 0.5px; padding: 6px 10px; }
    .week-total { float: right; font-weight: 700; color: #374151; }

    /* Subtotal */
    tr.subtotal-row td { background: #f1f5fb; border-top: 1px solid #c7d2e8; }

    /* Grand total */
    tr.grand-total td { background: #1e3a5f; color: #fff; font-weight: 800; font-size: 12px; padding: 9px 10px; }
    tr.grand-total td.right { text-align: right; }

    /* Summary */
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #d1d5db; margin-bottom: 20px; }
    .summary-col  { padding: 10px 14px; }
    .summary-col:first-child { border-right: 1px solid #d1d5db; }
    .proj-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dotted #e5e7eb; font-size: 11px; }
    .total-box { margin-top: 8px; padding: 8px 10px; background: #1e3a5f; color: #fff; display: flex; justify-content: space-between; font-weight: 800; font-size: 13px; border-radius: 4px; }
    .stat-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dotted #e5e7eb; font-size: 11px; }
    .green { color: #16a34a; }
    .blue  { color: #2563eb; }

    /* Declaration */
    .declaration { border: 1px solid #d1d5db; padding: 8px 14px; margin-bottom: 20px; font-size: 10px; color: #6b7280; line-height: 1.6; background: #f9fafb; }

    /* Signatures */
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .sig-box  { border-top: 1px solid #374151; padding-top: 6px; }
    .sig-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 2px; }
    .sig-name  { font-size: 11px; font-weight: 700; color: #111; margin-bottom: 1px; }
    .sig-sub   { font-size: 10px; color: #9ca3af; }
    .sig-line  { margin-top: 28px; border-bottom: 1px solid #9ca3af; }
    .sig-date  { font-size: 10px; color: #9ca3af; margin-top: 4px; }

    /* Footer */
    .footer { border-top: 1px solid #e5e7eb; padding-top: 10px; display: flex; justify-content: space-between; font-size: 9px; color: #9ca3af; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
  ${printScript}
</head>
<body>
<div class="page">

  <!-- Letterhead -->
  <div class="header">
    <div>
      <div class="co-name">iTAP Technologies</div>
      <div class="co-tag">Human Resources · Workforce Management</div>
    </div>
    <div class="doc-title">
      <div class="doc-name">Timesheet Report</div>
      <div class="ref-line">Ref: ${esc(refNo)}</div>
      <div class="ref-line">Generated: ${esc(generatedAt)}</div>
    </div>
  </div>

  <!-- Employee + Period -->
  <div class="info-grid">
    <div class="info-col">
      <div class="info-title">Employee Information</div>
      <div class="info-row"><span class="info-label">Full Name</span><span class="info-value">${esc(employee.full_name)}</span></div>
      <div class="info-row"><span class="info-label">Designation</span><span class="info-value">${esc(employee.designation ?? '—')}</span></div>
      <div class="info-row"><span class="info-label">Department</span><span class="info-value">${esc(employee.deptName)}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-value">${esc(employee.email ?? '—')}</span></div>
    </div>
    <div class="info-col">
      <div class="info-title">Report Period</div>
      <div class="info-row"><span class="info-label">From</span><span class="info-value">${esc(fmtLong(from))}</span></div>
      <div class="info-row"><span class="info-label">To</span><span class="info-value">${esc(fmtLong(to))}</span></div>
      <div class="info-row"><span class="info-label">Total Entries</span><span class="info-value">${entries.length}</span></div>
      <div class="info-row"><span class="info-label">Reporting To</span><span class="info-value">${esc(manager?.full_name ?? '—')}</span></div>
    </div>
  </div>

  <!-- Weekly table -->
  <div class="section-label">Weekly Timesheet</div>
  ${entries.length === 0
    ? `<div style="border:1px solid #e5e7eb;border-radius:6px;padding:24px;text-align:center;color:#9ca3af;margin-bottom:20px;">No entries recorded for this period.</div>`
    : `<table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Project / Task</th>
            <th style="width:26%">Notes</th>
            <th class="right" style="width:58px">Hours</th>
            <th class="right" style="width:72px">Cumulative</th>
            <th style="width:78px">Status</th>
          </tr>
        </thead>
        <tbody>
          ${weekRows}
        </tbody>
        <tfoot>
          <tr class="grand-total">
            <td colspan="3" class="right">GRAND TOTAL</td>
            <td class="right">${totalHours.toFixed(1)}</td>
            <td class="right">${totalHours.toFixed(1)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>`}

  <!-- Summary -->
  <div class="summary-grid">
    <div class="summary-col">
      <div class="info-title">Hours by Project</div>
      ${projectRows}
      <div class="total-box"><span>Grand Total</span><span>${totalHours.toFixed(1)} h</span></div>
    </div>
    <div class="summary-col">
      <div class="info-title">Summary</div>
      <div class="stat-row"><span>Total Hours Logged</span><span class="bold">${totalHours.toFixed(1)} h</span></div>
      <div class="stat-row"><span>Hours Approved</span><span class="bold green">${approvedHours.toFixed(1)} h</span></div>
      <div class="stat-row"><span>Hours Pending</span><span class="bold blue">${(totalHours - approvedHours).toFixed(1)} h</span></div>
      <div class="stat-row"><span>Projects Worked</span><span class="bold">${byProject.size}</span></div>
      <div class="stat-row"><span>Total Entries</span><span class="bold">${entries.length}</span></div>
    </div>
  </div>

  <!-- Declaration -->
  <div class="declaration">
    <strong style="color:#374151">Declaration:</strong> I hereby certify that the hours reported above are true and accurate to the best of my knowledge,
    and that the work described was performed during the stated period in accordance with company policies.
  </div>

  <!-- Signatures -->
  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-label">Employee</div>
      <div class="sig-name">${esc(employee.full_name)}</div>
      <div class="sig-sub">${esc(employee.designation ?? '')}</div>
      <div class="sig-line"></div>
      <div class="sig-date">Signature &amp; Date</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">Reviewed by (Manager)</div>
      <div class="sig-name">${esc(manager?.full_name ?? '—')}</div>
      <div class="sig-sub">${esc(manager?.designation ?? '')}</div>
      <div class="sig-line"></div>
      <div class="sig-date">Signature &amp; Date</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">Approved by (HR)</div>
      <div class="sig-name">&nbsp;</div>
      <div class="sig-sub">&nbsp;</div>
      <div class="sig-line"></div>
      <div class="sig-date">Signature &amp; Date</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>iTAP Technologies · Confidential HR Document</span>
    <span>Ref: ${esc(refNo)}</span>
    <span>Page 1 of 1</span>
  </div>

</div>
</body>
</html>`;
}
