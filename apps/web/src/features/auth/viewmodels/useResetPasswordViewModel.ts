import { passwordSchema } from '@cookit/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { errorCode } from '@/lib/api';
import { checkPasswordReset, resetPassword } from '../model/auth';
import { useLinkToken } from './useLinkToken';

export function useResetPasswordViewModel() {
  const token = useLinkToken();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [invalid, setInvalid] = useState<('password' | 'confirmation')[]>([]);

  const link = useQuery({
    queryKey: ['password-reset', token],
    queryFn: () => checkPasswordReset(token),
    enabled: token !== '',
    retry: false,
  });
  const mutation = useMutation({ mutationFn: resetPassword });

  return {
    status: mutation.isSuccess
      ? 'done'
      : !token || link.isError
        ? 'invalid'
        : link.isPending
          ? 'loading'
          : 'ready',
    /** An admin's link also turns 2FA off and removes the passkeys. */
    removesSecondFactor: link.data === 'admin',
    password,
    confirmation,
    setPassword,
    setConfirmation,
    invalid,
    submitting: mutation.isPending,
    error: mutation.isError ? errorCode(mutation.error) : undefined,
    submit: (event: FormEvent) => {
      event.preventDefault();
      const fields: ('password' | 'confirmation')[] = [];
      if (!passwordSchema.safeParse(password).success) fields.push('password');
      if (password !== confirmation) fields.push('confirmation');
      setInvalid(fields);
      if (fields.length === 0) mutation.mutate({ token, password });
    },
  } as const;
}
