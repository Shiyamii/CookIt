import { expect } from '@playwright/test';

/**
 * The emails the app sent, read from Mailpit (the SMTP catcher of the dev compose and CI) through
 * its API. Addresses are unique per test, so a search by recipient finds a test's own emails.
 */

export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';

export type Mail = { subject: string; text: string; html: string; to: string[]; from: string };

type Summary = { ID: string };
type Message = {
  Subject: string;
  Text: string;
  HTML: string;
  From: { Address: string; Name: string };
  To: { Address: string }[];
};

async function search(to: string): Promise<Summary[]> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`);
  return ((await res.json()) as { messages: Summary[] }).messages;
}

/** Every email sent to `to` so far (newest first). */
export async function mailsTo(to: string): Promise<Mail[]> {
  const mails: Mail[] = [];
  for (const { ID } of await search(to)) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/message/${ID}`);
    const message = (await res.json()) as Message;
    mails.push({
      subject: message.Subject,
      text: message.Text,
      html: message.HTML,
      to: message.To.map((address) => address.Address),
      from: `${message.From.Name} <${message.From.Address}>`,
    });
  }
  return mails;
}

/** Waits for the `count`-th email to `to` and returns the newest. */
export async function waitForMail(to: string, count = 1): Promise<Mail> {
  await expect.poll(async () => (await search(to)).length, { timeout: 15_000 }).toBe(count);
  const [mail] = await mailsTo(to);
  return mail!;
}

/** The app link of an email (the `#token=` one). */
export function linkIn(mail: Mail): string {
  const match = /https?:\/\/\S+#token=[A-Za-z0-9_-]{43}/.exec(mail.text);
  if (!match) throw new Error(`No link in: ${mail.text}`);
  return match[0];
}
