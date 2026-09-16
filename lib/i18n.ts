import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cookies, headers } from 'next/headers';

/**
 * Les textes du site, une langue par dossier.
 *
 * Même disposition que dans le dépôt du bot : `locales/<code>/<domaine>.json`,
 * fusionnés par langue au chargement. Ce module lit le SYSTÈME DE FICHIERS, et
 * ne s'importe donc que depuis un composant serveur, une server action ou une
 * route `app/api/**` — exactement comme `lib/botApi.ts`. Un composant
 * `'use client'` reçoit son dictionnaire en props (voir `components/I18n.tsx`).
 *
 * Aucune liste de langues n'est tenue ici. Déposer `locales/ch/` avec un bloc
 * `langue` (nom, drapeau) suffit à faire apparaître la langue dans le sélecteur
 * du site : c'est la condition pour qu'une traduction puisse arriver par une
 * simple contribution, sans toucher au code.
 *
 * ⚠️ Vercel : le dossier `locales/` est déclaré dans `outputFileTracingIncludes`
 * (`next.config.mjs`). Sans cette déclaration, il n'est pas embarqué dans la
 * fonction serverless et le site repart en clés brutes EN PRODUCTION seulement.
 */

/** Cookie qui mémorise la langue choisie par le visiteur. */
export const LOCALE_COOKIE = 'langue';

/** Un an : le choix de langue n'a pas de raison d'expirer plus tôt. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Langue servie quand rien d'autre ne s'applique. */
export const DEFAULT_LOCALE = 'fr';

/** Drapeau de repli : une langue qui n'en déclare pas reste affichable. */
const FALLBACK_FLAG = '🏳️';

type Tree = { [key: string]: string | Tree };

/** Valeurs interpolables dans une traduction (`{nom}`). */
export type Vars = Record<string, string | number>;

/** Signature de la fonction de traduction. */
export type Translate = (key: string, vars?: Vars) => string;

/** Un dictionnaire aplati (`nav.modules` -> « Modules »), sérialisable. */
export type Dictionary = Record<string, string>;

/** Ce qu'une langue dit d'elle-même, pour le sélecteur. */
export interface LocaleInfo {
  /** Nom du dossier, en minuscules. */
  code: string;
  /** Nom de la langue, écrit DANS cette langue. */
  name: string;
  /** Emoji drapeau. */
  flag: string;
  /** Codes `Accept-Language` que cette langue revendique. */
  web: string[];
}

const localesDir = join(process.cwd(), 'locales');

let cache: Map<string, Tree> | null = null;

function merge(target: Tree, source: Tree): Tree {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof existing === 'object' &&
      existing !== null
    ) {
      merge(existing, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function catalogues(): Map<string, Tree> {
  if (cache) return cache;
  const loaded = new Map<string, Tree>();
  let entries: string[] = [];
  try {
    entries = readdirSync(localesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    // Dossier absent : le site doit rester debout et rendre ses clés plutôt que
    // de renvoyer une 500 sur toutes ses pages.
    entries = [];
  }

  for (const dir of entries) {
    const tree: Tree = {};
    for (const file of readdirSync(join(localesDir, dir))) {
      if (!file.endsWith('.json')) continue;
      try {
        merge(tree, JSON.parse(readFileSync(join(localesDir, dir, file), 'utf8')) as Tree);
      } catch {
        // Un fichier illisible n'emporte pas la langue entière : les autres
        // domaines restent traduits, et la clé manquante se voit à l'écran.
      }
    }
    loaded.set(dir.toLowerCase(), tree);
  }

  cache = loaded;
  return loaded;
}

function lookup(tree: Tree | undefined, key: string): string | undefined {
  if (!tree) return undefined;
  let current: string | Tree | undefined = tree;
  for (const part of key.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function flatten(tree: Tree, prefix = '', out: Dictionary = {}): Dictionary {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

function normalize(locale: string): string {
  return locale.trim().toLowerCase();
}

/** Cette langue existe-t-elle sur le site ? */
export function isKnownLocale(locale: string): boolean {
  return catalogues().has(normalize(locale));
}

/** Ce qu'une langue dit d'elle-même, avec des replis si elle le tait. */
export function localeInfo(code: string): LocaleInfo {
  const locale = normalize(code);
  const tree = catalogues().get(locale);
  const web = lookup(tree, 'langue.web') ?? locale;
  return {
    code: locale,
    // Sans nom déclaré, le code est un pis-aller lisible : mieux vaut une ligne
    // dans le sélecteur qu'une langue introuvable.
    name: lookup(tree, 'langue.nom') ?? locale.toUpperCase(),
    flag: lookup(tree, 'langue.drapeau') ?? FALLBACK_FLAG,
    web: web
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

/** Toutes les langues du site, la langue par défaut en tête. */
export function listLocales(): LocaleInfo[] {
  return [...catalogues().keys()]
    .map((code) => localeInfo(code))
    .sort((a, b) => {
      if (a.code === DEFAULT_LOCALE) return -1;
      if (b.code === DEFAULT_LOCALE) return 1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Le dictionnaire d'une langue, aplati et complété par la langue par défaut.
 *
 * Le repli est fusionné ICI plutôt que consulté à chaque lecture : c'est ce qui
 * permet d'envoyer un seul objet aux composants client et de garder une
 * traduction partielle utilisable — une langue de la communauté arrive rarement
 * complète, et une page à moitié en clés brutes serait pire que pas de langue
 * du tout.
 */
export function dictionaryFor(locale: string): Dictionary {
  const base = catalogues().get(DEFAULT_LOCALE);
  const wanted = catalogues().get(normalize(locale));
  return { ...(base ? flatten(base) : {}), ...(wanted ? flatten(wanted) : {}) };
}

/** Construit une fonction de traduction sur un dictionnaire aplati. */
export function translator(dict: Dictionary): Translate {
  return (key, vars) => {
    // Clé absente : on rend la clé. Elle est laide à l'écran, et c'est le but —
    // un texte manquant doit se voir, pas se deviner.
    const template = dict[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match,
    );
  };
}

/**
 * La langue à servir pour CETTE requête.
 *
 * Dans l'ordre : le choix explicite du visiteur (cookie), puis ce que son
 * navigateur demande (`Accept-Language`), puis la langue par défaut. Un choix
 * fait dans le sélecteur doit primer sur la préférence du navigateur, sinon il
 * serait défait à chaque page.
 */
export async function requestLocale(): Promise<string> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (chosen && isKnownLocale(chosen)) return normalize(chosen);

  const header = (await headers()).get('accept-language') ?? '';
  // « fr-CH;q=0.9, en;q=0.8 » -> ['fr-ch', 'en'], par qualité décroissante.
  const wanted = header
    .split(',')
    .map((part) => {
      const [tag = '', ...rest] = part.trim().split(';');
      const q = rest.find((r) => r.trim().startsWith('q='));
      return { tag: normalize(tag), q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .filter((entry) => entry.tag)
    .sort((a, b) => b.q - a.q);

  const available = listLocales();
  for (const { tag } of wanted) {
    const exact = available.find(
      (info) => info.code === tag || info.web.some((code) => normalize(code) === tag),
    );
    if (exact) return exact.code;
    const base = tag.split('-')[0] ?? tag;
    const loose = available.find(
      (info) =>
        info.code === base || info.web.some((code) => normalize(code).split('-')[0] === base),
    );
    if (loose) return loose.code;
  }
  return DEFAULT_LOCALE;
}

/** Tout ce dont une page a besoin : sa langue, sa fonction `t`, son dictionnaire. */
export async function getTranslation(): Promise<{
  locale: string;
  t: Translate;
  dict: Dictionary;
  locales: LocaleInfo[];
}> {
  const locale = await requestLocale();
  const dict = dictionaryFor(locale);
  return { locale, t: translator(dict), dict, locales: listLocales() };
}
