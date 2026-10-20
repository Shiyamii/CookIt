import type { Locale } from '../locale';
import { fold } from '../text';

/** Current version of the recipe format (`format: 1` line). Older versions stay readable. */
export const CURRENT_FORMAT = 1;

export const META_FIELDS = ['servings', 'source', 'format', 'tags'] as const;
export type MetaField = (typeof META_FIELDS)[number];

/**
 * Keys accepted in part 1, per language. Matched ignoring case and accents; any language is
 * accepted whatever the recipe language. The first key of each list is the canonical one used by
 * the serializer. Adding a language means adding its keys here.
 */
export const META_KEYS: Record<MetaField, Record<Locale, readonly string[]>> = {
  servings: { fr: ['portions', 'personnes', 'parts'], en: ['servings', 'serves', 'yield'] },
  source: { fr: ['source'], en: ['source'] },
  format: { fr: ['format'], en: ['format'] },
  tags: { fr: ['tags', 'étiquettes'], en: ['tags'] },
};

const fieldByKey = new Map<string, MetaField>(
  META_FIELDS.flatMap((field) =>
    Object.values(META_KEYS[field]).flatMap((keys) => keys.map((key) => [fold(key), field])),
  ),
);

/** The known field a `key:` designates, or undefined for an unknown key (kept in `extraMeta`). */
export function metaFieldOf(key: string): MetaField | undefined {
  return fieldByKey.get(fold(key.trim()));
}
