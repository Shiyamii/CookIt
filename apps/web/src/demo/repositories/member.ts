import type { CookingRepository } from '../../../../server/src/modules/cooking/cooking.repository';
import type { MembersRepository } from '../../../../server/src/modules/members/members.repository';
import type { ProfileRepository } from '../../../../server/src/modules/profile/profile.repository';
import type { PushRepository } from '../../../../server/src/modules/push/push.repository';
import type { ShoppingRepository } from '../../../../server/src/modules/shopping/shopping.repository';
import type { DemoState } from '../state';

/** The cooking session of each user, in memory (demo only: no timers to notify). */
export function createMemoryCookingRepository(state: () => DemoState): CookingRepository {
  const s = state;
  const find = (userId: string) => s().cookSessions.find((row) => row.userId === userId);
  return {
    async findActive(userId) {
      const row = find(userId);
      return row && { version: row.version, updatedAt: row.updatedAt, state: row.state };
    },
    async save(userId, cookState, { now }) {
      const row = find(userId);
      if (row) {
        Object.assign(row, { state: cookState, updatedAt: now, version: row.version + 1 });
        return row.version;
      }
      s().cookSessions.push({ userId, state: cookState, updatedAt: now, version: 1 });
      return 1;
    },
    async change(userId, change, now) {
      const row = find(userId);
      const next = row && change(row.state);
      if (!row || !next) return false;
      Object.assign(row, { state: next, updatedAt: now, version: row.version + 1 });
      return true;
    },
    async end(userId) {
      const before = s().cookSessions.length;
      s().cookSessions = s().cookSessions.filter((row) => row.userId !== userId);
      return s().cookSessions.length < before;
    },
  };
}

/** The shopping list of each user, in memory (demo only). */
export function createMemoryShoppingRepository(state: () => DemoState): ShoppingRepository {
  const s = state;
  return {
    async find(userId) {
      const row = s().shoppingLists.find((list) => list.userId === userId);
      return row && { version: row.version, updatedAt: row.updatedAt, state: row.state };
    },
    async save(userId, list, now) {
      const row = s().shoppingLists.find((candidate) => candidate.userId === userId);
      if (row) {
        Object.assign(row, { state: list, updatedAt: now, version: row.version + 1 });
        return row.version;
      }
      s().shoppingLists.push({ userId, state: list, updatedAt: now, version: 1 });
      return 1;
    },
  };
}

/** Alarm settings in memory; no profile pictures in the demo (no image server). */
export function createMemoryProfileRepository(state: () => DemoState): ProfileRepository {
  const s = state;
  return {
    async replaceAvatar() {
      throw new Error('Profile pictures are not part of the demo');
    },
    async removeAvatar() {},
    async findAvatar() {
      return undefined;
    },
    async findAlarm(userId) {
      return s().alarms.find((row) => row.userId === userId)?.settings;
    },
    async saveAlarm(userId, settings, now) {
      const others = s().alarms.filter((row) => row.userId !== userId);
      s().alarms = [...others, { userId, settings, updatedAt: now }];
    },
  };
}

/** No push service in the demo: the API answers "not configured", nothing is ever stored. */
export function createMemoryPushRepository(): PushRepository {
  return {
    async upsert() {},
    async prune() {},
    async list() {
      return [];
    },
    async delete() {
      return false;
    },
    async deleteById() {},
    async claimDue() {
      return [];
    },
    async markNotified() {},
    async release() {},
  };
}

/** The members list in memory (demo only). */
export function createMemoryMembersRepository(state: () => DemoState): MembersRepository {
  const s = state;
  const enabled = () => s().users.filter((user) => !user.disabledAt);
  const summary = (user: DemoState['users'][number]) => ({
    username: user.displayUsername || user.username,
    name: user.name,
    image: user.image,
    publicRecipes: s().recipes.filter((r) => r.ownerId === user.id && r.visibility === 'public')
      .length,
  });
  return {
    async listListed() {
      return enabled()
        .filter((user) => user.listed)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map(summary);
    },
    async findByUsername(username) {
      const user = enabled().find((u) => u.username === username.toLowerCase());
      return user && { ...summary(user), id: user.id, listed: user.listed };
    },
    async isListed(userId) {
      return s().users.find((user) => user.id === userId)?.listed ?? false;
    },
    async setListed(userId, listed) {
      const user = s().users.find((u) => u.id === userId);
      if (user) user.listed = listed;
    },
  };
}
