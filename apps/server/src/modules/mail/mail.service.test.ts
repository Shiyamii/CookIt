import { describe, expect, test } from 'bun:test';
import type { Email } from '../../lib/mailer';
import { createMailService, renderTemplate } from './mail.service';
import { MESSAGES } from './messages';

const ORIGIN = 'https://cook.example';
const URL_ = `${ORIGIN}/invite#token=${'T'.repeat(43)}`;

function setup() {
  const sent: Email[] = [];
  const mail = createMailService({
    mailer: {
      async send(email) {
        sent.push(email);
      },
    },
    origin: ORIGIN,
  });
  return { mail, sent };
}

describe('mail service', () => {
  test('an invite: subject, both versions, the link, the expiry date in the language', async () => {
    const { mail, sent } = setup();
    await mail.invite({
      to: 'bob@example.com',
      locale: 'fr',
      inviter: 'Ada',
      url: URL_,
      expiresAt: new Date('2026-11-02T12:00:00Z'),
    });
    const [email] = sent;
    expect(email?.to).toBe('bob@example.com');
    expect(email?.subject).toBe('Ada vous invite sur CookIt');
    expect(email?.html).toContain('<html lang="fr"');
    expect(email?.html).toContain(`href="${URL_}"`);
    expect(email?.html).toContain('2 novembre 2026');
    expect(email?.html).toContain('cook.example');
    expect(email?.html).not.toMatch(/\{\{|%%/);
    expect(email?.text).toContain(`Créer mon compte: ${URL_}`);
    expect(email?.text).toContain('2 novembre 2026');
  });

  test('names and links are escaped: never markup', async () => {
    const { mail, sent } = setup();
    await mail.invite({
      to: 'bob@example.com',
      locale: 'en',
      inviter: '<script>alert(1)</script> & "Ada"',
      url: `${ORIGIN}/invite#token=a"><img src=x>`,
      expiresAt: new Date('2026-11-02T12:00:00Z'),
    });
    const html = sent[0]?.html ?? '';
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Ada&quot;');
    expect(html).toContain('a&quot;&gt;&lt;img src=x&gt;');
  });

  test('a line break in a name cannot add lines to the subject', async () => {
    const { mail, sent } = setup();
    await mail.invite({
      to: 'bob@example.com',
      locale: 'en',
      inviter: 'Ada\r\nBcc: eve@example.com',
      url: URL_,
      expiresAt: new Date('2026-11-02T12:00:00Z'),
    });
    expect(sent[0]?.subject).toBe('Ada Bcc: eve@example.com invites you to CookIt');
  });

  test('a password reset and a test email, in every language', async () => {
    const { mail, sent } = setup();
    for (const locale of ['fr', 'en', 'hu'] as const) {
      await mail.passwordReset({ to: 'bob@example.com', locale, username: 'bob', url: URL_ });
      await mail.test({ to: 'ada@example.com', locale });
    }
    expect(sent.map((email) => email.subject)).toEqual([
      MESSAGES.fr.passwordReset.subject,
      MESSAGES.fr.test.subject,
      MESSAGES.en.passwordReset.subject,
      MESSAGES.en.test.subject,
      MESSAGES.hu.passwordReset.subject,
      MESSAGES.hu.test.subject,
    ]);
    expect(sent[0]?.html).toContain('bob');
    expect(sent[1]?.html).toContain(`href="${ORIGIN}"`);
  });

  test('every text of every language has its placeholders filled', () => {
    const { mail } = setup();
    for (const locale of ['fr', 'en', 'hu'] as const) {
      for (const kind of ['invite', 'passwordReset', 'test'] as const) {
        const email = mail.compose(kind, locale, 'x@example.com', URL_, {
          inviter: 'Ada',
          date: 'tomorrow',
          username: 'bob',
        });
        expect(`${email.subject}${email.text}${email.html}`).not.toMatch(/\{\w+\}|\{\{|%%/);
      }
    }
  });

  test('without SMTP settings: not enabled, and sending throws', async () => {
    const mail = createMailService({ origin: ORIGIN });
    expect(mail.enabled).toBe(false);
    await expect(mail.test({ to: 'ada@example.com', locale: 'en' })).rejects.toThrow(
      'email_not_configured',
    );
  });

  test('renderTemplate escapes every value and empties unknown placeholders', () => {
    expect(renderTemplate('<p>{{a}} {{ b }} {{c}}</p>', { a: '<b>', b: "it's" })).toBe(
      '<p>&lt;b&gt; it&#39;s </p>',
    );
  });
});
