import { isLocale, registerInputSchema } from '@cookit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { errorCode } from '@/lib/api';
import { checkInvite, register } from '../model/auth';
import { useLinkToken } from './useLinkToken';

export type RegisterField = 'username' | 'email' | 'name' | 'password' | 'confirmation';

/** Sign-up from an invite link (`/invite#token=…`) or the first-admin link (`/setup#token=…`). */
export function useRegisterViewModel() {
  const token = useLinkToken();
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => checkInvite(token),
    enabled: token !== '',
    retry: false,
  });

  const [values, setValues] = useState<Record<RegisterField, string>>({
    username: '',
    email: '',
    name: '',
    password: '',
    confirmation: '',
  });
  const [invalid, setInvalid] = useState<RegisterField[]>([]);
  // The first admin's email is pre-filled (ADMIN_EMAIL) until the user types their own.
  const email = values.email || invite.data?.email || '';

  const mutation = useMutation({
    mutationFn: register,
    onSuccess: async () => {
      // Leave the page first: its own queries (the invite check) must not run again.
      await navigate('/', { replace: true });
      // Nothing cached for a previous user may show up (active queries are fetched again).
      await queryClient.resetQueries();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';
    const parsed = registerInputSchema.safeParse({
      token,
      username: values.username,
      email,
      name: values.name.trim() || undefined,
      password: values.password,
      locale,
    });
    const fields = parsed.success
      ? []
      : parsed.error.issues.map((issue) => String(issue.path[0]) as RegisterField);
    if (values.password !== values.confirmation) fields.push('confirmation');
    setInvalid(fields);
    if (parsed.success && fields.length === 0) mutation.mutate(parsed.data);
  };

  return {
    status: !token || invite.isError ? 'invalid' : invite.isPending ? 'loading' : 'ready',
    isAdminSetup: invite.data?.role === 'admin',
    values: { ...values, email },
    setValue: (field: RegisterField, value: string) => setValues((v) => ({ ...v, [field]: value })),
    invalid,
    submitting: mutation.isPending,
    error: mutation.isError ? errorCode(mutation.error) : undefined,
    submit,
  } as const;
}
