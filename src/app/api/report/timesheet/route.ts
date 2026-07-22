import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { buildTimesheetReportData } from '@/lib/timesheet-report-data';
import { renderTimesheetReportHtml } from '@/lib/timesheet-report-html';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const empId = searchParams.get('empId');
  const from  = searchParams.get('from');
  const to    = searchParams.get('to');

  if (!empId || !from || !to) {
    return new NextResponse('Missing parameters.', { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  // Not under /dashboard or /portal, so the middleware's is_active check
  // never runs for this route — a deactivated employee's still-valid session
  // could otherwise keep generating reports via a bookmarked URL.
  const admin = createAdminClient();
  const { data: caller } = await admin.from('employees').select('is_active').eq('user_id', user.id).maybeSingle();
  if (caller && !caller.is_active) return new NextResponse('Unauthorized', { status: 401 });

  const data = await buildTimesheetReportData(supabase, { empId, from, to });
  if (!data) return new NextResponse('Employee not found or access denied.', { status: 403 });

  const html = renderTimesheetReportHtml(data, { includePrintScript: true });

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
