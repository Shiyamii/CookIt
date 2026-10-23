import { isLocale } from '@cookit/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchMeta, META_QUERY_KEY } from '@/features/system/model/meta';
import { errorCode } from '@/lib/api';
import { requestPasswordReset } from '../model/auth';

/**
 * "Forgot your password?" (`/forgot-password`, email configured only): sends a reset link to the
 * account's address. The page says the same thing whether the account exists or not.
 */
export function useForgotPasswordViewModel() {
  const { i18n } = useTranslation();
  const meta = useQuery({ queryKey: META_QUERY_KEY, queryFn: fetchMeta });
  const [identifier, setIdentifier] = useState('');
  const request = useMutation({
    mutationFn: () =>
      requestPasswordReset(
        identifier.trim(),
        isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en',
      ),
  });

  return {
    status: meta.isPending
      ? 'loading'
      : meta.data?.email !== true
        ? 'unavailable'
        : request.isSuccess
          ? 'sent'
          : 'ready',
    identifier,
    setIdentifier,
    submitting: request.isPending,
    error: request.isError ? errorCode(request.error) : undefined,
    submit: (event: FormEvent) => {
      event.preventDefault();
      if (identifier.trim()) request.mutate();
    },
  } as const;
}
