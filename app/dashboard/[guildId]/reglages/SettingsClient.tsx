"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type {
  BackupState,
  BotLogArchive,
  BotLogLevel,
  BotLogRecord,
  BotMetrics,
  BotTask,
  ChatterieGuildAccess,
  DeployMode,
  DeployState,
  GachaImportState,
  GuildChannel,
  GuildGrades,
  PresenceState,
  RestartState,
  SyncPublicState,
} from "@/lib/botApi";
import type { Translate } from "@/lib/i18n";
import { useT } from "@/components/I18n";
import { formatDateTime, useHydrated, useTimeZone } from "@/lib/dates";
import {
  deployAction,
  getBotLogsAction,
  getDeployAction,
  refreshDeployBranchesAction,
  setChatterieAccessAction,
  wipeChatterieAction,
  setGachaImportAction,
  setPresenceAction,
  setRestartAction,
  setWishlistLimitAction,
} from "../actions";
import { BackupPanel } from "./BackupPanel";
import { EquipePanel } from "./EquipePanel";
import { MonitoringPanel } from "./MonitoringPanel";
import { SyncPublicPanel } from "./SyncPublicPanel";

/**
 * L'onglet Réglages : ce qui ne se range pas dans un module.
 *
 * La sauvegarde appartient au serveur ; la mise à jour, le redémarrage, les
 * statuts du bot, les tâches planifiées et l'import du catalogue n'appartiennent
 * à aucun serveur en particulier — les ranger parmi les modules laissait croire
 * le contraire, et seul le propriétaire du bot les voit.
 */


/**
 * Les étapes qu'écrit l'updater hôte, dans l'ordre.
 *
 * Une mise à jour dure une à deux minutes pendant lesquelles le bot ne répond
 * plus : sans jalons, l'écran ne dit rien et on ne sait pas distinguer « ça
 * construit » de « c'est planté ».
 */
const DEPLOY_STEPS = [
  "requested",
  "picked_up",
  "fetching",
  "switching",
  "pulling",
  "building",
] as const;

/** Les phases finales ne sont pas des étapes : elles closent la progression. */
const DEPLOY_DONE = new Set(["success", "up_to_date", "failure"]);

function stepIndex(phase?: string): number {
  if (!phase) return -1;
  if (DEPLOY_DONE.has(phase)) return DEPLOY_STEPS.length;
  return DEPLOY_STEPS.findIndex((step) => step === phase);
}

/** Durée écoulée, en clair. */
function elapsedLabel(t: Translate, fromIso?: string, toMs = Date.now()): string {
  if (!fromIso) return "";
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return "";
  const seconds = Math.max(0, Math.round((toMs - from) / 1000));
  if (seconds < 60) return t("reglages.duree.secondes", { n: seconds });
  return t("reglages.duree.minutesSecondes", {
    m: Math.floor(seconds / 60),
    s: seconds % 60,
  });
}

/** Le journal de l'updater, fenêtre défilante calée sur sa dernière ligne. */
function DeployLog({ log, live }: { log: string; live: boolean }) {
  const ref = useRef<HTMLPreElement>(null);

  // Recaler à chaque arrivée : un journal qu'il faut faire défiler à la main
  // pendant que ça tourne ne sert à rien.
  useEffect(() => {
    const node = ref.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [log]);

  return (
    <pre
      ref={ref}
      className="mt-2 max-h-[280px] overflow-auto whitespace-pre-wrap break-words rounded-[12px] border border-[var(--bd)] bg-[var(--surf)] p-[12px] font-mono text-[12px] leading-[1.6] text-[var(--mut)]"
      aria-live={live ? "polite" : "off"}
    >
      {log}
    </pre>
  );
}

function DeployPanel({
  guildId,
  deploy,
}: {
  guildId: string;
  deploy: DeployState | null;
}) {
  const { t } = useT();
  const format = t("langue.format");
  const [state, setState] = useState(deploy);
  const branches = state?.branches ?? [];
  const [branch, setBranch] = useState(branches[0] ?? "");
  // Complet par défaut : c'est ce que faisait le bouton avant ce choix, et le
  // réflexe sûr quand on doute du cache Docker.
  const [mode, setMode] = useState<DeployMode>("full");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  // Récupération des branches : absente d'un bot antérieur, le bouton reste
  // alors caché et le sélecteur se contente du repli `DEPLOY_BRANCHES`.
  const timeZone = useTimeZone();
  const canRefresh = state?.fetchedAt !== undefined;
  const [fetchedAt, setFetchedAt] = useState(state?.fetchedAt ?? null);

  // Suivi d'une mise à jour en cours. `startedAt` sert d'horloge locale : le
  // statut de l'updater peut mettre quelques secondes à apparaître, et on veut
  // afficher un temps écoulé dès le clic.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // Zéro, pas `Date.now()` : le serveur et le navigateur ne lisent pas la même
  // horloge, et un rendu serveur pris à « 12 s » réhydraté à « 13 s » fait
  // échouer l'hydratation — React re-rend alors la page entière (#418). Les
  // effets ci-dessous posent l'heure du lecteur dès le montage ; d'ici là le
  // temps écoulé vaut zéro, et il n'est de toute façon affiché que pendant une
  // mise à jour.
  const [now, setNow] = useState(0);
  // Le bot redémarre AU MILIEU de sa propre mise à jour : ses non-réponses sont
  // attendues, pas des erreurs. On les compte pour le dire correctement.
  const [unreachable, setUnreachable] = useState(0);

  const running =
    startedAt !== null || (state?.status?.state === "running" && state.runningLog != null);

  const poll = useCallback(async () => {
    const fresh = await getDeployAction(guildId).catch(() => null);
    if (!fresh) {
      setUnreachable((count) => count + 1);
      return;
    }
    setUnreachable(0);
    setState((prev) => (prev ? { ...prev, ...fresh } : fresh));
  }, [guildId]);

  // Une mise à jour peut déjà tourner quand on ouvre la page (lancée depuis
  // Discord, ou onglet rouvert) : on reprend le suivi au lieu d'afficher un
  // état figé.
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
      void poll();
    }, 2000);
    return () => {
      clearInterval(timer);
    };
  }, [running, poll]);

  // Fin de course : l'updater a posé un état final ET vidé son journal.
  useEffect(() => {
    if (startedAt === null) return;
    const finished =
      state?.status?.state != null &&
      state.status.state !== "running" &&
      state.runningLog == null;
    // Garde-fou : sans réponse au bout de 15 min, on rend la main plutôt que
    // de laisser tourner une horloge pour rien.
    if (finished || Date.now() - startedAt > 15 * 60_000) setStartedAt(null);
  }, [state, startedAt]);

  const run = () => {
    setMessage(null);
    setUnreachable(0);
    startTransition(async () => {
      const res = await deployAction(guildId, branch || undefined, mode);
      if (!res.ok) {
        setMessage(t("reglages.deploy.echecDemande"));
        return;
      }
      setStartedAt(Date.now());
      setNow(Date.now());
      setMessage(null);
      void poll();
    });
  };

  /**
   * Le bot ne connaît pas les branches : il passe la commande à l'updater sur
   * le VPS et attend sa réponse. D'où l'attente de quelques secondes, et le cas
   * « personne n'a répondu » qu'il faut dire plutôt que de laisser croire à une
   * liste à jour.
   */
  const refresh = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await refreshDeployBranchesAction(guildId);
      if (!res) {
        setMessage(t("reglages.deploy.echecBranches"));
        return;
      }
      setState((prev) => (prev ? { ...prev, branches: res.branches } : prev));
      setFetchedAt(res.fetchedAt);
      if (res.branches.length > 0 && !res.branches.includes(branch)) {
        setBranch(res.branches[0] ?? "");
      }
      setMessage(
        res.ok
          ? t("reglages.deploy.branchesRecuperees", { n: res.branches.length })
          : t("reglages.deploy.branchesMuettes"),
      );
    });
  };

  const status = state?.status;
  const result = state?.result;
  const resultOk = result?.status === "success";

  return (
    <div className="space-y-[18px] rounded-[18px] border border-[var(--acc-bd)] bg-[var(--acc-bg)] p-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-[520px]">
          <p className="text-[16px] font-bold">{t("reglages.deploy.titre")}</p>
          <p className="mt-[6px] text-[14px] text-[var(--mut)]">
            {t("reglages.deploy.aide")}
          </p>
          <p className="mt-[6px] text-[13px] text-[var(--muted2)]">
            {mode === "cache"
              ? t("reglages.deploy.modeRapideAide")
              : t("reglages.deploy.modeCompletAide")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-[10px]">
          <label className="flex items-center gap-2 text-[14px] text-[var(--mut)]">
            {t("reglages.deploy.branche")}
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={pending || branches.length === 0}
              className="field w-auto max-w-[260px] font-mono text-[13px] disabled:opacity-50"
            >
              {branches.length === 0 ? (
                <option value="">{t("reglages.deploy.aucuneBranche")}</option>
              ) : null}
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[14px] text-[var(--mut)]">
            {t("reglages.deploy.mode")}
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value === "cache" ? "cache" : "full");
              }}
              disabled={pending || running}
              className="field w-auto max-w-[200px] text-[13px] disabled:opacity-50"
            >
              <option value="full">{t("reglages.deploy.modeComplet")}</option>
              <option value="cache">{t("reglages.deploy.modeRapide")}</option>
            </select>
          </label>
          {canRefresh ? (
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              title={t("reglages.deploy.rafraichirBranches")}
              className="shrink-0 rounded-[9px] border border-[var(--bd)] px-3 py-[9px] text-[14px] font-semibold disabled:opacity-50"
            >
              {pending ? t("reglages.patiente") : "🔄"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={run}
            disabled={pending || running}
            className="shrink-0 rounded-[10px] bg-[var(--acc)] px-[18px] py-[10px] text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {running
              ? t("reglages.deploy.boutonEnCours")
              : pending
                ? t("reglages.deploy.boutonDemande")
                : t("reglages.deploy.bouton")}
          </button>
        </div>
      </div>

      {/* --- Progression, pendant --- */}
      {running ? (
        <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold">
              {t("reglages.deploy.enCours")}
              {status?.branch ? (
                <span className="ml-2 font-mono text-[12px] text-[var(--mut)]">
                  {status.branch}
                </span>
              ) : null}
            </p>
            <span className="text-[12px] tabular-nums text-[var(--muted2)]">
              {elapsedLabel(
                t,
                status?.requestedAt ??
                  (startedAt ? new Date(startedAt).toISOString() : undefined),
                now,
              )}
            </span>
          </div>

          <ol className="mt-3 space-y-[6px]">
            {DEPLOY_STEPS.map((step, index) => {
              const current = stepIndex(status?.phase);
              const done = index < current;
              const active = index === current;
              return (
                <li
                  key={step}
                  className="flex items-baseline gap-[10px] text-[13px]"
                  style={{
                    color: done
                      ? "var(--mut)"
                      : active
                        ? "var(--tx)"
                        : "var(--muted2)",
                  }}
                >
                  <span aria-hidden className="w-[16px] shrink-0 text-center">
                    {done ? "✓" : active ? "●" : "○"}
                  </span>
                  <span className={active ? "font-semibold" : undefined}>
                    {t(`reglages.deploy.etapes.${step}`)}
                  </span>
                  {active && status?.message ? (
                    <span className="text-[12px] text-[var(--muted2)]">
                      — {status.message}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {/* Le bot se redémarre lui-même : ses silences sont attendus. Le dire,
              sinon on lit « injoignable » comme une panne. */}
          {unreachable > 0 ? (
            <p className="mt-3 text-[13px] text-[#fcd34d]">
              {t("reglages.deploy.injoignable")}
            </p>
          ) : null}

          {state?.runningLog ? (
            <DeployLog log={state.runningLog} live />
          ) : (
            <p className="mt-3 text-[13px] text-[var(--muted2)]">
              {t("reglages.deploy.attenteLog")}
            </p>
          )}
        </div>
      ) : null}

      {/* --- Résultat, après --- */}
      {!running && (status || result) ? (
        <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            {result ? (
              <p
                className="text-[14px] font-semibold"
                style={{ color: resultOk ? "#34d399" : "#fca5a5" }}
              >
                {resultOk
                  ? t("reglages.deploy.derniereReussie")
                  : t("reglages.deploy.derniereEchouee", {
                      statut: result.status ?? t("reglages.deploy.echec"),
                    })}
              </p>
            ) : (
              <p className="text-[14px] font-semibold">
                {status?.message ?? t("reglages.deploy.aucuneEnregistree")}
              </p>
            )}
            {result?.finishedAt ? (
              <span className="text-[12px] text-[var(--muted2)]">
                {formatDateTime(format, result.finishedAt, timeZone)}
              </span>
            ) : null}
          </div>

          {result ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--muted2)]">
              {result.branch ? (
                <span>
                  {t("reglages.deploy.brancheLabel")}{" "}
                  <code className="code text-[11px]">{result.branch}</code>
                </span>
              ) : null}
              {/* Dire en quel mode : « commit inchangé, rien recréé » se lit
                  autrement selon qu'on a demandé rapide ou complet. */}
              {result.mode ? (
                <span>
                  {result.mode === "cache"
                    ? t("reglages.deploy.rapide")
                    : t("reglages.deploy.complet")}
                </span>
              ) : null}
              {/* Avant → après : « ça a marché » ne dit pas ce qui a changé. */}
              {result.commit ? (
                <span className="font-mono">
                  {result.beforeCommit && result.beforeCommit !== result.commit
                    ? `${result.beforeCommit.slice(0, 8)} → ${result.commit.slice(0, 8)}`
                    : t("reglages.deploy.commitInchange", {
                        commit: result.commit.slice(0, 8),
                      })}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Journal replié quand tout va bien, ouvert quand ça a échoué :
              c'est là qu'on le cherche. */}
          {result?.log ? (
            <details className="mt-3" open={!resultOk}>
              <summary className="cursor-pointer text-[13px] text-[var(--mut)]">
                {t("reglages.deploy.journal")}
              </summary>
              <DeployLog log={result.log} live={false} />
            </details>
          ) : null}
        </div>
      ) : null}

      {canRefresh ? (
        // Dire d'où sort la liste : sans cette ligne, on ne sait pas si on
        // regarde les branches du dépôt ou le repli du `.env` du bot.
        <p className="text-[13px] text-[var(--muted2)]">
          {fetchedAt
            ? t("reglages.deploy.branchesLues", {
                n: branches.length,
                date: formatDateTime(format, fetchedAt, timeZone),
              })
            : t("reglages.deploy.branchesJamais")}
        </p>
      ) : null}

      {message ? (
        <p className="text-[14px] text-[var(--tx)]">{message}</p>
      ) : null}
    </div>
  );
}

/** Ce que le planificateur exécute réellement, module par module. */
function TasksPanel({ tasks }: { tasks: BotTask[] }) {
  const { t } = useT();
  return (
    <section className="card p-[22px]">
      <p className="text-[16px] font-bold">{t("reglages.tasks.titre")}</p>
      <p className="mt-[6px] text-[14px] text-[var(--mut)]">
        {t("reglages.tasks.aide")}
      </p>

      {tasks.length === 0 ? (
        <p className="mt-4 text-[14px] text-[var(--mut)]">
          {t("reglages.tasks.aucune")}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--bd)]">
          {tasks.map((task) => (
            <li
              key={task.name}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-[10px]"
            >
              <span className="text-[14px] font-semibold">{task.name}</span>
              {task.cron ? (
                <code className="code text-[12px]">{task.cron}</code>
              ) : null}
              {task.module ? (
                <span className="text-[12px] text-[var(--muted2)]">
                  {t("reglages.tasks.module", { nom: task.module })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Planification et relance de l'import du catalogue gacha (propriétaire). */
function GachaImportPanel({
  guildId,
  initial,
}: {
  guildId: string;
  initial: GachaImportState;
}) {
  const { t } = useT();
  const format = t("langue.format");
  const timeZone = useTimeZone();
  const [state, setState] = useState(initial);
  const [cron, setCron] = useState(initial.cron);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const apply = (patch: { auto?: boolean; cron?: string; run?: boolean }) => {
    setMessage(null);
    startTransition(async () => {
      const res = await setGachaImportAction(guildId, patch);
      if (res.ok) {
        setState(res.state);
        setCron(res.state.cron);
        setMessage(
          patch.run ? t("reglages.gacha.lance") : t("reglages.gacha.enregistre"),
        );
        return;
      }
      // Le bot valide l'expression avant de l'enregistrer : sans ce retour, on
      // croirait avoir programmé un import qui ne tournerait jamais.
      setMessage(
        res.error === "invalid_cron"
          ? t("reglages.gacha.cronInvalide")
          : res.error === "running"
            ? t("reglages.gacha.dejaEnCours")
            : res.error === "forbidden"
              ? t("reglages.gacha.reserve")
              : t("reglages.gacha.echec"),
      );
    });
  };

  return (
    <section className="card p-[22px]">
      <p className="text-[16px] font-bold">{t("reglages.gacha.titre")}</p>
      <p className="mt-[6px] text-[14px] text-[var(--mut)]">
        {t("reglages.gacha.aide")}
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-[10px] text-[14px]">
          <input
            type="checkbox"
            checked={state.auto}
            disabled={pending}
            onChange={(e) => apply({ auto: e.target.checked })}
          />
          {t("reglages.gacha.auto")}
        </label>

        <label className="flex flex-col gap-[6px] text-[14px] text-[var(--mut)]">
          {t("reglages.gacha.cron")}
          <input
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            disabled={pending}
            className="field w-[180px] disabled:opacity-50"
            placeholder="0 4 1 * *"
          />
        </label>

        <button
          type="button"
          onClick={() => apply({ cron })}
          disabled={pending || cron === state.cron}
          className="rounded-[10px] border border-[var(--bd)] px-[16px] py-[10px] text-[14px] font-semibold disabled:opacity-50"
        >
          {t("reglages.enregistrer")}
        </button>

        <button
          type="button"
          onClick={() => apply({ run: true })}
          disabled={pending || state.running}
          className="rounded-[10px] bg-[var(--acc)] px-[18px] py-[10px] text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {state.running
            ? t("reglages.gacha.enCours")
            : t("reglages.gacha.lancer")}
        </button>
      </div>

      {/* Aucune cadence plus serrée que l'hebdomadaire : l'import dure
          plusieurs minutes et le catalogue ne bouge pas d'un jour à l'autre. */}
      {state.presets && state.presets.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[var(--muted2)]">
            {t("reglages.gacha.cadences")}
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
      ) : null}

      <p className="mt-4 text-[13px] text-[var(--muted2)]">
        {t("reglages.gacha.dernier", {
          date: formatDateTime(
            format,
            state.lastRunAt,
            timeZone,
            t("reglages.jamais"),
          ),
        })}
      </p>
      {message ? <p className="mt-2 text-[14px]">{message}</p> : null}
    </section>
  );
}

/**
 * Les statuts de profil du bot.
 *
 * Un statut par ligne, dans un simple champ multiligne : ce sont des bouts de
 * texte courts et nombreux, et une liste de champs individuels ferait un
 * formulaire interminable là où un copier-coller suffit. Le bot en tire un au
 * démarrage — enregistrer en applique donc un tout de suite, sans quoi on ne
 * verrait l'effet de sa modification qu'au prochain redémarrage.
 */
function PresencePanel({
  guildId,
  initial,
}: {
  guildId: string;
  initial: PresenceState;
}) {
  const { t } = useT();
  const [state, setState] = useState(initial);
  const [text, setText] = useState(initial.lines.join("\n"));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  // Ce que le bot retiendrait : lignes vides écartées, doublons supprimés.
  const parsed = Array.from(
    new Set(
      text
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ),
  );
  const tooLong = parsed.filter((line) => line.length > state.maxLength);
  const dirty = parsed.join("\n") !== state.lines.join("\n");

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await setPresenceAction(guildId, parsed);
      if (!res) {
        setMessage(t("reglages.presence.echec"));
        return;
      }
      setState(res);
      setText(res.lines.join("\n"));
      setMessage(
        res.current
          ? t("reglages.presence.enregistreAvecStatut", { statut: res.current })
          : t("reglages.presence.enregistre"),
      );
    });
  };

  return (
    <section className="card p-[22px]">
      <p className="text-[16px] font-bold">{t("reglages.presence.titre")}</p>
      <p className="mt-[6px] text-[14px] text-[var(--mut)]">
        {t("reglages.presence.aide")}
      </p>

      <p className="mt-4 text-[13px] text-[var(--muted2)]">
        {t("reglages.presence.actuel")}{" "}
        {state.current ? (
          <span className="text-[var(--tx)]">« {state.current} »</span>
        ) : (
          t("reglages.aucun")
        )}
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={pending}
        rows={12}
        spellCheck={false}
        className="field mt-3 w-full font-mono text-[13px] leading-[1.7] disabled:opacity-50"
        placeholder={t("reglages.presence.placeholder")}
      />

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--muted2)]">
        <span>
          {t("reglages.presence.compteur", {
            n: parsed.length,
            max: state.maxLines,
          })}
        </span>
        <span>
          {t("reglages.presence.longueurMax", { n: state.maxLength })}
        </span>
        {parsed.length > state.maxLines ? (
          <span className="text-[#fcd34d]">
            {t("reglages.presence.tropDeLignes", { max: state.maxLines })}
          </span>
        ) : null}
        {tooLong.length > 0 ? (
          <span className="text-[#fcd34d]">
            {t("reglages.presence.lignesTropLongues", { n: tooLong.length })}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-[10px] bg-[var(--acc)] px-[18px] py-[10px] text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {pending
            ? t("reglages.enregistrement")
            : t("reglages.presence.enregistrer")}
        </button>
        <button
          type="button"
          onClick={() => setText(state.defaults.join("\n"))}
          disabled={pending}
          className="rounded-[9px] border border-[var(--bd)] px-4 py-[9px] text-[14px] font-semibold disabled:opacity-50"
        >
          {t("reglages.presence.origine")}
        </button>
      </div>

      {message ? <p className="mt-3 text-[14px]">{message}</p> : null}
    </section>
  );
}

/** Depuis quand le bot tourne, en clair. */
function uptimeLabel(t: Translate, startedAt: string): string {
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return t("reglages.duree.inconnue");
  const minutes = Math.max(0, Math.floor((Date.now() - start) / 60_000));
  if (minutes < 60) return t("reglages.duree.minutes", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return t("reglages.duree.heuresMinutes", { h: hours, m: minutes % 60 });
  return t("reglages.duree.joursHeures", {
    j: Math.floor(hours / 24),
    h: hours % 24,
  });
}

/**
 * Cadence de redémarrage du bot.
 *
 * Le bot ne se relance pas lui-même : il s'arrête proprement et son superviseur
 * le remonte. C'est dit ici, parce qu'une installation lancée à la main
 * resterait éteinte — et qu'on n'a pas envie de le découvrir à 5 h du matin.
 */
function RestartPanel({
  guildId,
  initial,
}: {
  guildId: string;
  initial: RestartState;
}) {
  const { t } = useT();
  const format = t("langue.format");
  const timeZone = useTimeZone();
  // « En route depuis » se compte depuis `Date.now()` : il ne s'affiche qu'une
  // fois l'hydratation passée, sinon les deux horloges se contredisent.
  const hydrated = useHydrated();
  const [state, setState] = useState(initial);
  const [cron, setCron] = useState(initial.cron);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const apply = (patch: { auto?: boolean; cron?: string; now?: boolean }) => {
    setMessage(null);
    startTransition(async () => {
      const res = await setRestartAction(guildId, patch);
      if (res.ok) {
        setState(res.state);
        setCron(res.state.cron);
        setMessage(
          patch.now
            ? t("reglages.restart.lance")
            : patch.auto === false
              ? t("reglages.restart.desactiveOk")
              : t("reglages.restart.enregistre"),
        );
        return;
      }
      // Le planificateur du bot ignore en silence une expression qu'il ne
      // comprend pas : sans ce retour, on croirait avoir programmé un
      // redémarrage qui ne tomberait jamais.
      setMessage(
        res.error === "invalid_cron"
          ? t("reglages.restart.cronInvalide")
          : res.error === "forbidden"
            ? t("reglages.restart.reserve")
            : res.error === "rate_limited"
              ? t("reglages.restart.limite")
              : t("reglages.restart.echec"),
      );
    });
  };

  const restart = () => {
    if (!window.confirm(t("reglages.restart.confirmer"))) {
      return;
    }
    apply({ now: true });
  };

  return (
    <section className="card p-[22px]">
      <p className="text-[16px] font-bold">{t("reglages.restart.titre")}</p>
      <p className="mt-[6px] text-[14px] text-[var(--mut)]">
        {t("reglages.restart.aide")}
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-[10px] text-[14px]">
          <input
            type="checkbox"
            checked={state.auto}
            disabled={pending}
            onChange={(e) => apply({ auto: e.target.checked, cron })}
          />
          {t("reglages.restart.activer")}
        </label>

        <label className="flex flex-col gap-[6px] text-[14px] text-[var(--mut)]">
          {t("reglages.restart.cron")}
          <input
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            disabled={pending}
            className="field w-[170px] disabled:opacity-50"
            placeholder="0 5 * * *"
          />
        </label>

        <button
          type="button"
          onClick={() => apply({ cron })}
          disabled={pending || cron === state.cron}
          className="rounded-[10px] border border-[var(--bd)] px-[16px] py-[10px] text-[14px] font-semibold disabled:opacity-50"
        >
          {t("reglages.enregistrer")}
        </button>

        <button
          type="button"
          onClick={restart}
          disabled={pending}
          className="rounded-[10px] border border-[rgba(248,113,113,.5)] px-[16px] py-[10px] text-[14px] font-semibold text-[#fca5a5] disabled:opacity-50"
        >
          {t("reglages.restart.maintenant")}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[var(--muted2)]">
          {t("reglages.restart.cadences")}
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

      {/* La case cochée dit l’intention ; « programmé » dit ce que le
          planificateur exécute vraiment — les deux diffèrent si l’expression
          n’a pas été comprise. */}
      <p className="mt-4 text-[13px] text-[var(--muted2)]">
        {state.auto && !state.scheduled ? (
          <span className="text-[#fcd34d]">
            {t("reglages.restart.incoherent")}
          </span>
        ) : (
          t("reglages.restart.etat", {
            etat: state.auto
              ? t("reglages.restart.programme")
              : t("reglages.restart.desactive"),
            // La durée se compte depuis `Date.now()` : tant que l'hydratation
            // n'est pas passée, les deux horloges ne diraient pas la même
            // chose et React abandonnerait la page.
            duree: hydrated
              ? uptimeLabel(t, state.startedAt)
              : t("reglages.duree.inconnue"),
            date: formatDateTime(
              format,
              state.lastRestartAt,
              timeZone,
              t("reglages.jamais"),
            ),
          })
        )}
      </p>

      {message ? <p className="mt-2 text-[14px]">{message}</p> : null}
    </section>
  );
}

/**
 * Les six niveaux, du plus grave au plus bavard.
 *
 * On coche des niveaux, on ne règle plus un seuil. « Alertes ET erreurs, sans
 * le bruit d'info » est la question qu'on se pose vraiment devant des logs, et
 * un seuil cumulatif (« avertissements et plus ») ne savait pas l'exprimer :
 * il fallait choisir entre rater les alertes et se noyer sous les infos.
 */
const LEVEL_FILTERS: { value: BotLogLevel; className: string }[] = [
  { value: "fatal", className: "text-[#fca5a5] border-[rgba(248,113,113,.5)]" },
  { value: "error", className: "text-[#fca5a5] border-[rgba(248,113,113,.5)]" },
  { value: "warn", className: "text-[#fcd34d] border-[rgba(252,211,77,.5)]" },
  { value: "info", className: "text-[var(--mut)] border-[var(--bd)]" },
  { value: "debug", className: "text-[var(--muted2)] border-[var(--bd)]" },
  { value: "trace", className: "text-[var(--muted2)] border-[var(--bd)]" },
];

/** Les niveaux qu'on vient regarder quand quelque chose ne va pas. */
const PROBLEM_LEVELS: BotLogLevel[] = ["warn", "error", "fatal"];

/**
 * Le niveau nommé auquel appartient une valeur pino.
 *
 * Par tranche et non par égalité : pino accepte des niveaux personnalisés (45…)
 * et une telle ligne doit s'afficher comme une alerte, pas tomber dans un
 * fourre-tout.
 */
function levelBucket(level: number): BotLogLevel {
  if (level >= 60) return "fatal";
  if (level >= 50) return "error";
  if (level >= 40) return "warn";
  if (level >= 30) return "info";
  if (level >= 20) return "debug";
  return "trace";
}

function levelMeta(level: number): { value: BotLogLevel; className: string } {
  const bucket = levelBucket(level);
  return LEVEL_FILTERS.find((entry) => entry.value === bucket) ?? LEVEL_FILTERS[3]!;
}

function fmtTime(format: string, ms: number): string {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(format);
}

/** `YYYY-MM-DD` d'aujourd'hui, décalé de `offset` jours. */
function dayKey(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** « Aujourd'hui », « Hier », sinon la date en toutes lettres. */
function dayLabel(t: Translate, format: string, day: string): string {
  if (day === dayKey()) return t("reglages.logs.aujourdhui");
  if (day === dayKey(-1)) return t("reglages.logs.hier");
  const parsed = new Date(`${day}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString(format, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Taille lisible. Un chiffre rond vaut mieux qu'une précision dont personne ne fait rien. */
function fmtBytes(t: Translate, bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} ${t("reglages.octets.o")}`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(0)} ${t("reglages.octets.ko")}`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} ${t("reglages.octets.mo")}`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ${t("reglages.octets.go")}`;
}

/** Ce que le bot garde vraiment, dit sans détour. */
function retentionLine(
  t: Translate,
  archive: BotLogArchive,
  source: "buffer" | "archive",
): string {
  if (!archive.enabled) return t("reglages.logs.archiveDesactivee");
  // Singulier et pluriel se choisissent dans la langue, pas par un « s » ajouté
  // ici : toutes les langues ne marquent pas le pluriel de la même façon.
  const jours = (n: number) =>
    n > 1 ? t("reglages.logs.jourN") : t("reglages.logs.jourUn");
  const kept = t("reglages.logs.retention", {
    n: archive.retentionDays,
    jours: jours(archive.retentionDays),
  });
  const held =
    archive.days.length > 0
      ? t("reglages.logs.joursArchives", {
          n: archive.days.length,
          jours: jours(archive.days.length),
          taille: fmtBytes(t, archive.bytes),
        })
      : t("reglages.logs.aucunJourArchive");
  const floor =
    archive.minLevel === "trace" || archive.minLevel === "debug" || archive.minLevel === "info"
      ? ""
      : t("reglages.logs.plancher", { niveau: archive.minLevel });
  const live = source === "buffer" ? t("reglages.logs.memoireVive") : "";
  return `${kept} — ${held}${floor}.${live}`;
}

/**
 * Les logs applicatifs du bot.
 *
 * Deux distances derrière le même panneau. « Maintenant » lit le tampon mémoire
 * du bot : ce qui vient de se passer, vidé au redémarrage. Choisir une date lit
 * l'archive sur disque, qui survit aux redémarrages et remonte jusqu'à la
 * rétention configurée. Les niveaux se cochent librement et la recherche porte
 * sur le module, le message, l'erreur et les champs de la ligne — le filtrage se
 * fait côté bot, pour ne pas ramener un jour entier de logs afin d'en afficher
 * trois lignes.
 *
 * Rafraîchi à la demande plutôt qu'en flux : c'est un hublot qu'on ouvre quand
 * on se pose une question, pas une console qu'on laisse tourner.
 */
function LogsPanel({ guildId }: { guildId: string }) {
  const { t } = useT();
  const format = t("langue.format");
  const [logs, setLogs] = useState<BotLogRecord[] | null>(null);
  const [levels, setLevels] = useState<BotLogLevel[]>([]);
  const [day, setDay] = useState("");
  const [search, setSearch] = useState("");
  const [archive, setArchive] = useState<BotLogArchive | null>(null);
  const [source, setSource] = useState<"buffer" | "archive">("buffer");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(
    (query: { levels: BotLogLevel[]; day: string; search: string }) => {
      setMessage(null);
      startTransition(async () => {
        const res = await getBotLogsAction(guildId, {
          limit: 300,
          levels: query.levels,
          ...(query.day ? { date: query.day } : {}),
          ...(query.search.trim() ? { search: query.search.trim() } : {}),
        });
        if (!res) {
          setMessage(t("reglages.logs.indisponible"));
          return;
        }
        setLogs(res.logs);
        setArchive(res.archive);
        setSource(res.source);
        if (res.logs.length === 0) {
          setMessage(
            query.search.trim() || query.levels.length > 0
              ? t("reglages.logs.aucunFiltre")
              : query.day
                ? t("reglages.logs.aucunJour")
                : t("reglages.logs.aucuneMemoire"),
          );
        }
      });
    },
    [guildId, t],
  );

  // La recherche ne part pas à chaque frappe : chaque appel traverse le
  // dashboard puis le bot, et une requête par lettre les saturerait tous deux.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelDebounce = () => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = null;
  };
  useEffect(() => cancelDebounce, []);

  /** Applique un changement de filtre ET recharge : un filtre qui ne recharge pas ment. */
  const apply = (patch: { levels?: BotLogLevel[]; day?: string; search?: string }) => {
    // Une frappe encore en attente partirait avec les anciens filtres et
    // écraserait le résultat qu'on demande ici : on l'annule.
    cancelDebounce();
    const next = {
      levels: patch.levels ?? levels,
      day: patch.day ?? day,
      search: patch.search ?? search,
    };
    setLevels(next.levels);
    setDay(next.day);
    setSearch(next.search);
    load(next);
  };

  const toggleLevel = (value: BotLogLevel) => {
    apply({
      levels: levels.includes(value)
        ? levels.filter((entry) => entry !== value)
        : [...levels, value],
    });
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    cancelDebounce();
    debounce.current = setTimeout(() => {
      load({ levels, day, search: value });
    }, 450);
  };

  // Le jour du bot peut différer de celui du navigateur (fuseau `TZ` du VPS) :
  // on n'ajoute « Aujourd'hui » que si le bot l'a réellement archivé.
  const days = archive?.days ?? [];

  return (
    <section className="card p-[22px]">
      <p className="text-[16px] font-bold">{t("reglages.logs.titre")}</p>
      <p className="mt-[6px] text-[14px] text-[var(--mut)]">
        {t("reglages.logs.aide")}
      </p>

      {/* Niveaux : des cases, pas un seuil — « Alertes + Erreurs » se coche. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {LEVEL_FILTERS.map((entry) => {
          const on = levels.includes(entry.value);
          return (
            <button
              key={entry.value}
              type="button"
              aria-pressed={on}
              onClick={() => {
                toggleLevel(entry.value);
              }}
              className={`rounded-[7px] border px-[10px] py-[5px] text-[12px] font-semibold transition ${entry.className} ${
                on
                  ? "bg-[var(--acc-bg)] ring-1 ring-[var(--acc-bd)]"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              {t(`reglages.logs.niveaux.${entry.value}`)}
            </button>
          );
        })}

        <span className="mx-1 h-[18px] w-px bg-[var(--bd)]" aria-hidden="true" />

        <button
          type="button"
          onClick={() => {
            apply({ levels: PROBLEM_LEVELS });
          }}
          className="rounded-[7px] border border-[var(--bd)] px-[10px] py-[5px] text-[12px] font-semibold"
        >
          {t("reglages.logs.problemes")}
        </button>
        <button
          type="button"
          onClick={() => {
            apply({ levels: [] });
          }}
          className="rounded-[7px] border border-[var(--bd)] px-[10px] py-[5px] text-[12px] font-semibold"
        >
          {t("reglages.logs.tout")}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {/* Un menu des jours RÉELLEMENT archivés plutôt qu'un calendrier ouvert :
            proposer une date hors rétention ne produirait qu'une page vide. */}
        <select
          value={day}
          aria-label={t("reglages.logs.jour")}
          onChange={(e) => {
            apply({ day: e.target.value });
          }}
          className="field w-auto"
        >
          <option value="">{t("reglages.logs.maintenant")}</option>
          {days.map((entry) => (
            <option key={entry} value={entry}>
              {dayLabel(t, format, entry)}
            </option>
          ))}
        </select>

        <input
          type="search"
          value={search}
          placeholder={t("reglages.logs.recherche")}
          aria-label={t("reglages.logs.recherche")}
          onChange={(e) => {
            onSearchChange(e.target.value);
          }}
          className="field w-auto min-w-[240px] flex-1"
        />

        <button
          type="button"
          onClick={() => {
            cancelDebounce();
            load({ levels, day, search });
          }}
          disabled={pending}
          className="rounded-[9px] border border-[var(--bd)] px-4 py-[7px] text-[14px] font-semibold disabled:opacity-50"
        >
          {pending
            ? t("reglages.logs.lecture")
            : logs
              ? t("reglages.logs.rafraichir")
              : t("reglages.logs.afficher")}
        </button>
      </div>

      {archive ? (
        <p className="mt-3 text-[13px] text-[var(--muted2)]">
          {retentionLine(t, archive, source)}
        </p>
      ) : null}

      {message ? <p className="mt-3 text-[14px] text-[var(--mut)]">{message}</p> : null}

      {logs && logs.length > 0 ? (
        <ul className="mt-4 max-h-[420px] divide-y divide-[var(--bd)] overflow-y-auto rounded-[12px] border border-[var(--bd)] bg-[var(--surf)]">
          {logs.map((line, index) => {
            const meta = levelMeta(line.level);
            return (
              <li
                key={`${String(line.time)}-${String(index)}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-[9px]"
              >
                <span className="text-[12px] tabular-nums text-[var(--muted2)]">
                  {fmtTime(format, line.time)}
                </span>
                <span
                  className={`rounded-[6px] border px-[6px] py-[1px] text-[11px] font-semibold ${meta.className}`}
                >
                  {t(`reglages.logs.niveaux.${meta.value}`)}
                </span>
                {line.scope ? (
                  <span className="text-[12px] text-[var(--muted2)]">{line.scope}</span>
                ) : null}
                <span className="min-w-0 flex-1 break-words text-[13px]">
                  {line.msg}
                  {line.err ? <span className="text-[#fca5a5]"> — {line.err}</span> : null}
                  {/* Les champs de la ligne, en retrait : « Tâche terminée » est
                      le même message pour tous les modules, c'est
                      « task=deliver remis=3 » qui dit ce qui s'est passé. En
                      chasse fixe et en gris, ils se lisent d'un coup d'œil sans
                      disputer la place au message. */}
                  {line.details ? (
                    <span className="ml-2 font-mono text-[12px] text-[var(--muted2)]">
                      {line.details}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Plafond de souhaits par membre, global au bot.
 *
 * Il vit ici et non dans la config du gacha parce que la liste de souhaits est
 * globale au membre : un plafond par serveur ne contraindrait que le geste
 * d’ajouter — on atteindrait la limite ici, on irait ajouter ailleurs, et tout
 * resterait actif partout.
 */
function WishlistLimitPanel({
  guildId,
  initial,
}: {
  guildId: string;
  initial: number;
}) {
  const { t } = useT();
  const [max, setMax] = useState(String(initial));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const save = () => {
    const value = Number.parseInt(max, 10);
    if (!Number.isFinite(value) || value < 1) {
      setMessage(t("reglages.wishlist.minimum"));
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await setWishlistLimitAction(guildId, value);
      if (!res) {
        setMessage(t("reglages.wishlist.echec"));
        return;
      }
      setMax(String(res.max));
      setMessage(t("reglages.wishlist.fixe", { n: res.max }));
    });
  };

  return (
    <section className="card p-[22px]">
      <p className="text-[16px] font-bold">{t("reglages.wishlist.titre")}</p>
      <p className="mt-[6px] text-[14px] text-[var(--mut)]">
        {t("reglages.wishlist.aide")}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          value={max}
          onChange={(e) => setMax(e.target.value)}
          inputMode="numeric"
          className="field w-[120px]"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-[9px] border border-[var(--bd)] px-4 py-[7px] text-[14px] font-semibold disabled:opacity-50"
        >
          {pending ? t("reglages.enregistrement") : t("reglages.enregistrer")}
        </button>
      </div>

      {message ? <p className="mt-3 text-[14px]">{message}</p> : null}
    </section>
  );
}

/**
 * Accès à La Chatterie.
 *
 * L'interrupteur porte sur LE serveur qu'on regarde : on n'ouvre le jeu que là
 * où l'on est administrateur, ce qui est déjà la condition pour être ici. Les
 * autres serveurs autorisés se listent dessous, retirables d'un clic.
 *
 * La règle du « vide » compte autant que le reste : liste vide, le jeu est
 * ouvert partout ; un seul identifiant referme tout le reste.
 */
function ChatterieAccessPanel({
  guildId,
  guildName,
  initialAllowed,
  initialGuilds,
}: {
  guildId: string;
  guildName: string;
  initialAllowed: string[];
  initialGuilds: ChatterieGuildAccess[];
}) {
  const { t } = useT();
  const [allowed, setAllowed] = useState(initialAllowed);
  const [guilds, setGuilds] = useState(initialGuilds);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  // La remise à zéro se confirme en deux temps : un clic ne doit pas suffire à
  // effacer les parties de tout un serveur.
  const [confirmWipe, setConfirmWipe] = useState(false);

  const restricted = allowed.length > 0;
  const here = allowed.includes(guildId);

  const apply = (targetId: string, targetName: string, next: boolean) => {
    setMessage(null);
    startTransition(async () => {
      const res = await setChatterieAccessAction(targetId, next);
      if (!res.ok || !res.allowed) {
        setMessage(t("reglages.chatterie.echec"));
        return;
      }
      const list = res.allowed;
      setAllowed(list);
      setGuilds((current) => {
        const known = new Map(current.map((g) => [g.id, g]));
        if (next && !known.has(targetId)) {
          known.set(targetId, { id: targetId, name: targetName, icon: null });
        }
        return list
          .map((id) => known.get(id) ?? { id, name: id, icon: null })
          .filter((g): g is ChatterieGuildAccess => Boolean(g));
      });
      setMessage(
        list.length === 0
          ? t("reglages.chatterie.videe")
          : next
            ? t("reglages.chatterie.ouvert")
            : t("reglages.chatterie.retiree"),
      );
    });
  };

  const wipe = () => {
    if (!confirmWipe) {
      setConfirmWipe(true);
      setMessage(null);
      return;
    }
    setConfirmWipe(false);
    startTransition(async () => {
      const res = await wipeChatterieAction(guildId);
      setMessage(
        res.ok
          ? t("reglages.chatterie.effacee", {
              n: res.deleted ?? 0,
              nom: guildName,
            })
          : t("reglages.chatterie.echec"),
      );
    });
  };

  return (
    <section className="card p-[22px]">
      <p className="text-[16px] font-bold">{t("reglages.chatterie.titre")}</p>
      <p className="mt-[6px] text-[14px] text-[var(--mut)]">
        {restricted
          ? t("reglages.chatterie.restreint")
          : t("reglages.chatterie.libre")}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => apply(guildId, guildName, !here)}
          disabled={pending}
          className="rounded-[9px] border border-[var(--bd)] px-4 py-[7px] text-[14px] font-semibold disabled:opacity-50"
        >
          {pending
            ? t("reglages.enregistrement")
            : here
              ? t("reglages.chatterie.retirerIci")
              : t("reglages.chatterie.autoriser")}
        </button>
        <span className="text-[13px] text-[var(--mut)]">
          {here
            ? t("reglages.chatterie.ici", { nom: guildName })
            : restricted
              ? t("reglages.chatterie.pasIci", { nom: guildName })
              : t("reglages.chatterie.partout", { nom: guildName })}
        </span>
      </div>

      {guilds.length > 0 ? (
        <div className="mt-5">
          <p className="text-[13px] font-semibold text-[var(--mut)]">
            {t("reglages.chatterie.serveursAutorises")}
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {guilds.map((guild) => (
              <div
                key={guild.id}
                className="flex items-center justify-between gap-4 rounded-[12px] border border-[var(--bd)] px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-3">
                  {guild.icon === null ? (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--bd)] text-[13px] text-[var(--mut)]">
                      {guild.name.slice(0, 1).toUpperCase()}
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={guild.icon}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">
                      {guild.name}
                      {guild.id === guildId ? t("reglages.chatterie.celuiCi") : ""}
                    </span>
                    <span className="block font-mono text-[11px] text-[var(--mut)]">
                      {guild.id}
                    </span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => apply(guild.id, guild.name, false)}
                  disabled={pending}
                  className="shrink-0 rounded-[9px] border border-[var(--bd)] px-3 py-[6px] text-[13px] text-[var(--mut)] disabled:opacity-50"
                >
                  {t("reglages.chatterie.retirer")}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 border-t border-[var(--bd)] pt-4">
        <p className="text-[13px] font-semibold text-[var(--mut)]">
          {t("reglages.chatterie.remiseAZero")}
        </p>
        <p className="mt-[6px] text-[14px] text-[var(--mut)]">
          {t("reglages.chatterie.remiseAide", { nom: guildName })}
        </p>
        <button
          type="button"
          onClick={wipe}
          disabled={pending}
          className={`mt-3 rounded-[9px] border px-4 py-[7px] text-[14px] font-semibold disabled:opacity-50 ${
            confirmWipe
              ? "border-[#ed4245] text-[#ed4245]"
              : "border-[var(--bd)] text-[var(--mut)]"
          }`}
        >
          {confirmWipe
            ? t("reglages.chatterie.confirmerEffacer")
            : t("reglages.chatterie.effacer")}
        </button>
        {confirmWipe ? (
          <button
            type="button"
            onClick={() => setConfirmWipe(false)}
            className="ml-2 text-[13px] text-[var(--mut)] underline"
          >
            {t("reglages.chatterie.annulerMinuscule")}
          </button>
        ) : null}
      </div>

      {message ? <p className="mt-3 text-[14px]">{message}</p> : null}
    </section>
  );
}

export function SettingsClient({
  guildId,
  isOwner,
  grades,
  backup,
  channels,
  metrics,
  deploy,
  tasks,
  gachaImport,
  wishlistLimit,
  guildName,
  chatterieAccess,
  presence,
  restart,
  syncPublic,
}: {
  guildId: string;
  isOwner: boolean;
  /** Les grades du serveur. `null` pour qui ne les distribue pas. */
  grades: GuildGrades | null;
  backup: BackupState | null;
  channels: GuildChannel[];
  metrics: BotMetrics | null;
  deploy: DeployState | null;
  tasks: BotTask[];
  gachaImport: GachaImportState | null;
  wishlistLimit: number | null;
  guildName: string;
  chatterieAccess: { guilds: ChatterieGuildAccess[]; allowed: string[] } | null;
  presence: PresenceState | null;
  restart: RestartState | null;
  syncPublic: SyncPublicState | null;
}) {
  const { t } = useT();
  // Onglets, comme sur la page d'un module : ces panneaux n'ont rien à voir
  // entre eux et empilés ils forment un long déroulé où l'on cherche son
  // réglage. Un simple admin de serveur n'en voit qu'un — la barre serait
  // alors un ornement, donc elle disparaît.
  const panels: { id: string; label: string; node: ReactNode }[] = [
    // L'équipe d'abord : c'est le réglage qui décide de qui verra les autres.
    ...(grades
      ? [
          {
            id: "equipe",
            label: t("reglages.onglets.equipe"),
            node: <EquipePanel guildId={guildId} initial={grades} />,
          },
        ]
      : []),
    {
      id: "backup",
      label: t("reglages.onglets.backup"),
      node: backup ? (
        <BackupPanel
          guildId={guildId}
          initial={backup}
          // Seuls les salons textuels peuvent recevoir le fichier.
          channels={channels.filter((c) => c.type === 0 || c.type === 5)}
        />
      ) : (
        <section className="card p-[22px]">
          <p className="text-[16px] font-bold">{t("reglages.backup.titre")}</p>
          <p className="mt-[6px] text-[14px] text-[var(--mut)]">
            {t("reglages.backup.indisponible")}
          </p>
        </section>
      ),
    },
    // Propre à l'instance : réservé au propriétaire du bot.
    ...(isOwner
      ? [
          {
            // En tête des panneaux d'instance : on regarde l'état du bot avant
            // de le mettre à jour ou de le redémarrer, pas après.
            id: "monitoring",
            label: t("reglages.onglets.monitoring"),
            node: <MonitoringPanel guildId={guildId} initial={metrics} />,
          },
          {
            id: "deploy",
            label: t("reglages.onglets.deploy"),
            node: <DeployPanel guildId={guildId} deploy={deploy} />,
          },
          ...(restart
            ? [
                {
                  id: "restart",
                  label: t("reglages.onglets.restart"),
                  node: <RestartPanel guildId={guildId} initial={restart} />,
                },
              ]
            : []),
          ...(presence
            ? [
                {
                  id: "presence",
                  label: t("reglages.onglets.presence"),
                  node: <PresencePanel guildId={guildId} initial={presence} />,
                },
              ]
            : []),
          {
            id: "logs",
            label: t("reglages.onglets.logs"),
            node: <LogsPanel guildId={guildId} />,
          },
          {
            // Publier le code : voisin de la mise à jour, qui est l'autre
            // panneau où l'hôte agit sur le dépôt.
            id: "sync-public",
            label: t("reglages.onglets.syncPublic"),
            node: <SyncPublicPanel initial={syncPublic} />,
          },
          {
            id: "tasks",
            label: t("reglages.onglets.tasks"),
            node: <TasksPanel tasks={tasks} />,
          },
          ...(gachaImport
            ? [
                {
                  id: "gacha",
                  label: t("reglages.onglets.gacha"),
                  node: (
                    <GachaImportPanel guildId={guildId} initial={gachaImport} />
                  ),
                },
              ]
            : []),
          ...(chatterieAccess !== null
            ? [
                {
                  id: "chatterie",
                  label: t("reglages.onglets.chatterie"),
                  node: (
                    <ChatterieAccessPanel
                      guildId={guildId}
                      guildName={guildName}
                      initialAllowed={chatterieAccess.allowed}
                      initialGuilds={chatterieAccess.guilds}
                    />
                  ),
                },
              ]
            : []),
          ...(wishlistLimit !== null
            ? [
                {
                  id: "wishlist",
                  label: t("reglages.onglets.wishlist"),
                  node: (
                    <WishlistLimitPanel
                      guildId={guildId}
                      initial={wishlistLimit}
                    />
                  ),
                },
              ]
            : []),
        ]
      : []),
  ];

  const [tab, setTab] = useState(panels[0]?.id ?? "");
  const showTabs = panels.length > 1;

  return (
    <div className="flex flex-col gap-6">
      {showTabs ? (
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label={t("reglages.sections")}
        >
          {panels.map((panel) => {
            const active = panel.id === tab;
            return (
              <button
                key={panel.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(panel.id)}
                className={`rounded-[10px] border px-[14px] py-[8px] text-[14px] font-semibold transition-colors ${
                  active
                    ? "border-[var(--acc-bd)] bg-[var(--acc-bg)] text-[var(--tx)]"
                    : "border-[var(--bd)] bg-[var(--surf)] text-[var(--mut)] hover:text-[var(--tx)]"
                }`}
              >
                {panel.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Masqués plutôt que démontés : un panneau garde ainsi sa saisie en
          cours (expression cron, branche choisie) quand on passe à côté. */}
      {panels.map((panel) => (
        <div key={panel.id} hidden={showTabs && panel.id !== tab}>
          {panel.node}
        </div>
      ))}
    </div>
  );
}
