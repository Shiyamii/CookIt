import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { clearCookingData } from '@/features/cooking/model/store';
import { forgetPushSubscription } from '@/features/push/model/push';
import { clearDrafts } from '@/features/recipes/model/draft';
import { signOut } from '../model/auth';
import { useSession } from './useSession';

export function useUserMenuViewModel() {
  const { user, isLoading } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: async () => {
      // While still signed in: this browser stops getting the account's notifications.
      await forgetPushSubscription();
      await signOut();
    },
    onSuccess: async () => {
      // Every cached query may hold private data: start from a clean cache, and drop the local
      // recipe drafts and cooking session (the next person on this browser must not see them).
      queryClient.clear();
      clearDrafts();
      clearCookingData();
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
