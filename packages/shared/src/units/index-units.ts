import type { UnitMatch } from '../recipe/model';
import { DEFAULT_UNITS } from './catalog';
import { normalizeAlias } from './normalize';
import type { Unit, UnitRounding } from './unit';

/** A unit lookup built once per catalog. */
export type UnitIndex = {
  /** The unit written at `from` in `text` (longest alias wins, whole words only). */
  match(text: string, from: number): UnitMatch | undefined;
  rounding(slug: string | undefined): UnitRounding;
};

const MAX_ALIAS_WORDS = 5;
const cache = new WeakMap<readonly Unit[], UnitIndex>();

export function unitIndex(units: readonly Unit[] = DEFAULT_UNITS): UnitIndex {
  const cached = cache.get(units);
  if (cached) return cached;

  const slugByAlias = new Map<string, string>();
  const roundingBySlug = new Map<string, UnitRounding>();
  let maxWords = 1;
  for (const unit of units) {
    roundingBySlug.set(unit.slug, unit.rounding);
    for (const alias of [unit.slug, ...Object.values(unit.aliases).flat()]) {
      const key = normalizeAlias(alias);
      // First unit wins; conflicts are reported by findAliasConflicts (admin validation).
      if (key && !slugByAlias.has(key)) slugByAlias.set(key, unit.slug);
      maxWords = Math.min(MAX_ALIAS_WORDS, Math.max(maxWords, alias.trim().split(/\s+/).length));
    }
  }

  const lookup = (candidate: string) => {
    const key = normalizeAlias(candidate);
    // Regular plurals (`gousses`, `cups`) without listing them.
    return (
      slugByAlias.get(key) ?? (key.endsWith('s') ? slugByAlias.get(key.slice(0, -1)) : undefined)
    );
  };

  const index: UnitIndex = {
    match(text, from) {
      let start = from;
      while (start < text.length && /\s/.test(text.charAt(start))) start++;
      const ends: number[] = [];
      let pos = start;
      while (ends.length < maxWords && pos < text.length) {
        while (pos < text.length && !/\s/.test(text.charAt(pos))) pos++;
        ends.push(pos);
        while (pos < text.length && /\s/.test(text.charAt(pos))) pos++;
      }
      for (let i = ends.length - 1; i >= 0; i--) {
        const end = ends[i] ?? start;
        const slug = lookup(text.slice(start, end));
        if (slug) return { start, end, slug };
      }
      return undefined;
    },
    rounding: (slug) => (slug && roundingBySlug.get(slug)) || 'fraction',
  };
  cache.set(units, index);
  return index;
}

/** Aliases (normalized) shared by several units: the admin must not save such a catalog. */
export function findAliasConflicts(units: readonly Unit[]): { alias: string; slugs: string[] }[] {
  const slugsByAlias = new Map<string, Set<string>>();
  for (const unit of units) {
    for (const alias of [unit.slug, ...Object.values(unit.aliases).flat()]) {
      const key = normalizeAlias(alias);
      const slugs = slugsByAlias.get(key) ?? new Set<string>();
      slugs.add(unit.slug);
      slugsByAlias.set(key, slugs);
    }
  }
  return [...slugsByAlias]
    .filter(([, slugs]) => slugs.size > 1)
    .map(([alias, slugs]) => ({ alias, slugs: [...slugs] }));
}
