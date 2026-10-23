import { useEffect, useId, useRef, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = Omit<ComponentProps<typeof Input>, 'id'> & {
  label: string;
  /** Help text, replaced by `error` when the value is invalid. */
  hint?: string;
  error?: string;
  /**
   * Focus the field this long after it appears, rather than at once (`autoFocus`): a password
   * manager notices a field when it is added and opens its menu when it gets the focus, which it
   * misses if both happen at the same moment.
   */
  focusAfterMs?: number;
  /** Not a sign-in field (a passkey's name, a note…): password managers leave it alone. */
  notCredential?: boolean;
};

/** What the common password managers read to leave a field alone. */
const IGNORED_BY_PASSWORD_MANAGERS = {
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': 'true',
  'data-protonpass-ignore': 'true',
  'data-form-type': 'other',
};

/** Label + input + help or error text, wired for screen readers. */
export function FormField({ label, hint, error, focusAfterMs, notCredential, ...input }: Props) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const describedBy = error || hint ? `${id}-description` : undefined;

  useEffect(() => {
    if (focusAfterMs === undefined) return;
    const timer = setTimeout(() => ref.current?.focus(), focusAfterMs);
    return () => clearTimeout(timer);
  }, [focusAfterMs]);

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="h-11"
        {...(notCredential && IGNORED_BY_PASSWORD_MANAGERS)}
        {...input}
      />
      {(error || hint) && (
        <p
          id={describedBy}
          className={error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/**
 * The account a form is about, for password managers (a change of password, a 2FA or passkey
 * confirmation): they save or fill the password of this username. Not shown.
 */
export function HiddenUsername({ username }: { username: string }) {
  return (
    <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
  );
}
