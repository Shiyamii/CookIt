import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { signOut } from '../model/auth';
import { useSession } from './useSession';

export function useUserMenuViewModel() {
  const { user, isLoading } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      // Every cached query may hold private data: start from a clean cache.
      queryClient.clear();
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
