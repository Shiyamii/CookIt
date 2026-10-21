import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { errorCode } from '@/lib/api';
import {
  confirmTwoFactor,
  disableTwoFactor,
  fetchSecurity,
  regenerateBackupCodes,
  SECURITY_QUERY_KEY,
  startTwoFactor,
  type TwoFactorSetup,
} from '../model/security';

/** What needs the password first: turning 2FA on or off, or new backup codes. */
export type PasswordAction = 'enable' | 'disable' | 'regenerate';

type Mode =
  | { kind: 'idle' }
  | { kind: 'password'; action: PasswordAction }
  | { kind: 'setup'; setup: TwoFactorSetup }
  // Backup codes are shown once: after the first code is confirmed, or after a regeneration.
  | { kind: 'codes'; codes: string[] };

export function useTwoFactorViewModel() {
  const queryClient = useQueryClient();
  const security = useQuery({ queryKey: SECURITY_QUERY_KEY, queryFn: fetchSecurity });
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = () => queryClient.invalidateQueries({ queryKey: SECURITY_QUERY_KEY });
  const show = (next: Mode) => {
    setMode(next);
    setPassword('');
    setCode('');
    setCopied(false);
    setError(undefined);
  };

  const withPassword = useMutation({
    mutationFn: async (action: PasswordAction): Promise<Mode> => {
      if (action === 'enable') return { kind: 'setup', setup: await startTwoFactor(password) };
      if (action === 'regenerate') {
        return { kind: 'codes', codes: await regenerateBackupCodes(password) };
      }
      await disableTwoFactor(password);
      return { kind: 'idle' };
    },
    onMutate: () => setError(undefined),
    onSuccess: async (next) => {
      show(next);
      await refresh();
    },
    onError: (failure) => {
      setPassword('');
      setError(errorCode(failure));
    },
  });

  const confirmation = useMutation({
    mutationFn: (setup: TwoFactorSetup) => confirmTwoFactor(code).then(() => setup.backupCodes),
    onMutate: () => setError(undefined),
    onSuccess: async (codes) => {
      show({ kind: 'codes', codes });
      await refresh();
    },
    onError: (failure) => {
      setCode('');
      setError(errorCode(failure));
    },
  });

  return {
    loading: security.isPending,
    loadError: security.isError,
    enabled: security.data?.twoFactorEnabled ?? false,
    mode,
    password,
    setPassword,
    code,
    setCode,
    copied,
    error,
    submitting: withPassword.isPending || confirmation.isPending,
    ask: (action: PasswordAction) => show({ kind: 'password', action }),
    cancel: () => show({ kind: 'idle' }),
    submitPassword: (event: FormEvent) => {
      event.preventDefault();
      if (mode.kind === 'password' && password) withPassword.mutate(mode.action);
    },
    submitCode: (event: FormEvent) => {
      event.preventDefault();
      if (mode.kind === 'setup' && code.trim()) confirmation.mutate(mode.setup);
    },
    copyCodes: async () => {
      if (mode.kind !== 'codes') return;
      try {
        await navigator.clipboard.writeText(mode.codes.join('\n'));
        setCopied(true);
      } catch {
        // No clipboard access (permissions): the codes stay visible to copy by hand.
      }
    },
  };
}
