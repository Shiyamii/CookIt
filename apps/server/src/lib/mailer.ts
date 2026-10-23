import nodemailer from 'nodemailer';

/** An email ready to send: HTML from a compiled template, and its plain-text version. */
export type Email = { to: string; subject: string; html: string; text: string };

export type Mailer = {
  send(email: Email): Promise<void>;
};

export type SmtpConfig = {
  host: string;
  port: number;
  security: 'starttls' | 'tls' | 'none';
  auth?: { user: string; pass: string };
  from: string;
};

/**
 * Sends through the SMTP server of the environment. `starttls` refuses a server that does not
 * offer TLS (the password and the links never go in clear); `none` is for a relay on a local
 * network or the tests. Short timeouts: a request waiting on a send must not hang.
 */
export function createMailer(config: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === 'tls',
    requireTLS: config.security === 'starttls',
    ignoreTLS: config.security === 'none',
    auth: config.auth,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    // Never in the logs: addresses and links are personal data and secrets.
    logger: false,
    debug: false,
  });
  return {
    async send(email) {
      await transport.sendMail({
        from: config.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    },
  };
}

/**
 * What can be said about a failed send without the address or the message: the SMTP answer, with
 * anything that looks like an address blanked out (servers often repeat the recipient).
 */
export function sendError(error: unknown): string {
  const value = error as { code?: unknown; responseCode?: unknown; response?: unknown };
  const parts = [
    typeof value.code === 'string' ? value.code : undefined,
    typeof value.responseCode === 'number' ? String(value.responseCode) : undefined,
    typeof value.response === 'string' ? value.response : undefined,
  ].filter(Boolean);
  const text = parts.length ? parts.join(' ') : error instanceof Error ? error.message : 'unknown';
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/<[^>]*@[^>]*>|[^\s<>"']+@[^\s<>"']+/g, '<address>')
    .slice(0, 300);
}
