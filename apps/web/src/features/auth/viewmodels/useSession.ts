import { useQuery } from '@tanstack/react-query';
import { fetchCurrentUser, SESSION_QUERY_KEY } from '../model/auth';

/** The signed-in user, shared by every ViewModel that needs it (one cached query). */
export function useSession() {
  const query = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchCurrentUser,
    staleTime: 60_000,
  });
  return { user: query.data ?? null, isLoading: query.isPending };
}
