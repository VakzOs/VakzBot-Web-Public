/**
 * Génère le jeu complet d'emojis pour le sélecteur du catalogue à partir de
 * `emojibase-data` (dépendance de DEV uniquement). Produit un module TS compact
 * — c'est LUI qui est committé et embarqué, pas la lib.
 *
 * Chaque emoji porte une chaîne de recherche normalisée = libellé FR + tags FR
 * + shortcodes GitHub/Discord (`red_circle`…), sans accents, séparateurs
 * (`_ - : /`) réduits à des espaces. Regénérer : `node scripts/gen-emoji.mjs`.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const data = require('emojibase-data/fr/data.json');
const shortcodes = require('emojibase-data/en/shortcodes/github.json');

/** Groupe emojibase -> onglet du picker (ordre = ordre d'affichage). */
const CATEGORIES = [
  { id: 'smileys', group: 0, tab: '😀', label: 'Smileys' },
  { id: 'people', group: 1, tab: '🧑', label: 'Personnes' },
  { id: 'animals', group: 3, tab: '🐻', label: 'Animaux' },
  { id: 'food', group: 4, tab: '🍔', label: 'Nourriture' },
  { id: 'activities', group: 6, tab: '⚽', label: 'Activités' },
  { id: 'travel', group: 5, tab: '✈️', label: 'Voyage' },
  { id: 'objects', group: 7, tab: '💡', label: 'Objets' },
  { id: 'symbols', group: 8, tab: '❤️', label: 'Symboles' },
  { id: 'flags', group: 9, tab: '🏳️', label: 'Drapeaux' },
];

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[:_\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const shortcodesFor = (hexcode) => {
  const v = shortcodes[hexcode];
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

const byGroup = new Map(CATEGORIES.map((c) => [c.group, []]));
const sorted = [...data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

for (const e of sorted) {
  const bucket = byGroup.get(e.group);
  if (!bucket) continue; // groupe non retenu (ex. « component » : teintes de peau)
  const terms = norm([e.label, ...(e.tags ?? []), ...shortcodesFor(e.hexcode)].join(' '));
  bucket.push({ c: e.emoji, t: terms });
}

const cats = CATEGORIES.map((c) => ({
  id: c.id,
  tab: c.tab,
  label: c.label,
  emojis: byGroup.get(c.group),
}));

const total = cats.reduce((n, c) => n + c.emojis.length, 0);

const header = `// Généré par scripts/gen-emoji.mjs — NE PAS ÉDITER À LA MAIN.
// Source : emojibase-data (fr) + shortcodes GitHub. Regénérer : node scripts/gen-emoji.mjs
// ${total} emojis, ${cats.length} catégories.

/** Un emoji : \`c\` = caractère, \`t\` = termes de recherche normalisés. */
export type EmojiEntry = { c: string; t: string };
export type EmojiCategory = { id: string; tab: string; label: string; emojis: EmojiEntry[] };

export const EMOJI_CATEGORIES: EmojiCategory[] = ${JSON.stringify(cats)};
`;

const out = new URL('../app/dashboard/[guildId]/catalogue/emoji-data.ts', import.meta.url);
writeFileSync(out, header);
// Vérif rapide : le disque rouge (:red_circle:) doit être présent et cherchable.
const red = cats.flatMap((c) => c.emojis).find((e) => e.c === '🔴');
console.log(`✔ ${total} emojis écrits. 🔴 terms = "${red?.t}"`);
