import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { fetchGallery, fetchMyRecipes, RECIPES_QUERY_KEY } from '../model/recipes';

const SEARCH_DELAY_MS = 300;

/** My recipes or the public gallery, with search (kept in the URL: `?q=`) and "load more". */
export function useRecipeListViewModel(kind: 'mine' | 'gallery') {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const [search, setSearch] = useState(urlQuery);

  // Typing waits a moment before searching (and before changing the URL).
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim() === urlQuery) return;
      setParams(search.trim() ? { q: search.trim() } : {}, { replace: true });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, urlQuery, setParams]);

  const fetchPage = kind === 'mine' ? fetchMyRecipes : fetchGallery;
  const query = useInfiniteQuery({
    queryKey: [...RECIPES_QUERY_KEY, kind, urlQuery],
    queryFn: ({ pageParam }) => fetchPage(urlQuery, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
  });

  return {
    search,
    setSearch,
    searching: urlQuery !== '',
    recipes: query.data?.pages.flatMap((page) => page.recipes) ?? [],
    loading: query.isPending,
    loadError: query.isError,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
  };
}
