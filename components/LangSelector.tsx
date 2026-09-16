'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LangMenu } from './LangMenu';
import { useT } from './I18n';

/** Un an, comme `LOCALE_COOKIE_MAX_AGE` côté serveur. */
const MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Sélecteur de la langue DU SITE.
 *
 * Le choix part dans un cookie plutôt que dans l'URL : le site n'a pas de
 * préfixe de langue (`/en/...`), et tous les liens déjà écrits continuent de
 * fonctionner. `router.refresh()` rejoue le rendu serveur avec le nouveau
 * cookie — c'est lui qui re-traduit la page, pas un état React.
 *
 * Les langues ne sont pas listées ici : elles viennent de `locales/`, drapeau
 * compris. Ajouter une langue au site, c'est ajouter un dossier.
 */
export function LangSelector({ compact = false }: { compact?: boolean }) {
  const { t, locale, locales } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Une seule langue disponible : un sélecteur qui ne choisit rien est un
  // ornement. On ne l'affiche pas.
  if (locales.length < 2) return null;

  const change = (next: string) => {
    document.cookie = `langue=${encodeURIComponent(next)}; path=/; max-age=${String(
      MAX_AGE,
    )}; samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <LangMenu
      options={locales}
      value={locale}
      onChange={change}
      label={t('nav.langue')}
      disabled={pending}
      compact={compact}
      // Le sélecteur est dans la barre de navigation, à droite : ouvert vers la
      // gauche, le panneau reste dans la page au lieu de déborder.
      align="end"
    />
  );
}
