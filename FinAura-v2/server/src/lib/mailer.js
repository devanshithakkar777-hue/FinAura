import nodemailer from 'nodemailer';

export function createMailer(config, log) {
  const transport = config.SMTP_URL ? nodemailer.createTransport(config.SMTP_URL) : null;
  return {
    async send({ to, subject, text }) {
      if (!transport) {
        // No SMTP configured: log so links are usable in development. Never do this with real secrets in prod logs.
        log.warn({ to, subject, text }, 'SMTP_URL not set — email not sent (logged instead)');
        return { logged: true };
      }
      await transport.sendMail({ from: config.MAIL_FROM, to, subject, text });
      return { sent: true };
    },
  };
}
