'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useT } from '@/components/I18n';
import { formatDateTime, useTimeZone } from '@/lib/dates';
import type { MyRequest } from '@/lib/invitations';
import { inviteUrl } from '@/lib/site';
import { redeemCodeAction, requestCodeAction } from './actions';

/**
 * Le formulaire où l'on présente son code.
 *
 * Trois écrans possibles, et le choix ne se fait pas ici : la page (serveur) a
 * déjà demandé au bot s'il exige un code, et sait si le visiteur est connecté.
 * Ce composant n'est que la moitié interactive — la saisie, l'attente, et le
 * bouton d'ajout qui n'apparaît qu'une fois le code retenu.
 */

/** Ce qu'on affiche pendant la saisie : majuscules et tirets posés d'office. */
function formatInput(value: string): string {
  const raw = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
  return (raw.match(/.{1,4}/g) ?? []).join('-');
}

export function AjouterClient({
  /** `null` : le bot n'a pas répondu, on ne sait pas si un code est exigé. */
  require,
  connected,
  /** La demande de ce visiteur, s'il en a laissé une. */
  maDemande,
}: {
  require: boolean | null;
  connected: boolean;
  maDemande: MyRequest | null;
}) {
  const { t } = useT();
  const timeZone = useTimeZone();
  const format = t('langue.format');
  // Un code accordé arrive déjà saisi : il n'y a plus qu'à valider. Le
  // recopier à la main d'un encadré vers le champ juste au-dessous serait une
  // corvée inventée.
  const [code, setCode] = useState(maDemande?.grantedCode ?? '');
  const [minutes, setMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [demande, setDemande] = useState('');
  const [demandeFaite, setDemandeFaite] = useState<{ notified: boolean } | null>(null);
  const [demandeErreur, setDemandeErreur] = useState<string | null>(null);
  const [demandePending, startDemande] = useTransition();

  if (require === null) {
    return (
      <section className="card mt-8 p-[22px]">
        <h2 className="font-display text-[18px] font-semibold">
          {t('invitations.indisponible.titre')}
        </h2>
        <p className="mt-2 text-[15px] leading-[1.65] text-[var(--mut)]">
          {t('invitations.indisponible.texte')}
        </p>
      </section>
    );
  }

  // Porte ouverte : le formulaire n'aurait rien à valider, et un champ qu'on
  // remplit pour rien est pire qu'un champ absent.
  if (!require) {
    return (
      <section className="card mt-8 p-[22px]">
        <h2 className="font-display text-[18px] font-semibold">{t('invitations.ouvert.titre')}</h2>
        <p className="mt-2 text-[15px] leading-[1.65] text-[var(--mut)]">
          {t('invitations.ouvert.texte')}
        </p>
        <a
          href={inviteUrl()}
          target="_blank"
          rel="noreferrer"
          className="btn-accent mt-5 px-[20px] py-[12px] text-[15px]"
        >
          {t('invitations.ouvert.bouton')}
        </a>
      </section>
    );
  }

  if (!connected) {
    return (
      <section className="card mt-8 p-[22px]">
        <h2 className="font-display text-[18px] font-semibold">
          {t('invitations.connexion.titre')}
        </h2>
        <p className="mt-2 max-w-[640px] text-[15px] leading-[1.65] text-[var(--mut)]">
          {t('invitations.connexion.texte')}
        </p>
        <a
          href="/api/auth/login?retour=/ajouter"
          className="btn-accent mt-5 px-[20px] py-[12px] text-[15px]"
        >
          {t('invitations.connexion.bouton')}
        </a>
      </section>
    );
  }

  if (minutes !== null) {
    return (
      <section className="mt-8 rounded-[18px] border border-[rgba(52,211,153,.32)] bg-[rgba(52,211,153,.06)] p-[22px]">
        <h2 className="font-display text-[18px] font-semibold text-[#34d399]">
          {t('invitations.succes.titre')}
        </h2>
        <p className="mt-2 max-w-[640px] text-[15px] leading-[1.65] text-[var(--mut)]">
          {t('invitations.succes.texte', { minutes })}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a
            href={inviteUrl()}
            target="_blank"
            rel="noreferrer"
            className="btn-accent px-[20px] py-[12px] text-[15px]"
          >
            {t('invitations.succes.bouton')}
          </a>
          <Link
            href="/dashboard"
            className="rounded-[12px] border border-[var(--bd)] px-[20px] py-[12px] text-[15px] font-semibold text-[var(--mut)] transition-colors hover:bg-[var(--surf-hover)] hover:text-[var(--tx)]"
          >
            {t('invitations.succes.dashboard')}
          </Link>
        </div>
        <p className="mt-4 text-[13px] text-[var(--muted2)]">{t('invitations.succes.apres')}</p>
      </section>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await redeemCodeAction(code);
      if (result.status === 'ok') setMinutes(result.minutes);
      else setError(t(`invitations.erreurs.${result.reason}`));
    });
  };

  /** Une demande déposée et pas encore traitée : rien d'autre à faire qu'attendre. */
  const attente = Boolean(maDemande && !maDemande.answeredAt);

  const demander = () => {
    setDemandeErreur(null);
    startDemande(async () => {
      const result = await requestCodeAction(demande);
      if (result.status === 'ok') setDemandeFaite({ notified: result.notified });
      else setDemandeErreur(t(`invitations.erreurs.${result.reason}`));
    });
  };

  const repondu = maDemande?.answeredAt ? (
    <section className="mt-8 rounded-[18px] border border-[rgba(52,211,153,.32)] bg-[rgba(52,211,153,.06)] p-[22px]">
      <h2 className="font-display text-[17px] font-semibold text-[#34d399]">
        {t('invitations.maDemande.reponseTitre')}
      </h2>
      <p className="mt-1 text-[13px] text-[var(--muted2)]">
        {t('invitations.maDemande.reponseDate', {
          date: formatDateTime(format, maDemande.answeredAt, timeZone),
        })}
      </p>
      {maDemande.reply ? (
        <p className="mt-3 max-w-[640px] whitespace-pre-wrap text-[15px] leading-[1.65] text-[var(--mut)]">
          {maDemande.reply}
        </p>
      ) : null}
      {maDemande.grantedCode ? (
        <p className="mt-3 text-[14px] text-[var(--mut)]">
          {t('invitations.maDemande.reponseCode')}
        </p>
      ) : null}
    </section>
  ) : null;

  return (
    <>
    {repondu}
    <section className="card mt-8 p-[22px]">
      <label htmlFor="code-acces" className="text-[15px] font-semibold">
        {t('invitations.form.label')}
      </label>
      <div className="mt-3 flex flex-wrap gap-3">
        <input
          id="code-acces"
          value={code}
          onChange={(e) => setCode(formatInput(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !pending) submit();
          }}
          placeholder={t('invitations.form.placeholder')}
          autoComplete="off"
          spellCheck={false}
          className="field max-w-[260px] font-mono tracking-[0.12em]"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || code.length < 14}
          className="btn-accent px-[20px] py-[11px] text-[15px] disabled:opacity-50"
        >
          {pending ? t('invitations.form.envoi') : t('invitations.form.valider')}
        </button>
      </div>
      <p className="mt-3 text-[13px] text-[var(--muted2)]">{t('invitations.form.aide')}</p>
      {error ? <p className="mt-3 text-[14px] text-[#fca5a5]">{error}</p> : null}
    </section>

    {/* Demander un code. Sans ce formulaire, en obtenir un suppose de savoir
        déjà à qui le demander — ce qui ferme la porte à qui découvre
        l'instance. */}
    <section className="card mt-5 p-[22px]">
      <h2 className="font-display text-[17px] font-semibold">
        {t('invitations.demande.titre')}
      </h2>
      <p className="mt-2 max-w-[640px] text-[15px] leading-[1.65] text-[var(--mut)]">
        {t('invitations.demande.texte')}
      </p>

      {demandeFaite ? (
        <p className="mt-4 text-[14px] leading-[1.6] text-[#34d399]">
          {demandeFaite.notified
            ? t('invitations.demande.envoyee')
            : t('invitations.demande.envoyeeSansMp')}
        </p>
      ) : attente ? (
        /* Une demande dort déjà : proposer d'en écrire une seconde ferait
           croire que la première s'est perdue. */
        <div className="mt-4">
          <p className="text-[14px] font-semibold">{t('invitations.maDemande.attenteTitre')}</p>
          <p className="mt-1 max-w-[600px] text-[14px] leading-[1.6] text-[var(--mut)]">
            {t('invitations.maDemande.attenteTexte', {
              date: formatDateTime(format, maDemande?.createdAt, timeZone),
            })}
          </p>
        </div>
      ) : (
        <>
          <label htmlFor="demande-message" className="mt-4 block text-[14px] font-semibold">
            {t('invitations.demande.label')}
          </label>
          <textarea
            id="demande-message"
            value={demande}
            onChange={(e) => setDemande(e.target.value)}
            placeholder={t('invitations.demande.placeholder')}
            maxLength={500}
            rows={3}
            className="field mt-2 w-full max-w-[560px] resize-y"
          />
          <button
            type="button"
            onClick={demander}
            disabled={demandePending || !demande.trim()}
            className="mt-3 block rounded-[12px] border border-[var(--acc-bd)] px-[20px] py-[11px] text-[15px] font-semibold text-[var(--acc2)] transition-colors hover:bg-[var(--surf-hover)] disabled:opacity-50"
          >
            {demandePending ? t('invitations.demande.envoi') : t('invitations.demande.envoyer')}
          </button>
          {demandeErreur ? (
            <p className="mt-3 text-[14px] text-[#fca5a5]">{demandeErreur}</p>
          ) : null}
        </>
      )}
    </section>
    </>
  );
}
