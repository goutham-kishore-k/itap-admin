import { createAdminClient } from '@/lib/supabase-admin';
import { sendMail, isEmailEnabled } from '@/lib/mailer';

interface NotificationDetails {
  employeeName: string;
  project: string;
  hours: string;
  period: string;
  status: string;
  timesheetId: string;
}

interface NotifyEmployeeParams {
  employeeId: string;
  type: 'timesheet_approved' | 'timesheet_rejected';
  title: string;
  body: string;
  link?: string;
  details?: NotificationDetails;
}

const COMPANY_NAME  = 'iTAP Technologies';
const COMPANY_ADDRESS = [
  '2711 Lyndon B Johnson Freeway, Suite 1070',
  'Dallas, TX 75234',
];
const COMPANY_EMAIL = 'info@itaptechnologies.com';
const COMPANY_PHONE = '+1 (469) 609-7081';

const DETAIL_ROWS: { key: keyof NotificationDetails; label: string }[] = [
  { key: 'employeeName', label: 'Employee' },
  { key: 'project',      label: 'Project' },
  { key: 'hours',        label: 'Hours' },
  { key: 'period',       label: 'Work period' },
  { key: 'status',       label: 'Status' },
  { key: 'timesheetId',  label: 'Timesheet ID' },
];

// Always writes the in-app alert; additionally emails the employee when
// EMAIL_NOTIFICATIONS_ENABLED=true and SMTP is configured (see mailer.ts).
export async function notifyEmployee({ employeeId, type, title, body, link, details }: NotifyEmployeeParams): Promise<void> {
  const admin = createAdminClient();

  await admin.from('notifications').insert({
    employee_id: employeeId,
    type,
    title,
    body,
    link: link ?? null,
  });

  if (!isEmailEnabled()) return;

  const { data: employee } = await admin
    .from('employees')
    .select('email, full_name')
    .eq('id', employeeId)
    .single();
  if (!employee?.email) return;

  const appUrl   = (process.env.APP_URL ?? '').replace(/\/$/, '');
  const firstName = employee.full_name?.split(' ')[0] || 'there';
  const linkLine  = link ? `${appUrl}${link}` : null;

  const labelWidth = Math.max(...DETAIL_ROWS.map(r => r.label.length)) + 2;
  const detailsTextLines = details
    ? ['', ...DETAIL_ROWS.map(r => `${(r.label + ':').padEnd(labelWidth)}${details[r.key]}`)]
    : [];

  const text = [
    `Hi ${firstName},`,
    '',
    body,
    ...detailsTextLines,
    ...(linkLine ? ['', `View timesheet: ${linkLine}`] : []),
    '',
    'Regards,',
    'HR Team',
    COMPANY_NAME,
    '',
    ...COMPANY_ADDRESS,
    `${COMPANY_EMAIL} | ${COMPANY_PHONE}`,
  ].join('\n');

  const detailsHtml = details ? `
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
      ${DETAIL_ROWS.map((r, i) => `
        <tr${i % 2 === 1 ? ' style="background:#FBF7F3;"' : ''}>
          <td style="padding:7px 12px;color:#8A7871;width:130px;">${r.label}</td>
          <td style="padding:7px 12px;color:#2b2b2b;font-weight:${r.key === 'status' ? 600 : 400};">${details[r.key]}</td>
        </tr>`).join('')}
    </table>
  ` : '';

  const html = `
    <p>Hi ${firstName},</p>
    <p>${body}</p>
    ${detailsHtml}
    ${linkLine ? `<p><a href="${linkLine}" style="display:inline-block;padding:9px 16px;background:#B0182B;color:#fff;font-weight:600;font-size:13.5px;text-decoration:none;border-radius:8px;">View timesheet</a></p>` : ''}
    <p>Regards,<br>HR Team<br><strong>${COMPANY_NAME}</strong></p>
    <p style="color:#8A7871;font-size:12px;line-height:1.6;margin-top:20px;">
      ${COMPANY_ADDRESS.join('<br>')}<br>
      ${COMPANY_EMAIL} | ${COMPANY_PHONE}
    </p>
  `.trim();

  await sendMail({ to: employee.email, subject: title, text, html });
}
