import { useTranslation } from 'react-i18next';
import { NotInDemo } from '@/components/NotInDemo';
import { ChangePasswordSection } from './ChangePasswordSection';
import { PasskeysSection } from './PasskeysSection';
import { TwoFactorSection } from './TwoFactorSection';

/** Account security settings: password, two-factor authentication, passkeys. */
export function SecurityPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto grid w-full max-w-xl grid-cols-1 gap-6">
      <h1 className="text-2xl font-semibold">{t('account.security.title')}</h1>
      <NotInDemo>
        <TwoFactorSection />
        <PasskeysSection />
        <ChangePasswordSection />
      </NotInDemo>
      <p className="text-sm text-muted-foreground">{t('account.security.recovery')}</p>
    </div>
  );
}
