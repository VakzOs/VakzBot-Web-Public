'use client';

import { site } from '@/lib/site';
import { useT } from './I18n';

/** Bloc d'appel à l'action final. */
export function CTA() {
  const { t } = useT();
  return (
    <section id="heberger" className="container-site scroll-mt-[70px] py-[96px]">
      <div
        className="relative overflow-hidden rounded-[28px] border border-[var(--bd)] px-8 py-16 text-center"
        style={{ background: 'linear-gradient(160deg, var(--cta-from), transparent)' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-140px] h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-[var(--glow)] blur-[110px]"
        />
        <div className="relative">
          <h2 className="mx-auto max-w-[560px] font-display text-[32px] font-bold tracking-[-0.02em] sm:text-[40px]">
            {t('accueil.cta.titre')}
          </h2>
          <p className="mx-auto mt-[18px] max-w-[540px] text-[17px] leading-[1.6] text-[var(--mut)]">
            {t('accueil.cta.texte', { nom: site.name })}
          </p>
          <a
            href={site.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-accent mt-8 rounded-[14px] px-[30px] py-4 text-[16px] shadow-[0_18px_40px_-14px_var(--glow)]"
          >
            {t('accueil.cta.bouton')}
          </a>
        </div>
      </div>
    </section>
  );
}
