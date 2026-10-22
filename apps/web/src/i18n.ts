import { SUPPORTED_LOCALES } from '@cookit/shared';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { hu } from './locales/hu';
import { fr } from './locales/fr';

// Detection: saved choice first, then the browser language. Signed in, the profile language wins
// (useLanguageMenuViewModel).
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, fr: { translation: fr }, hu: { translation: hu } },
    supportedLngs: SUPPORTED_LOCALES,
    nonExplicitSupportedLngs: true,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'cookit.locale',
      caches: ['localStorage'],
    },
  });

document.documentElement.lang = i18n.resolvedLanguage ?? 'en';
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
