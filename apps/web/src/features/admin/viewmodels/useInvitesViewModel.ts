import {
  createInviteInputSchema,
  INVITE_DEFAULT_DAYS,
  isLocale,
  SUPPORTED_LOCALES,
  type Locale,
} from '@cookit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchMeta, META_QUERY_KEY } from '@/features/system/model/meta';
import { ApiError, errorCode } from '@/lib/api';
import {
  copyToClipboard,
  createInvite,
  INVITES_QUERY_KEY,
  listInvites,
  revokeInvite,
  sendTestEmail,
} from '../model/admin';

/**
 * The invitations page: create a link (copied by hand, or emailed when email is configured),
 * list and revoke invites, send a test email.
 */
export function useInvitesViewModel() {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const meta = useQuery({ queryKey: META_QUERY_KEY, queryFn: fetchMeta });
  const invites = useQuery({ queryKey: INVITES_QUERY_KEY, queryFn: listInvites });
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(String(INVITE_DEFAULT_DAYS));
  const [email, setEmail] = useState('');
  const [locale, setLocale] = useState<Locale>(() =>
    isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en',
  );
  const [invalid, setInvalid] = useState<('days' | 'email')[]>([]);
  const [copied, setCopied] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: INVITES_QUERY_KEY });

  const create = useMutation({
    mutationFn: createInvite,
    onSuccess: async () => {
      setLabel('');
      setEmail('');
      setCopied(false);
      await refresh();
    },
  });
  const revoke = useMutation({ mutationFn: revokeInvite, onSettled: refresh });
  const test = useMutation({ mutationFn: sendTestEmail });
  const testDetail =
    test.error instanceof ApiError && typeof test.error.details?.detail === 'string'
      ? test.error.details.detail
      : undefined;

  return {
    emailEnabled: meta.data?.email === true,
    invites: invites.data ?? [],
    loading: invites.isPending,
    loadError: invites.isError ? errorCode(invites.error) : undefined,
    label,
    setLabel,
    days,
    setDays,
    email,
    setEmail,
    locale,
    setLocale: (value: string) => {
      if (isLocale(value)) setLocale(value);
    },
    locales: SUPPORTED_LOCALES,
    invalidDays: invalid.includes('days'),
    invalidEmail: invalid.includes('email'),
    creating: create.isPending,
    createError: create.isError ? errorCode(create.error) : undefined,
    /** The link of the invite just created: shown once, the server only keeps its hash. */
    newLink: create.data?.url,
    /** Where it was emailed; `failed` when an address was given but the email did not leave. */
    emailedTo: create.data?.emailed ? create.variables?.email : undefined,
    emailFailed: create.data !== undefined && !create.data.emailed && !!create.variables?.email,
    copied,
    copyNewLink: async () => {
      if (create.data) setCopied(await copyToClipboard(create.data.url));
    },
    submit: (event: FormEvent) => {
      event.preventDefault();
      const parsed = createInviteInputSchema.safeParse({
        label: label.trim() || undefined,
        expiresInDays: Number(days),
        email: email.trim() || undefined,
        locale,
      });
      setInvalid(
        parsed.success
          ? []
          : parsed.error.issues.map((issue) =>
              issue.path[0] === 'email' ? ('email' as const) : ('days' as const),
            ),
      );
      if (parsed.success) create.mutate(parsed.data);
    },
    revoke: (id: string) => revoke.mutate(id),
    revokingId: revoke.isPending ? revoke.variables : undefined,

    sendTestEmail: () => test.mutate(),
    testing: test.isPending,
    testSentTo: test.data?.to,
    testError: test.isError ? errorCode(test.error) : undefined,
    testDetail,
  };
}
