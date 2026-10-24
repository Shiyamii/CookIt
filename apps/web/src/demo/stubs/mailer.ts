// Stands in for apps/server/src/lib/mailer.ts in the demo build: no email in the demo
// (nodemailer needs Node). `GET /api/v1/meta` says `email: false`, so the app offers none.

export type Email = { to: string; subject: string; html: string; text: string };
export type Mailer = { send(email: Email): Promise<void> };

export function createMailer(): Mailer {
  throw new Error('No email in the demo');
}

/** The SMTP answer of a failed send: never one in the demo. */
export function sendError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown';
}
