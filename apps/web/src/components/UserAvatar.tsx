import { cn } from '@/lib/utils';

/**
 * A user's profile picture, or the first letter of their name. Decorative: the name is always
 * written next to it (or in the button's label).
 */
export function UserAvatar({
  image,
  name,
  className,
}: {
  image: string | null;
  name: string;
  className?: string;
}) {
  const classes = cn('inline-block size-8 shrink-0 rounded-full', className);
  if (image) return <img src={image} alt="" className={cn(classes, 'object-cover')} />;
  return (
    <span
      aria-hidden="true"
      className={cn(
        classes,
        'grid place-items-center bg-secondary font-medium text-secondary-foreground uppercase',
      )}
    >
      {[...name.trim()][0] ?? '?'}
    </span>
  );
}
