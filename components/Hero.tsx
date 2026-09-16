'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { site } from '@/lib/site';
import { heroBubbles } from '@/lib/modules';
import { useSiteStats } from './Stats';
import { useT } from './I18n';

function FeatureBubble({
  emoji,
  label,
  className,
  duration,
}: {
  emoji: string;
  label: string;
  className: string;
  duration: string;
}) {
  return (
    <div
      className={`absolute inline-flex items-center gap-[9px] rounded-[14px] border border-[var(--bd)] bg-[var(--surf-solid)] px-[15px] py-[9px] text-[14px] font-semibold text-[var(--tx)] shadow-[0_14px_30px_-12px_rgba(10,11,25,.7)] transition-opacity duration-300 ${className}`}
      style={{ animation: `floatY ${duration} ease-in-out infinite` }}
    >
      <span className="text-[16px]">{emoji}</span>
      {label}
    </div>
  );
}

export function Hero() {
  const { t, locales } = useT();
  const stats = useSiteStats();
  const [fi, setFi] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const id = setInterval(() => setFi((v) => (v + 1) % heroBubbles.length), 2600);
    return () => clearInterval(id);
  }, []);

  const f1 = heroBubbles[fi];
  const f2 = heroBubbles[(fi + 5) % heroBubbles.length];
  const miniStats = stats.slice(0, 3);
  // Le titre porte un retour à la ligne voulu par la maquette : il se traduit
  // avec le texte (l'anglais ne coupe pas au même mot) plutôt que d'être figé
  // dans le balisage.
  const [titre1, titre2] = t('accueil.titre').split('\n');

  return (
    <section id="top" className="relative overflow-hidden">
      {/* Halos aurora */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute left-[6%] top-[-160px] h-[560px] w-[560px] rounded-full bg-[var(--glow)] blur-[100px]"
          style={{ animation: 'blob 18s ease-in-out infinite' }}
        />
        <div
          className="absolute right-0 top-[-40px] h-[480px] w-[480px] rounded-full bg-[var(--glow2)] blur-[100px]"
          style={{ animation: 'blob 22s ease-in-out infinite reverse' }}
        />
      </div>

      <div className="container-site relative grid items-center gap-5 pb-[84px] pt-[72px] lg:grid-cols-[1.05fr_.95fr]">
        {/* Colonne gauche */}
        <div>
          <div className="fu1 mb-6 inline-flex items-center gap-[9px] rounded-full border border-[var(--bd)] bg-[var(--surf)] px-4 py-2 text-[14px] text-[var(--mut)]">
            <span
              className="h-2 w-2 rounded-full bg-[#34d399]"
              style={{ animation: 'pulseDot 2s infinite' }}
            />
            {t('accueil.badge', {
              modules: site.counts.modules,
              langues: locales.length,
            })}
          </div>

          <h1 className="fu2 font-display text-[42px] font-bold leading-[1.04] tracking-[-0.02em] sm:text-[52px] lg:text-[60px]">
            {titre1}
            <br />
            {titre2}{' '}
            <span className="bg-gradient-to-r from-[var(--acc)] to-[var(--acc2)] bg-clip-text text-transparent">
              {t('accueil.titreAccent')}
            </span>
          </h1>

          <p className="fu3 mt-6 max-w-[500px] text-[18px] leading-[1.6] text-[var(--mut)]">
            {t('accueil.sousTitre')}
          </p>

          <div className="fu4 mt-[34px] flex flex-wrap gap-[14px]">
            <a
              href={site.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-accent rounded-[14px] px-[26px] py-[15px] text-[16px] shadow-[0_18px_40px_-14px_var(--glow)]"
            >
              {t('accueil.ctaHeberger')}
            </a>
            <Link
              href="/#modules"
              className="btn-ghost rounded-[14px] px-[26px] py-[15px] text-[16px]"
            >
              {t('accueil.ctaModules')}
            </Link>
          </div>

          <div className="fu5 mt-9 flex gap-[30px]">
            {miniStats.map((s) => (
              <div key={s.id}>
                <div className="font-display text-[28px] font-extrabold text-[var(--tx)]">
                  {s.value}
                </div>
                <div className="mt-0.5 text-[13px] font-semibold text-[var(--mut)]">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Colonne droite — mascotte */}
        <div className="relative hidden min-h-[400px] items-center justify-center md:flex">
          <div className="relative h-[200px] w-[200px]">
            <div
              className="absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: 'radial-gradient(circle, var(--glow) 0%, transparent 68%)',
                animation: 'glowPulse 5s ease-in-out infinite',
              }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={site.avatarUrl}
              alt={t('accueil.mascotte', { nom: site.name })}
              className="relative h-[200px] w-[200px] rounded-[40px] shadow-[0_30px_70px_-22px_var(--glow)]"
              style={{ animation: 'floatY 6s ease-in-out infinite' }}
            />
            <div
              className="absolute right-[-96px] top-[-38px] rounded-[16px_16px_16px_4px] border border-[var(--bd)] bg-[var(--surf-solid)] px-[15px] py-[9px] font-display text-[15px] font-bold text-[var(--tx)] shadow-[0_14px_30px_-12px_rgba(10,11,25,.7)]"
              style={{ animation: 'floatY 4.5s ease-in-out infinite' }}
            >
              {t('accueil.bulleMeow')}
            </div>
            <div
              className="absolute bottom-[2px] left-[-128px] inline-flex items-center gap-2 rounded-full bg-[#34d399] px-[15px] py-[9px] text-[14px] font-bold text-[#052b20] shadow-[0_14px_30px_-12px_rgba(52,211,153,.6)]"
              style={{ animation: 'floatY 5.5s ease-in-out infinite' }}
            >
              {t('accueil.bulleDashboard')}
            </div>
            <FeatureBubble
              emoji={f1?.emoji ?? ''}
              label={t(`catalogue.modules.${f1?.id ?? ''}.nom`)}
              className="left-[-118px] top-[-18px]"
              duration="6.2s"
            />
            <FeatureBubble
              emoji={f2?.emoji ?? ''}
              label={t(`catalogue.modules.${f2?.id ?? ''}.nom`)}
              className="bottom-[-24px] right-[-84px]"
              duration="7s"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
