import type { UserSummary } from '@cookit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { errorCode } from '@/lib/api';
import {
  copyToClipboard,
  createResetLink,
  deleteUser,
  disableUser,
  enableUser,
  listUsers,
  setUserListed,
  USERS_QUERY_KEY,
} from '../model/admin';

type Action = 'disable' | 'enable' | 'delete' | 'reset' | 'list' | 'unlist';

export function useUsersViewModel() {
  const queryClient = useQueryClient();
  const { user: me } = useSession();
  const users = useQuery({ queryKey: USERS_QUERY_KEY, queryFn: listUsers });
  const [resetLink, setResetLink] = useState<{ user: UserSummary; url: string; copied: boolean }>();
  const [pendingDelete, setPendingDelete] = useState<UserSummary>();

  const action = useMutation({
    mutationFn: async ({ action, user }: { action: Action; user: UserSummary }) => {
      if (action === 'disable') await disableUser(user.id);
      if (action === 'enable') await enableUser(user.id);
      if (action === 'delete') await deleteUser(user.id);
      if (action === 'list' || action === 'unlist') {
        await setUserListed(user.id, action === 'list');
      }
      if (action === 'reset') {
        const { url } = await createResetLink(user.id);
        setResetLink({ user, url, copied: false });
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });

  const run = (kind: Action, user: UserSummary) => action.mutate({ action: kind, user });

  return {
    users: users.data ?? [],
    loading: users.isPending,
    loadError: users.isError ? errorCode(users.error) : undefined,
    /** The signed-in admin cannot act on their own account (the server refuses too). */
    isSelf: (user: UserSummary) => user.id === me?.id,
    busyId: action.isPending ? action.variables.user.id : undefined,
    actionError: action.isError ? errorCode(action.error) : undefined,
    disable: (user: UserSummary) => run('disable', user),
    enable: (user: UserSummary) => run('enable', user),
    createResetLink: (user: UserSummary) => run('reset', user),
    /** Puts the user in the members list, or takes them out. */
    toggleListed: (user: UserSummary) => run(user.listed ? 'unlist' : 'list', user),
    resetLink,
    copyResetLink: async () => {
      if (resetLink) setResetLink({ ...resetLink, copied: await copyToClipboard(resetLink.url) });
    },
    dismissResetLink: () => setResetLink(undefined),
    pendingDelete,
    askDelete: (user: UserSummary) => setPendingDelete(user),
    cancelDelete: () => setPendingDelete(undefined),
    confirmDelete: () => {
      if (pendingDelete) run('delete', pendingDelete);
      setPendingDelete(undefined);
    },
  };
}
