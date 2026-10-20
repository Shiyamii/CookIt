import { useId, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = Omit<ComponentProps<typeof Input>, 'id'> & {
  label: string;
  /** Help text, replaced by `error` when the value is invalid. */
  hint?: string;
  error?: string;
};

/** Label + input + help or error text, wired for screen readers. */
export function FormField({ label, hint, error, ...input }: Props) {
  const id = useId();
  const describedBy = error || hint ? `${id}-description` : undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="h-11"
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
