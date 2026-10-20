import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

/** Shown for an unknown, used, revoked or expired link (the reason is not disclosed). */
export function InvalidLink() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{t('auth.invalidLink.title')}</h1>
      <p className="max-w-sm text-muted-foreground">{t('auth.invalidLink.text')}</p>
      <Button asChild variant="outline">
        <Link to="/login">{t('auth.login.title')}</Link>
      </Button>
    </div>
  );
}
