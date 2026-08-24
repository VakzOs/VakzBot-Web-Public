'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { site } from '@/lib/site';

const FEATURES: [string, string][] = [
  ['💰', 'Économie'],
  ['🎟️', 'Tickets'],
  ['🎉', 'Giveaways'],
  ['📣', 'Alertes stream'],
  ['👋', 'Bienvenue'],
  ['💡', 'Suggestions'],
  ['🛡️', 'Automod'],
  ['📈', 'Niveaux'],
  ['⭐', 'Starboard'],
  ['⏰', 'Rappels'],
];

function FeatureBubble({
  feature,
  className,
  duration,
}: {
  feature: [string, string];
  className: string;
  duration: string;
}) {
  return (
    <div
      className={`absolute inline-flex items-center gap-[9px] rounded-[14px] border border-[var(--bd)] bg-[var(--surf-solid)] px-[15px] py-[9px] text-[14px] font-semibold text-[var(--tx)] shadow-[0_14px_30px_-12px_rgba(10,11,25,.7)] transition-opacity duration-300 ${className}`}
      style={{ animation: `floatY ${duration} ease-in-out infinite` }}
    >
      <span className="text-[16px]">{feature[0]}</span>
      {feature[1]}
    </div>
  );
}

export function Hero() {
  const [fi, setFi] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const id = setInterval(() => setFi((v) => (v + 1) % FEATURES.length), 2600);
    return () => clearInterval(id);
  }, []);

  const f1 = FEATURES[fi];
  const f2 = FEATURES[(fi + 5) % FEATURES.length];
  const miniStats = site.stats.slice(0, 3);

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
            37 modules · FR &amp; EN · 100 % gratuit
          </div>

          <h1 className="fu2 font-display text-[42px] font-bold leading-[1.04] tracking-[-0.02em] sm:text-[52px] lg:text-[60px]">
            Le compagnon
            <br />
            tout-en-un de ton{' '}
            <span className="bg-gradient-to-r from-[var(--acc)] to-[var(--acc2)] bg-clip-text text-transparent">
              serveur Discord
            </span>
          </h1>

          <p className="fu3 mt-6 max-w-[500px] text-[18px] leading-[1.6] text-[var(--mut)]">
            Modération, niveaux, économie, tickets, giveaways, alertes stream… il ronronne, tu
            gères. Tout se règle en quelques clics via <code className="code text-[15px]">/config</code>.
          </p>

          <div className="fu4 mt-[34px] flex flex-wrap gap-[14px]">
            <a
              href={site.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-accent rounded-[14px] px-[26px] py-[15px] text-[16px] shadow-[0_18px_40px_-14px_var(--glow)]"
            >
              Héberger le bot →
            </a>
            <Link
              href="/#modules"
              className="btn-ghost rounded-[14px] px-[26px] py-[15px] text-[16px]"
            >
              Découvrir les modules
            </Link>
          </div>

          <div className="fu5 mt-9 flex gap-[30px]">
            {miniStats.map((s) => (
              <div key={s.label}>
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
              alt="Mascotte Meow Bot"
              className="relative h-[200px] w-[200px] rounded-[40px] shadow-[0_30px_70px_-22px_var(--glow)]"
              style={{ animation: 'floatY 6s ease-in-out infinite' }}
            />
            <div
              className="absolute right-[-96px] top-[-38px] rounded-[16px_16px_16px_4px] border border-[var(--bd)] bg-[var(--surf-solid)] px-[15px] py-[9px] font-display text-[15px] font-bold text-[var(--tx)] shadow-[0_14px_30px_-12px_rgba(10,11,25,.7)]"
              style={{ animation: 'floatY 4.5s ease-in-out infinite' }}
            >
              meow&nbsp;!
            </div>
            <div
              className="absolute bottom-[2px] left-[-128px] inline-flex items-center gap-2 rounded-full bg-[#34d399] px-[15px] py-[9px] text-[14px] font-bold text-[#052b20] shadow-[0_14px_30px_-12px_rgba(52,211,153,.6)]"
              style={{ animation: 'floatY 5.5s ease-in-out infinite' }}
            >
              ✓ /config
            </div>
            <FeatureBubble
              feature={f1}
              className="left-[-118px] top-[-18px]"
              duration="6.2s"
            />
            <FeatureBubble
              feature={f2}
              className="bottom-[-24px] right-[-84px]"
              duration="7s"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
