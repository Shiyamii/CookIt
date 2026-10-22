import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLoginViewModel } from '../viewmodels/useLoginViewModel';

export function LoginPage() {
  const { t } = useTranslation();
  const vm = useLoginViewModel();
  if (vm.alreadySignedIn) return <Navigate to="/" replace />;

  const errorAlert = vm.error && (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
    </Alert>
  );

  if (vm.step === 'code') {
    const backup = vm.codeKind === 'backup';
    return (
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">
            <h1>{t('auth.twoFactor.title')}</h1>
          </CardTitle>
          <CardDescription>
            {backup ? t('auth.twoFactor.backupSubtitle') : t('auth.twoFactor.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={vm.submitCode} noValidate>
            {errorAlert}
            <FormField
              key={vm.codeKind}
              label={backup ? t('auth.twoFactor.backupCode') : t('auth.twoFactor.code')}
              autoComplete="one-time-code"
              inputMode={backup ? 'text' : 'numeric'}
              autoCapitalize="none"
              autoFocus
              required
              value={vm.code}
              onChange={(event) => vm.setCode(event.target.value)}
            />
            <Button type="submit" size="lg" disabled={vm.submitting}>
              {t('auth.twoFactor.submit')}
            </Button>
            <Button
              type="button"
              variant="link"
              className="text-foreground underline decoration-primary decoration-2"
              onClick={vm.toggleCodeKind}
            >
              {backup ? t('auth.twoFactor.useApp') : t('auth.twoFactor.useBackup')}
            </Button>
            <Button type="button" variant="ghost" onClick={vm.backToCredentials}>
              {t('auth.twoFactor.back')}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">
          <h1>{t('auth.login.title')}</h1>
        </CardTitle>
        <CardDescription>{t('auth.login.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={vm.submit} noValidate>
          {errorAlert}
          <FormField
            label={t('auth.fields.identifier')}
            // `webauthn`: the browser may suggest saved passkeys in this field.
            autoComplete="username webauthn"
            autoCapitalize="none"
            required
            value={vm.identifier}
            onChange={(event) => vm.setIdentifier(event.target.value)}
          />
          <FormField
            label={t('auth.fields.password')}
            type="password"
            autoComplete="current-password"
            required
            value={vm.password}
            onChange={(event) => vm.setPassword(event.target.value)}
          />
          <Button type="submit" size="lg" disabled={vm.submitting}>
            {t('auth.login.submit')}
          </Button>
          {vm.passkeysAvailable && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={vm.submitting}
              onClick={vm.signInWithPasskey}
            >
              <KeyRound /> {t('auth.login.passkey')}
            </Button>
          )}
          <p className="text-sm text-muted-foreground">{t('auth.login.inviteOnly')}</p>
        </form>
      </CardContent>
    </Card>
  );
}
