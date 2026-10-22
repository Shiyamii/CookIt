import { MAX_RECIPE_IMAGES } from '@cookit/shared';

/** The photo order with `id` moved by `delta` places (unchanged at either end). */
export function moveImage(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const order = [...ids];
  [order[from], order[to]] = [order[to]!, order[from]!];
  return order;
}

/** The photo order with `id` first: the cover. */
export function makeCover(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? [id, ...ids.filter((other) => other !== id)] : [...ids];
}

/** The chosen files that still fit (the others are left out), and how many were left out. */
export function filesThatFit<T>(
  files: readonly T[],
  current: number,
): { files: T[]; left: number } {
  const free = Math.max(0, MAX_RECIPE_IMAGES - current);
  return { files: files.slice(0, free), left: Math.max(0, files.length - free) };
}
