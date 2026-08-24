'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOJI_CATEGORIES } from './emoji-data';

/**
 * Sélecteur d'emojis type Discord : onglets de catégories + grille + recherche.
 *
 * Le jeu complet d'emojis (avec libellés FR, tags et shortcodes `:red_circle:`)
 * est généré dans `emoji-data.ts` par `scripts/gen-emoji.mjs`. La zone de saisie
 * reste éditable pour coller un emoji personnalisé Discord (`<:nom:id>`).
 */
const RECENTS_KEY = 'meow:emoji:recents';
const RECENTS_MAX = 24;
const SEARCH_LIMIT = 120;

/** Minuscules, sans accents, séparateurs (`_ - : /`) réduits à des espaces. */
function normalizeQuery(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[:_\-/]/g, ' ')
    .toLowerCase();
}

const ALL = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

function readRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string') : [];
  } catch {
    return [];
  }
}

export function EmojiPicker({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState(EMOJI_CATEGORIES[0].id);
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Recents : lus seulement côté client (évite un décalage d'hydratation).
  useEffect(() => setRecents(readRecents()), []);

  // Fermeture au clic extérieur et à Échap ; focus la recherche à l'ouverture.
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const results = useMemo(() => {
    const tokens = normalizeQuery(query.trim()).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;
    const out: string[] = [];
    for (const e of ALL) {
      if (tokens.every((tk) => e.t.includes(tk))) {
        out.push(e.c);
        if (out.length >= SEARCH_LIMIT) break;
      }
    }
    return out;
  }, [query]);

  const pick = (emoji: string) => {
    onChange(emoji);
    const next = [emoji, ...recents.filter((e) => e !== emoji)].slice(0, RECENTS_MAX);
    setRecents(next);
    try {
      window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      /* localStorage indisponible : tant pis pour les récents */
    }
    setOpen(false);
    setQuery('');
  };

  const activeCat = EMOJI_CATEGORIES.find((c) => c.id === cat) ?? EMOJI_CATEGORIES[0];
  const grid = results ?? activeCat.emojis.map((e) => e.c);

  const cell = (emoji: string, key: string) => (
    <button
      key={key}
      type="button"
      onClick={() => pick(emoji)}
      className="grid h-[32px] place-items-center rounded-[8px] text-[20px] leading-none transition-colors hover:bg-[var(--surf-hover)]"
    >
      {emoji}
    </button>
  );

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '📦'}
          className="field text-center"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Choisir un emoji"
          aria-expanded={open}
          className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] border border-[var(--bd)] bg-[var(--surf)] text-[18px] transition-colors hover:border-[var(--acc-bd)]"
        >
          😀
        </button>
      </div>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[300px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] shadow-[0_12px_32px_rgba(0,0,0,.35)]">
          {/* Barre de recherche */}
          <div className="border-b border-[var(--bd)] p-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un emoji…"
              className="field h-[34px] text-[13px]"
            />
          </div>

          {/* Onglets de catégories (masqués pendant une recherche) */}
          {results === null ? (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--bd)] px-2 py-2">
              {EMOJI_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCat(c.id)}
                  title={c.label}
                  aria-label={c.label}
                  className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] text-[16px] transition-colors ${
                    c.id === cat ? 'bg-[var(--acc-bg)]' : 'hover:bg-[var(--surf-hover)]'
                  }`}
                >
                  {c.tab}
                </button>
              ))}
            </div>
          ) : null}

          <div className="max-h-[240px] overflow-y-auto p-2">
            {results === null && recents.length > 0 ? (
              <>
                <p className="px-1 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted2)]">
                  Récents
                </p>
                <div className="mb-2 grid grid-cols-8 gap-[2px]">
                  {recents.map((emoji, i) => cell(emoji, `r-${emoji}-${i}`))}
                </div>
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted2)]">
                  {activeCat.label}
                </p>
              </>
            ) : null}

            {results !== null && results.length === 0 ? (
              <p className="px-1 py-6 text-center text-[13px] text-[var(--muted2)]">
                Aucun emoji trouvé.
              </p>
            ) : (
              <div className="grid grid-cols-8 gap-[2px]">
                {grid.map((emoji, i) => cell(emoji, `${emoji}-${i}`))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
