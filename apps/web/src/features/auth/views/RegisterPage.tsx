import { PASSWORD_MIN_LENGTH } from '@cookit/shared';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRegisterViewModel, type RegisterField } from '../viewmodels/useRegisterViewModel';
import { InvalidLink } from './InvalidLink';

export function RegisterPage() {
  const { t } = useTranslation();
  const vm = useRegisterViewModel();

  if (vm.status === 'loading')
    return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (vm.status === 'invalid') return <InvalidLink />;

  const field = (name: RegisterField) => ({
    value: vm.values[name],
    onChange: (event: { target: { value: string } }) => vm.setValue(name, event.target.value),
    error: vm.invalid.includes(name) ? t(`auth.invalid.${name}`) : undefined,
  });

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">
          <h1>{t(vm.isAdminSetup ? 'auth.setup.title' : 'auth.register.title')}</h1>
        </CardTitle>
        <CardDescription>
          {t(vm.isAdminSetup ? 'auth.setup.subtitle' : 'auth.register.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={vm.submit} noValidate>
          {vm.error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
            </Alert>
          )}
          <FormField
            label={t('auth.fields.username')}
            hint={t('auth.hints.username')}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            required
            {...field('username')}
          />
          <FormField
            label={t('auth.fields.email')}
            type="email"
            name="email"
            autoComplete="email"
            required
            {...field('email')}
          />
          <FormField
            label={t('auth.fields.name')}
            hint={t('auth.hints.name')}
            name="name"
            autoComplete="name"
            {...field('name')}
          />
          <FormField
            label={t('auth.fields.password')}
            hint={t('auth.hints.password', { min: PASSWORD_MIN_LENGTH })}
            type="password"
            name="new-password"
            autoComplete="new-password"
            required
            {...field('password')}
          />
          <FormField
            label={t('auth.fields.confirmation')}
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            required
            {...field('confirmation')}
          />
          <Button type="submit" size="lg" disabled={vm.submitting}>
            {t('auth.register.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
