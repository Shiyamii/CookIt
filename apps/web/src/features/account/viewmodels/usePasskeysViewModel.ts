import type { PasskeySummary } from '@cookit/shared';
import { passkeyNameSchema } from '@cookit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { errorCode } from '@/lib/api';
import { passkeysSupported } from '@/features/auth/model/auth';
import {
  addPasskey,
  deletePasskey,
  fetchSecurity,
  renamePasskey,
  SECURITY_QUERY_KEY,
} from '../model/security';

export function usePasskeysViewModel() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const security = useQuery({ queryKey: SECURITY_QUERY_KEY, queryFn: fetchSecurity });
  const [name, setName] = useState('');
  // The password, asked again before adding or deleting a passkey.
  const [password, setPassword] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string }>();
  const [pendingDelete, setPendingDelete] = useState<PasskeySummary>();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = () => queryClient.invalidateQueries({ queryKey: SECURITY_QUERY_KEY });
  const onError = (failure: unknown) => {
    const reason = errorCode(failure);
    // Closing the browser dialog is not an error worth a message.
    if (reason !== 'passkey_cancelled') setError(reason);
  };

  const add = useMutation({
    mutationFn: () => addPasskey(name, password),
    onMutate: () => {
      setError(undefined);
      setAdded(false);
    },
    onSuccess: async () => {
      setName('');
      setAdded(true);
      await refresh();
    },
    onError,
    onSettled: () => setPassword(''),
  });

  const rename = useMutation({
    mutationFn: (target: { id: string; name: string }) => renamePasskey(target.id, target.name),
    onMutate: () => setError(undefined),
    onSuccess: async () => {
      setEditing(undefined);
      await refresh();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePasskey(id, password),
    onMutate: () => setError(undefined),
    onSettled: async () => {
      setPendingDelete(undefined);
      setPassword('');
      await refresh();
    },
    onError,
  });

  return {
    /** For password managers: the account these passwords belong to. */
    username: user?.username ?? '',
    supported: passkeysSupported(),
    loading: security.isPending,
    loadError: security.isError,
    passkeys: security.data?.passkeys ?? [],
    name,
    setName,
    password,
    setPassword,
    nameInvalid: name.trim() !== '' && !passkeyNameSchema.safeParse(name).success,
    added,
    error,
    busy: add.isPending || rename.isPending || remove.isPending,
    submitAdd: (event: FormEvent) => {
      event.preventDefault();
      if (!password) return;
      if (name.trim() === '' || passkeyNameSchema.safeParse(name).success) add.mutate();
    },
    editing,
    startRename: (passkey: PasskeySummary) =>
      setEditing({ id: passkey.id, name: passkey.name ?? '' }),
    setEditingName: (value: string) =>
      setEditing((current) => current && { ...current, name: value }),
    editingInvalid: editing !== undefined && !passkeyNameSchema.safeParse(editing.name).success,
    cancelRename: () => setEditing(undefined),
    submitRename: (event: FormEvent) => {
      event.preventDefault();
      if (editing && passkeyNameSchema.safeParse(editing.name).success) rename.mutate(editing);
    },
    pendingDelete,
    askDelete: (passkey: PasskeySummary) => {
      setPassword('');
      setPendingDelete(passkey);
    },
    cancelDelete: () => {
      setPassword('');
      setPendingDelete(undefined);
    },
    confirmDelete: (event: FormEvent) => {
      event.preventDefault();
      if (pendingDelete && password) remove.mutate(pendingDelete.id);
    },
  };
}
