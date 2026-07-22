import nodemailer from 'nodemailer';

export function isEmailEnabled(): boolean {
  return process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true';
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error('EMAIL_NOTIFICATIONS_ENABLED is true but SMTP_HOST/SMTP_USER/SMTP_PASSWORD are not set.');
  }
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

// Email is a best-effort side channel alongside the in-app notification — a
// delivery failure (bad SMTP config, provider outage) must never block or
// throw out of the approve/reject flow that triggered it, so errors are
// swallowed here rather than propagated.
export async function sendMail(opts: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  if (!isEmailEnabled()) return;
  try {
    const from = process.env.MAIL_FROM || process.env.SMTP_USER!;
    await getTransporter().sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html });
  } catch (err) {
    console.error('[mailer] failed to send email:', err);
  }
}
