import { createClient } from '@/lib/supabase-server';
import PrintTrigger from './PrintTrigger';

interface PageProps {
  searchParams: Promise<{ empId?: string; from?: string; to?: string }>;
}

function fmtLong(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function fmtShort(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDay(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// Returns Monday of the week containing the given date string (YYYY-MM-DD)
function weekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function weekEnd(startStr: string): string {
  const d = new Date(startStr + 'T12:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
}

interface Entry { date: string; project: string; hours: number; notes: string | null; status: string; }

function groupByWeek(entries: Entry[]): { weekKey: string; weekStartStr: string; weekEndStr: string; rows: Entry[] }[] {
  const map = new Map<string, Entry[]>();
  entries.forEach(e => {
    const key = weekStart(e.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => ({ weekKey: key, weekStartStr: key, weekEndStr: weekEnd(key), rows }));
}

const STATUS_LABEL: Record<string, string> = {
  approved:  'Approved',
  submitted: 'Submitted',
  rejected:  'Rejected',
  draft:     'Draft',
};

export default async function TimesheetReportPage({ searchParams }: PageProps) {
  const { empId, from, to } = await searchParams;

  if (!empId || !from || !to) {
    return <div style={{ padding: 40, color: '#6b7280', fontFamily: 'sans-serif' }}>Missing parameters. Close this tab and try again.</div>;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: manager } = user
    ? await supabase.from('employees').select('id, full_name, designation').eq('user_id', user.id).maybeSingle()
    : { data: null };

  const [{ data: employee }, { data: rawEntries }] = await Promise.all([
    supabase.from('employees')
      .select('id, full_name, designation, email, departments(name), manager:manager_id(full_name)')
      .eq('id', empId).maybeSingle(),
    supabase.from('timesheet_entries')
      .select('date, project, hours, notes, status')
      .eq('employee_id', empId)
      .gte('date', from).lte('date', to)
      .order('date').order('created_at'),
  ]);

  if (!employee) {
    return <div style={{ padding: 40, color: '#6b7280', fontFamily: 'sans-serif' }}>Employee not found or access denied.</div>;
  }

  const entries: Entry[] = (rawEntries ?? []).map(e => ({
    date:    e.date,
    project: e.project,
    hours:   Number(e.hours),
    notes:   e.notes ?? null,
    status:  e.status,
  }));

  const totalHours    = entries.reduce((s, e) => s + e.hours, 0);
  const approvedHours = entries.filter(e => e.status === 'approved').reduce((s, e) => s + e.hours, 0);
  const weeks         = groupByWeek(entries);

  const byProject = new Map<string, number>();
  entries.forEach(e => byProject.set(e.project, (byProject.get(e.project) ?? 0) + e.hours));

  const deptName = (employee.departments as unknown as { name: string } | null)?.name ?? '—';
  const generatedAt = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const refNo = `TS-${empId.replace(/-/g, '').slice(0, 6).toUpperCase()}-${from.replace(/-/g, '')}`;

  const S: Record<string, React.CSSProperties> = {
    page:        { fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 11, color: '#111', background: '#fff', maxWidth: 780, margin: '0 auto', padding: '28px 32px' },
    // Header
    header:      { borderBottom: '3px solid #1e3a5f', paddingBottom: 14, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
    companyName: { fontSize: 20, fontWeight: 900, color: '#1e3a5f', letterSpacing: 1 },
    companyTag:  { fontSize: 10, color: '#6b7280', marginTop: 2, letterSpacing: 0.5 },
    docTitle:    { textAlign: 'right' as const },
    docName:     { fontSize: 15, fontWeight: 800, color: '#1e3a5f', textTransform: 'uppercase' as const, letterSpacing: 2 },
    refLine:     { fontSize: 10, color: '#9ca3af', marginTop: 3 },
    // Info grid
    infoGrid:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: '1px solid #d1d5db', marginBottom: 20 },
    infoSection: { padding: '10px 14px' },
    infoTitle:   { fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1.5, color: '#6b7280', marginBottom: 8, borderBottom: '1px solid #e5e7eb', paddingBottom: 4 },
    infoRow:     { display: 'flex', gap: 6, marginBottom: 4, lineHeight: 1.5 },
    infoLabel:   { fontSize: 10, color: '#6b7280', minWidth: 90, flexShrink: 0 },
    infoValue:   { fontSize: 11, fontWeight: 600, color: '#111' },
    divider:     { borderRight: '1px solid #d1d5db' },
    // Table
    table:       { width: '100%', borderCollapse: 'collapse' as const, marginBottom: 20, fontSize: 11 },
    th:          { background: '#1e3a5f', color: '#fff', padding: '8px 10px', textAlign: 'left' as const, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8 },
    thRight:     { background: '#1e3a5f', color: '#fff', padding: '8px 10px', textAlign: 'right' as const, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8 },
    tdEven:      { padding: '7px 10px', borderBottom: '1px solid #f3f4f6', background: '#fff' },
    tdOdd:       { padding: '7px 10px', borderBottom: '1px solid #f3f4f6', background: '#f8fafc' },
    tdRight:     { textAlign: 'right' as const },
    totalRow:    { background: '#1e3a5f', color: '#fff' },
    totalCell:   { padding: '9px 10px', fontWeight: 800, fontSize: 12 },
    // Summary
    summaryGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: '1px solid #d1d5db', marginBottom: 20 },
    summaryLeft: { padding: '10px 14px', borderRight: '1px solid #d1d5db' },
    summaryRight:{ padding: '10px 14px' },
    summaryTitle:{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1.5, color: '#6b7280', marginBottom: 8, borderBottom: '1px solid #e5e7eb', paddingBottom: 4 },
    projRow:     { display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dotted #e5e7eb', fontSize: 11 },
    totalBox:    { marginTop: 8, padding: '8px 10px', background: '#1e3a5f', color: '#fff', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 13, borderRadius: 4 },
    // Signatures
    sigGrid:     { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 },
    sigBox:      { borderTop: '1px solid #374151', paddingTop: 6 },
    sigLabel:    { fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, color: '#6b7280', marginBottom: 2 },
    sigName:     { fontSize: 11, fontWeight: 700, color: '#111', marginBottom: 1 },
    sigSub:      { fontSize: 10, color: '#9ca3af' },
    sigLine:     { marginTop: 28, borderBottom: '1px solid #9ca3af' },
    sigDate:     { fontSize: 10, color: '#9ca3af', marginTop: 4 },
    // Footer
    footer:      { borderTop: '1px solid #e5e7eb', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9ca3af' },
  };

  return (
    <>
      <PrintTrigger />
      <div style={S.page}>

        {/* ── Letterhead ── */}
        <div style={S.header}>
          <div>
            <div style={S.companyName}>iTAP Technologies</div>
            <div style={S.companyTag}>Human Resources · Workforce Management</div>
          </div>
          <div style={S.docTitle}>
            <div style={S.docName}>Timesheet Report</div>
            <div style={S.refLine}>Ref: {refNo}</div>
            <div style={S.refLine}>Generated: {generatedAt}</div>
          </div>
        </div>

        {/* ── Employee + Period info ── */}
        <div style={S.infoGrid}>
          <div style={{ ...S.infoSection, ...S.divider }}>
            <div style={S.infoTitle}>Employee Information</div>
            <div style={S.infoRow}><span style={S.infoLabel}>Full Name</span><span style={S.infoValue}>{employee.full_name}</span></div>
            <div style={S.infoRow}><span style={S.infoLabel}>Designation</span><span style={S.infoValue}>{employee.designation ?? '—'}</span></div>
            <div style={S.infoRow}><span style={S.infoLabel}>Department</span><span style={S.infoValue}>{deptName}</span></div>
            <div style={S.infoRow}><span style={S.infoLabel}>Email</span><span style={S.infoValue}>{employee.email ?? '—'}</span></div>
          </div>
          <div style={S.infoSection}>
            <div style={S.infoTitle}>Report Period</div>
            <div style={S.infoRow}><span style={S.infoLabel}>From</span><span style={S.infoValue}>{fmtLong(from)}</span></div>
            <div style={S.infoRow}><span style={S.infoLabel}>To</span><span style={S.infoValue}>{fmtLong(to)}</span></div>
            <div style={S.infoRow}><span style={S.infoLabel}>Total Entries</span><span style={S.infoValue}>{entries.length}</span></div>
            <div style={S.infoRow}><span style={S.infoLabel}>Reporting To</span><span style={S.infoValue}>{manager?.full_name ?? '—'}</span></div>
          </div>
        </div>

        {/* ── Weekly timesheet table ── */}
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#6b7280', marginBottom: 6 }}>
          Weekly Timesheet
        </div>
        {entries.length === 0 ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '24px', textAlign: 'center', color: '#9ca3af', marginBottom: 20 }}>
            No entries recorded for this period.
          </div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Date</th>
                <th style={S.th}>Project / Task</th>
                <th style={{ ...S.th, width: '28%' }}>Notes</th>
                <th style={{ ...S.thRight, width: 64 }}>Hours</th>
                <th style={{ ...S.th, width: 80 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, wi) => {
                const weekHours = week.rows.reduce((s, e) => s + e.hours, 0);
                return (
                  <>
                    {/* Week header row */}
                    <tr key={`wh-${wi}`}>
                      <td colSpan={5} style={{
                        padding: '6px 10px',
                        background: '#e8edf5',
                        borderTop: wi > 0 ? '2px solid #1e3a5f' : undefined,
                        borderBottom: '1px solid #c7d2e8',
                        fontWeight: 800,
                        fontSize: 10,
                        color: '#1e3a5f',
                        letterSpacing: 0.5,
                      }}>
                        Week {wi + 1} &nbsp;·&nbsp; {fmtShort(week.weekStartStr)} – {fmtShort(week.weekEndStr)}
                        <span style={{ float: 'right', fontWeight: 700, color: '#374151' }}>
                          {weekHours.toFixed(1)} h this week
                        </span>
                      </td>
                    </tr>

                    {/* Daily entries within this week */}
                    {week.rows.map((e, ri) => {
                      const td = ri % 2 === 0 ? S.tdEven : S.tdOdd;
                      return (
                        <tr key={`${wi}-${ri}`}>
                          <td style={{ ...td, whiteSpace: 'nowrap', paddingLeft: 20 }}>{fmtDay(e.date)}</td>
                          <td style={{ ...td, fontWeight: 600 }}>{e.project}</td>
                          <td style={{ ...td, color: '#6b7280' }}>{e.notes || '—'}</td>
                          <td style={{ ...td, ...S.tdRight, fontWeight: 700 }}>{e.hours.toFixed(1)}</td>
                          <td style={td}>{STATUS_LABEL[e.status] ?? e.status}</td>
                        </tr>
                      );
                    })}

                    {/* Week subtotal */}
                    <tr key={`ws-${wi}`}>
                      <td colSpan={3} style={{ padding: '5px 10px', background: '#f1f5fb', borderTop: '1px solid #c7d2e8', fontSize: 10, color: '#6b7280', textAlign: 'right', fontStyle: 'italic' }}>
                        Week {wi + 1} subtotal
                      </td>
                      <td style={{ padding: '5px 10px', background: '#f1f5fb', borderTop: '1px solid #c7d2e8', textAlign: 'right', fontWeight: 800, color: '#1e3a5f', fontSize: 12 }}>
                        {weekHours.toFixed(1)}
                      </td>
                      <td style={{ padding: '5px 10px', background: '#f1f5fb', borderTop: '1px solid #c7d2e8' }} />
                    </tr>
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={S.totalRow}>
                <td colSpan={3} style={{ ...S.totalCell, textAlign: 'right' }}>GRAND TOTAL</td>
                <td style={{ ...S.totalCell, textAlign: 'right' }}>{totalHours.toFixed(1)}</td>
                <td style={S.totalCell} />
              </tr>
            </tfoot>
          </table>
        )}

        {/* ── Summary ── */}
        <div style={S.summaryGrid}>
          <div style={S.summaryLeft}>
            <div style={S.summaryTitle}>Hours by Project</div>
            {Array.from(byProject.entries()).sort((a, b) => b[1] - a[1]).map(([proj, hrs]) => (
              <div key={proj} style={S.projRow}>
                <span style={{ color: '#374151' }}>{proj}</span>
                <span style={{ fontWeight: 700 }}>{hrs.toFixed(1)} h</span>
              </div>
            ))}
            <div style={S.totalBox}>
              <span>Grand Total</span>
              <span>{totalHours.toFixed(1)} h</span>
            </div>
          </div>
          <div style={S.summaryRight}>
            <div style={S.summaryTitle}>Summary</div>
            <div style={S.projRow}><span style={{ color: '#374151' }}>Total Hours Logged</span><span style={{ fontWeight: 700 }}>{totalHours.toFixed(1)} h</span></div>
            <div style={S.projRow}><span style={{ color: '#374151' }}>Hours Approved</span><span style={{ fontWeight: 700, color: '#16a34a' }}>{approvedHours.toFixed(1)} h</span></div>
            <div style={S.projRow}><span style={{ color: '#374151' }}>Hours Pending</span><span style={{ fontWeight: 700, color: '#2563eb' }}>{(totalHours - approvedHours).toFixed(1)} h</span></div>
            <div style={S.projRow}><span style={{ color: '#374151' }}>Projects Worked</span><span style={{ fontWeight: 700 }}>{byProject.size}</span></div>
            <div style={S.projRow}><span style={{ color: '#374151' }}>Total Entries</span><span style={{ fontWeight: 700 }}>{entries.length}</span></div>
          </div>
        </div>

        {/* ── Declarations ── */}
        <div style={{ border: '1px solid #d1d5db', padding: '8px 14px', marginBottom: 20, fontSize: 10, color: '#6b7280', lineHeight: 1.6, background: '#f9fafb' }}>
          <strong style={{ color: '#374151' }}>Declaration:</strong> I hereby certify that the hours reported above are true and accurate to the best of my knowledge,
          and that the work described was performed during the stated period in accordance with company policies.
        </div>

        {/* ── Signatures ── */}
        <div style={S.sigGrid}>
          <div style={S.sigBox}>
            <div style={S.sigLabel}>Employee</div>
            <div style={S.sigName}>{employee.full_name}</div>
            <div style={S.sigSub}>{employee.designation ?? ''}</div>
            <div style={S.sigLine} />
            <div style={S.sigDate}>Signature &amp; Date</div>
          </div>
          <div style={S.sigBox}>
            <div style={S.sigLabel}>Reviewed by (Manager)</div>
            <div style={S.sigName}>{manager?.full_name ?? '—'}</div>
            <div style={S.sigSub}>{manager?.designation ?? ''}</div>
            <div style={S.sigLine} />
            <div style={S.sigDate}>Signature &amp; Date</div>
          </div>
          <div style={S.sigBox}>
            <div style={S.sigLabel}>Approved by (HR)</div>
            <div style={S.sigName}>&nbsp;</div>
            <div style={S.sigSub}>&nbsp;</div>
            <div style={S.sigLine} />
            <div style={S.sigDate}>Signature &amp; Date</div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={S.footer}>
          <span>iTAP Technologies · Confidential HR Document</span>
          <span>Ref: {refNo}</span>
          <span>Page 1 of 1</span>
        </div>

      </div>
    </>
  );
}
