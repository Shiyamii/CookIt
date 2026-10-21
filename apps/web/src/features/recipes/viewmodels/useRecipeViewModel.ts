import type { RecipeVisibility } from '@cookit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { errorCode } from '@/lib/api';
import { useLinkToken } from '@/features/auth/viewmodels/useLinkToken';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { displayRecipe, durationText, parseDetail, sourceLink } from '../model/display';
import {
  copyRecipe,
  deleteRecipe,
  fetchRecipe,
  fetchSharedRecipe,
  RECIPES_QUERY_KEY,
  setVisibility,
} from '../model/recipes';

/**
 * A recipe page: `/recipes/:id` (owner or public recipe) or `/shared#token=…` (unlisted share
 * link). Servings can be changed (quantities follow, timers don't); the owner manages visibility
 * and deletion; another signed-in user can add it to their library.
 */
export function useRecipeViewModel(source: 'id' | 'shared') {
  const { id = '' } = useParams();
  const token = useLinkToken({ keep: true });
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [servings, setServings] = useState<number>();
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string>();

  const recipe = useQuery({
    queryKey:
      source === 'id'
        ? [...RECIPES_QUERY_KEY, 'detail', id]
        : [...RECIPES_QUERY_KEY, 'shared', token],
    queryFn: () => (source === 'id' ? fetchRecipe(id) : fetchSharedRecipe(token)),
    enabled: source === 'id' ? id !== '' : token !== '',
    retry: false,
  });
  const detail = recipe.data;

  const document = useMemo(() => (detail ? parseDetail(detail) : undefined), [detail]);
  const shownServings = servings ?? document?.servings ?? 1;
  const display = useMemo(
    () => (document && detail ? displayRecipe(document, shownServings, detail.lang) : undefined),
    [document, detail, shownServings],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });

  const visibility = useMutation({
    mutationFn: (value: RecipeVisibility) => setVisibility(detail?.id ?? '', value),
    onMutate: () => setError(undefined),
    onSuccess: async () => {
      setCopied(false);
      await refresh();
    },
    onError: (failure) => setError(errorCode(failure)),
  });

  const removal = useMutation({
    mutationFn: () => deleteRecipe(detail?.id ?? ''),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: [...RECIPES_QUERY_KEY, 'detail', detail?.id] });
      await refresh();
      await navigate('/recipes', { replace: true });
    },
    onError: (failure) => {
      setConfirmDelete(false);
      setError(errorCode(failure));
    },
  });

  const copy = useMutation({
    mutationFn: () => copyRecipe(detail?.id ?? '', source === 'shared' ? token : undefined),
    onMutate: () => setError(undefined),
    onSuccess: async (created) => {
      await refresh();
      await navigate(`/recipes/${created.id}`);
    },
    onError: (failure) => setError(errorCode(failure)),
  });

  const missing = (source === 'shared' && token === '') || recipe.isError || (detail && !document);

  return {
    status: missing ? 'not_found' : recipe.isPending ? 'loading' : 'ready',
    recipe: display,
    lang: detail?.lang,
    ownerName: detail?.ownerName ?? '',
    isOwner: detail?.isOwner ?? false,
    canCopy: user !== null && detail !== undefined && !detail.isOwner,
    signedIn: user !== null,
    id: detail?.id ?? '',
    visibility: detail?.visibility ?? 'private',
    shareUrl: detail?.shareUrl ?? null,
    sourceHref: sourceLink(display?.source ?? null),
    durationText,
    baseServings: document?.servings ?? 1,
    servings: shownServings,
    setServings: (value: number) => setServings(Math.max(1, Math.min(1000, Math.round(value)))),
    resetServings: () => setServings(undefined),
    error,
    busy: visibility.isPending || removal.isPending || copy.isPending,
    changeVisibility: (value: RecipeVisibility) => visibility.mutate(value),
    copied,
    copyShareUrl: async () => {
      if (!detail?.shareUrl) return;
      try {
        await navigator.clipboard.writeText(detail.shareUrl);
        setCopied(true);
      } catch {
        // No clipboard access: the link stays selectable.
      }
    },
    confirmDelete,
    askDelete: () => setConfirmDelete(true),
    cancelDelete: () => setConfirmDelete(false),
    deleteRecipe: () => removal.mutate(),
    addToLibrary: () => copy.mutate(),
  };
}
