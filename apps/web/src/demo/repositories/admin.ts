import type {
  InviteWithUser,
  InvitesRepository,
} from '../../../../server/src/modules/invites/invites.repository';
import type {
  UserRow,
  UsersRepository,
} from '../../../../server/src/modules/users/users.repository';
import { DemoUnavailableError } from '../unavailable';
import type { DemoState } from '../state';

/** Accounts in memory (demo only), with the last-admin guard of the Drizzle repository. */
export function createMemoryUsersRepository(state: () => DemoState): UsersRepository {
  const s = state;
  const find = (id: string) => s().users.find((user) => user.id === id);
  const isLastEnabledAdmin = (id: string) => {
    const target = find(id);
    if (!target || target.role !== 'admin' || target.disabledAt) return false;
    return !s().users.some((u) => u.role === 'admin' && !u.disabledAt && u.id !== id);
  };
  const row = (user: DemoState['users'][number]): UserRow => ({ ...user });

  return {
    async list() {
      return [...s().users].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(row);
    },
    async findById(id) {
      const user = find(id);
      return user && row(user);
    },
    async findByUsername(username) {
      const user = s().users.find((u) => u.username === username.toLowerCase());
      return user && row(user);
    },
    async disable(id, now) {
      if (isLastEnabledAdmin(id)) return 'last_admin';
      const user = find(id);
      if (user) user.disabledAt ??= now;
      return 'done';
    },
    async enable(id) {
      const user = find(id);
      if (user) user.disabledAt = null;
    },
    async setListed(id, listed) {
      const user = find(id);
      if (user) user.listed = listed;
    },
    // As the foreign keys do: what the account owns goes with it, copies keep their recipe.
    async delete(id) {
      if (isLastEnabledAdmin(id)) return 'last_admin';
      const state = s();
      const owned = new Set(state.recipes.filter((r) => r.ownerId === id).map((r) => r.id));
      state.users = state.users.filter((u) => u.id !== id);
      state.recipes = state.recipes.filter((r) => !owned.has(r.id));
      for (const recipe of state.recipes) {
        if (recipe.copiedFromOwnerId === id) recipe.copiedFromOwnerId = null;
      }
      state.translations = state.translations.filter((t) => !owned.has(t.recipeId));
      state.recipeTags = state.recipeTags.filter((link) => !owned.has(link.recipeId));
      state.notes = state.notes.filter((n) => n.userId !== id && !owned.has(n.recipeId));
      state.saved = state.saved.filter((l) => l.userId !== id && !owned.has(l.recipeId));
      state.cookSessions = state.cookSessions.filter((c) => c.userId !== id);
      state.shoppingLists = state.shoppingLists.filter((l) => l.userId !== id);
      state.alarms = state.alarms.filter((a) => a.userId !== id);
      for (const invite of state.invites) {
        if (invite.createdBy === id) invite.createdBy = null;
        if (invite.usedBy === id) invite.usedBy = null;
      }
      return 'done';
    },
  };
}

/** Invitation links in memory (demo only): created, listed and revoked; never used. */
export function createMemoryInvitesRepository(state: () => DemoState): InvitesRepository {
  const s = state;
  return {
    async create(invite) {
      s().invites.push({
        role: 'user',
        createdBy: null,
        label: null,
        email: null,
        locale: null,
        usedBy: null,
        usedAt: null,
        revokedAt: null,
        createdAt: new Date(),
        ...invite,
      });
    },
    async list(): Promise<InviteWithUser[]> {
      return [...s().invites]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((invite) => ({
          ...invite,
          usedByUsername:
            s().users.find((user) => user.id === invite.usedBy)?.displayUsername ?? null,
        }));
    },
    async findByTokenHash(tokenHash) {
      return s().invites.find((invite) => invite.tokenHash === tokenHash);
    },
    async revoke(id, now) {
      const invite = s().invites.find((candidate) => candidate.id === id);
      const pending = invite && !invite.usedAt && !invite.revokedAt && invite.expiresAt > now;
      if (!invite || !pending) return false;
      invite.revokedAt = now;
      return true;
    },
    async revokePendingSetupLinks(now) {
      for (const invite of s().invites) {
        if (!invite.createdBy && !invite.usedAt && !invite.revokedAt) invite.revokedAt = now;
      }
    },
    async emailTaken(email) {
      return s().users.some((user) => user.email.toLowerCase() === email.toLowerCase());
    },
    async adminExists() {
      return s().users.some((user) => user.role === 'admin' && !user.disabledAt);
    },
    // Creating an account needs the real sign-in (Better Auth): not in the demo.
    async accept() {
      throw new DemoUnavailableError();
    },
  };
}
