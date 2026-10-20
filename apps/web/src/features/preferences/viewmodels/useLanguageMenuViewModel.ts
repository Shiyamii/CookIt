import { isLocale, SUPPORTED_LOCALES } from '@cookit/shared';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { saveLocale } from '@/features/auth/model/auth';
import { useSession } from '@/features/auth/viewmodels/useSession';

/**
 * Language of the interface. Signed in, the profile's language wins when the session loads, and
 * a change is saved to the profile; anonymous, the choice stays in this browser.
 */
export function useLanguageMenuViewModel() {
  const { i18n } = useTranslation();
  const { user } = useSession();
  const profileLocale = user?.locale;

  useEffect(() => {
    if (profileLocale && profileLocale !== i18n.resolvedLanguage) {
      void i18n.changeLanguage(profileLocale);
    }
    // Only when the signed-in profile changes, not on every language switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLocale]);

  return {
    language: i18n.resolvedLanguage,
    languages: SUPPORTED_LOCALES,
    selectLanguage: (value: string) => {
      if (!isLocale(value)) return;
      void i18n.changeLanguage(value);
      if (user) void saveLocale(value).catch(() => {});
    },
  };
}
