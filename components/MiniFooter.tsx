'use client';

import { site } from '@/lib/site';
import { useT } from './I18n';

/** Pied de page minimal (pages légales), container configurable. */
export function MiniFooter({ container = 'container-legal' }: { container?: string }) {
  const { t } = useT();
  return (
    <footer className="border-t border-[var(--bd)]">
      <div className={`${container} flex flex-wrap items-center justify-between gap-[18px] py-8`}>
        <div className="flex items-center gap-[10px] font-display text-[16px] font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={site.avatarUrl} alt="" className="h-7 w-7 rounded-[8px]" /> {site.name}
        </div>
        <p className="text-[14px] text-[var(--muted2)]">
          {t('pied.droits', { annee: new Date().getFullYear(), nom: site.name })}
        </p>
      </div>
    </footer>
  );
}
