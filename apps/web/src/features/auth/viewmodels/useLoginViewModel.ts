import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clearOfflineData } from '@/features/pwa/model/offline';
import { useEffect, useEffectEvent, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { errorCode } from '@/lib/api';
import {
  cancelPasskeyPrompt,
  passkeyAutofillSupported,
  passkeysSupported,
  signIn,
  signInWithPasskey,
  verifySignInCode,
} from '../model/auth';
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

/**
 * The 2FA challenge is gone (expired after 10 minutes, too many wrong codes) or the account's 2FA
 * is locked for an hour: back to the password step.
 */
const CHALLENGE_LOST = new Set([
  'INVALID_TWO_FACTOR_COOKIE',
  'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE',
  'ACCOUNT_TEMPORARILY_LOCKED',
]);

export function useLoginViewModel() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'credentials' | 'code'>('credentials');
  const [codeKind, setCodeKind] = useState<'totp' | 'backup'>('totp');
  const [code, setCode] = useState('');
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useSession();

  const finish = async () => {
    setFinished(true);
    // Nothing cached for a previous user (expired session in a shared tab) may show up:
    // reset every query (active ones, like the session, are fetched again) before leaving,
    // so that the target page already sees the new session.
    await clearOfflineData();
    await queryClient.resetQueries();
    await navigate(safeRedirect(params.get('redirect')), { replace: true });
  };
  const finishFromAutofill = useEffectEvent(finish);
  const failFromAutofill = useEffectEvent((reason: string) => setError(reason));

  const credentials = useMutation({
    mutationFn: () => signIn(identifier, password),
    onMutate: () => setError(undefined),
    onSuccess: async (result) => {
      if (result === 'signed_in') return finish();
      setPassword('');
      setStep('code');
    },
    onError: (failure) => setError(errorCode(failure)),
  });

  const verification = useMutation({
    mutationFn: () => verifySignInCode(codeKind, code),
    onMutate: () => setError(undefined),
    onSuccess: finish,
    onError: (failure) => {
      const reason = errorCode(failure);
      setError(reason);
      setCode('');
      if (CHALLENGE_LOST.has(reason)) setStep('credentials');
    },
  });

  const passkey = useMutation({
    mutationFn: () => signInWithPasskey(),
    onMutate: () => setError(undefined),
    onSuccess: finish,
    onError: (failure) => {
      const reason = errorCode(failure);
      // Closing the browser dialog is not an error worth a message.
      if (reason !== 'passkey_cancelled') setError(reason);
    },
  });

  // Passkeys suggested in the username field: waits in the background until one is picked.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!passkeysSupported() || !(await passkeyAutofillSupported()) || !active) return;
      try {
        await signInWithPasskey(true);
        if (active) await finishFromAutofill();
      } catch (failure) {
        const reason = errorCode(failure);
        if (active && reason !== 'passkey_cancelled') failFromAutofill(reason);
      }
    })();
    return () => {
      active = false;
      cancelPasskeyPrompt();
    };
  }, []);

  const busy = credentials.isPending || verification.isPending || passkey.isPending;

  return {
    // Signed in before using this page: after a sign-in here, `finish` handles the redirect.
    alreadySignedIn: user !== null && !finished && !busy && credentials.isIdle,
    step,
    identifier,
    password,
    setIdentifier,
    setPassword,
    codeKind,
    code,
    setCode,
    passkeysAvailable: passkeysSupported(),
    submitting: busy,
    error,
    submit: (event: FormEvent) => {
      event.preventDefault();
      if (identifier.trim() && password) credentials.mutate();
    },
    submitCode: (event: FormEvent) => {
      event.preventDefault();
      if (code.trim()) verification.mutate();
    },
    /** Switches between the authenticator app code and a backup code. */
    toggleCodeKind: () => {
      setCodeKind((kind) => (kind === 'totp' ? 'backup' : 'totp'));
      setCode('');
      setError(undefined);
    },
    backToCredentials: () => {
      setStep('credentials');
      setCode('');
      setError(undefined);
    },
    signInWithPasskey: () => passkey.mutate(),
  };
}
