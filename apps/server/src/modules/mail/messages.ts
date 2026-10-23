import type { Locale } from '@cookit/shared';

/**
 * Texts of the emails, per language. `{name}` placeholders are filled in by the mail service
 * (before HTML escaping); every email uses the `action` template.
 */
export type EmailTexts = {
  subject: string;
  heading: string;
  intro: string;
  button: string;
  note: string;
};

export type EmailKind = 'invite' | 'passwordReset' | 'test';

type Common = { linkHint: string; footer: string };

export const MESSAGES: Record<Locale, Record<EmailKind, EmailTexts> & Common> = {
  fr: {
    invite: {
      subject: '{inviter} vous invite sur CookIt',
      heading: 'Bienvenue sur CookIt',
      intro:
        '{inviter} vous invite à créer votre compte sur CookIt ({host}) pour garder vos recettes et les cuisiner pas à pas.',
      button: 'Créer mon compte',
      note: 'Ce lien est valable jusqu’au {date} et ne sert qu’une fois. Si vous ne vous attendiez pas à cette invitation, ignorez simplement cet email.',
    },
    passwordReset: {
      subject: 'Choisir un nouveau mot de passe CookIt',
      heading: 'Nouveau mot de passe',
      intro:
        'Quelqu’un (sans doute vous) a demandé à changer le mot de passe du compte {username} sur CookIt ({host}).',
      button: 'Choisir un nouveau mot de passe',
      note: 'Ce lien est valable une heure et ne sert qu’une fois. Si vous n’avez rien demandé, ignorez cet email : votre mot de passe ne change pas.',
    },
    test: {
      subject: 'Email de test CookIt',
      heading: 'L’envoi d’emails fonctionne',
      intro:
        'Cet email confirme que CookIt ({host}) peut envoyer des emails avec sa configuration SMTP.',
      button: 'Ouvrir CookIt',
      note: 'Vous le recevez parce qu’un email de test a été demandé depuis la page d’administration.',
    },
    linkHint: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
    footer: 'Envoyé par CookIt, {host}',
  },
  en: {
    invite: {
      subject: '{inviter} invites you to CookIt',
      heading: 'Welcome to CookIt',
      intro:
        '{inviter} invites you to create your account on CookIt ({host}) to keep your recipes and cook them step by step.',
      button: 'Create my account',
      note: 'This link is valid until {date} and works once. If you did not expect this invitation, just ignore this email.',
    },
    passwordReset: {
      subject: 'Choose a new CookIt password',
      heading: 'New password',
      intro:
        'Someone (probably you) asked to change the password of the account {username} on CookIt ({host}).',
      button: 'Choose a new password',
      note: 'This link is valid for one hour and works once. If you did not ask for it, ignore this email: your password does not change.',
    },
    test: {
      subject: 'CookIt test email',
      heading: 'Sending emails works',
      intro: 'This email confirms that CookIt ({host}) can send emails with its SMTP settings.',
      button: 'Open CookIt',
      note: 'You get it because a test email was requested from the administration page.',
    },
    linkHint: 'If the button does not work, copy this link into your browser:',
    footer: 'Sent by CookIt, {host}',
  },
  hu: {
    invite: {
      subject: '{inviter} meghívott a CookItre',
      heading: 'Üdv a CookItben',
      intro:
        '{inviter} meghívott, hogy hozz létre fiókot a CookItben ({host}), ahol megőrizheted a receptjeidet, és lépésről lépésre főzhetsz.',
      button: 'Fiók létrehozása',
      note: 'A link {date}-ig érvényes, és csak egyszer használható. Ha nem vártál meghívót, egyszerűen hagyd figyelmen kívül ezt az e-mailt.',
    },
    passwordReset: {
      subject: 'Új CookIt-jelszó beállítása',
      heading: 'Új jelszó',
      intro:
        'Valaki (valószínűleg te) kérte a(z) {username} fiók jelszavának megváltoztatását a CookItben ({host}).',
      button: 'Új jelszó beállítása',
      note: 'A link egy óráig érvényes, és csak egyszer használható. Ha nem te kérted, hagyd figyelmen kívül ezt az e-mailt: a jelszavad nem változik.',
    },
    test: {
      subject: 'CookIt teszt e-mail',
      heading: 'Az e-mail-küldés működik',
      intro:
        'Ez az e-mail megerősíti, hogy a CookIt ({host}) tud e-mailt küldeni az SMTP-beállításaival.',
      button: 'CookIt megnyitása',
      note: 'Azért kaptad, mert valaki teszt e-mailt kért az adminisztrációs oldalról.',
    },
    linkHint: 'Ha a gomb nem működik, másold be ezt a linket a böngésződbe:',
    footer: 'Küldte: CookIt, {host}',
  },
};
