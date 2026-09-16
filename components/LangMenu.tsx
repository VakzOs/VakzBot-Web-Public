'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Flag } from './Flag';

/**
 * Le menu déroulant des deux sélecteurs de langue.
 *
 * Un `<select>` natif était le choix d'origine — accessible d'office, et
 * correct sur mobile. Mais son menu est dessiné par le système : fond blanc et
 * surlignage bleu de Windows au milieu d'une interface sombre, sans aucune
 * prise en CSS. C'est la seule partie d'un formulaire qu'on ne peut pas mettre
 * aux couleurs du site.
 *
 * D'où ce bouton + liste, qui reprend les jetons du thème. Ce qu'il faut alors
 * réécrire à la main, et qui vient gratuitement avec un `<select>` :
 * `role="listbox"`, la navigation aux flèches, Échap pour fermer, la fermeture
 * au clic extérieur, et le renvoi du focus sur le bouton après un choix.
 */

export interface LangOption {
  code: string;
  name: string;
  flag: string;
}

export function LangMenu({
  options,
  value,
  onChange,
  label,
  disabled = false,
  /** Masque le nom de la langue sur le bouton (barres étroites du dashboard). */
  compact = false,
  /** Ouvre le menu vers la gauche : le sélecteur est collé au bord droit. */
  align = 'start',
}: {
  options: LangOption[];
  value: string;
  onChange: (code: string) => void;
  label: string;
  disabled?: boolean;
  compact?: boolean;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const current = options.find((option) => option.code === value) ?? options[0];
  const index = Math.max(
    0,
    options.findIndex((option) => option.code === value),
  );

  // Clic ailleurs, ou focus parti hors du menu : on referme. Sans ça, le
  // panneau reste ouvert derrière le reste de la page.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent | FocusEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('focusin', away);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('focusin', away);
    };
  }, [open]);

  const openMenu = (from = index) => {
    setActive(from);
    setOpen(true);
  };

  const choose = (code: string) => {
    setOpen(false);
    // Le focus revient au bouton : sans ce retour, la tabulation repartirait
    // du début du document après un choix au clavier.
    button.current?.focus();
    if (code !== value) onChange(code);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false);
      if (event.key === 'Escape') button.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((position) => (position + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((position) => (position - 1 + options.length) % options.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option.code);
    }
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu();
        }}
        className="inline-flex items-center gap-[7px] rounded-[10px] border px-3 py-2 text-[14px] font-semibold leading-none transition-colors disabled:opacity-50"
        style={{
          background: open ? 'var(--acc-bg)' : 'var(--surf)',
          borderColor: open ? 'var(--acc-bd)' : 'var(--bd)',
          color: 'var(--tx)',
        }}
      >
        {current ? <Flag flag={current.flag} className="text-[15px]" /> : null}
        {compact ? null : (
          <span className="hidden sm:inline">{current?.name ?? value}</span>
        )}
        <svg
          aria-hidden
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className="shrink-0 transition-transform"
          style={{
            transform: open ? 'rotate(180deg)' : undefined,
            color: 'var(--muted2)',
          }}
        >
          <path d="M1 3.5 5 7.5 9 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${listId}-${String(active)}`}
          tabIndex={-1}
          className={`absolute z-[60] mt-2 min-w-[170px] overflow-hidden rounded-[12px] border py-1 shadow-[0_18px_40px_-16px_rgba(10,11,25,.65)] ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
          style={{ background: 'var(--surf-solid)', borderColor: 'var(--bd)' }}
        >
          {options.map((option, position) => {
            const selected = option.code === value;
            const highlighted = position === active;
            return (
              <li
                key={option.code}
                id={`${listId}-${String(position)}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => {
                  setActive(position);
                }}
                onClick={() => {
                  choose(option.code);
                }}
                className="flex cursor-pointer items-center gap-[9px] px-3 py-[7px] text-[14px]"
                style={{
                  background: highlighted ? 'var(--surf-hover)' : 'transparent',
                  color: selected ? 'var(--tx)' : 'var(--mut)',
                  fontWeight: selected ? 600 : 400,
                }}
              >
                <Flag flag={option.flag} className="text-[15px]" />
                <span className="flex-1 whitespace-nowrap">{option.name}</span>
                {/* La coche dit lequel est actif : la graisse seule ne se voit
                    pas, et la couleur seule ne se lit pas de tous les yeux. */}
                <span
                  aria-hidden
                  className="w-[11px] shrink-0 text-[11px]"
                  style={{ color: 'var(--acc2)', opacity: selected ? 1 : 0 }}
                >
                  ✓
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
