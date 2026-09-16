'use client';

import { useEffect, useState } from 'react';

/** Le fuseau que rend `useTimeZone()` ; `undefined` = celui du navigateur. */
export type TimeZone = string | undefined;

/**
 * Écrire une date deux fois sans se contredire.
 *
 * Un composant `'use client'` est d'abord rendu sur le serveur (Vercel, en UTC)
 * puis rendu une seconde fois à l'identique dans le navigateur, pour
 * l'hydratation. `toLocaleString()` ne répond pas pareil des deux côtés :
 * « 13:07 » sur le serveur, « 15:07 » à Paris. React voit deux textes
 * différents, abandonne l'hydratation et re-rend la page entière côté client —
 * c'est l'erreur #418 de la console, et elle emporte tout le tableau de bord,
 * pas seulement l'horodatage fautif.
 *
 * D'où deux temps. Tant que ce hook renvoie `'UTC'` — sur le serveur ET au
 * premier rendu du navigateur, les deux seuls qui doivent coïncider — tout est
 * écrit en UTC, donc identique de part et d'autre. L'effet qui suit
 * l'hydratation rend la main au fuseau du lecteur, où l'heure reprend son sens.
 * Une date peut donc sauter de quelques heures au premier battement ; c'est le
 * prix, et il est moins cher qu'une page re-rendue en entier.
 *
 * Les formats ci-dessous sont toujours explicites : les valeurs par défaut de
 * `toLocaleString` dépendent de la version d'ICU, et celle de Node n'est pas
 * celle du navigateur — deux textes différents, à nouveau.
 *
 * Chaque fonction prend en plus un `format` : le tag BCP47 déclaré par la
 * langue affichée (`t('langue.format')`). Il ne peut pas se déduire du code de
 * la langue — `locales/ch/` est un dossier valide, `toLocaleString('ch')` ne
 * veut rien dire — et le figer à « fr-FR » rendrait des dates françaises sur
 * un site passé en anglais.
 *
 * @returns `'UTC'` jusqu'à l'hydratation, puis `undefined` — soit, pour `Intl`,
 * le fuseau du navigateur.
 */
export function useTimeZone(): TimeZone {
  return useHydrated() ? undefined : 'UTC';
}

/**
 * Faux sur le serveur ET au premier rendu du navigateur, vrai ensuite.
 *
 * Le pendant de `useTimeZone()` pour ce qu'aucun fuseau ne rattrape : une durée
 * comptée depuis `Date.now()`. Les deux horloges ne sont pas à la même seconde,
 * donc « 3 min 12 s » côté serveur devient « 3 min 13 s » côté navigateur et
 * l'hydratation échoue. Ce qui se mesure depuis maintenant ne s'affiche qu'une
 * fois ce hook passé au vrai.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}

const DATE_TIME: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

const DAY_SHORT: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' };

const DAY_LONG: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
};

const CLOCK: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

const CLOCK_SECONDS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

/** Une date exploitable, ou `null` — y compris pour `''`, `0` et « 2026-13-45 ». */
function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** « 16/09/2026 15:07:39 ». `fallback` couvre l'absence comme l'illisible. */
export function formatDateTime(
  format: string,
  value: string | number | Date | null | undefined,
  timeZone: TimeZone,
  fallback = '',
): string {
  const date = toDate(value);
  return date ? date.toLocaleString(format, { ...DATE_TIME, timeZone }) : fallback;
}

/** « 16/09 » : les axes d'une courbe étalée sur plusieurs jours. */
export function formatDayShort(format: string, ms: number, timeZone: TimeZone): string {
  return new Date(ms).toLocaleDateString(format, { ...DAY_SHORT, timeZone });
}

/** « samedi 13 septembre » : une journée qu'on désigne, pas qu'on mesure. */
export function formatDayLong(format: string, ms: number, timeZone: TimeZone): string {
  return new Date(ms).toLocaleDateString(format, { ...DAY_LONG, timeZone });
}

/** « 15:07 ». */
export function formatClock(format: string, ms: number, timeZone: TimeZone): string {
  return new Date(ms).toLocaleTimeString(format, { ...CLOCK, timeZone });
}

/** « 15:07:39 », pour une ligne de log où la seconde compte. */
export function formatClockSeconds(
  format: string,
  ms: number,
  timeZone: TimeZone,
  fallback = '',
): string {
  const date = toDate(ms);
  return date
    ? date.toLocaleTimeString(format, { ...CLOCK_SECONDS, timeZone })
    : fallback;
}

/**
 * `YYYY-MM-DD` d'un instant, dans `timeZone` — le format qu'attend un
 * `<input type="date">`.
 *
 * `en-CA` est le raccourci habituel vers l'ISO : demander les composants à
 * `Intl` est le seul moyen d'obtenir le jour d'un AUTRE fuseau que celui de la
 * machine, que `date.getFullYear()` ignore.
 */
export function dayKey(ms: number, timeZone: TimeZone): string {
  return new Date(ms).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  });
}
