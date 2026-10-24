import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { fetchMeta, META_QUERY_KEY } from '@/features/system/model/meta';

/**
 * The main navigation: my recipes for a signed-in user; the gallery for members, and for everyone
 * when the instance's gallery is public.
 */
export function useMainNavViewModel() {
  const { user, isLoading } = useSession();
  const meta = useQuery({ queryKey: META_QUERY_KEY, queryFn: fetchMeta });
  return {
    signedIn: user !== null,
    loading: isLoading,
    showGallery: user !== null || meta.data?.publicGallery === true,
  };
}
