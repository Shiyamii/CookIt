import type {
  AdminTagCategory,
  TagCategory,
  TagCategoryInput,
  TagInput,
  Unit,
  UnitEntry,
} from '@cookit/shared';
import { fold } from '@cookit/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';

/**
 * The common catalogs edited by the admin (plan §3, §4): units (read by the parser and the
 * scaling) and tag categories. Read by everyone, public pages included.
 */

export const UNITS_QUERY_KEY = ['catalog', 'units'] as const;
export const TAGS_QUERY_KEY = ['catalog', 'tags'] as const;
export const ADMIN_TAGS_QUERY_KEY = ['catalog', 'admin-tags'] as const;

export function fetchUnits(): Promise<UnitEntry[]> {
  return apiGet<UnitEntry[]>('/units');
}

export function fetchTags(): Promise<TagCategory[]> {
  return apiGet<TagCategory[]>('/tags');
}

export function fetchAdminTags(): Promise<AdminTagCategory[]> {
  return apiGet<AdminTagCategory[]>('/admin/tags');
}

export function createUnit(unit: Unit): Promise<UnitEntry> {
  return apiPost<UnitEntry>('/admin/units', unit);
}

export async function updateUnit(id: string, unit: Unit): Promise<void> {
  await apiPut(`/admin/units/${encodeURIComponent(id)}`, unit);
}

export async function deleteUnit(id: string): Promise<void> {
  await apiDelete(`/admin/units/${encodeURIComponent(id)}`);
}

export async function reorderUnits(ids: string[]): Promise<void> {
  await apiPut('/admin/units/order', { ids });
}

export async function createCategory(input: TagCategoryInput): Promise<void> {
  await apiPost('/admin/tag-categories', input);
}

export async function updateCategory(id: string, input: TagCategoryInput): Promise<void> {
  await apiPut(`/admin/tag-categories/${encodeURIComponent(id)}`, input);
}

export async function deleteCategory(id: string): Promise<void> {
  await apiDelete(`/admin/tag-categories/${encodeURIComponent(id)}`);
}

export async function reorderCategories(ids: string[]): Promise<void> {
  await apiPut('/admin/tag-categories/order', { ids });
}

export async function reorderTags(categoryId: string, ids: string[]): Promise<void> {
  await apiPut(`/admin/tag-categories/${encodeURIComponent(categoryId)}/tag-order`, { ids });
}

export async function createTag(input: TagInput): Promise<void> {
  await apiPost('/admin/tags', input);
}

export async function updateTag(id: string, input: TagInput): Promise<void> {
  await apiPut(`/admin/tags/${encodeURIComponent(id)}`, input);
}

/** A tag used by recipes needs `confirm`, or `mergeInto` another tag. */
export async function deleteTag(
  id: string,
  options: { confirm?: boolean; mergeInto?: string } = {},
): Promise<void> {
  await apiPost(`/admin/tags/${encodeURIComponent(id)}/delete`, options);
}

/** Aliases typed one per line or separated by commas. */
export function parseAliases(text: string): string[] {
  const seen = new Set<string>();
  for (const alias of text.split(/[\n,]/)) {
    const value = alias.trim();
    if (value) seen.add(value);
  }
  return [...seen];
}

/** `ids` with `id` moved one place up or down (unchanged at the ends). */
export function moved(ids: readonly string[], id: string, direction: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const result = [...ids];
  [result[from], result[to]] = [result[to] ?? id, result[from] ?? id];
  return result;
}

/** A slug suggested from a label: `Plat principal` → `plat-principal`. */
export function slugFromLabel(label: string): string {
  return fold(label)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
}
