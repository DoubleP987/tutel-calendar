import nodemailer from 'nodemailer';

/** Optional SMTP transport. An invitation is usable even before mail is configured. */
export async function sendInvitationEmail(invitation, groupName) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return { status: 'not-configured' };
  const port = Number(process.env.SMTP_PORT || 465);
  if (![465, 587].includes(port)) return { status: 'invalid-configuration' };
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  try {
    const expires = new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Asia/Bangkok',
    }).format(new Date(invitation.expiresAt));
    const result = await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: invitation.email,
      subject: `คำเชิญเข้ากลุ่ม ${groupName} · Tutel Calendar`,
      text: `คุณได้รับคำเชิญเข้ากลุ่ม ${groupName}\n\n${invitation.url}\n\nเข้าสู่ระบบด้วย Google หรือ Discord ที่ยืนยันอีเมลตรงกับคำเชิญ\nคำเชิญหมดอายุ ${expires} (เวลาไทย)\nหากคุณไม่รู้จักกลุ่มนี้หรือไม่ต้องการเข้าร่วม สามารถละเว้นอีเมลนี้ได้`,
    });
    if (!result.accepted?.length) return { status: 'failed', reason: 'recipient-rejected' };
    return { status: 'sent' };
  } catch (error) {
    const reason = error.responseCode
      ? `smtp-${error.responseCode}`
      : ['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EENVELOPE'].includes(error.code)
        ? error.code
        : 'smtp-error';
    console.warn('[invitation-email]', reason);
    return { status: 'failed', reason };
  } finally {
    transport.close();
  }
}
