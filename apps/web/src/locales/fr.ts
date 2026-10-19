import type { Translations } from './en';

export const fr: Translations = {
  nav: {
    home: 'Accueil',
  },
  language: {
    label: 'Langue',
    fr: 'Français',
    en: 'English',
  },
  theme: {
    label: 'Thème',
    light: 'Clair',
    dark: 'Sombre',
    system: 'Système',
  },
  home: {
    title: 'Bienvenue sur CookIt',
    subtitle: 'Vos recettes, étape par étape, avec des minuteurs qui n’oublient rien.',
    apiStatus: 'État du serveur',
    status: {
      loading: 'Vérification…',
      ok: 'Connecté',
      error: 'Injoignable',
    },
  },
  notFound: {
    title: 'Page introuvable',
    back: 'Retour à l’accueil',
  },
};
