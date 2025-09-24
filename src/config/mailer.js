// config/mailer.js
const nodemailer = require('nodemailer');
const env = require('./env');

let transporter = null;

function getTransport() {
  if (!env.MAIL_ENABLED) {
    return {
      sendMail: async (opts) => {
        // тихо логируем, чтобы dev/тесты не падали
        if (process.env.NODE_ENV !== 'test') {
          console.log('[MAIL disabled] Would send:', { to: opts.to, subject: opts.subject });
        }
        return { messageId: 'disabled' };
      }
    };
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: (env.SMTP_USER && env.SMTP_PASS) ? {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      } : undefined,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, html, text, from }) {
  const t = getTransport();
  return t.sendMail({
    from: from || env.FROM_EMAIL,
    to, subject, html, text,
  });
}

module.exports = { sendMail };
