import { Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { usePushViewModel } from '../viewmodels/usePushViewModel';

/**
 * In the cooking mode: says clearly when this device will not be warned of a finished timer
 * with the page closed (plan §5.4), with a way to turn notifications on and the help page.
 */
export function PushNotice() {
  const { t } = useTranslation();
  const vm = usePushViewModel();
  if (vm.status === 'loading' || vm.status === 'on' || vm.status === 'not_configured') {
    return null;
  }
  return (
    <div
      role="status"
      data-testid="push-notice"
      className="grid gap-2 rounded-lg border border-dashed p-3 text-sm"
    >
      <p className="flex gap-2">
        <BellOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0">{t(`push.notice.${vm.status}`)}</span>
      </p>
      <div className="flex flex-wrap gap-2 pl-6">
        {vm.status === 'off' && (
          <Button size="sm" onClick={vm.enable} disabled={vm.busy}>
            <Bell /> {t('push.enable')}
          </Button>
        )}
        <Button asChild size="sm" variant="ghost">
          <Link to="/account/notifications">{t('push.help.link')}</Link>
        </Button>
      </div>
      {vm.error && (
        <p role="alert" className="w-full text-destructive">
          {t(`errors.${vm.error}`, t('errors.unknown'))}
        </p>
      )}
    </div>
  );
}
