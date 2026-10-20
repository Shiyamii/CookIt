import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHomeViewModel } from '../viewmodels/useHomeViewModel';

export function HomePage() {
  const { t } = useTranslation();
  const { apiStatus: status } = useHomeViewModel();

  return (
    <Card>
      <CardHeader>
        {/* CardTitle renders a <div>: the page still needs a real <h1> for screen readers. */}
        <CardTitle className="text-2xl">
          <h1>{t('home.title')}</h1>
        </CardTitle>
        <CardDescription>{t('home.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4 text-sm">
        <span className="text-muted-foreground">{t('home.apiStatus')}</span>
        <span data-testid="api-status" data-status={status} className="flex items-center gap-2">
          <span
            className={
              status === 'ok'
                ? 'size-2 rounded-full bg-primary'
                : status === 'error'
                  ? 'size-2 rounded-full bg-destructive'
                  : 'size-2 animate-pulse rounded-full bg-muted-foreground'
            }
            aria-hidden
          />
          {t(`home.status.${status}`)}
        </span>
      </CardContent>
    </Card>
  );
}
