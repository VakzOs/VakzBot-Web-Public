'use client';

import { createContext, useContext, useMemo } from 'react';
import type { Dictionary, LocaleInfo, Translate, Vars } from '@/lib/i18n';

/**
 * La langue du site, côté navigateur.
 *
 * `lib/i18n.ts` lit le système de fichiers : un composant `'use client'` ne
 * peut pas l'importer. Le layout (serveur) résout la langue une fois et pose
 * ici le dictionnaire déjà aplati ; les composants client n'ont plus qu'à
 * appeler `useT()`, sans recevoir en props chacune des chaînes dont ils ont
 * besoin.
 *
 * Le dictionnaire complet part au navigateur — quelques kilo-octets. C'est le
 * prix d'un `t('…')` utilisable partout plutôt qu'une cascade de props à
 * travers cinq composants.
 */
interface I18nValue {
  locale: string;
  dict: Dictionary;
  locales: LocaleInfo[];
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  dict,
  locales,
  children,
}: I18nValue & { children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, dict, locales }), [locale, dict, locales]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * La fonction de traduction, la langue courante et les langues disponibles.
 *
 * Hors provider (test isolé, rendu partiel), `t` rend la clé : un composant
 * client ne doit jamais faire tomber la page parce qu'il manque un contexte.
 */
export function useT(): { t: Translate; locale: string; locales: LocaleInfo[] } {
  const value = useContext(I18nContext);
  // `t` est mémoïsé sur le dictionnaire, et c'est vital : plusieurs composants
  // le mettent dans les dépendances d'un `useCallback` qui finit dans un
  // `useEffect`. Une nouvelle fonction à chaque rendu y relancerait l'effet en
  // boucle — le monitoring redemanderait ses mesures au bot sans jamais
  // s'arrêter.
  const t = useMemo<Translate>(() => {
    const dict = value?.dict;
    return (key: string, vars?: Vars) => {
      const template = dict?.[key] ?? key;
      if (!vars) return template;
      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
      );
    };
  }, [value?.dict]);
  return { t, locale: value?.locale ?? '', locales: value?.locales ?? [] };
}
