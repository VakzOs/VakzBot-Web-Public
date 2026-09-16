'use client';

import { useState, useTransition } from 'react';
import type { BotLocale } from '@/lib/botApi';
import { useT } from '@/components/I18n';
import { LangMenu } from '@/components/LangMenu';
import { site } from '@/lib/site';
import { setBotLocaleAction } from './actions';

/**
 * Sélecteur de la langue DU BOT sur ce serveur.
 *
 * À ne pas confondre avec celui de la barre de navigation, qui change la langue
 * du SITE : ici on choisit dans quelle langue le bot s'adresse aux membres du
 * serveur. Un admin peut très bien lire son dashboard en anglais et laisser le
 * bot parler français à sa communauté — d'où deux réglages, et un texte d'aide
 * qui le dit.
 *
 * Les langues viennent du bot lui-même (`GET /api/locales`), drapeau compris :
 * déposer un dossier de langue dans le dépôt du bot la fait apparaître ici sans
 * qu'une ligne du site change.
 */
export function BotLangSelector({
  guildId,
  current,
  locales,
}: {
  guildId: string;
  current: string;
  locales: BotLocale[];
}) {
  const { t } = useT();
  const [locale, setLocale] = useState(current);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (next: string) => {
    if (next === locale) return;
    const previous = locale;
    setLocale(next); // optimiste
    setMessage(null);
    startTransition(async () => {
      const res = await setBotLocaleAction(guildId, next);
      if (res.ok) {
        setMessage(t('dashboard.langueBot.enregistre'));
      } else {
        setLocale(previous); // rollback
        setMessage(t('dashboard.langueBot.echec'));
      }
    });
  };

  return (
    <section className="card p-[22px]">
      <h2 className="font-display text-[18px] font-semibold text-[var(--tx)]">
        {t('dashboard.langueBot.titre')}
      </h2>
      <p className="mt-2 max-w-[620px] text-[14px] leading-[1.6] text-[var(--mut)]">
        {t('dashboard.langueBot.aide', { nom: site.name })}
      </p>

      {locales.length < 2 ? (
        <p className="mt-4 text-[14px] text-[var(--muted2)]">
          {t('dashboard.langueBot.indisponible')}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <LangMenu
            options={locales}
            value={locale}
            onChange={change}
            label={t('dashboard.langueBot.titre')}
            disabled={pending}
          />
          {pending ? (
            <span className="text-[14px] text-[var(--mut)]">
              {t('dashboard.langueBot.encours')}
            </span>
          ) : message ? (
            <span className="text-[14px] text-[var(--tx)]">{message}</span>
          ) : null}
        </div>
      )}
    </section>
  );
}
