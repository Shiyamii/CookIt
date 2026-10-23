import { PASSWORD_MIN_LENGTH } from '@cookit/shared';
import { useTranslation } from 'react-i18next';
import { FormField, HiddenUsername } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChangePasswordViewModel } from '../viewmodels/useChangePasswordViewModel';

export function ChangePasswordSection() {
  const { t } = useTranslation();
  const vm = useChangePasswordViewModel();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('account.password.title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={vm.submit} noValidate>
          <HiddenUsername username={vm.username} />
          {vm.error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
            </Alert>
          )}
          {vm.done && (
            <Alert role="status">
              <AlertDescription>{t('account.password.done')}</AlertDescription>
            </Alert>
          )}
          <FormField
            label={t('account.password.current')}
            type="password"
            name="current-password"
            autoComplete="current-password"
            required
            value={vm.current}
            onChange={(event) => vm.setCurrent(event.target.value)}
            error={
              vm.invalid.includes('current') ? t('account.password.currentRequired') : undefined
            }
          />
          <FormField
            label={t('auth.fields.newPassword')}
            hint={t('auth.hints.password', { min: PASSWORD_MIN_LENGTH })}
            type="password"
            name="new-password"
            autoComplete="new-password"
            required
            value={vm.password}
            onChange={(event) => vm.setPassword(event.target.value)}
            error={vm.invalid.includes('password') ? t('auth.invalid.password') : undefined}
          />
          <FormField
            label={t('auth.fields.confirmation')}
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            required
            value={vm.confirmation}
            onChange={(event) => vm.setConfirmation(event.target.value)}
            error={vm.invalid.includes('confirmation') ? t('auth.invalid.confirmation') : undefined}
          />
          <Button type="submit" className="justify-self-start" disabled={vm.submitting}>
            {t('account.password.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
