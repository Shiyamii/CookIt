import type {
  CreatedInvite,
  CreateInviteInput,
  InviteStatus,
  InviteSummary,
  Locale,
  RegisterInput,
} from '@cookit/shared';
import { INVITE_DEFAULT_DAYS, isLocale } from '@cookit/shared';
import { sendError } from '../../lib/mailer';
import { generateToken, hashToken } from '../../lib/tokens';
import type { MailService } from '../mail/mail.service';
import type { AcceptResult, InviteRow, InvitesRepository } from './invites.repository';

const DAY_MS = 24 * 3600 * 1000;
/** The first-admin setup link is valid for 24 hours (plan §5.1). */
const SETUP_LINK_MS = DAY_MS;

export type InvitesService = ReturnType<typeof createInvitesService>;

export function createInvitesService(deps: {
  repository: InvitesRepository;
  origin: string;
  adminEmail?: string;
  hashPassword: (password: string) => Promise<string>;
  mail?: Pick<MailService, 'enabled' | 'invite'>;
  log?: (message: string) => void;
  now?: () => Date;
  newId?: () => string;
}) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  const status = (invite: InviteRow): InviteStatus => {
    if (invite.usedAt) return 'used';
    if (invite.revokedAt) return 'revoked';
    if (invite.expiresAt <= now()) return 'expired';
    return 'pending';
  };

  const inviteUrl = (token: string) => `${deps.origin}/invite#token=${token}`;
  const setupUrl = (token: string) => `${deps.origin}/setup#token=${token}`;

  return {
    /**
     * Creates a user invite; the link (with the token) is only returned here, never stored. With
     * an email, the link is also sent there (an unsent email still leaves the link to copy).
     */
    async create(
      admin: { id: string; name: string; locale: Locale },
      input: Partial<CreateInviteInput>,
    ): Promise<CreatedInvite | { error: 'email_not_configured' | 'email_taken' }> {
      const email = input.email?.trim().toLowerCase();
      if (email && !deps.mail?.enabled) return { error: 'email_not_configured' };
      if (email && (await deps.repository.emailTaken(email))) return { error: 'email_taken' };
      const token = generateToken();
      const days = input.expiresInDays ?? INVITE_DEFAULT_DAYS;
      const expiresAt = new Date(now().getTime() + days * DAY_MS);
      const locale = input.locale ?? admin.locale;
      await deps.repository.create({
        id: newId(),
        tokenHash: hashToken(token),
        role: 'user',
        createdBy: admin.id,
        label: input.label ?? null,
        email: email ?? null,
        locale: email ? locale : null,
        expiresAt,
      });
      const url = inviteUrl(token);
      if (!email || !deps.mail) return { url, emailed: false };
      try {
        await deps.mail.invite({ to: email, locale, inviter: admin.name, url, expiresAt });
        return { url, emailed: true };
      } catch (error) {
        deps.log?.(`Invite email not sent: ${sendError(error)}`);
        return { url, emailed: false };
      }
    },

    async list(): Promise<InviteSummary[]> {
      const invites = await deps.repository.list();
      return invites.map((invite) => ({
        id: invite.id,
        label: invite.label,
        role: invite.role,
        status: status(invite),
        createdAt: invite.createdAt.toISOString(),
        expiresAt: invite.expiresAt.toISOString(),
        usedAt: invite.usedAt?.toISOString() ?? null,
        usedByUsername: invite.usedByUsername,
        email: invite.email,
      }));
    },

    revoke(id: string): Promise<boolean> {
      return deps.repository.revoke(id, now());
    },

    /**
     * What the sign-up page needs to know about a link: whether it is usable, its role, and what
     * to pre-fill (the first admin's email, or the address and language an invite was sent to).
     */
    async check(
      token: string,
    ): Promise<{ role: 'admin' | 'user'; email?: string; locale?: Locale } | undefined> {
      const invite = await deps.repository.findByTokenHash(hashToken(token));
      if (!invite || status(invite) !== 'pending') return undefined;
      const isSetup = invite.role === 'admin' && invite.createdBy === null;
      if (isSetup && (await deps.repository.adminExists())) return undefined;
      const email = isSetup ? deps.adminEmail : (invite.email ?? undefined);
      const locale = isLocale(invite.locale) ? invite.locale : undefined;
      return { role: invite.role, ...(email && { email }), ...(locale && { locale }) };
    },

    /** Creates the account from an invite (atomic: see the repository). */
    async accept(input: RegisterInput): Promise<AcceptResult & { username?: string }> {
      const username = input.username.trim();
      const email = input.email.trim().toLowerCase();
      // Only an address the link was emailed to is verified (the person got the email): a reset
      // link is only ever emailed to a verified address.
      const invite = await deps.repository.findByTokenHash(hashToken(input.token));
      const result = await deps.repository.accept(
        hashToken(input.token),
        {
          id: newId(),
          name: input.name?.trim() || username,
          email,
          emailVerified: invite?.email !== null && invite?.email === email,
          // Like Better Auth's username plugin: stored lowercase, displayed as typed.
          username: username.toLowerCase(),
          displayUsername: username,
          locale: input.locale,
          passwordHash: await deps.hashPassword(input.password),
        },
        now(),
      );
      return result.ok ? { ...result, username: username.toLowerCase() } : result;
    },

    /**
     * At startup: while no admin exists, replaces any previous setup link by a new one (24 h) and
     * returns its URL, to be written in the logs. Undefined once an admin exists.
     */
    async createSetupLinkIfNoAdmin(): Promise<string | undefined> {
      if (await deps.repository.adminExists()) return undefined;
      await deps.repository.revokePendingSetupLinks(now());
      const token = generateToken();
      await deps.repository.create({
        id: newId(),
        tokenHash: hashToken(token),
        role: 'admin',
        createdBy: null,
        label: 'setup',
        expiresAt: new Date(now().getTime() + SETUP_LINK_MS),
      });
      return setupUrl(token);
    },
  };
}
