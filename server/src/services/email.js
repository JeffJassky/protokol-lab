import sgMail from '@sendgrid/mail';

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

function from() {
  return {
    email: process.env.SENDGRID_FROM_EMAIL,
    name: process.env.SENDGRID_FROM_NAME || 'Vitality Tracker',
  };
}

async function send({ to, subject, html, text }) {
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    console.warn('[email] SendGrid not configured, skipping send to', to);
    console.warn('[email] subject:', subject);
    console.warn('[email] text:\n', text);
    return;
  }
  try {
    await sgMail.send({ to, from: from(), subject, html, text });
  } catch (err) {
    console.error('[email] send failed:', err?.response?.body || err.message);
    throw err;
  }
}

export async function sendPasswordResetEmail(to, resetUrl) {
  const subject = 'Reset your Vitality Tracker password';
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
          We received a request to reset the password for your Vitality Tracker account.
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
  await send({ to, subject, html, text });
}

export async function sendWelcomeEmail(to) {
  const subject = 'Welcome to Vitality Tracker';
  const appUrl = process.env.APP_URL || '';
  const text = `Welcome to Vitality Tracker.

Your account is ready. Sign in anytime at ${appUrl}`;
  const html = `<!doctype html>
<html>
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f7;padding:24px;margin:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e5ea;">
      <tr><td style="padding:32px 28px;">
        <h1 style="font-size:20px;margin:0 0 12px;color:#111;">Welcome to Vitality Tracker</h1>
        <p style="font-size:15px;color:#333;line-height:1.5;margin:0 0 20px;">
          Your account is ready. Start tracking your nutrition and weight whenever you're ready.
        </p>
        ${appUrl ? `<p style="margin:0 0 20px;"><a href="${appUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500;font-size:15px;">Open Vitality Tracker</a></p>` : ''}
      </td></tr>
    </table>
  </body>
</html>`;
  await send({ to, subject, html, text });
}
