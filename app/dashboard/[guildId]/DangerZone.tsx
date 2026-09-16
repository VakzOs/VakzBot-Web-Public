'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/I18n';
import { purgeGuildAction } from './actions';

export function DangerZone({ guildId, guildName }: { guildId: string; guildName: string }) {
  const { t } = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const purge = () => {
    setError(null);
    startTransition(async () => {
      const res = await purgeGuildAction(guildId);
      if (res.ok) {
        router.push('/dashboard?purged=1');
      } else {
        setError(t('dashboard.danger.echec'));
        setConfirming(false);
      }
    });
  };

  return (
    <section className="rounded-[18px] border border-[rgba(248,113,113,.32)] bg-[rgba(248,113,113,.06)] p-[22px]">
      <h2 className="flex items-center gap-2 font-display text-[18px] font-semibold text-[#fca5a5]">
        {t('dashboard.danger.titre')}
      </h2>
      <p className="mt-2 max-w-[620px] text-[14px] leading-[1.6] text-[var(--mut)]">
        {t('dashboard.danger.texte', { nom: guildName })}
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-4 rounded-[10px] border border-[rgba(248,113,113,.5)] px-[18px] py-[10px] text-[14px] font-semibold text-[#fca5a5] transition-colors hover:bg-[rgba(248,113,113,.1)]"
        >
          {t('dashboard.danger.bouton')}
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-[14px] font-medium text-[#fca5a5]">
            {t('dashboard.danger.confirmer')}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={purge}
              disabled={pending}
              className="rounded-[10px] bg-[#dc2626] px-[18px] py-[10px] text-[14px] font-semibold text-white transition-colors hover:bg-[#ef4444] disabled:opacity-50"
            >
              {pending ? t('dashboard.danger.encours') : t('dashboard.danger.oui')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-[10px] border border-[var(--bd)] px-[18px] py-[10px] text-[14px] font-semibold text-[var(--mut)] transition-colors hover:bg-[var(--surf-hover)] hover:text-[var(--tx)] disabled:opacity-50"
            >
              {t('dashboard.danger.annuler')}
            </button>
          </div>
        </div>
      )}

      {error ? <p className="mt-3 text-[14px] text-[#fca5a5]">{error}</p> : null}
    </section>
  );
}
