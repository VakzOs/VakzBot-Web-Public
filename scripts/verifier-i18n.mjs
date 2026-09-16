#!/usr/bin/env node
/**
 * Vérifie que chaque clé de traduction appelée dans le code existe vraiment.
 *
 * `t()` rend la clé quand elle manque : la page s'affiche, ne plante pas, et
 * montre « dashboard.module.enregistrer » à un administrateur. Ni `lint` ni
 * `build` ne le voient — d'où ce contrôle, jumeau de celui du dépôt du bot.
 *
 * Trois choses vérifiées :
 *   1. toute clé littérale appelée dans le code existe en français ;
 *   2. les deux langues de référence (fr, en) portent exactement les mêmes
 *      clés, avec les mêmes variables `{…}` ;
 *   3. une langue AJOUTÉE a le droit d'être incomplète — `t()` retombe sur le
 *      français — mais doit se nommer (`langue.nom`, `langue.drapeau`,
 *      `langue.format`) et ne pas inventer de clés absentes du français.
 *
 * Usage : npm run i18n:check
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Langues tenues par le dépôt : alignement strict exigé entre elles. */
const REFERENCE_LOCALES = ['fr', 'en'];

/** Langue de repli : toute clé appelée dans le code doit y exister. */
const DEFAULT_LOCALE = 'fr';

/** Ce qu'une langue doit déclarer pour être présentable dans le sélecteur. */
const META_KEYS = ['langue.nom', 'langue.drapeau', 'langue.format'];

/** Dossiers parcourus à la recherche d'appels à `t()`. */
const SOURCE_DIRS = ['app', 'components', 'lib'];

const IGNORED_DIRS = new Set(['node_modules', '.next']);

async function sources(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sources(full)));
    else if (/\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

function flatten(value, prefix = '', out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object') flatten(child, path, out);
    else out.set(path, String(child));
  }
  return out;
}

async function loadLocale(locale) {
  const keys = new Map();
  for (const file of await readdir(join('locales', locale))) {
    if (!file.endsWith('.json')) continue;
    flatten(JSON.parse(await readFile(join('locales', locale, file), 'utf8')), '', keys);
  }
  return keys;
}

const locales = (await readdir('locales', { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name.toLowerCase());

const dictionaries = Object.fromEntries(
  await Promise.all(locales.map(async (locale) => [locale, await loadLocale(locale)])),
);

const problems = [];
for (const locale of REFERENCE_LOCALES) {
  if (!dictionaries[locale]) problems.push(`locales : langue « ${locale} » absente`);
}

const literals = new Map();
const prefixes = new Map();

for (const dir of SOURCE_DIRS) {
  for (const file of await sources(dir)) {
    const code = await readFile(file, 'utf8');
    for (const match of code.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) {
      literals.set(match[1], file);
    }
    // t(`a.b.${x}`) — on ne retient que la partie fixe, avant la première
    // interpolation, et on vérifie qu'elle mène quelque part.
    for (const match of code.matchAll(/\bt\(\s*`([a-zA-Z0-9_.]*?)\$\{/g)) {
      const prefix = match[1].replace(/\.$/, '');
      if (prefix) prefixes.set(prefix, file);
    }
  }
}

const checked = REFERENCE_LOCALES.filter((locale) => dictionaries[locale]);

for (const [key, file] of literals) {
  for (const locale of checked) {
    if (!dictionaries[locale].has(key)) {
      problems.push(`${file} : « ${key} » absente de ${locale}`);
    }
  }
}

for (const [prefix, file] of prefixes) {
  for (const locale of checked) {
    const some = [...dictionaries[locale].keys()].some((key) => key.startsWith(`${prefix}.`));
    if (!some) problems.push(`${file} : préfixe « ${prefix}.* » sans aucune clé en ${locale}`);
  }
}

// Alignement strict entre langues de référence, clés ET variables : une
// traduction qui perd un `{nom}` affiche une phrase à trou.
for (const locale of checked) {
  for (const other of checked) {
    if (locale === other) continue;
    for (const [key, text] of dictionaries[locale]) {
      const twin = dictionaries[other].get(key);
      if (twin === undefined) {
        problems.push(`locales : « ${key} » en ${locale} mais pas en ${other}`);
        continue;
      }
      const vars = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
      if (vars(text) !== vars(twin)) {
        problems.push(`locales : « ${key} » n'a pas les mêmes variables en ${locale} et ${other}`);
      }
    }
  }
}

for (const [locale, keys] of Object.entries(dictionaries)) {
  for (const meta of META_KEYS) {
    if (!keys.has(meta)) {
      problems.push(`locales/${locale} : « ${meta} » manquante (bloc « langue » de commun.json)`);
    }
  }
}

const extras = Object.keys(dictionaries).filter((locale) => !checked.includes(locale));
const coverage = [];
for (const locale of extras) {
  const reference = dictionaries[DEFAULT_LOCALE];
  if (!reference) break;
  for (const key of dictionaries[locale].keys()) {
    if (!reference.has(key)) {
      problems.push(`locales/${locale} : « ${key} » inconnue en ${DEFAULT_LOCALE}`);
    }
  }
  const translated = [...reference.keys()].filter((key) => dictionaries[locale].has(key)).length;
  coverage.push(
    `${locale} : ${String(translated)}/${String(reference.size)} clés (${String(
      Math.round((translated / Math.max(reference.size, 1)) * 100),
    )} %)`,
  );
}

if (problems.length > 0) {
  console.error(`✖ ${String(problems.length)} problème(s) de traduction :`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `✔ ${String(literals.size)} clé(s) littérale(s) et ${String(prefixes.size)} préfixe(s) dynamique(s) vérifiés, ${checked.join(' et ')} alignés.`,
);
// Une langue de la communauté a le droit d'être en chemin : on dit où elle en est.
for (const line of coverage) console.log(`  langue ajoutée — ${line}`);
