'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { ApiModule } from '@/lib/botApi';
import { useT } from '@/components/I18n';
import { toggleModuleAction } from './actions';

/**
 * Les catégories du bot, dans l'ordre d'affichage, avec leur emoji. Leurs
 * titres sont traduits (`dashboard.modules.categories.*`) : ce sont les
 * catégories du CŒUR du bot (`src/core/module-catalog.ts`), pas celles de la
 * vitrine — d'où le `operations` qui n'existe pas côté site.
 */
const CATEGORY_EMOJI: Record<string, string> = {
  security: '🛡️',
  community: '👥',
  engagement: '✨',
  operations: '🧰',
  fun: '🎮',
};
const CATEGORY_ORDER = ['security', 'community', 'engagement', 'operations', 'fun'];

/** Switch 44×25 : piste accent/track, knob blanc glissant. */
export function Toggle({
  enabled,
  pending,
  onChange,
}: {
  enabled: boolean;
  pending?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={pending}
      aria-pressed={enabled}
      className="relative h-[25px] w-[44px] shrink-0 rounded-full transition-colors disabled:opacity-50"
      style={{ background: enabled ? 'var(--acc)' : 'var(--track)' }}
    >
      <span
        className="absolute top-[3px] h-[19px] w-[19px] rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,.35)] transition-[left] duration-200"
        style={{ left: enabled ? '22px' : '3px' }}
      />
    </button>
  );
}

function ModuleRow({ guildId, mod }: { guildId: string; mod: ApiModule }) {
  const { t } = useT();
  const [enabled, setEnabled] = useState(mod.enabled);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !enabled;
    setEnabled(next); // optimiste
    startTransition(async () => {
      const res = await toggleModuleAction(guildId, mod.name, next);
      if (!res.ok) setEnabled(!next); // rollback
    });
  };

  const hasForm = Array.isArray(mod.configUI) && mod.configUI.length > 0;

  return (
    <div className="flex items-center gap-[14px] rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-4">
      <span className="text-[20px]">{mod.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-[var(--tx)]">{mod.label}</p>
        <p className="mt-[3px] text-[13px] leading-[1.45] text-[var(--mut)]">{mod.description}</p>
        <div className="mt-[6px] flex flex-wrap gap-x-4 gap-y-1">
          {hasForm ? (
            <Link
              href={`/dashboard/${guildId}/${mod.name}`}
              className="inline-block text-[12px] font-semibold text-[var(--acc2)]"
            >
              {t('dashboard.modules.configurer')}
            </Link>
          ) : null}
          {mod.name === 'items' && !mod.partial ? (
            <Link
              href={`/dashboard/${guildId}/catalogue`}
              className="inline-block text-[12px] font-semibold text-[var(--acc2)]"
            >
              {t('dashboard.modules.catalogue')}
            </Link>
          ) : null}
          {mod.name === 'gacha' && !mod.partial ? (
            <Link
              href={`/dashboard/${guildId}/gacha-personnages`}
              className="inline-block text-[12px] font-semibold text-[var(--acc2)]"
            >
              {t('dashboard.modules.personnages')}
            </Link>
          ) : null}
        </div>
      </div>
      {/* L'interrupteur allume le module pour tout le serveur : il demande le
          module entier. À qui n'en tient qu'un bloc, on montre l'état plutôt
          qu'un bouton que le bot refuserait. */}
      {mod.partial ? (
        <span className="shrink-0 text-[12px] text-[var(--mut)]">
          {mod.enabled ? t('dashboard.module.active') : t('dashboard.module.desactive')}
        </span>
      ) : (
        <Toggle enabled={enabled} pending={pending} onChange={toggle} />
      )}
    </div>
  );
}

export function ModulesClient({ guildId, modules }: { guildId: string; modules: ApiModule[] }) {
  const { t } = useT();
  const grouped = CATEGORY_ORDER.map((id) => ({
    id,
    emoji: CATEGORY_EMOJI[id] ?? '⚙️',
    modules: modules.filter((m) => m.category === id),
  })).filter((g) => g.modules.length > 0);

  return (
    <div className="flex flex-col gap-9">
      {grouped.map((group) => (
        <section key={group.id}>
          <h2 className="mb-4 flex items-center gap-[10px] font-display text-[18px] font-semibold">
            <span className="text-[20px]">{group.emoji}</span>{' '}
            {t(`dashboard.modules.categories.${group.id}`)}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {group.modules.map((mod) => (
              <ModuleRow key={mod.name} guildId={guildId} mod={mod} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
