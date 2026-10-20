import { createInviteInputSchema, INVITE_DEFAULT_DAYS } from '@cookit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { errorCode } from '@/lib/api';
import {
  copyToClipboard,
  createInvite,
  INVITES_QUERY_KEY,
  listInvites,
  revokeInvite,
} from '../model/admin';

export function useInvitesViewModel() {
  const queryClient = useQueryClient();
  const invites = useQuery({ queryKey: INVITES_QUERY_KEY, queryFn: listInvites });
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(String(INVITE_DEFAULT_DAYS));
  const [invalidDays, setInvalidDays] = useState(false);
  const [copied, setCopied] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: INVITES_QUERY_KEY });

  const create = useMutation({
    mutationFn: createInvite,
    onSuccess: async () => {
      setLabel('');
      setCopied(false);
      await refresh();
    },
  });
  const revoke = useMutation({ mutationFn: revokeInvite, onSettled: refresh });

  return {
    invites: invites.data ?? [],
    loading: invites.isPending,
    loadError: invites.isError ? errorCode(invites.error) : undefined,
    label,
    setLabel,
    days,
    setDays,
    invalidDays,
    creating: create.isPending,
    createError: create.isError ? errorCode(create.error) : undefined,
    /** The link of the invite just created: shown once, the server only keeps its hash. */
    newLink: create.data?.url,
    copied,
    copyNewLink: async () => {
      if (create.data) setCopied(await copyToClipboard(create.data.url));
    },
    submit: (event: FormEvent) => {
      event.preventDefault();
      const parsed = createInviteInputSchema.safeParse({
        label: label.trim() || undefined,
        expiresInDays: Number(days),
      });
      setInvalidDays(!parsed.success);
      if (parsed.success) create.mutate(parsed.data);
    },
    revoke: (id: string) => revoke.mutate(id),
    revokingId: revoke.isPending ? revoke.variables : undefined,
  };
}
