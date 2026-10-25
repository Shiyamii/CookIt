import { isLocale, type ForgotPasswordInput, type PasswordResetInput } from '@cookit/shared';
import { sendError } from '../../lib/mailer';
import { generateToken, hashToken } from '../../lib/tokens';
import type { MailService } from '../mail/mail.service';
import type { PasswordResetRepository } from './password-reset.repository';

/** Links handed over by an admin: valid for 3 days. */
const RESET_LINK_MS = 3 * 24 * 3600 * 1000;
/** Links sent by email when the user asks: one hour. */
const EMAILED_LINK_MS = 3600 * 1000;

export type PasswordResetService = ReturnType<typeof createPasswordResetService>;

export function createPasswordResetService(deps: {
  repository: PasswordResetRepository;
  origin: string;
  hashPassword: (password: string) => Promise<string>;
  mail?: Pick<MailService, 'enabled' | 'passwordReset'>;
  log?: (message: string) => void;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());

  const newLink = async (
    userId: string,
    createdBy: string | null,
    kind: 'admin' | 'email',
  ): Promise<string> => {
    const token = generateToken();
    await deps.repository.create({
      id: crypto.randomUUID(),
      tokenHash: hashToken(token),
      userId,
      createdBy,
      kind,
      expiresAt: new Date(now().getTime() + (kind === 'email' ? EMAILED_LINK_MS : RESET_LINK_MS)),
    });
    return `${deps.origin}/reset-password#token=${token}`;
  };

  return {
    /** A one-time link to choose a new password; `createdBy` is null for the rescue CLI. */
    async createLink(userId: string, createdBy: string | null): Promise<{ url: string }> {
      return { url: await newLink(userId, createdBy, 'admin') };
    },

    /**
     * "Forgot your password?": emails a link to the account with this email or username, if
     * there is one (enabled, with a verified email: an address typed at sign-up and never proven
     * could be someone else's) and `allow(accountId)` (the per-account limits, counted on the
     * account whatever was typed). Says nothing either way: the caller answers the same whatever
     * happens, and does not wait for it (no timing difference either).
     */
    async requestByEmail(
      input: ForgotPasswordInput,
      allow: (accountId: string) => Promise<boolean> = async () => true,
    ): Promise<void> {
      if (!deps.mail?.enabled) return;
      const account = await deps.repository.findAccount(input.identifier);
      if (!account || account.disabled || !account.email || !account.emailVerified) return;
      if (!(await allow(account.id))) return;
      const url = await newLink(account.id, null, 'email');
      const locale = isLocale(account.locale) ? account.locale : (input.locale ?? 'en');
      try {
        await deps.mail.passwordReset({
          to: account.email,
          locale,
          username: account.username,
          url,
        });
      } catch (error) {
        deps.log?.(`Password reset email not sent: ${sendError(error)}`);
      }
    },

    async isValid(token: string): Promise<boolean> {
      return (await this.linkKind(token)) !== undefined;
    },

    /** The kind of a usable link (an admin link also turns 2FA off), undefined otherwise. */
    async linkKind(token: string): Promise<'admin' | 'email' | undefined> {
      const reset = await deps.repository.findByTokenHash(hashToken(token));
      return reset && !reset.usedAt && reset.expiresAt > now() ? reset.kind : undefined;
    },

    async reset(input: PasswordResetInput): Promise<boolean> {
      // A link that cannot work costs no password hash (argon2id: memory and CPU for anyone who
      // sends random tokens). Hashed before the transaction to keep it short; `consume` checks
      // the link again.
      if (!(await this.linkKind(input.token))) return false;
      const passwordHash = await deps.hashPassword(input.password);
      return deps.repository.consume(hashToken(input.token), passwordHash, now());
    },
  };
}
