import sgMail from "@sendgrid/mail";
import { childLogger, errContext } from "../lib/logger.js";

const log = childLogger('email');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  log.info({ from: process.env.SENDGRID_FROM_EMAIL }, 'email: SendGrid configured');
} else {
  log.warn('email: SENDGRID_API_KEY missing — emails will be logged, not sent');
}

function from() {
  return {
    email: process.env.SENDGRID_FROM_EMAIL,
    name: process.env.SENDGRID_FROM_NAME || "Protokol Lab",
  };
}

async function send({ to, subject, html, text, template }) {
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    log.warn({ to, template, subject, textPreview: text?.slice(0, 200) }, 'email: not configured — would have sent');
    return;
  }
  const t0 = Date.now();
  try {
    const [resp] = await sgMail.send({ to, from: from(), subject, html, text });
    log.info(
      {
        to, template, subject,
        sgStatus: resp?.statusCode,
        sgMessageId: resp?.headers?.['x-message-id'],
        durationMs: Date.now() - t0,
      },
      'email: sent',
    );
  } catch (err) {
    log.error(
      { ...errContext(err), to, template, subject, sgBody: err?.response?.body },
      'email: send failed',
    );
    throw err;
  }
}

export async function sendPasswordResetEmail(to, resetUrl) {
  const subject = "Reset your Protokol Lab password";
  const text = `We received a request to reset your password.

Open this link to choose a new password (valid for 2 hours):
${resetUrl}

If you didn't request this, you can ignore this email.`;
  const html = `<!doctype html>
<html>
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f7;padding:24px;margin:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e5ea;">
      <tr><td style="padding:32px 28px;">
        <h1 style="font-size:20px;margin:0 0 12px;color:#111;">Reset your password</h1>
        <p style="font-size:15px;color:#333;line-height:1.5;margin:0 0 20px;">
          We received a request to reset the password for your Protokol Lab account.
          Click the button below to choose a new password. The link is valid for 2 hours.
        </p>
        <p style="margin:0 0 24px;">
          <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500;font-size:15px;">Reset password</a>
        </p>
        <p style="font-size:13px;color:#666;line-height:1.5;margin:0 0 8px;">
          Or copy this URL into your browser:
        </p>
        <p style="font-size:13px;color:#4f46e5;word-break:break-all;margin:0 0 20px;">
          ${resetUrl}
        </p>
        <p style="font-size:13px;color:#888;margin:0;">
          If you didn't request this, you can ignore this email.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;
  await send({ to, subject, html, text, template: 'password-reset' });
}

// ---------------------------------------------------------------------------
// Support email helpers
// ---------------------------------------------------------------------------

function supportTicketUrl(ticketId, { admin = false } = {}) {
  const base = process.env.APP_URL || '';
  return `${base}${admin ? '/admin/support/tickets/' : '/support/tickets/'}${ticketId}`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emailShell(innerHtml) {
  return `<!doctype html>
<html>
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f7;padding:24px;margin:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e5ea;">
      <tr><td style="padding:32px 28px;">
        ${innerHtml}
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendTicketCreatedUserEmail(to, ticket) {
  const subject = `[Support #${String(ticket._id).slice(-6)}] We got your ticket`;
  const url = supportTicketUrl(ticket._id);
  const text = `We received your support ticket: "${ticket.subject}"

We'll reply as soon as we can. You can track status here:
${url}`;
  const html = emailShell(`
    <h1 style="font-size:20px;margin:0 0 12px;color:#111;">We got your ticket</h1>
    <p style="font-size:15px;color:#333;line-height:1.5;margin:0 0 16px;">
      Thanks for reaching out. We received your support ticket and will reply soon.
    </p>
    <p style="font-size:14px;color:#555;margin:0 0 16px;">
      <strong>${escapeHtml(ticket.subject)}</strong>
    </p>
    <p style="margin:0 0 20px;"><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500;font-size:15px;">View ticket</a></p>
  `);
  await send({ to, subject, html, text, template: 'ticket-created' });
}

export async function sendTicketAdminNotifyEmail(ticket) {
  const adminEmail = process.env.SUPPORT_ADMIN_EMAIL;
  if (!adminEmail) {
    log.warn({ ticketId: String(ticket._id) }, 'ticket-admin-notify: SUPPORT_ADMIN_EMAIL not set');
    return;
  }
  const subject = `[Support] New ticket from ${ticket.userEmail}: ${ticket.subject}`;
  const url = supportTicketUrl(ticket._id, { admin: true });
  const text = `New ticket from ${ticket.userEmail}

Subject: ${ticket.subject}

${ticket.description}

Open: ${url}`;
  const html = emailShell(`
    <h1 style="font-size:18px;margin:0 0 12px;color:#111;">New support ticket</h1>
    <p style="font-size:13px;color:#666;margin:0 0 4px;">From</p>
    <p style="font-size:14px;color:#111;margin:0 0 12px;"><strong>${escapeHtml(ticket.userEmail)}</strong></p>
    <p style="font-size:13px;color:#666;margin:0 0 4px;">Subject</p>
    <p style="font-size:14px;color:#111;margin:0 0 12px;">${escapeHtml(ticket.subject)}</p>
    <p style="font-size:13px;color:#666;margin:0 0 4px;">Description</p>
    <p style="font-size:14px;color:#333;line-height:1.5;white-space:pre-wrap;margin:0 0 20px;">${escapeHtml(ticket.description)}</p>
    <p style="margin:0 0 20px;"><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:500;font-size:14px;">Open in admin</a></p>
  `);
  await send({ to: adminEmail, subject, html, text, template: 'ticket-admin-notify' });
}

export async function sendTicketStatusChangedEmail(to, ticket, prevStatus) {
  const subject = `[Support #${String(ticket._id).slice(-6)}] Status: ${ticket.status}`;
  const url = supportTicketUrl(ticket._id);
  const text = `Your support ticket "${ticket.subject}" changed status from ${prevStatus} to ${ticket.status}.

${url}`;
  const html = emailShell(`
    <h1 style="font-size:20px;margin:0 0 12px;color:#111;">Ticket status updated</h1>
    <p style="font-size:15px;color:#333;line-height:1.5;margin:0 0 16px;">
      Your ticket <strong>${escapeHtml(ticket.subject)}</strong> moved from
      <strong>${escapeHtml(prevStatus)}</strong> to <strong>${escapeHtml(ticket.status)}</strong>.
    </p>
    <p style="margin:0 0 20px;"><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500;font-size:15px;">View ticket</a></p>
  `);
  await send({ to, subject, html, text, template: 'ticket-status-changed' });
}

export async function sendTicketReplyEmail(to, ticket, message) {
  const subject = `[Support #${String(ticket._id).slice(-6)}] New reply: ${ticket.subject}`;
  const url = supportTicketUrl(ticket._id);
  const text = `A support agent replied to your ticket "${ticket.subject}":

${message.body}

Reply here: ${url}`;
  const html = emailShell(`
    <h1 style="font-size:20px;margin:0 0 12px;color:#111;">New reply on your ticket</h1>
    <p style="font-size:14px;color:#555;margin:0 0 8px;">Re: <strong>${escapeHtml(ticket.subject)}</strong></p>
    <div style="font-size:15px;color:#333;line-height:1.5;white-space:pre-wrap;background:#f5f5f7;border:1px solid #e5e5ea;border-radius:8px;padding:14px 16px;margin:0 0 20px;">${escapeHtml(message.body)}</div>
    <p style="margin:0 0 20px;"><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500;font-size:15px;">Reply</a></p>
  `);
  await send({ to, subject, html, text, template: 'ticket-reply' });
}

export async function sendWelcomeEmail(to) {
  const subject = "Welcome to Protokol Lab";
  const appUrl = process.env.APP_URL || "";
  const text = `Welcome to Protokol Lab.

Your account is ready. Sign in anytime at ${appUrl}`;
  const html = `<!doctype html>
<html>
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f7;padding:24px;margin:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e5ea;">
      <tr><td style="padding:32px 28px;">
        <h1 style="font-size:20px;margin:0 0 12px;color:#111;">Welcome to Protokol Lab</h1>
        <p style="font-size:15px;color:#333;line-height:1.5;margin:0 0 20px;">
          Your account is ready. Start tracking your nutrition and weight whenever you're ready.
        </p>
        ${appUrl ? `<p style="margin:0 0 20px;"><a href="${appUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500;font-size:15px;">Open Protokol Lab</a></p>` : ""}
      </td></tr>
    </table>
  </body>
</html>`;
  await send({ to, subject, html, text, template: 'welcome' });
}
