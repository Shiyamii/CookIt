import { isLocale, SUPPORTED_LOCALES } from '@cookit/shared';
import { useTranslation } from 'react-i18next';

export function useLanguageMenuViewModel() {
  const { i18n } = useTranslation();
  return {
    language: i18n.resolvedLanguage,
    languages: SUPPORTED_LOCALES,
    selectLanguage: (value: string) => {
      if (isLocale(value)) void i18n.changeLanguage(value);
    },
  };
}
