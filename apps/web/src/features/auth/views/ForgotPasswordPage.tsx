import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useForgotPasswordViewModel } from '../viewmodels/useForgotPasswordViewModel';

/** Asks for a password reset link by email. */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const vm = useForgotPasswordViewModel();

  if (vm.status === 'loading')
    return <p className="text-muted-foreground">{t('common.loading')}</p>;

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">
          <h1>{t('auth.forgot.title')}</h1>
        </CardTitle>
        {vm.status === 'ready' && <CardDescription>{t('auth.forgot.subtitle')}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4">
        {vm.status === 'unavailable' ? (
          <p>{t('auth.forgot.unavailable')}</p>
        ) : vm.status === 'sent' ? (
          <p role="status">{t('auth.forgot.sent')}</p>
        ) : (
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
            <Button type="submit" size="lg" disabled={vm.submitting || !vm.identifier.trim()}>
              {t('auth.forgot.submit')}
            </Button>
          </form>
        )}
        <Link
          to="/login"
          className="justify-self-start text-sm font-medium underline decoration-primary decoration-2 underline-offset-2"
        >
          {t('auth.forgot.back')}
        </Link>
      </CardContent>
    </Card>
  );
}
