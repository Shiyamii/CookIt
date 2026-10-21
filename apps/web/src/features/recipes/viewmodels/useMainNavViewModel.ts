import { useSession } from '@/features/auth/viewmodels/useSession';

/** The main navigation: my recipes for a signed-in user, the public gallery for everyone. */
export function useMainNavViewModel() {
  const { user, isLoading } = useSession();
  return { signedIn: user !== null, loading: isLoading };
}
