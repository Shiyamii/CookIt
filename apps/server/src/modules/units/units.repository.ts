import type { Unit, UnitEntry } from '@cookit/shared';
import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db';
import { uniqueViolation } from '../../db/errors';
import { units } from './units.schema';

export type UnitsRepository = {
  list(): Promise<UnitEntry[]>;
  /** `slug_taken` when another unit has the slug. */
  create(unit: Unit & { id: string }): Promise<'ok' | 'slug_taken'>;
  update(id: string, unit: Unit): Promise<'ok' | 'slug_taken' | 'not_found'>;
  delete(id: string): Promise<boolean>;
  /** Positions follow the order of `ids` (all the units). */
  reorder(ids: string[]): Promise<void>;
};

const toEntry = (row: typeof units.$inferSelect): UnitEntry => ({
  id: row.id,
  slug: row.slug,
  rounding: row.rounding,
  position: row.position,
  labels: row.labels,
  aliases: row.aliases,
});

export function createUnitsRepository(db: Database): UnitsRepository {
  return {
    async list() {
      const rows = await db.select().from(units).orderBy(asc(units.position), asc(units.slug));
      return rows.map(toEntry);
    },

    async create(unit) {
      try {
        await db.insert(units).values({
          ...unit,
          position: sql`(select coalesce(max(${units.position}), -1) + 1 from ${units})`,
        });
        return 'ok';
      } catch (error) {
        if (uniqueViolation(error)) return 'slug_taken';
        throw error;
      }
    },

    async update(id, unit) {
      try {
        const updated = await db
          .update(units)
          .set({
            slug: unit.slug,
            rounding: unit.rounding,
            labels: unit.labels,
            aliases: unit.aliases,
          })
          .where(eq(units.id, id))
          .returning({ id: units.id });
        return updated.length ? 'ok' : 'not_found';
      } catch (error) {
        if (uniqueViolation(error)) return 'slug_taken';
        throw error;
      }
    },

    async delete(id) {
      const deleted = await db.delete(units).where(eq(units.id, id)).returning({ id: units.id });
      return deleted.length > 0;
    },

    async reorder(ids) {
      await db.transaction(async (tx) => {
        for (const [position, id] of ids.entries()) {
          await tx.update(units).set({ position }).where(eq(units.id, id));
        }
      });
    },
  };
}
