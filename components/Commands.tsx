'use client';

import { commands } from '@/lib/modules';
import { useT } from './I18n';

/**
 * Section « Commandes » (fond alterné bg2, bords haut/bas).
 *
 * Le nom de la commande passe par `t()` au même titre que sa description : le
 * bot enregistre ses commandes dans la langue du serveur (`/rang` ici,
 * `/rank` là), et un nom écrit en dur laissait du français sur la page
 * anglaise.
 */
export function Commands() {
  const { t } = useT();

  return (
    <section
      id="commandes"
      className="mt-[96px] scroll-mt-[70px] border-y border-[var(--bd)] bg-[var(--bg2)] py-[88px]"
    >
      <div className="container-site">
        <div className="mx-auto max-w-[640px] text-center">
          <h2 className="font-display text-[32px] font-bold tracking-[-0.02em] sm:text-[40px]">
            {t('catalogue.commandes.titre')}
          </h2>
          <p className="mt-4 text-[17px] text-[var(--mut)]">{t('catalogue.commandes.intro')}</p>
        </div>

        <div className="mx-auto mt-12 grid max-w-[900px] gap-[14px] sm:grid-cols-2">
          {commands.map((id) => (
            <div
              key={id}
              className="flex items-start gap-4 rounded-[16px] border border-[var(--bd)] bg-[var(--surf)] p-[18px]"
            >
              <code className="shrink-0 rounded-[9px] bg-[var(--codebg)] px-[11px] py-[6px] font-mono text-[14px] font-semibold text-[var(--acc2)]">
                {t(`catalogue.commandes.${id}.nom`)}
              </code>
              <p className="mt-[3px] text-[14px] leading-[1.5] text-[var(--mut)]">
                {t(`catalogue.commandes.${id}.texte`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
