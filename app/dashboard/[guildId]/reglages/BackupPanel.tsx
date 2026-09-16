'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BackupRun, BackupState, GuildChannel } from '@/lib/botApi';
import { deleteBackupAction, restoreBackupAction, setBackupAction } from '../actions';

/**
 * Le panneau « Sauvegarde » d'un serveur.
 *
 * Une sauvegarde contient tout ce que le bot détient du serveur — la
 * configuration, mais aussi l'argent, les objets, les inventaires, la Route de
 * l'Infini, les niveaux… D'où le ton : on télécharge d'un clic, on planifie, et
 * on ne restaure jamais sans avoir confirmé.
 */

function fmtDate(value: string | number | null | undefined): string {
  if (!value) return 'jamais';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'jamais' : date.toLocaleString('fr-FR');
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
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

/** Traduit un code d'erreur du bot en phrase utile. */
function errorMessage(code: string): string {
  switch (code) {
    case 'invalid_cron':
      return '❌ Expression cron invalide. Exemple : 0 4 * * * (chaque jour à 4 h).';
    case 'invalid_channel':
      return '❌ Salon invalide.';
    case 'rate_limited':
      return '⏳ Trop de demandes d’affilée. Réessaie dans une minute.';
    case 'forbidden':
      return '❌ Tu n’as pas les droits sur ce serveur.';
    case 'unknown_guild':
      return '❌ Le bot n’est pas (ou plus) sur ce serveur.';
    case 'invalid_json':
    case 'invalid_shape':
    case 'invalid_file':
      return '❌ Ce fichier n’est pas une sauvegarde Vakz-Bot valide.';
    case 'unknown_file':
      return '❌ Cette sauvegarde n’existe plus.';
    case 'too_large':
      return '❌ Fichier trop volumineux.';
    case 'restore_failed':
      return '❌ La restauration a échoué : rien n’a été modifié.';
    default:
      return '❌ Le bot n’a pas répondu.';
  }
}

/** Résumé lisible d'une sauvegarde qui vient de tourner. */
function runMessage(run: BackupRun): string {
  if (!run.ok) return errorMessage(run.error ?? '');
  const parts = [`✅ Sauvegarde créée (${run.rows ?? 0} ligne(s), ${run.modules ?? 0} module(s))`];
  if (run.delivered) parts.push('copie déposée dans le salon');
  if (run.pruned) parts.push(`${run.pruned} ancienne(s) supprimée(s)`);
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
  const router = useRouter();
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
        setMessage(errorMessage(res.error));
        return;
      }
      setState(res.state);
      setCron(res.state.settings.cron);
      setKeep(String(res.state.settings.keep));
      setMessage(res.state.run ? runMessage(res.state.run) : '✅ Enregistré.');
    });
  };

  const remove = (name: string) => {
    setMessage(null);
    startTransition(async () => {
      const res = await deleteBackupAction(guildId, name);
      if (!res.ok || !res.state) {
        setMessage('❌ Suppression impossible.');
        return;
      }
      setState(res.state);
      setMessage('🗑️ Sauvegarde supprimée.');
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
        setMessage(errorMessage(res.error));
        return;
      }
      const rows = res.result.data?.total ?? 0;
      setMessage(
        `✅ Serveur restauré : ${res.result.applied.length} module(s)` +
          (res.result.data ? `, ${rows} ligne(s) de données` : '') +
          '.',
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
        setMessage(
          '❌ Fichier trop volumineux pour le dashboard. Passe par ' +
            '/sauvegarde importer sur Discord, ou téléverse la version .json.gz.',
        );
        return;
      }
      const query = `recreate=${recreate ? 1 : 0}&data=${restoreData ? 1 : 0}`;
      const res = await fetch(`/api/backup/${guildId}?${query}`, { method: 'POST', body });
      const outcome = (await res.json().catch(() => null)) as
        | { ok: true; result: { applied: string[]; data: { total: number } | null } }
        | { ok: false; error: string }
        | null;
      if (!outcome?.ok) {
        setMessage(errorMessage(outcome?.error ?? ''));
        return;
      }
      setMessage(
        `✅ Serveur restauré depuis le fichier : ${outcome.result.applied.length} module(s)` +
          (outcome.result.data ? `, ${outcome.result.data.total} ligne(s) de données` : '') +
          '.',
      );
      if (fileInput.current) fileInput.current.value = '';
      router.refresh();
    });
  };

  return (
    <section className="card p-[22px]">
      <p className="text-[16px] font-bold">Sauvegarde du serveur</p>
      <p className="mt-[6px] max-w-[720px] text-[14px] leading-[1.6] text-[var(--mut)]">
        Une sauvegarde contient <strong className="text-[var(--tx)]">tout</strong> ce que le bot
        détient de ce serveur : la configuration des modules, la structure (salons et rôles) qu’elle
        référence, et les données des membres — argent, objets et inventaires, hôtel des ventes,
        Route de l’Infini, niveaux, sanctions, suggestions, concours…
      </p>

      {/* --- Sauvegarder maintenant --- */}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => apply({ run: true })}
          disabled={pending}
          className="rounded-[10px] bg-[var(--acc)] px-[18px] py-[10px] text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? 'En cours…' : '💾 Sauvegarder maintenant'}
        </button>
        <span className="text-[13px] text-[var(--muted2)]">
          Dernière : {fmtDate(settings.lastRunAt || null)}
          {settings.lastStatus === 'error' ? (
            <span className="text-[#fca5a5]"> — échec : {settings.lastError || 'erreur'}</span>
          ) : null}
        </span>
      </div>

      {/* --- Planification --- */}
      <div className="mt-6 border-t border-[var(--bd)] pt-5">
        <p className="text-[15px] font-semibold">Sauvegarde automatique</p>
        <p className="mt-[4px] text-[13px] text-[var(--mut)]">
          Le bot sauvegarde tout seul, selon l’expression cron ci-dessous (heure du bot).
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-[10px] text-[14px]">
            <input
              type="checkbox"
              checked={settings.auto}
              disabled={pending}
              onChange={(e) => apply({ auto: e.target.checked })}
            />
            Activer
          </label>

          <label className="flex flex-col gap-[6px] text-[14px] text-[var(--mut)]">
            Expression cron
            <input
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              disabled={pending}
              className="field w-[170px] disabled:opacity-50"
              placeholder="0 4 * * *"
            />
          </label>

          <label className="flex flex-col gap-[6px] text-[14px] text-[var(--mut)]">
            Sauvegardes conservées
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
            Enregistrer
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[var(--muted2)]">Cadences courantes :</span>
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
            Inclure les données des membres
          </label>

          <label className="flex flex-col gap-[6px] text-[14px] text-[var(--mut)]">
            Déposer une copie dans un salon
            <select
              value={settings.channelId ?? ''}
              disabled={pending}
              onChange={(e) => apply({ channelId: e.target.value || null })}
              className="field w-[240px] disabled:opacity-50"
            >
              <option value="">— aucun —</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 max-w-[640px] text-[12px] text-[var(--muted2)]">
          Une sauvegarde qui ne vit qu’à côté de la base qu’elle protège ne protège pas de
          grand-chose : le dépôt dans un salon te laisse une copie hors du serveur du bot.
        </p>
      </div>

      {/* --- Options de restauration --- */}
      <div className="mt-6 border-t border-[var(--bd)] pt-5">
        <p className="text-[15px] font-semibold">Restauration</p>
        <div className="mt-3 flex flex-wrap gap-5">
          <label className="flex items-center gap-[10px] text-[14px]">
            <input
              type="checkbox"
              checked={restoreData}
              onChange={(e) => setRestoreData(e.target.checked)}
            />
            Restaurer aussi les données
            <span className="text-[12px] text-[var(--muted2)]">(écrase celles du serveur)</span>
          </label>
          <label className="flex items-center gap-[10px] text-[14px]">
            <input
              type="checkbox"
              checked={recreate}
              onChange={(e) => setRecreate(e.target.checked)}
            />
            Recréer les salons et rôles manquants
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-[6px] text-[14px] text-[var(--mut)]">
          Restaurer depuis un fichier (.json ou .json.gz)
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
            Sauvegardes disponibles ({state.backups.length})
          </p>
          <span className="text-[12px] text-[var(--muted2)]">
            {fmtSize(state.totalSize)} sur le serveur du bot
          </span>
        </div>

        {state.backups.length === 0 ? (
          <p className="mt-3 text-[14px] text-[var(--mut)]">
            Aucune sauvegarde pour l’instant. Lance-en une, ou active la sauvegarde automatique.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--bd)]">
            {state.backups.map((backup) => (
              <li key={backup.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-[10px]">
                <span className="text-[14px]">{fmtDate(backup.createdAt)}</span>
                <span className="text-[12px] text-[var(--muted2)]">{fmtSize(backup.size)}</span>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/backup/${guildId}?file=${encodeURIComponent(backup.name)}`}
                    className="rounded-[8px] border border-[var(--bd)] px-[12px] py-[6px] text-[13px] font-semibold transition-colors hover:border-[var(--acc-bd)]"
                  >
                    Télécharger
                  </a>
                  {confirming === backup.name ? (
                    <>
                      <button
                        type="button"
                        onClick={() => restore(backup.name)}
                        disabled={pending}
                        className="rounded-[8px] bg-[#dc2626] px-[12px] py-[6px] text-[13px] font-semibold text-white disabled:opacity-50"
                      >
                        Oui, restaurer
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        disabled={pending}
                        className="rounded-[8px] border border-[var(--bd)] px-[12px] py-[6px] text-[13px] text-[var(--mut)] disabled:opacity-50"
                      >
                        Annuler
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(backup.name)}
                      disabled={pending}
                      className="rounded-[8px] border border-[var(--bd)] px-[12px] py-[6px] text-[13px] font-semibold transition-colors hover:border-[var(--acc-bd)] disabled:opacity-50"
                    >
                      Restaurer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(backup.name)}
                    disabled={pending}
                    className="rounded-[8px] border border-[var(--bd)] px-[12px] py-[6px] text-[13px] text-[#fca5a5] transition-colors hover:border-[rgba(248,113,113,.5)] disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                </span>
                {confirming === backup.name ? (
                  <p className="w-full text-[13px] text-[#fca5a5]">
                    Restaurer remplace la configuration
                    {restoreData ? ' et les données' : ''} de ce serveur par celles du fichier. Les
                    lignes actuelles seront perdues.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {state.excludedTables.length > 0 ? (
        <p className="mt-5 text-[12px] text-[var(--muted2)]">
          Hors sauvegarde, volontairement : le cache de <code className="code text-[11px]">/rollback</code>{' '}
          (copie de chaque message vu, énorme et sans objet une fois restaurée) et les salons vocaux
          temporaires.
        </p>
      ) : null}

      {message ? <p className="mt-4 text-[14px]">{message}</p> : null}
    </section>
  );
}
