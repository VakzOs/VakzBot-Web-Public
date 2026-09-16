'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BackupRun, BackupState, GuildChannel } from '@/lib/botApi';
import type { Translate } from '@/lib/i18n';
import { useT } from '@/components/I18n';
import { formatDateTime, useTimeZone } from '@/lib/dates';
import { deleteBackupAction, restoreBackupAction, setBackupAction } from '../actions';

/**
 * Le panneau « Sauvegarde » d'un serveur.
 *
 * Une sauvegarde contient tout ce que le bot détient du serveur — la
 * configuration, mais aussi l'argent, les objets, les inventaires, la Route de
 * l'Infini, les niveaux… D'où le ton : on télécharge d'un clic, on planifie, et
 * on ne restaure jamais sans avoir confirmé.
 */

function fmtSize(t: Translate, bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} ${t('reglages.octets.o')}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ${t('reglages.octets.ko')}`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${t('reglages.octets.mo')}`;
}

/**
 * Plafond du corps d'une requête chez Vercel (4,5 Mo). Au-delà, la restauration
 * n'atteindrait même pas le bot.
 */
const UPLOAD_LIMIT = 4 * 1024 * 1024;

/**
 * Prépare le fichier choisi par l'admin : un JSON volumineux est compressé dans
 * le navigateur avant l'envoi (le bot accepte les deux formes, et le gzip fait
 * fondre un dump JSON d'environ 90 %). Sans cela, une grosse sauvegarde ne
 * passerait tout simplement pas la limite de l'hébergeur.
 */
async function prepareUpload(file: File): Promise<ArrayBuffer | null> {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer.slice(0, 2));
  const gzipped = head[0] === 0x1f && head[1] === 0x8b;
  if (gzipped || buffer.byteLength <= UPLOAD_LIMIT) return buffer;
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([buffer]).stream().pipeThrough(new CompressionStream('gzip'));
  const compressed = await new Response(stream).arrayBuffer();
  return compressed.byteLength <= UPLOAD_LIMIT ? compressed : null;
}

/**
 * Traduit un code d'erreur du bot en phrase utile.
 *
 * Les trois codes de fichier invalide (`invalid_json`, `invalid_shape`,
 * `invalid_file`) partagent un message : la distinction intéresse le bot, pas
 * l'administrateur, à qui il faut seulement dire que ce fichier n'est pas une
 * sauvegarde.
 */
function errorMessage(t: Translate, code: string): string {
  const key =
    code === 'invalid_json' || code === 'invalid_shape' ? 'invalid_file' : code;
  const known = [
    'invalid_cron',
    'invalid_channel',
    'rate_limited',
    'forbidden',
    'unknown_guild',
    'invalid_file',
    'unknown_file',
    'too_large',
    'restore_failed',
  ];
  return t(`reglages.backup.erreurs.${known.includes(key) ? key : 'defaut'}`);
}

/** Résumé lisible d'une sauvegarde qui vient de tourner. */
function runMessage(t: Translate, run: BackupRun): string {
  if (!run.ok) return errorMessage(t, run.error ?? '');
  const parts = [
    t('reglages.backup.creee', { lignes: run.rows ?? 0, modules: run.modules ?? 0 }),
  ];
  if (run.delivered) parts.push(t('reglages.backup.deposee'));
  if (run.pruned) parts.push(t('reglages.backup.purgees', { n: run.pruned }));
  return `${parts.join(' · ')}.`;
}

export function BackupPanel({
  guildId,
  initial,
  channels,
}: {
  guildId: string;
  initial: BackupState;
  channels: GuildChannel[];
}) {
  const { t } = useT();
  const format = t('langue.format');
  const router = useRouter();
  const timeZone = useTimeZone();
  const [state, setState] = useState(initial);
  const [cron, setCron] = useState(initial.settings.cron);
  const [keep, setKeep] = useState(String(initial.settings.keep));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  /** Fichier dont la restauration attend confirmation. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [restoreData, setRestoreData] = useState(true);
  const [recreate, setRecreate] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  const settings = state.settings;

  const apply = (patch: Parameters<typeof setBackupAction>[1]) => {
    setMessage(null);
    startTransition(async () => {
      const res = await setBackupAction(guildId, patch);
      if (!res.ok) {
        setMessage(errorMessage(t, res.error));
        return;
      }
      setState(res.state);
      setCron(res.state.settings.cron);
      setKeep(String(res.state.settings.keep));
      setMessage(
        res.state.run
          ? runMessage(t, res.state.run)
          : t('reglages.backup.enregistre'),
      );
    });
  };

  const remove = (name: string) => {
    setMessage(null);
    startTransition(async () => {
      const res = await deleteBackupAction(guildId, name);
      if (!res.ok || !res.state) {
        setMessage(t('reglages.backup.suppressionImpossible'));
        return;
      }
      setState(res.state);
      setMessage(t('reglages.backup.supprimee'));
    });
  };

  const restore = (name: string) => {
    setMessage(null);
    setConfirming(null);
    startTransition(async () => {
      const res = await restoreBackupAction(guildId, {
        file: name,
        recreate,
        data: restoreData,
      });
      if (!res.ok) {
        setMessage(errorMessage(t, res.error));
        return;
      }
      const rows = res.result.data?.total ?? 0;
      setMessage(
        t('reglages.backup.restauree', {
          modules: res.result.applied.length,
          donnees: res.result.data
            ? t('reglages.backup.lignesDonnees', { n: rows })
            : '',
        }),
      );
      router.refresh();
    });
  };

  /** Restauration depuis un fichier choisi sur le disque de l'admin. */
  const upload = (file: File) => {
    setMessage(null);
    startTransition(async () => {
      const body = await prepareUpload(file);
      if (!body) {
        setMessage(t('reglages.backup.fichierTropGros'));
        return;
      }
      const query = `recreate=${recreate ? 1 : 0}&data=${restoreData ? 1 : 0}`;
      const res = await fetch(`/api/backup/${guildId}?${query}`, { method: 'POST', body });
      const outcome = (await res.json().catch(() => null)) as
        | { ok: true; result: { applied: string[]; data: { total: number } | null } }
        | { ok: false; error: string }
        | null;
      if (!outcome?.ok) {
        setMessage(errorMessage(t, outcome?.error ?? ''));
        return;
      }
      setMessage(
        t('reglages.backup.restaureeFichier', {
          modules: outcome.result.applied.length,
          donnees: outcome.result.data
            ? t('reglages.backup.lignesDonnees', { n: outcome.result.data.total })
            : '',
        }),
      );
      if (fileInput.current) fileInput.current.value = '';
      router.refresh();
    });
  };

  return (
    <section className="card p-[22px]">
      <p className="text-[16px] font-bold">{t('reglages.backup.titre')}</p>
      <p className="mt-[6px] max-w-[720px] text-[14px] leading-[1.6] text-[var(--mut)]">
        {t('reglages.backup.aide')}
      </p>

      {/* --- Sauvegarder maintenant --- */}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => apply({ run: true })}
          disabled={pending}
          className="rounded-[10px] bg-[var(--acc)] px-[18px] py-[10px] text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {pending
            ? t('reglages.backup.enCours')
            : t('reglages.backup.maintenant')}
        </button>
        <span className="text-[13px] text-[var(--muted2)]">
          {t('reglages.backup.derniere', {
            date: formatDateTime(
              format,
              settings.lastRunAt,
              timeZone,
              t('reglages.jamais'),
            ),
          })}
          {settings.lastStatus === 'error' ? (
            <span className="text-[#fca5a5]">
              {t('reglages.backup.dernierEchec', {
                erreur: settings.lastError || t('reglages.backup.erreur'),
              })}
            </span>
          ) : null}
        </span>
      </div>

      {/* --- Planification --- */}
      <div className="mt-6 border-t border-[var(--bd)] pt-5">
        <p className="text-[15px] font-semibold">{t('reglages.backup.auto')}</p>
        <p className="mt-[4px] text-[13px] text-[var(--mut)]">
          {t('reglages.backup.autoAide')}
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-[10px] text-[14px]">
            <input
              type="checkbox"
              checked={settings.auto}
              disabled={pending}
              onChange={(e) => apply({ auto: e.target.checked })}
            />
            {t('reglages.backup.activer')}
          </label>

          <label className="flex flex-col gap-[6px] text-[14px] text-[var(--mut)]">
            {t('reglages.backup.cron')}
            <input
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              disabled={pending}
              className="field w-[170px] disabled:opacity-50"
              placeholder="0 4 * * *"
            />
          </label>

          <label className="flex flex-col gap-[6px] text-[14px] text-[var(--mut)]">
            {t('reglages.backup.conservees')}
            <input
              type="number"
              min={1}
              max={60}
              value={keep}
              onChange={(e) => setKeep(e.target.value)}
              disabled={pending}
              className="field w-[110px] disabled:opacity-50"
            />
          </label>

          <button
            type="button"
            onClick={() => apply({ cron, keep: Number(keep) || settings.keep })}
            disabled={pending || (cron === settings.cron && Number(keep) === settings.keep)}
            className="rounded-[10px] border border-[var(--bd)] px-[16px] py-[10px] text-[14px] font-semibold disabled:opacity-50"
          >
            {t('reglages.enregistrer')}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[var(--muted2)]">
            {t('reglages.backup.cadences')}
          </span>
          {state.presets.map((preset) => (
            <button
              key={preset.cron}
              type="button"
              onClick={() => setCron(preset.cron)}
              disabled={pending}
              className="rounded-[8px] border border-[var(--bd)] px-[10px] py-[4px] text-[12px] text-[var(--mut)] transition-colors hover:border-[var(--acc-bd)] hover:text-[var(--tx)] disabled:opacity-50"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-[10px] text-[14px]">
            <input
              type="checkbox"
              checked={settings.includeData}
              disabled={pending}
              onChange={(e) => apply({ includeData: e.target.checked })}
            />
            {t('reglages.backup.inclureDonnees')}
          </label>

          <label className="flex flex-col gap-[6px] text-[14px] text-[var(--mut)]">
            {t('reglages.backup.salonCopie')}
            <select
              value={settings.channelId ?? ''}
              disabled={pending}
              onChange={(e) => apply({ channelId: e.target.value || null })}
              className="field w-[240px] disabled:opacity-50"
            >
              <option value="">{t('reglages.backup.aucunSalon')}</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 max-w-[640px] text-[12px] text-[var(--muted2)]">
          {t('reglages.backup.salonAide')}
        </p>
      </div>

      {/* --- Options de restauration --- */}
      <div className="mt-6 border-t border-[var(--bd)] pt-5">
        <p className="text-[15px] font-semibold">
          {t('reglages.backup.restauration')}
        </p>
        <div className="mt-3 flex flex-wrap gap-5">
          <label className="flex items-center gap-[10px] text-[14px]">
            <input
              type="checkbox"
              checked={restoreData}
              onChange={(e) => setRestoreData(e.target.checked)}
            />
            {t('reglages.backup.restaurerDonnees')}
            <span className="text-[12px] text-[var(--muted2)]">
              {t('reglages.backup.restaurerDonneesAide')}
            </span>
          </label>
          <label className="flex items-center gap-[10px] text-[14px]">
            <input
              type="checkbox"
              checked={recreate}
              onChange={(e) => setRecreate(e.target.checked)}
            />
            {t('reglages.backup.recreer')}
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-[6px] text-[14px] text-[var(--mut)]">
          {t('reglages.backup.depuisFichier')}
          <input
            ref={fileInput}
            type="file"
            accept=".json,.gz,application/json,application/gzip"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
            className="text-[13px] text-[var(--mut)] file:mr-3 file:rounded-[8px] file:border file:border-[var(--bd)] file:bg-[var(--surf)] file:px-3 file:py-[6px] file:text-[13px] file:text-[var(--tx)]"
          />
        </label>
      </div>

      {/* --- Sauvegardes déposées --- */}
      <div className="mt-6 border-t border-[var(--bd)] pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[15px] font-semibold">
            {t('reglages.backup.disponibles', { n: state.backups.length })}
          </p>
          <span className="text-[12px] text-[var(--muted2)]">
            {t('reglages.backup.taille', {
              taille: fmtSize(t, state.totalSize),
            })}
          </span>
        </div>

        {state.backups.length === 0 ? (
          <p className="mt-3 text-[14px] text-[var(--mut)]">
            {t('reglages.backup.aucune')}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--bd)]">
            {state.backups.map((backup) => (
              <li key={backup.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-[10px]">
                <span className="text-[14px]">
                  {formatDateTime(
                    format,
                    backup.createdAt,
                    timeZone,
                    t('reglages.jamais'),
                  )}
                </span>
                <span className="text-[12px] text-[var(--muted2)]">
                  {fmtSize(t, backup.size)}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/backup/${guildId}?file=${encodeURIComponent(backup.name)}`}
                    className="rounded-[8px] border border-[var(--bd)] px-[12px] py-[6px] text-[13px] font-semibold transition-colors hover:border-[var(--acc-bd)]"
                  >
                    {t('reglages.backup.telecharger')}
                  </a>
                  {confirming === backup.name ? (
                    <>
                      <button
                        type="button"
                        onClick={() => restore(backup.name)}
                        disabled={pending}
                        className="rounded-[8px] bg-[#dc2626] px-[12px] py-[6px] text-[13px] font-semibold text-white disabled:opacity-50"
                      >
                        {t('reglages.backup.ouiRestaurer')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        disabled={pending}
                        className="rounded-[8px] border border-[var(--bd)] px-[12px] py-[6px] text-[13px] text-[var(--mut)] disabled:opacity-50"
                      >
                        {t('reglages.annuler')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(backup.name)}
                      disabled={pending}
                      className="rounded-[8px] border border-[var(--bd)] px-[12px] py-[6px] text-[13px] font-semibold transition-colors hover:border-[var(--acc-bd)] disabled:opacity-50"
                    >
                      {t('reglages.backup.restaurer')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(backup.name)}
                    disabled={pending}
                    className="rounded-[8px] border border-[var(--bd)] px-[12px] py-[6px] text-[13px] text-[#fca5a5] transition-colors hover:border-[rgba(248,113,113,.5)] disabled:opacity-50"
                  >
                    {t('reglages.backup.supprimer')}
                  </button>
                </span>
                {confirming === backup.name ? (
                  <p className="w-full text-[13px] text-[#fca5a5]">
                    {t('reglages.backup.avertissementRestauration', {
                      donnees: restoreData
                        ? t('reglages.backup.etLesDonnees')
                        : '',
                    })}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {state.excludedTables.length > 0 ? (
        <p className="mt-5 text-[12px] text-[var(--muted2)]">
          {t('reglages.backup.horsSauvegarde')}
        </p>
      ) : null}

      {message ? <p className="mt-4 text-[14px]">{message}</p> : null}
    </section>
  );
}
