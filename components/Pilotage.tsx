'use client';

import { useT } from './I18n';

/**
 * Ce que le dashboard fait de l'INSTANCE, et pas d'un module : métriques,
 * sauvegardes, restauration, mises à jour. Rien de tout cela n'est un module —
 * ça n'avait donc sa place ni dans le catalogue ni dans la liste des commandes,
 * et la page n'en disait rien alors que c'est la raison d'ouvrir le dashboard
 * quand on héberge soi-même.
 *
 * Les identifiants et leurs emoji sont ici (c'est la structure de la section) ;
 * les textes vivent dans `accueil.pilotage.*`, comme partout ailleurs.
 */
const CAPACITES: { id: string; emoji: string }[] = [
  { id: 'metriques', emoji: '📊' },
  { id: 'sauvegardes', emoji: '💾' },
  { id: 'restauration', emoji: '♻️' },
  { id: 'maj', emoji: '🚀' },
];

/** Section « Pilotage de l'instance », entre les modules et les commandes. */
export function Pilotage() {
  const { t } = useT();

  return (
    <section id="pilotage" className="container-site scroll-mt-[70px] px-6 pt-[96px]">
      <div className="mx-auto max-w-[640px] text-center">
        <h2 className="font-display text-[32px] font-bold tracking-[-0.02em] sm:text-[40px]">
          {t('accueil.pilotage.titre')}
        </h2>
        <p className="mt-4 text-[17px] text-[var(--mut)]">{t('accueil.pilotage.intro')}</p>
      </div>

      <div className="mx-auto mt-12 grid max-w-[900px] gap-[14px] sm:grid-cols-2">
        {CAPACITES.map((capacite) => (
          <div
            key={capacite.id}
            className="flex items-start gap-[14px] rounded-[16px] border border-[var(--bd)] bg-[var(--surf)] p-[18px] transition-all duration-200 hover:-translate-y-[3px] hover:border-[var(--acc)] hover:bg-[var(--surf-hover)]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] border border-[var(--bd)] bg-[var(--bg2)] text-[21px]">
              {capacite.emoji}
            </span>
            <div>
              <h3 className="text-[16px] font-semibold text-[var(--tx)]">
                {t(`accueil.pilotage.capacites.${capacite.id}.titre`)}
              </h3>
              <p className="mt-[7px] text-[14px] leading-[1.5] text-[var(--mut)]">
                {t(`accueil.pilotage.capacites.${capacite.id}.texte`)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
