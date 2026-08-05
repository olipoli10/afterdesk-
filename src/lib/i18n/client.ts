import { SITE_LANGS, siteLangOf, type SiteLang } from "./langs";

export type ClientLang = SiteLang;

export const CLIENT_LANGS: { code: ClientLang; label: string }[] = SITE_LANGS;

export function clientLangOf(value: string | undefined | null): ClientLang {
  return siteLangOf(value);
}

type ClientNav = {
  nav: { signIn: string; send: string; portal: string; client: string; workers: string };
};

/** Shared client-side navigation labels. Homepage content lives with the page. */
export const CLIENT_I18N: Record<ClientLang, ClientNav> = {
  en: { nav: { signIn: "Sign in", send: "Describe the outcome", portal: "My account", client: "Get work done", workers: "For workers" } },
  fr: { nav: { signIn: "Connexion", send: "Décrire le résultat", portal: "Mon compte", client: "Faire faire du travail", workers: "Pour les travailleurs" } },
  es: { nav: { signIn: "Iniciar sesión", send: "Describe el resultado", portal: "Mi cuenta", client: "Haz que se haga", workers: "Para trabajadores" } },
  tl: { nav: { signIn: "Mag-sign in", send: "Ilarawan ang resulta", portal: "Account ko", client: "Ipagawa ang trabaho", workers: "Para sa manggagawa" } },
};
