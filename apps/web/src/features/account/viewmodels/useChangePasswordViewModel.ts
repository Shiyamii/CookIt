import { passwordSchema } from '@cookit/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { errorCode } from '@/lib/api';
import { changePassword } from '../model/security';

type Field = 'current' | 'password' | 'confirmation';

export function useChangePasswordViewModel() {
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
