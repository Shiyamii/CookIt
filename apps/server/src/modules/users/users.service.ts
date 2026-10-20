import type { AccountError, UserSummary } from '@cookit/shared';
import type { PasswordResetService } from '../password-reset/password-reset.service';
import type { GuardedChange, UserRow, UsersRepository } from './users.repository';

export type UsersService = ReturnType<typeof createUsersService>;

type Outcome = { ok: true } | { ok: false; error: AccountError };

function summary(user: UserRow): UserSummary {
  return {
    id: user.id,
    username: user.displayUsername ?? user.username ?? '',
    name: user.name,
    email: user.email,
    role: user.role,
    locale: user.locale,
    createdAt: user.createdAt.toISOString(),
    disabledAt: user.disabledAt?.toISOString() ?? null,
  };
}

/** Admin user management (plan §5.1, "Utilisateurs" page). */
export function createUsersService(deps: {
  repository: UsersRepository;
  passwordReset: PasswordResetService;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());

  /**
   * An admin cannot disable or delete their own account. The last enabled admin is protected by
   * the repository (checked in the same transaction as the change).
   */
  async function checkTarget(actorId: string, targetId: string): Promise<Outcome> {
    if (actorId === targetId) return { ok: false, error: 'cannot_change_self' };
    if (!(await deps.repository.findById(targetId))) return { ok: false, error: 'not_found' };
    return { ok: true };
  }

  const guarded = (change: GuardedChange): Outcome =>
    change === 'done' ? { ok: true } : { ok: false, error: 'last_admin' };

  return {
    async list(): Promise<UserSummary[]> {
      return (await deps.repository.list()).map(summary);
    },

    async disable(actorId: string, targetId: string): Promise<Outcome> {
      const check = await checkTarget(actorId, targetId);
      if (!check.ok) return check;
      return guarded(await deps.repository.disable(targetId, now()));
    },

    async enable(targetId: string): Promise<Outcome> {
      if (!(await deps.repository.findById(targetId))) return { ok: false, error: 'not_found' };
      await deps.repository.enable(targetId);
      return { ok: true };
    },

    // Recipes do not exist yet: the choice of what happens to them comes with phase 4.
    async delete(actorId: string, targetId: string): Promise<Outcome> {
      const check = await checkTarget(actorId, targetId);
      if (!check.ok) return check;
      return guarded(await deps.repository.delete(targetId));
    },

    async createResetLink(actorId: string, targetId: string) {
      if (!(await deps.repository.findById(targetId))) {
        return { ok: false as const, error: 'not_found' as const };
      }
      return { ok: true as const, ...(await deps.passwordReset.createLink(targetId, actorId)) };
    },

    /** Rescue CLI: a reset link for any user, by username, without an admin session. */
    async createResetLinkForUsername(username: string): Promise<string | undefined> {
      const user = await deps.repository.findByUsername(username);
      if (!user) return undefined;
      return (await deps.passwordReset.createLink(user.id, null)).url;
    },
  };
}
