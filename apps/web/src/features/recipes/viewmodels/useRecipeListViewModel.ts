import { isLocale, RECIPE_SCOPES, type RecipeScope } from '@cookit/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTagCatalog } from '@/features/catalog/viewmodels/useCatalogs';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { errorCode } from '@/lib/api';
import { EXPORT_ALL_URL } from '../model/importing';
import { fetchGallery, fetchMyRecipes, RECIPES_QUERY_KEY } from '../model/recipes';

const SEARCH_DELAY_MS = 300;

/**
 * My recipes or the public gallery, with search (kept in the URL: `?q=`) and "load more". My
 * recipes shows the user's own and the ones added by link (`?scope=mine|saved` narrows it).
 */
export function useRecipeListViewModel(kind: 'mine' | 'gallery') {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const urlScope = params.get('scope');
  const scope: RecipeScope =
    kind === 'mine' && RECIPE_SCOPES.includes(urlScope as RecipeScope)
      ? (urlScope as RecipeScope)
      : 'all';
  const urlTags = params.get('tags') ?? '';
  const tags = useMemo(() => urlTags.split(',').filter(Boolean), [urlTags]);
  const [search, setSearch] = useState(urlQuery);
  const catalog = useTagCatalog();

  // Typing waits a moment before searching (and before changing the URL).
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim() === urlQuery) return;
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (search.trim()) next.set('q', search.trim());
          else next.delete('q');
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, urlQuery, setParams]);

  // Titles in the interface language when the recipe has that translation.
  const { i18n } = useTranslation();
  const lang = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : undefined;
  const query = useInfiniteQuery({
    queryKey: [...RECIPES_QUERY_KEY, kind, urlQuery, urlTags, lang, scope],
    queryFn: ({ pageParam }) =>
      kind === 'mine'
        ? fetchMyRecipes(urlQuery, pageParam, tags, lang, scope)
        : fetchGallery(urlQuery, pageParam, tags, lang),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
  });

  return {
    search,
    setSearch,
    searching: urlQuery !== '' || tags.length > 0,
    // Filters: tags by category; a recipe must have all the selected ones.
    filterGroups: catalog.categories
      .filter((category) => category.tags.length > 0)
      .map((category) => ({
        id: category.id,
        label: catalog.label(category.labels, category.slug),
        tags: category.tags.map((tag) => ({
          slug: tag.slug,
          label: catalog.label(tag.labels, tag.slug),
          selected: tags.includes(tag.slug),
        })),
      })),
    selectedTagCount: tags.length,
    /** My recipes: all, the user's own, or the ones added by link. */
    scopes: RECIPE_SCOPES,
    scope,
    chooseScope: (value: RecipeScope) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value === 'all') next.delete('scope');
          else next.set('scope', value);
          return next;
        },
        { replace: true },
      ),
    toggleTag: (slug: string) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          const chosen = tags.includes(slug) ? tags.filter((t) => t !== slug) : [...tags, slug];
          if (chosen.length) next.set('tags', chosen.join(','));
          else next.delete('tags');
          return next;
        },
        { replace: true },
      ),
    clearTags: () =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('tags');
          return next;
        },
        { replace: true },
      ),
    recipes: query.data?.pages.flatMap((page) => page.recipes) ?? [],
    loading: query.isPending,
    loadError: query.isError,
    /** The gallery is for members only on this instance. */
    signInRequired: query.isError && errorCode(query.error) === 'sign_in_required',
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    exportAllUrl: EXPORT_ALL_URL,
  };
}
