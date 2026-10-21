import { findAliasConflicts, type Unit, type UnitEntry } from '@cookit/shared';
import type { UnitsRepository } from './units.repository';

export type UnitError =
  | { error: 'not_found' }
  | { error: 'slug_taken' }
  /** A normalized alias already used by another unit (plan §3: unique across the catalog). */
  | { error: 'alias_conflict'; aliases: string[] };

/**
 * The unit catalog (plan §3): data edited by the admin, read by the parser on the server and by
 * the front. `catalog()` is cached and replaced by a **new array** after every change: the
 * parser caches its unit index per array.
 */
export function createUnitsService(deps: { repository: UnitsRepository; newId?: () => string }) {
  const { repository } = deps;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  let cached: Promise<UnitEntry[]> | undefined;

  const entries = () => {
    cached ??= repository.list().catch((error: unknown) => {
      cached = undefined;
      throw error;
    });
    return cached;
  };
  const changed = () => {
    cached = undefined;
  };

  /** Aliases of `unit` that another unit (not `exceptId`) already has, normalized. */
  const conflicts = async (unit: Unit, exceptId?: string): Promise<string[]> => {
    const others = (await entries()).filter((entry) => entry.id !== exceptId);
    return findAliasConflicts([...others, unit])
      .filter((conflict) => conflict.slugs.includes(unit.slug))
      .map((conflict) => conflict.alias);
  };

  return {
    list: entries,

    /** What the parser and the scaling use. */
    async catalog(): Promise<readonly Unit[]> {
      return entries();
    },

    async create(unit: Unit): Promise<UnitEntry | UnitError> {
      const taken = await conflicts(unit);
      if (taken.length) return { error: 'alias_conflict', aliases: taken };
      const id = newId();
      const result = await repository.create({ ...unit, id });
      changed();
      if (result === 'slug_taken') return { error: 'slug_taken' };
      return (await entries()).find((entry) => entry.id === id) ?? { ...unit, id, position: 0 };
    },

    async update(id: string, unit: Unit): Promise<{ ok: true } | UnitError> {
      if (!(await entries()).some((entry) => entry.id === id)) return { error: 'not_found' };
      const taken = await conflicts(unit, id);
      if (taken.length) return { error: 'alias_conflict', aliases: taken };
      const result = await repository.update(id, unit);
      changed();
      if (result === 'ok') return { ok: true };
      return { error: result };
    },

    /** Recipe texts are never touched: a deleted unit is simply no longer recognized. */
    async delete(id: string): Promise<{ ok: true } | UnitError> {
      const deleted = await repository.delete(id);
      changed();
      return deleted ? { ok: true } : { error: 'not_found' };
    },

    /** `ids`: every unit, in the new order. */
    async reorder(ids: string[]): Promise<{ ok: true } | UnitError> {
      const current = await entries();
      const known = new Set(current.map((entry) => entry.id));
      const complete =
        ids.length === current.length &&
        new Set(ids).size === ids.length &&
        ids.every((id) => known.has(id));
      if (!complete) return { error: 'not_found' };
      await repository.reorder(ids);
      changed();
      return { ok: true };
    },
  };
}

export type UnitsService = ReturnType<typeof createUnitsService>;
