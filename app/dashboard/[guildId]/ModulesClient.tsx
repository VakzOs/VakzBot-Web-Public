'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { ApiModule } from '@/lib/botApi';
import { toggleModuleAction } from './actions';

const CATEGORY_LABELS: Record<string, { title: string; emoji: string }> = {
  security: { title: 'Sécurité & Modération', emoji: '🛡️' },
  community: { title: 'Communauté', emoji: '👥' },
  engagement: { title: 'Engagement', emoji: '✨' },
  operations: { title: 'Utilitaires', emoji: '🧰' },
  fun: { title: 'Fun', emoji: '🎮' },
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
              Configurer →
            </Link>
          ) : null}
          {mod.name === 'items' ? (
            <Link
              href={`/dashboard/${guildId}/catalogue`}
              className="inline-block text-[12px] font-semibold text-[var(--acc2)]"
            >
              🎁 Catalogue d’objets →
            </Link>
          ) : null}
          {mod.name === 'gacha' ? (
            <Link
              href={`/dashboard/${guildId}/gacha-personnages`}
              className="inline-block text-[12px] font-semibold text-[var(--acc2)]"
            >
              🎴 Personnages maison →
            </Link>
          ) : null}
        </div>
      </div>
      <Toggle enabled={enabled} pending={pending} onChange={toggle} />
    </div>
  );
}

export function ModulesClient({ guildId, modules }: { guildId: string; modules: ApiModule[] }) {
  const grouped = CATEGORY_ORDER.map((id) => ({
    id,
    meta: CATEGORY_LABELS[id] ?? { title: id, emoji: '⚙️' },
    modules: modules.filter((m) => m.category === id),
  })).filter((g) => g.modules.length > 0);

  return (
    <div className="flex flex-col gap-9">
      {grouped.map((group) => (
        <section key={group.id}>
          <h2 className="mb-4 flex items-center gap-[10px] font-display text-[18px] font-semibold">
            <span className="text-[20px]">{group.meta.emoji}</span> {group.meta.title}
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
