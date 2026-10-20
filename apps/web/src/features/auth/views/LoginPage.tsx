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
          {vm.error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
            </Alert>
          )}
          <FormField
            label={t('auth.fields.identifier')}
            autoComplete="username"
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
          <p className="text-sm text-muted-foreground">{t('auth.login.inviteOnly')}</p>
        </form>
      </CardContent>
    </Card>
  );
}
