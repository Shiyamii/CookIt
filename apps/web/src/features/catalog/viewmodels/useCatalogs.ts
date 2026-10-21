import type { TagCategory, Unit } from '@cookit/shared';
import { labelFor, type LocalizedLabels } from '@cookit/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { isLocale } from '@cookit/shared';
import { fetchTags, fetchUnits, TAGS_QUERY_KEY, UNITS_QUERY_KEY } from '../model/catalog';

/** The catalogs change rarely: kept for a few minutes before being read again. */
const STALE_MS = 5 * 60_000;

/** The unit catalog for parsing and scaling (undefined while loading). */
export function useUnitCatalog(): { units: readonly Unit[] | undefined; failed: boolean } {
  const query = useQuery({ queryKey: UNITS_QUERY_KEY, queryFn: fetchUnits, staleTime: STALE_MS });
  return { units: query.data, failed: query.isError };
}

/** Tag categories with their tags, and their labels in the interface language. */
export function useTagCatalog() {
  const { i18n } = useTranslation();
  const locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'fr';
  const query = useQuery({ queryKey: TAGS_QUERY_KEY, queryFn: fetchTags, staleTime: STALE_MS });
  const label = useCallback(
    (labels: LocalizedLabels, fallback: string) => labelFor(labels, locale, fallback),
    [locale],
  );
  const categories: TagCategory[] = query.data ?? [];
  return { categories, loading: query.isPending, label };
}
