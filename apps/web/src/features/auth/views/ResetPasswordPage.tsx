import { PASSWORD_MIN_LENGTH } from '@cookit/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useResetPasswordViewModel } from '../viewmodels/useResetPasswordViewModel';
import { InvalidLink } from './InvalidLink';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const vm = useResetPasswordViewModel();

  if (vm.status === 'loading')
    return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (vm.status === 'invalid') return <InvalidLink />;

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">
          <h1>{t('auth.reset.title')}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {vm.status === 'done' ? (
          <div className="grid gap-4">
            <p role="status">{t('auth.reset.done')}</p>
            <Button asChild size="lg">
              <Link to="/login">{t('auth.login.submit')}</Link>
            </Button>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={vm.submit} noValidate>
            <p className="text-sm text-muted-foreground">{t('auth.reset.secondFactor')}</p>
            {vm.error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
              </Alert>
            )}
            <FormField
              label={t('auth.fields.newPassword')}
              hint={t('auth.hints.password', { min: PASSWORD_MIN_LENGTH })}
              type="password"
              autoComplete="new-password"
              required
              value={vm.password}
              onChange={(event) => vm.setPassword(event.target.value)}
              error={vm.invalid.includes('password') ? t('auth.invalid.password') : undefined}
            />
            <FormField
              label={t('auth.fields.confirmation')}
              type="password"
              autoComplete="new-password"
              required
              value={vm.confirmation}
              onChange={(event) => vm.setConfirmation(event.target.value)}
              error={
                vm.invalid.includes('confirmation') ? t('auth.invalid.confirmation') : undefined
              }
            />
            <Button type="submit" size="lg" disabled={vm.submitting}>
              {t('auth.reset.submit')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
