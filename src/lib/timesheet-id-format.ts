// Short human-readable form for display (emails, UI) — mirrors the
// TS-XXXXXXXX short_id pattern already used for timesheet_approvals, with a
// distinct prefix since it identifies a different entity (the period itself,
// not an approval record). Pure formatting only, no server-only imports —
// safe to use from client components, unlike lib/timesheets.ts which pulls
// in the service-role Supabase client.
export function shortTimesheetId(id: string): string {
  return 'TSH-' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
}
