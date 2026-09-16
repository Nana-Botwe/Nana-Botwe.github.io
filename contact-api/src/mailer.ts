import nodemailer from 'nodemailer';
import { config } from './config';

export interface Mail {
  subject: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  const { to, from, dryRun, smtp } = config.mail;

  if (dryRun) {
    console.log(`[dry run] To: ${to}\n[dry run] Subject: ${mail.subject}\n\n${mail.text}`);
    return;
  }
  if (!smtp.host) {
    throw new Error('SMTP_HOST is not set. Configure SMTP, or set MAIL_DRY_RUN=true to test.');
  }

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined
  });

  await transport.sendMail({ from: from || smtp.user, to, subject: mail.subject, text: mail.text });
}
