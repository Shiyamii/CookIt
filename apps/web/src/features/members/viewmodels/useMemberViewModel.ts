import { isLocale } from '@cookit/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { fetchMember, fetchMemberRecipes, MEMBERS_QUERY_KEY } from '../model/members';

/** A member's page: their name, picture and public recipes. */
export function useMemberViewModel() {
  const { username = '' } = useParams();
  const { user } = useSession();
  const { i18n } = useTranslation();
  const lang = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : undefined;

  const member = useQuery({
    queryKey: [...MEMBERS_QUERY_KEY, 'profile', username],
    queryFn: () => fetchMember(username),
    retry: false,
  });
  const recipes = useInfiniteQuery({
    queryKey: [...MEMBERS_QUERY_KEY, 'recipes', username, lang],
    queryFn: ({ pageParam }) => fetchMemberRecipes(username, pageParam, lang),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled: member.isSuccess,
  });

  return {
    status: member.isPending ? 'loading' : member.isError ? 'not_found' : 'ready',
    member: member.data,
    /** The signed-in user's own page: where to change how they appear. */
    isMe:
      member.data !== undefined &&
      member.data.username.toLowerCase() === user?.username?.toLowerCase(),
    recipes: recipes.data?.pages.flatMap((page) => page.recipes) ?? [],
    recipesLoading: recipes.isPending,
    hasMore: recipes.hasNextPage,
    loadingMore: recipes.isFetchingNextPage,
    loadMore: () => void recipes.fetchNextPage(),
  };
}
