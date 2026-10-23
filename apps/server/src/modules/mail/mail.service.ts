import { isLocale, type Locale } from '@cookit/shared';
import type { Email, Mailer } from '../../lib/mailer';
import { MESSAGES, type EmailKind } from './messages';
import { TEMPLATES } from './templates.generated';

export type MailService = ReturnType<typeof createMailService>;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** `{name}` placeholders of a text; values are single lines (no header or layout tricks). */
const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (match, name: string) =>
    (values[name] ?? match).replace(/[\r\n\t]+/g, ' '),
  );

/**
 * The `{{name}}` placeholders of a compiled template, HTML-escaped (an inviter's name, a
 * username or a link can never become markup).
 */
export function renderTemplate(html: string, values: Record<string, string>): string {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => escapeHtml(values[name] ?? ''));
}

/**
 * The emails of the app (optional: without SMTP every method throws `email_not_configured`, and
 * callers check `enabled` first). One template (`action`: a text and a button), texts per
 * language in `messages.ts`, an HTML and a plain-text version.
 */
export function createMailService(deps: { mailer?: Mailer; origin: string }) {
  const host = new URL(deps.origin).host;

  /** The email of `kind` in `locale`; `values` fill the texts' placeholders. */
  function compose(
    kind: EmailKind,
    locale: Locale,
    to: string,
    url: string,
    values: Record<string, string> = {},
  ): Email {
    const lang = isLocale(locale) ? locale : 'en';
    const messages = MESSAGES[lang];
    const texts = messages[kind];
    const all = { host, ...values };
    const filled = {
      subject: fill(texts.subject, all),
      heading: fill(texts.heading, all),
      intro: fill(texts.intro, all),
      button: fill(texts.button, all),
      note: fill(texts.note, all),
      linkHint: fill(messages.linkHint, all),
      footer: fill(messages.footer, all),
    };
    const html = renderTemplate(TEMPLATES.action, {
      ...filled,
      lang,
      url,
      preview: filled.intro,
    });
    const text = [
      filled.heading,
      '',
      filled.intro,
      '',
      `${filled.button}: ${url}`,
      '',
      filled.note,
      '',
      '--',
      filled.footer,
    ].join('\n');
    return { to, subject: filled.subject, html, text };
  }

  async function send(email: Email): Promise<void> {
    if (!deps.mailer) throw new Error('email_not_configured');
    await deps.mailer.send(email);
  }

  const date = (value: Date, locale: Locale) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(value);

  return {
    enabled: deps.mailer !== undefined,
    compose,

    invite(input: { to: string; locale: Locale; inviter: string; url: string; expiresAt: Date }) {
      return send(
        compose('invite', input.locale, input.to, input.url, {
          inviter: input.inviter,
          date: date(input.expiresAt, input.locale),
        }),
      );
    },

    passwordReset(input: { to: string; locale: Locale; username: string; url: string }) {
      return send(
        compose('passwordReset', input.locale, input.to, input.url, { username: input.username }),
      );
    },

    test(input: { to: string; locale: Locale }) {
      return send(compose('test', input.locale, input.to, deps.origin));
    },
  };
}
