import type { AdminTagCategory, TagCategoryInput, TagInput } from '@cookit/shared';
import { asc, count, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db';
import { uniqueViolation } from '../../db/errors';
import { recipeTags } from '../recipes/recipes.schema';
import { tagCategories, tags } from './tags.schema';

export type TagsRepository = {
  /** Categories in order, each with its tags in order; `counts`: recipes per tag. */
  list(options?: { counts?: boolean }): Promise<AdminTagCategory[]>;
  createCategory(id: string, input: TagCategoryInput): Promise<'ok' | 'slug_taken'>;
  /**
   * `single_choice_conflict`: the category would become single-choice while recipes have
   * several of its tags (they could not be saved any more).
   */
  updateCategory(
    id: string,
    input: TagCategoryInput,
  ): Promise<'ok' | 'slug_taken' | 'not_found' | 'single_choice_conflict'>;
  /** `not_empty` while the category still has tags. */
  deleteCategory(id: string): Promise<'ok' | 'not_empty' | 'not_found'>;
  reorderCategories(ids: string[]): Promise<void>;
  createTag(id: string, input: TagInput): Promise<'ok' | 'slug_taken'>;
  /**
   * A tag moved to another category goes to its end. `single_choice_conflict`: moved into a
   * single-choice category where recipes having it already have another tag.
   */
  updateTag(
    id: string,
    input: TagInput,
  ): Promise<'ok' | 'slug_taken' | 'not_found' | 'single_choice_conflict'>;
  /** Deletes the tag (its recipe links go with it). */
  deleteTag(id: string): Promise<void>;
  /**
   * In one transaction: the recipes of `fromId` get `intoId`, then `fromId` is deleted.
   * `single_choice_conflict` when `intoId`'s category is single-choice and a recipe of `fromId`
   * already has another tag of it.
   */
  mergeTag(fromId: string, intoId: string): Promise<'ok' | 'single_choice_conflict'>;
  reorderTags(ids: string[]): Promise<void>;
};

const nextCategoryPosition = sql`(select coalesce(max(${tagCategories.position}), -1) + 1 from ${tagCategories})`;
const nextTagPosition = (categoryId: string) =>
  sql`(select coalesce(max(${tags.position}), -1) + 1 from ${tags} where ${tags.categoryId} = ${categoryId})`;

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Would recipes having `tagId` end up with two tags of single-choice category `categoryId`?
 * (Tags in `ignore` do not count: the tag itself, or the one it merges into.)
 */
async function singleChoiceConflict(
  tx: Tx,
  tagId: string,
  categoryId: string,
  ignore: string[],
): Promise<boolean> {
  const [category] = await tx
    .select({ multiple: tagCategories.multiple })
    .from(tagCategories)
    .where(eq(tagCategories.id, categoryId));
  if (!category || category.multiple) return false;
  const rows = await tx.execute(sql`
    select 1 from ${recipeTags} mine
    join ${recipeTags} other on other.recipe_id = mine.recipe_id
    join ${tags} t on t.id = other.tag_id
    where mine.tag_id = ${tagId} and t.category_id = ${categoryId}
      and other.tag_id not in (${sql.join(
        ignore.map((id) => sql`${id}`),
        sql`, `,
      )})
    limit 1`);
  return rows.length > 0;
}

/** 23503: the category is still referenced by tags (`on delete restrict`). */
function foreignKeyViolation(error: unknown): boolean {
  return (error as { cause?: { code?: string } } | null)?.cause?.code === '23503';
}

export function createTagsRepository(db: Database): TagsRepository {
  const slugTaken = async (write: () => Promise<unknown>) => {
    try {
      await write();
      return undefined;
    } catch (error) {
      if (uniqueViolation(error)) return 'slug_taken' as const;
      throw error;
    }
  };

  return {
    async list(options = {}) {
      const categories = await db
        .select()
        .from(tagCategories)
        .orderBy(asc(tagCategories.position), asc(tagCategories.slug));
      const rows = await db.select().from(tags).orderBy(asc(tags.position), asc(tags.slug));
      const counts = new Map<string, number>();
      if (options.counts) {
        const used = await db
          .select({ tagId: recipeTags.tagId, n: count() })
          .from(recipeTags)
          .groupBy(recipeTags.tagId);
        for (const row of used) counts.set(row.tagId, row.n);
      }
      return categories.map((category) => ({
        ...category,
        tags: rows
          .filter((tag) => tag.categoryId === category.id)
          .map((tag) => ({ ...tag, recipeCount: counts.get(tag.id) ?? 0 })),
      }));
    },

    async createCategory(id, input) {
      return (
        (await slugTaken(() =>
          db.insert(tagCategories).values({ id, ...input, position: nextCategoryPosition }),
        )) ?? 'ok'
      );
    },

    async updateCategory(id, input) {
      let result: 'ok' | 'not_found' | 'single_choice_conflict' = 'not_found';
      const taken = await slugTaken(() =>
        db.transaction(async (tx) => {
          const [current] = await tx
            .select({ multiple: tagCategories.multiple })
            .from(tagCategories)
            .where(eq(tagCategories.id, id))
            .for('update');
          if (!current) return;
          if (current.multiple && !input.multiple) {
            const rows = await tx.execute(sql`
              select 1 from ${recipeTags} rt join ${tags} t on t.id = rt.tag_id
              where t.category_id = ${id}
              group by rt.recipe_id having count(*) > 1 limit 1`);
            if (rows.length > 0) {
              result = 'single_choice_conflict';
              return;
            }
          }
          await tx.update(tagCategories).set(input).where(eq(tagCategories.id, id));
          result = 'ok';
        }),
      );
      return taken ?? result;
    },

    async deleteCategory(id) {
      try {
        const deleted = await db
          .delete(tagCategories)
          .where(eq(tagCategories.id, id))
          .returning({ id: tagCategories.id });
        return deleted.length ? 'ok' : 'not_found';
      } catch (error) {
        if (foreignKeyViolation(error)) return 'not_empty';
        throw error;
      }
    },

    async reorderCategories(ids) {
      await db.transaction(async (tx) => {
        for (const [position, id] of ids.entries()) {
          await tx.update(tagCategories).set({ position }).where(eq(tagCategories.id, id));
        }
      });
    },

    async createTag(id, input) {
      return (
        (await slugTaken(() =>
          db.insert(tags).values({ id, ...input, position: nextTagPosition(input.categoryId) }),
        )) ?? 'ok'
      );
    },

    async updateTag(id, input) {
      let result: 'ok' | 'not_found' | 'single_choice_conflict' = 'not_found';
      const taken = await slugTaken(() =>
        db.transaction(async (tx) => {
          const [current] = await tx
            .select({ categoryId: tags.categoryId })
            .from(tags)
            .where(eq(tags.id, id))
            .for('update');
          if (!current) return;
          const moved = current.categoryId !== input.categoryId;
          if (moved && (await singleChoiceConflict(tx, id, input.categoryId, [id]))) {
            result = 'single_choice_conflict';
            return;
          }
          await tx
            .update(tags)
            .set({ ...input, ...(moved && { position: nextTagPosition(input.categoryId) }) })
            .where(eq(tags.id, id));
          result = 'ok';
        }),
      );
      return taken ?? result;
    },

    async deleteTag(id) {
      await db.delete(tags).where(eq(tags.id, id));
    },

    async mergeTag(fromId, intoId) {
      return db.transaction(async (tx) => {
        const [into] = await tx
          .select({ categoryId: tags.categoryId })
          .from(tags)
          .where(eq(tags.id, intoId));
        if (into && (await singleChoiceConflict(tx, fromId, into.categoryId, [fromId, intoId]))) {
          return 'single_choice_conflict';
        }
        await tx.execute(sql`
          insert into ${recipeTags} (recipe_id, tag_id)
          select recipe_id, ${intoId} from ${recipeTags} where tag_id = ${fromId}
          on conflict do nothing`);
        await tx.delete(tags).where(eq(tags.id, fromId));
        return 'ok';
      });
    },

    async reorderTags(ids) {
      await db.transaction(async (tx) => {
        for (const [position, id] of ids.entries()) {
          await tx.update(tags).set({ position }).where(eq(tags.id, id));
        }
      });
    },
  };
}
