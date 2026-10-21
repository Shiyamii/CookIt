import { DEFAULT_TAG_CATEGORIES, DEFAULT_UNITS } from '@cookit/shared';
import { sql } from 'drizzle-orm';
import { seeds } from '../modules/system/system.schema';
import { tagCategories, tags } from '../modules/tags/tags.schema';
import { units } from '../modules/units/units.schema';
import type { Database } from './index';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Starting data (plan §3 and §4), inserted once and recorded in `seeds`: the admin edits it
 * afterwards, and a restart never brings back what was deleted. Several instances starting at
 * once: the advisory lock makes the second one wait, then skip.
 */
const SEEDS: { name: string; run: (tx: Tx) => Promise<void> }[] = [
  {
    name: 'units-v1',
    async run(tx) {
      await tx.insert(units).values(
        DEFAULT_UNITS.map((unit, position) => ({
          id: crypto.randomUUID(),
          slug: unit.slug,
          rounding: unit.rounding,
          position,
          labels: unit.labels,
          aliases: unit.aliases,
        })),
      );
    },
  },
  {
    name: 'tags-v1',
    async run(tx) {
      for (const [position, category] of DEFAULT_TAG_CATEGORIES.entries()) {
        const id = crypto.randomUUID();
        await tx.insert(tagCategories).values({
          id,
          slug: category.slug,
          position,
          multiple: category.multiple,
          labels: category.labels,
        });
        await tx.insert(tags).values(
          category.tags.map((tag, index) => ({
            id: crypto.randomUUID(),
            categoryId: id,
            slug: tag.slug,
            position: index,
            labels: tag.labels,
          })),
        );
      }
    },
  },
];

export async function runSeeds(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242002)`);
    const done = new Set((await tx.select({ name: seeds.name }).from(seeds)).map((s) => s.name));
    for (const seed of SEEDS) {
      if (done.has(seed.name)) continue;
      await seed.run(tx);
      await tx.insert(seeds).values({ name: seed.name });
    }
  });
}
