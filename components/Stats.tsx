'use client';

import { site } from '@/lib/site';
import { useT } from './I18n';

/**
 * Les quatre cartes de statistiques sous le hero.
 *
 * Le nombre de langues se compte dans `locales/` plutôt que dans une constante :
 * la carte se met à jour d'elle-même quand une langue arrive, au lieu d'annoncer
 * « 2 langues » pour l'éternité.
 *
 * Pas de carte « N commandes » : le staff ne configure plus rien par le chat,
 * tout passe par le dashboard — annoncer un catalogue de commandes vendrait
 * l'inverse de ce que le bot fait. D'où la carte « 0 commande à retenir », dont
 * la valeur reste une clé : une langue peut vouloir l'écrire en toutes lettres.
 *
 * Le hero n'en reprend que les trois premières (`slice(0, 3)`) : l'ordre compte.
 */
export function useSiteStats(): { id: string; value: string; label: string }[] {
  const { t, locales } = useT();
  return [
    { id: 'modules', value: String(site.counts.modules), label: t('accueil.stats.modules') },
    { id: 'langues', value: String(locales.length), label: t('accueil.stats.langues') },
    { id: 'gratuit', value: t('accueil.stats.gratuitValeur'), label: t('accueil.stats.gratuit') },
    {
      id: 'dashboard',
      value: t('accueil.stats.dashboardValeur'),
      label: t('accueil.stats.dashboard'),
    },
  ];
}

/** Bande de statistiques sous le hero (4 cartes centrées). */
export function Stats() {
  const stats = useSiteStats();
  return (
    <section className="container-site">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.id}
            className="rounded-[18px] border border-[var(--bd)] bg-[var(--surf)] px-1 py-[26px] text-center"
          >
            <div className="font-display text-[34px] font-extrabold tracking-[-0.02em] text-[var(--tx)]">
              {s.value}
            </div>
            <div className="mt-1 text-[14px] text-[var(--mut)]">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
