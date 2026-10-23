import { passwordSchema } from '@cookit/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { errorCode } from '@/lib/api';
import { changePassword } from '../model/security';

type Field = 'current' | 'password' | 'confirmation';

export function useChangePasswordViewModel() {
  const { user } = useSession();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [invalid, setInvalid] = useState<Field[]>([]);

  const mutation = useMutation({
    mutationFn: () => changePassword(current, password),
    onSuccess: () => {
      setCurrent('');
      setPassword('');
      setConfirmation('');
    },
  });

  return {
    /** For password managers: the account these passwords belong to. */
    username: user?.username ?? '',
    current,
    password,
    confirmation,
    setCurrent,
    setPassword,
    setConfirmation,
    invalid,
    submitting: mutation.isPending,
    done: mutation.isSuccess,
    error: mutation.isError ? errorCode(mutation.error) : undefined,
    submit: (event: FormEvent) => {
      event.preventDefault();
      const fields: Field[] = [];
      if (!current) fields.push('current');
      if (!passwordSchema.safeParse(password).success) fields.push('password');
      if (password !== confirmation) fields.push('confirmation');
      setInvalid(fields);
      if (fields.length === 0) mutation.mutate();
    },
  } as const;
}
