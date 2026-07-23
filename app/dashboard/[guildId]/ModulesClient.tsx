'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { ApiModule, DeployState } from '@/lib/botApi';
import { deployAction, toggleModuleAction } from './actions';

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
        {hasForm ? (
          <Link
            href={`/dashboard/${guildId}/${mod.name}`}
            className="mt-[6px] inline-block text-[12px] font-semibold text-[var(--acc2)]"
          >
            Configurer →
          </Link>
        ) : null}
      </div>
      <Toggle enabled={enabled} pending={pending} onChange={toggle} />
    </div>
  );
}

export function ModulesClient({
  guildId,
  modules,
  canDeploy,
  deploy,
}: {
  guildId: string;
  modules: ApiModule[];
  canDeploy: boolean;
  deploy?: DeployState | null;
}) {
  const grouped = CATEGORY_ORDER.map((id) => ({
    id,
    meta: CATEGORY_LABELS[id] ?? { title: id, emoji: '⚙️' },
    modules: modules.filter((m) => m.category === id),
  })).filter((g) => g.modules.length > 0);

  return (
    <div className="flex flex-col gap-9">
      {canDeploy ? <DeployPanel guildId={guildId} deploy={deploy ?? null} /> : null}
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

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR');
}

function DeployPanel({ guildId, deploy }: { guildId: string; deploy: DeployState | null }) {
  const branches = deploy?.branches ?? [];
  const [branch, setBranch] = useState(branches[0] ?? '');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await deployAction(guildId, branch || undefined);
      setMessage(
        res.ok
          ? `✅ Mise à jour demandée${branch ? ` (branche « ${branch} »)` : ''}. Le bot va se reconstruire et redémarrer (1-2 min).`
          : '❌ Échec de la demande de mise à jour.',
      );
    });
  };

  const status = deploy?.status;
  const result = deploy?.result;
  const resultOk = result?.status === 'success';

  return (
    <div className="space-y-[18px] rounded-[18px] border border-[var(--acc-bd)] bg-[var(--acc-bg)] p-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-[520px]">
          <p className="text-[16px] font-bold">Mise à jour du bot</p>
          <p className="mt-[6px] text-[14px] text-[var(--mut)]">
            Déclenche un <code className="code text-[13px]">/maj</code> (git pull + reconstruction +
            redémarrage) sur le serveur.
          </p>
        </div>
        <div className="flex items-center gap-[10px]">
          {branches.length > 0 ? (
            <label className="flex items-center gap-2 text-[14px] text-[var(--mut)]">
              Branche
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={pending}
                className="field w-auto disabled:opacity-50"
              >
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="shrink-0 rounded-[10px] bg-[var(--acc)] px-[18px] py-[10px] text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? 'En cours…' : 'Mettre à jour'}
          </button>
        </div>
      </div>

      {status || result ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[12px] border border-[var(--bd)] bg-[var(--surf)] p-[14px]">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted2)]">État</p>
            <p className="mt-[6px] text-[14px]">
              <span className="font-semibold">{status?.phase ?? status?.state ?? 'au repos'}</span>
              <span className="text-[var(--mut)]"> — {status?.message ?? 'prêt'}</span>
            </p>
            {status?.updatedAt ? (
              <p className="mt-[2px] text-[12px] text-[var(--muted2)]">{fmtDate(status.updatedAt)}</p>
            ) : null}
          </div>
          <div className="rounded-[12px] border border-[var(--bd)] bg-[var(--surf)] p-[14px]">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted2)]">
              Dernier résultat
            </p>
            {result ? (
              <p
                className="mt-[6px] text-[14px] font-semibold"
                style={{ color: resultOk ? '#34d399' : '#fca5a5' }}
              >
                {resultOk ? '✅ Succès' : `❌ ${result.status ?? 'échec'}`}
                {result.commit ? (
                  <span className="ml-1 font-mono text-[12px] text-[var(--mut)]">
                    {result.commit.slice(0, 8)}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="mt-[6px] text-[14px] text-[var(--mut)]">—</p>
            )}
            {result?.finishedAt ? (
              <p className="mt-[2px] text-[12px] text-[var(--muted2)]">{fmtDate(result.finishedAt)}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {message ? <p className="text-[14px] text-[var(--tx)]">{message}</p> : null}
    </div>
  );
}
