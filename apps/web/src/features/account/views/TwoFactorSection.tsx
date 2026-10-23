import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FormField, HiddenUsername } from '@/components/FormField';
import { QrCode } from '@/components/QrCode';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTwoFactorViewModel } from '../viewmodels/useTwoFactorViewModel';

export function TwoFactorSection() {
  const { t } = useTranslation();
  const vm = useTwoFactorViewModel();
  const { mode } = vm;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <h2>{t('account.twoFactor.title')}</h2>
          {!vm.loading && (
            <Badge variant={vm.enabled ? 'default' : 'secondary'}>
              {vm.enabled ? t('account.twoFactor.on') : t('account.twoFactor.off')}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{t('account.twoFactor.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {vm.error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
          </Alert>
        )}
        {vm.loadError && <p className="text-destructive">{t('errors.unknown')}</p>}

        {mode.kind === 'idle' && !vm.loading && (
          <div className="flex flex-wrap gap-2">
            {vm.enabled ? (
              <>
                <Button variant="outline" onClick={() => vm.ask('regenerate')}>
                  {t('account.twoFactor.regenerate')}
                </Button>
                <Button variant="destructive" onClick={() => vm.ask('disable')}>
                  {t('account.twoFactor.disable')}
                </Button>
              </>
            ) : (
              <Button onClick={() => vm.ask('enable')}>{t('account.twoFactor.enable')}</Button>
            )}
          </div>
        )}

        {mode.kind === 'password' && (
          <form className="grid gap-4" onSubmit={vm.submitPassword} noValidate>
            <HiddenUsername username={vm.username} />
            <p className="text-sm">{t(`account.twoFactor.confirm.${mode.action}`)}</p>
            <FormField
              label={t('auth.fields.password')}
              type="password"
              name="current-password"
              autoComplete="current-password"
              focusAfterMs={150}
              required
              value={vm.password}
              onChange={(event) => vm.setPassword(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant={mode.action === 'disable' ? 'destructive' : 'default'}
                disabled={vm.submitting}
              >
                {t('account.twoFactor.continue')}
              </Button>
              <Button type="button" variant="ghost" onClick={vm.cancel}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        )}

        {mode.kind === 'setup' && (
          <form className="grid gap-4" onSubmit={vm.submitCode} noValidate>
            <HiddenUsername username={vm.username} />
            <ol className="grid list-decimal gap-1 pl-5 text-sm">
              <li>{t('account.twoFactor.setup.scan')}</li>
              <li>{t('account.twoFactor.setup.enterCode')}</li>
            </ol>
            <div className="justify-self-center">
              <QrCode value={mode.setup.uri} label={t('account.twoFactor.setup.qrLabel')} />
            </div>
            <div className="grid gap-1 text-sm">
              <span className="text-muted-foreground">{t('account.twoFactor.setup.manual')}</span>
              <code
                data-testid="totp-secret"
                className="rounded-md bg-muted px-2 py-1 font-mono break-all select-all"
              >
                {mode.setup.secret}
              </code>
            </div>
            <FormField
              label={t('auth.twoFactor.code')}
              name="totp"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]*"
              inputMode="numeric"
              required
              value={vm.code}
              onChange={(event) => vm.setCode(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={vm.submitting}>
                {t('account.twoFactor.setup.activate')}
              </Button>
              <Button type="button" variant="ghost" onClick={vm.cancel}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        )}

        {mode.kind === 'codes' && (
          <div className="grid gap-4">
            <Alert role="status">
              <AlertDescription>{t('account.twoFactor.codes.intro')}</AlertDescription>
            </Alert>
            <ul
              data-testid="backup-codes"
              className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 font-mono text-sm"
            >
              {mode.codes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void vm.copyCodes()}>
                {vm.copied ? <Check /> : <Copy />}
                {vm.copied ? t('common.copied') : t('common.copy')}
              </Button>
              <Button onClick={vm.cancel}>{t('account.twoFactor.codes.saved')}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
