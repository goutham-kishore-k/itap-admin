import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
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

  const data = await buildTimesheetReportData(supabase, { empId, from, to });
  if (!data) return new NextResponse('Employee not found or access denied.', { status: 403 });

  const html = renderTimesheetReportHtml(data, { includePrintScript: true });

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
