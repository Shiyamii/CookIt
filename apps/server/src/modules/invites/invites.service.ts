import type { CreateInviteInput, InviteStatus, InviteSummary, RegisterInput } from '@cookit/shared';
import { INVITE_DEFAULT_DAYS } from '@cookit/shared';
import { generateToken, hashToken } from '../../lib/tokens';
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
    /** Creates a user invite; the link (with the token) is only returned here, never stored. */
    async create(createdBy: string, input: Partial<CreateInviteInput>) {
      const token = generateToken();
      const days = input.expiresInDays ?? INVITE_DEFAULT_DAYS;
      await deps.repository.create({
        id: newId(),
        tokenHash: hashToken(token),
        role: 'user',
        createdBy,
        label: input.label ?? null,
        expiresAt: new Date(now().getTime() + days * DAY_MS),
      });
      return { url: inviteUrl(token) };
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
      }));
    },

    revoke(id: string): Promise<boolean> {
      return deps.repository.revoke(id, now());
    },

    /**
     * What the sign-up page needs to know about a link: whether it is usable, its role, and the
     * email to pre-fill for the first admin.
     */
    async check(token: string): Promise<{ role: 'admin' | 'user'; email?: string } | undefined> {
      const invite = await deps.repository.findByTokenHash(hashToken(token));
      if (!invite || status(invite) !== 'pending') return undefined;
      const isSetup = invite.role === 'admin' && invite.createdBy === null;
      if (isSetup && (await deps.repository.adminExists())) return undefined;
      return { role: invite.role, ...(isSetup && deps.adminEmail && { email: deps.adminEmail }) };
    },

    /** Creates the account from an invite (atomic: see the repository). */
    async accept(input: RegisterInput): Promise<AcceptResult & { username?: string }> {
      const username = input.username.trim();
      const result = await deps.repository.accept(
        hashToken(input.token),
        {
          id: newId(),
          name: input.name?.trim() || username,
          email: input.email.trim().toLowerCase(),
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
