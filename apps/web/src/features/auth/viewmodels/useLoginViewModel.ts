import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { errorCode } from '@/lib/api';
import { signIn } from '../model/auth';
import { useSession } from './useSession';

/** Only paths of this app: never redirect to another site after sign-in. */
function safeRedirect(value: string | null): string {
  if (!value) return '/';
  try {
    const url = new URL(value, window.location.origin);
    // `/\evil.com`, `//evil.com` or a full URL resolve to another origin.
    return url.origin === window.location.origin && value.startsWith('/')
      ? `${url.pathname}${url.search}`
      : '/';
  } catch {
    return '/';
  }
}

export function useLoginViewModel() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useSession();

  const mutation = useMutation({
    mutationFn: () => signIn(identifier, password),
    onSuccess: async () => {
      // Nothing cached for a previous user (expired session in a shared tab) may show up:
      // reset every query (active ones, like the session, are fetched again) before leaving,
      // so that the target page already sees the new session.
      await queryClient.resetQueries();
      await navigate(safeRedirect(params.get('redirect')), { replace: true });
    },
  });

  return {
    // Signed in before submitting this form: after a sign-in here, onSuccess handles the redirect.
    alreadySignedIn: user !== null && mutation.isIdle,
    identifier,
    password,
    setIdentifier,
    setPassword,
    submitting: mutation.isPending,
    error: mutation.isError ? errorCode(mutation.error) : undefined,
    submit: (event: FormEvent) => {
      event.preventDefault();
      if (identifier.trim() && password) mutation.mutate();
    },
  };
}
