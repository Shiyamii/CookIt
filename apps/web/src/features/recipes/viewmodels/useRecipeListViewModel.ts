import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTagCatalog } from '@/features/catalog/viewmodels/useCatalogs';
import { useSearchParams } from 'react-router';
import { EXPORT_ALL_URL } from '../model/importing';
import { fetchGallery, fetchMyRecipes, RECIPES_QUERY_KEY } from '../model/recipes';

const SEARCH_DELAY_MS = 300;

/** My recipes or the public gallery, with search (kept in the URL: `?q=`) and "load more". */
export function useRecipeListViewModel(kind: 'mine' | 'gallery') {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get('q') ?? '';
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

  const fetchPage = kind === 'mine' ? fetchMyRecipes : fetchGallery;
  const query = useInfiniteQuery({
    queryKey: [...RECIPES_QUERY_KEY, kind, urlQuery, urlTags],
    queryFn: ({ pageParam }) => fetchPage(urlQuery, pageParam, tags),
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
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    exportAllUrl: EXPORT_ALL_URL,
  };
}
