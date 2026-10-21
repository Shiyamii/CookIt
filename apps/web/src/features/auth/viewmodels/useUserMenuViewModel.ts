import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { clearDrafts } from '@/features/recipes/model/draft';
import { signOut } from '../model/auth';
import { useSession } from './useSession';

export function useUserMenuViewModel() {
  const { user, isLoading } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      // Every cached query may hold private data: start from a clean cache, and drop the local
      // recipe drafts (the next person on this browser must not see them).
      queryClient.clear();
      clearDrafts();
      await navigate('/login', { replace: true });
    },
  });

  return {
    user,
    isLoading,
    isAdmin: user?.role === 'admin',
    signOut: () => mutation.mutate(),
  };
}
