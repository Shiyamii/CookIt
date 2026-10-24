import { FlaskConical } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { IS_DEMO } from '@/lib/demo';

/**
 * What needs a real server: in the demo build, a note in its place (before the visitor tries);
 * elsewhere, its children.
 */
export function NotInDemo({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  if (!IS_DEMO) return children;
  return (
    <Alert role="note" data-testid="not-in-demo">
      <FlaskConical aria-hidden />
      <AlertDescription>{t('demo.unavailable')}</AlertDescription>
    </Alert>
  );
}
