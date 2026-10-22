import {
  DEFAULT_TAG_CATEGORIES,
  DEFAULT_UNITS,
  findAliasConflicts,
  type Unit,
} from '@cookit/shared';
import { eq, sql } from 'drizzle-orm';
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
  {
    // Instances created before Hungarian: its labels and aliases are added to the starting units,
    // categories and tags that still exist (never over what the admin wrote), and the units and
    // tag new with it are created. An alias another unit already has is left out.
    name: 'hungarian-v1',
    async run(tx) {
      const rows = await tx.select().from(units);
      const catalog: Unit[] = rows.map(({ slug, rounding, labels, aliases }) => ({
        slug,
        rounding,
        labels,
        aliases,
      }));
      for (const unit of DEFAULT_UNITS) {
        const row = rows.find((candidate) => candidate.slug === unit.slug);
        const others = catalog.filter((other) => other.slug !== unit.slug);
        const free = (unit.aliases.hu ?? []).filter(
          (alias) =>
            findAliasConflicts([...others, { ...unit, aliases: { hu: [alias] } }]).length === 0,
        );
        if (!row) {
          if (!NEW_WITH_HUNGARIAN.units.includes(unit.slug)) continue;
          const aliases = { ...unit.aliases, hu: free };
          if (findAliasConflicts([...catalog, { ...unit, aliases }]).length) continue;
          await tx.insert(units).values({
            id: crypto.randomUUID(),
            slug: unit.slug,
            rounding: unit.rounding,
            position: catalog.length,
            labels: unit.labels,
            aliases,
          });
          catalog.push({ ...unit, aliases });
          continue;
        }
        await tx
          .update(units)
          .set({
            labels: { ...row.labels, hu: row.labels.hu ?? unit.labels.hu },
            aliases: { ...row.aliases, hu: row.aliases.hu ?? free },
          })
          .where(eq(units.id, row.id));
      }

      const categories = await tx.select().from(tagCategories);
      const tagRows = await tx.select().from(tags);
      for (const category of DEFAULT_TAG_CATEGORIES) {
        const row = categories.find((candidate) => candidate.slug === category.slug);
        if (!row) continue;
        await tx
          .update(tagCategories)
          .set({ labels: { ...row.labels, hu: row.labels.hu ?? category.labels.hu } })
          .where(eq(tagCategories.id, row.id));
        for (const tag of category.tags) {
          const existing = tagRows.find((candidate) => candidate.slug === tag.slug);
          if (existing) {
            await tx
              .update(tags)
              .set({ labels: { ...existing.labels, hu: existing.labels.hu ?? tag.labels.hu } })
              .where(eq(tags.id, existing.id));
          } else if (NEW_WITH_HUNGARIAN.tags.includes(tag.slug)) {
            await tx.insert(tags).values({
              id: crypto.randomUUID(),
              categoryId: row.id,
              slug: tag.slug,
              position: tagRows.filter((other) => other.categoryId === row.id).length,
              labels: tag.labels,
            });
          }
        }
      }
    },
  },
];

/** Starting units and tags added with Hungarian (`hungarian-v1` creates them on older instances). */
const NEW_WITH_HUNGARIAN = { units: ['dkg', 'tete'], tags: ['hongroise'] };

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
