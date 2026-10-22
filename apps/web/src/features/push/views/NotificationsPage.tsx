import { Bell, BellOff, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePushViewModel } from '../viewmodels/usePushViewModel';

/**
 * Notifications of finished timers (plan §5.4): this device's state and switch, the account's
 * devices, and how to get them on each system (iPhone: from the home screen only).
 */
export function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const vm = usePushViewModel({ devices: true });
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });

  return (
    <div className="mx-auto grid w-full max-w-xl grid-cols-1 gap-6">
      <h1 className="text-2xl font-semibold">{t('push.title')}</h1>
      <p className="text-muted-foreground">{t('push.intro')}</p>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <h2>{t('push.thisDevice')}</h2>
            {vm.status !== 'loading' && (
              <Badge variant={vm.status === 'on' ? 'default' : 'secondary'}>
                {t(vm.status === 'on' ? 'push.badgeOn' : 'push.badgeOff')}
              </Badge>
            )}
          </CardTitle>
          <CardDescription data-testid="push-status">
            {vm.status === 'loading' ? t('common.loading') : t(`push.status.${vm.status}`)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {vm.error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            {vm.status === 'off' && (
              <Button onClick={vm.enable} disabled={vm.busy}>
                <Bell /> {t('push.enable')}
              </Button>
            )}
            {vm.status === 'on' && (
              <>
                <Button variant="outline" onClick={vm.test} disabled={vm.testing}>
                  <Send /> {t('push.test')}
                </Button>
                <Button variant="outline" onClick={vm.disable} disabled={vm.busy}>
                  <BellOff /> {t('push.disable')}
                </Button>
              </>
            )}
          </div>
          {vm.testSent !== undefined && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('push.testSent', { count: vm.testSent })}
            </p>
          )}
          {vm.devices.length > 0 && (
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">{t('push.devices')}</h3>
              <ul className="grid gap-1 text-sm">
                {vm.devices.map((device) => (
                  <li key={device.id} className="flex flex-wrap gap-x-2">
                    <span>{device.name || t('push.unknownDevice')}</span>
                    <span className="text-muted-foreground">
                      {date.format(new Date(device.createdAt))}
                    </span>
                    {device.current && <Badge variant="secondary">{t('push.current')}</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4" aria-labelledby="push-help">
        <h2 id="push-help" className="text-xl font-semibold">
          {t('push.help.title')}
        </h2>
        <HelpBlock title={t('push.help.iosTitle')} steps={t('push.help.ios')} />
        <HelpBlock title={t('push.help.androidTitle')} steps={t('push.help.android')} />
        <HelpBlock title={t('push.help.computerTitle')} steps={t('push.help.computer')} />
        <HelpBlock title={t('push.help.braveTitle')} steps={t('push.help.brave')} />
        <HelpBlock title={t('push.help.blockedTitle')} steps={t('push.help.blocked')} />
        <HelpBlock title={t('push.help.limitsTitle')} steps={t('push.help.limits')} />
      </section>
    </div>
  );
}

/** A help paragraph; its lines (`\n`) are steps. */
function HelpBlock({ title, steps }: { title: string; steps: string }) {
  const lines = steps.split('\n');
  return (
    <div className="grid gap-1">
      <h3 className="font-medium">{title}</h3>
      {lines.length > 1 ? (
        <ol className="list-decimal space-y-1 pl-6 text-muted-foreground">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground">{steps}</p>
      )}
    </div>
  );
}
