"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BotMetricSample, BotMetrics, MetricsWindow } from "@/lib/botApi";
import { getMetricsAction } from "../actions";
import { MetricChart, type ChartSeries } from "./MetricChart";

/**
 * Le panneau Monitoring : l'état de santé de l'instance sur une seule page.
 *
 * Les autres panneaux des réglages agissent — mettre à jour, redémarrer,
 * planifier. Celui-ci ne fait qu'observer, et c'est ce qui dicte sa forme :
 *
 * - **rien à cliquer qui change quoi que ce soit** au bot, donc aucun risque à
 *   le laisser ouvert ;
 * - **il se rafraîchit tout seul**, au pas d'échantillonnage du bot : demander
 *   plus souvent ne rendrait pas des mesures plus récentes, seulement les mêmes
 *   points relus (et un appel à l'API Discord de plus derrière chaque action) ;
 * - **une valeur n'est jamais seule** : à côté de « 142 ms » il y a la courbe,
 *   parce que la question n'est pas « combien ? » mais « est-ce que ça monte ? ».
 *
 * L'historique est gardé en base par le bot : il **traverse ses redémarrages**,
 * dans la limite de sa rétention. Quand celle-ci est coupée, le bot retombe sur
 * un tampon mémoire d'une heure — le panneau l'annonce alors, plutôt que de
 * laisser lire une heure de calme là où il n'y a qu'un bot qui vient de
 * démarrer.
 *
 * Les compteurs (commandes, erreurs, requêtes) valent **pour la fenêtre
 * affichée**, pas depuis le démarrage : changer de période change donc ces
 * chiffres, et leur libellé le dit à chaque fois.
 */

/**
 * Périodes observables.
 *
 * Deux familles, et la différence n'est pas cosmétique : une période
 * **glissante** (« les cinq dernières minutes ») avance avec l'horloge et se
 * rafraîchit toute seule ; une période **de calendrier** (« hier ») est close —
 * la rafraîchir ne peut rien apprendre, alors le panneau arrête d'interroger le
 * bot et le dit.
 *
 * Le calcul se fait ici, dans le fuseau du navigateur : « hier » n'a pas le même
 * sens sur un VPS réglé en UTC et pour un administrateur à Paris, et c'est
 * l'administrateur qui regarde.
 */
type PeriodKind = "live" | "fixed";

interface Period {
  id: string;
  label: string;
  kind: PeriodKind;
  /** Bornes, recalculées à chaque appel : une période glissante suit l'horloge. */
  window: () => MetricsWindow;
}

/** Minuit du jour de `date`, dans le fuseau du navigateur. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const DAY_MS = 86_400_000;

/** Un jour de calendrier entier, `offset` jours avant aujourd'hui. */
function dayWindow(offset: number): MetricsWindow {
  const start = startOfDay(new Date(Date.now() - offset * DAY_MS));
  return { from: start, to: start + DAY_MS };
}

const PERIODS: Period[] = [
  {
    id: "live",
    label: "Temps réel",
    kind: "live",
    // Cinq minutes : à ce pas, chaque mesure est un point à elle seule et la
    // courbe avance visiblement à chaque rafraîchissement.
    window: () => ({ from: Date.now() - 300_000, to: Date.now() }),
  },
  { id: "1h", label: "1 h", kind: "live", window: () => ({ from: Date.now() - 3_600_000, to: Date.now() }) },
  { id: "6h", label: "6 h", kind: "live", window: () => ({ from: Date.now() - 21_600_000, to: Date.now() }) },
  {
    id: "today",
    label: "Aujourd’hui",
    kind: "live",
    window: () => ({ from: startOfDay(new Date()), to: Date.now() }),
  },
  { id: "yesterday", label: "Hier", kind: "fixed", window: () => dayWindow(1) },
  { id: "before", label: "Avant-hier", kind: "fixed", window: () => dayWindow(2) },
  {
    id: "month",
    label: "Mois en cours",
    kind: "live",
    window: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
        to: Date.now(),
      };
    },
  },
];

/** `YYYY-MM-DD` d'un instant, dans le fuseau du navigateur (pour `<input type="date">`). */
function dayKey(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${String(date.getFullYear())}-${month}-${day}`;
}

/** La journée entière désignée par un `YYYY-MM-DD` saisi dans le sélecteur. */
function windowOfDayKey(key: string): MetricsWindow | null {
  const [year, month, day] = key.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  const start = new Date(year, month - 1, day).getTime();
  return { from: start, to: start + DAY_MS };
}

/** Une date en clair : « samedi 13 septembre ». */
function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Cadences de rafraîchissement proposées. `0` = en pause. */
const REFRESH_CHOICES = [
  { value: 15_000, label: "15 s" },
  { value: 30_000, label: "30 s" },
  { value: 60_000, label: "1 min" },
  { value: 0, label: "Pause" },
] as const;

/** Octets en unité lisible. Le bot en renvoie toujours des octets bruts. */
function fmtBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${String(Math.round(bytes))} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[index]}`;
}

/** Mébioctets, pour les axes : une courbe se lit mieux dans une seule unité. */
function toMiB(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function fmtNumber(value: number): string {
  return Math.round(value).toLocaleString("fr-FR");
}

/** Durée en clair : « 3 j 4 h », « 12 min », « 48 s ». */
function fmtDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${String(days)} j ${String(hours)} h`;
  if (hours > 0) return `${String(hours)} h ${String(minutes)} min`;
  if (minutes > 0) return `${String(minutes)} min`;
  return `${String(Math.round(seconds))} s`;
}

/** Un pas de temps en clair : « 15 s », « 1 min 30 s », « 2 h ». */
function fmtStep(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${String(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) {
    return rest > 0
      ? `${String(minutes)} min ${String(rest)} s`
      : `${String(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const restMin = minutes % 60;
  return restMin > 0 ? `${String(hours)} h ${String(restMin)} min` : `${String(hours)} h`;
}

function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString("fr-FR");
}

/** Les niveaux de log, du plus bavard au plus grave, avec leur teinte. */
const LOG_LEVELS = [
  { key: "trace", label: "Trace", color: "var(--viz-idle)" },
  { key: "debug", label: "Debug", color: "var(--viz-idle)" },
  { key: "info", label: "Info", color: "var(--viz-1)" },
  { key: "warn", label: "Alertes", color: "var(--viz-warn)" },
  { key: "error", label: "Erreurs", color: "var(--viz-crit)" },
  { key: "fatal", label: "Fatales", color: "var(--viz-crit)" },
] as const;

/** Statuts de la connexion WebSocket, tels que discord.js les numérote. */
const WS_STATUS: Record<number, string> = {
  0: "Prêt",
  1: "Connexion…",
  2: "Reconnexion…",
  3: "En veille",
  4: "Presque prêt",
  5: "Déconnecté",
  6: "Attente des serveurs",
  7: "Identification…",
  8: "Reprise de session…",
};

type Severity = "good" | "warn" | "crit" | "idle";

const SEVERITY_COLOR: Record<Severity, string> = {
  good: "var(--viz-good)",
  warn: "var(--viz-warn)",
  crit: "var(--viz-crit)",
  idle: "var(--viz-idle)",
};

/**
 * Le mot qui accompagne la couleur.
 *
 * Une pastille verte seule ne dit rien à qui ne distingue pas le vert du rouge :
 * chaque état porte donc son libellé, et la couleur ne fait que le redire.
 */
const SEVERITY_LABEL: Record<Severity, string> = {
  good: "normal",
  warn: "à surveiller",
  crit: "critique",
  idle: "inconnu",
};

/** Classe un seuil : en dessous de `warn` tout va bien, au-delà de `crit` non. */
function severityOf(
  value: number | null,
  thresholds: { warn: number; crit: number },
): Severity {
  if (value === null || !Number.isFinite(value)) return "idle";
  if (value >= thresholds.crit) return "crit";
  if (value >= thresholds.warn) return "warn";
  return "good";
}

/** Une mini-courbe de tendance : douze points, sans axes ni graduation. */
function MiniSpark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 24 - ((value - min) / span) * 22 - 1;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="mt-[6px] h-[24px] w-full overflow-visible"
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Une tuile de chiffre : le libellé, la valeur, puis le contexte. */
function Tile({
  label,
  value,
  hint,
  severity,
  spark,
}: {
  label: string;
  value: string;
  hint?: string;
  severity?: Severity;
  spark?: { values: number[]; color: string };
}) {
  return (
    <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[14px]">
      <p className="flex items-center gap-[6px] text-[12px] text-[var(--mut)]">
        {severity ? (
          <span
            aria-hidden="true"
            className="inline-block h-[8px] w-[8px] shrink-0 rounded-full"
            style={{ background: SEVERITY_COLOR[severity] }}
          />
        ) : null}
        {label}
      </p>
      <p className="mt-[4px] text-[22px] font-bold leading-tight text-[var(--tx)]">
        {value}
      </p>
      {hint ? (
        <p className="mt-[2px] text-[12px] text-[var(--muted2)]">{hint}</p>
      ) : null}
      {spark ? <MiniSpark values={spark.values} color={spark.color} /> : null}
    </div>
  );
}

/** Une jauge remplie : la part occupée d'un total connu. */
function Meter({
  label,
  used,
  total,
  detail,
}: {
  label: string;
  used: number;
  total: number;
  detail: string;
}) {
  const ratio = total > 0 ? Math.min(1, used / total) : 0;
  const severity = severityOf(ratio * 100, { warn: 75, crit: 90 });
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
        <span className="text-[var(--mut)]">{label}</span>
        <span className="tabular-nums text-[var(--tx)]">{detail}</span>
      </div>
      <div className="mt-[6px] h-[8px] w-full overflow-hidden rounded-full bg-[var(--track)]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${String(Math.round(ratio * 100))}%`,
            background: SEVERITY_COLOR[severity],
          }}
        />
      </div>
    </div>
  );
}

/** Une ligne de la liste « ce qui revient le plus » : barre + valeur au bout. */
function BarRow({
  label,
  value,
  max,
  color,
  detail,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  detail?: string;
}) {
  const ratio = max > 0 ? Math.max(0.02, value / max) : 0;
  return (
    <li className="py-[7px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-[2px]">
        <span className="text-[13px] font-semibold text-[var(--tx)]">{label}</span>
        <span className="text-[12px] tabular-nums text-[var(--mut)]">
          {fmtNumber(value)}
          {detail ? <span className="text-[var(--muted2)]"> · {detail}</span> : null}
        </span>
      </div>
      <div className="mt-[5px] h-[8px] w-full rounded-[4px] bg-[var(--track)]">
        <div
          className="h-full rounded-[4px]"
          style={{ width: `${String(ratio * 100)}%`, background: color }}
        />
      </div>
    </li>
  );
}

/** Une ligne de la fiche d'instance : intitulé à gauche, valeur à droite. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-[2px] py-[7px]">
      <span className="text-[13px] text-[var(--mut)]">{label}</span>
      <span className="text-[13px] font-semibold tabular-nums text-[var(--tx)]">
        {value}
      </span>
    </div>
  );
}

export function MonitoringPanel({
  guildId,
  initial,
}: {
  guildId: string;
  initial: BotMetrics | null;
}) {
  const [metrics, setMetrics] = useState<BotMetrics | null>(initial);
  const [fetchedAt, setFetchedAt] = useState<number | null>(
    initial ? Date.now() : null,
  );
  const [refreshMs, setRefreshMs] = useState<number>(15_000);
  // La période courante : un préréglage, ou une date choisie au calendrier.
  const [periodId, setPeriodId] = useState<string>("1h");
  const [pickedDay, setPickedDay] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    initial ? null : "Bot injoignable : aucune mesure à afficher.",
  );
  // L'horloge qui fait vieillir le « il y a N s » : la mesure ne change pas
  // entre deux appels, mais son âge, si — et c'est lui qui dit si on regarde
  // une photo fraîche ou un écran resté ouvert toute la nuit.
  const [now, setNow] = useState(() => Date.now());

  // Un rafraîchissement qui arrive après un démontage (onglet changé, panneau
  // masqué) ne doit pas écrire dans un composant disparu.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (wanted: MetricsWindow) => {
      setLoading(true);
      try {
        const fresh = await getMetricsAction(guildId, wanted);
        if (!alive.current) return;
        if (fresh) {
          setMetrics(fresh);
          setFetchedAt(Date.now());
          setError(null);
        } else {
          // On garde la dernière photo à l'écran : un bot injoignable est une
          // information, effacer les courbes n'en est pas une.
          setError("Bot injoignable : mesures figées à la dernière lecture.");
        }
      } catch {
        if (alive.current) setError("Lecture refusée par le bot.");
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    [guildId],
  );

  /** Le préréglage courant, ou `null` quand une date est choisie au calendrier. */
  const period = useMemo(
    () => PERIODS.find((entry) => entry.id === periodId) ?? null,
    [periodId],
  );

  /** Les bornes à demander maintenant, préréglage ou date. */
  const windowOf = useCallback((): MetricsWindow => {
    if (periodId === "day") {
      return windowOfDayKey(pickedDay) ?? { from: Date.now() - 3_600_000, to: Date.now() };
    }
    return (period ?? PERIODS[1] ?? PERIODS[0])?.window() ?? {
      from: Date.now() - 3_600_000,
      to: Date.now(),
    };
  }, [period, periodId, pickedDay]);

  /** Une période close ne bouge plus : la réinterroger n'apprendrait rien. */
  const live = periodId !== "day" && period?.kind !== "fixed";

  /** Change de période ET recharge : une période qui n'appelle pas ment. */
  const pickPeriod = (id: string, day = pickedDay) => {
    setPeriodId(id);
    if (id === "day") {
      const key = day || dayKey(Date.now());
      setPickedDay(key);
      const wanted = windowOfDayKey(key);
      if (wanted) void load(wanted);
      return;
    }
    const chosen = PERIODS.find((entry) => entry.id === id);
    if (chosen) void load(chosen.window());
  };

  useEffect(() => {
    // Une période de calendrier close n'est rafraîchie que sur demande : la
    // laisser tourner rappellerait le bot toutes les quinze secondes pour lui
    // reposer une question dont la réponse ne peut plus changer.
    if (refreshMs === 0 || !live) return;
    const timer = setInterval(() => {
      void load(windowOf());
    }, refreshMs);
    return () => {
      clearInterval(timer);
    };
  }, [refreshMs, live, windowOf, load]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const history = useMemo<BotMetricSample[]>(
    () => metrics?.history ?? [],
    [metrics],
  );
  const times = useMemo(() => history.map((sample) => sample.t), [history]);

  const series = useCallback(
    (
      label: string,
      color: string,
      pick: (sample: BotMetricSample) => number | null,
    ): ChartSeries => ({ label, color, values: history.map(pick) }),
    [history],
  );

  if (!metrics) {
    return (
      <section className="card p-[22px]">
        <p className="text-[16px] font-bold">Monitoring</p>
        <p className="mt-[6px] text-[14px] text-[var(--mut)]">
          {error ?? "Aucune mesure disponible."} Le panneau se remplira dès que
          le bot répondra de nouveau.
        </p>
        <button
          type="button"
          onClick={() => {
            void load(windowOf());
          }}
          disabled={loading}
          className="mt-4 rounded-[9px] border border-[var(--bd)] px-4 py-[7px] text-[14px] font-semibold disabled:opacity-50"
        >
          {loading ? "Lecture…" : "Réessayer"}
        </button>
      </section>
    );
  }

  // Un point de courbe ne couvre pas toujours un échantillon : sur une fenêtre
  // large, le bot en regroupe plusieurs. L'unité affichée suit ce pas réel,
  // sinon « par 15 s » mentirait d'un facteur vingt sur sept jours.
  const bucketMs = Math.max(1000, metrics.window.bucketMs || metrics.sampleIntervalMs);
  const perBucket = `par ${fmtStep(bucketMs)}`;
  // Ce que le panneau a REÇU, pas ce qu'il a demandé : sur une période close,
  // les deux coïncident ; sur une période glissante, la borne haute a déjà
  // vieilli de quelques secondes, et c'est celle des chiffres affichés.
  const windowLabel =
    periodId === "day"
      ? fmtDay(metrics.window.from)
      : (period?.label ?? fmtDay(metrics.window.from));
  const windowSeconds = Math.round((metrics.window.to - metrics.window.from) / 1000);
  const persistence = metrics.persistence;
  // Les bornes de l'axe viennent de la fenêtre demandée, pas des mesures : sur
  // « 30 j » d'un bot démarré hier, la courbe doit commencer hier — au bout du
  // graphique — et non s'étirer sur tout le mois.
  const domain: [number, number] = [metrics.window.from, metrics.window.to];
  // Au-delà d'un point et demi sans mesure, le bot ne tournait pas : la courbe
  // se coupe plutôt que de relier les deux bords de la panne.
  const gapMs = bucketMs * 1.5;

  const ping = metrics.discord.ping;
  const pingSeverity = metrics.discord.ready
    ? severityOf(ping, { warn: 300, crit: 600 })
    : "crit";
  const cpuSeverity = severityOf(metrics.process.cpuPercent, { warn: 70, crit: 90 });
  const lagSeverity = severityOf(metrics.process.eventLoopLagMs, {
    warn: 50,
    crit: 200,
  });
  // Les compteurs viennent du bot, qui les somme sur la fenêtre entière : les
  // rederiver des points agrégés donnerait le même chiffre au mieux, un chiffre
  // faux dès qu'un point manque.
  const errorsWindow = metrics.totals.logs.error + metrics.totals.logs.fatal;
  const warningsWindow = metrics.totals.logs.warn;
  // Un seuil sur le nombre brut n'aurait pas de sens d'une période à l'autre :
  // soixante erreurs en une heure est une panne, soixante sur un mois est le
  // bruit de fond. On juge donc une CADENCE, pas un total.
  const hoursObserved = Math.max(
    1 / 60,
    (metrics.window.to - metrics.window.from) / 3_600_000,
  );
  const errorSeverity = severityOf(errorsWindow / hoursObserved, { warn: 1, crit: 10 });
  const heapSeverity = severityOf(
    (metrics.process.heapUsed / Math.max(1, metrics.process.heapLimit)) * 100,
    { warn: 75, crit: 90 },
  );

  const topCommands = metrics.commands.slice(0, 8);
  const maxCommand = topCommands[0]?.count ?? 0;
  const maxLog = Math.max(
    1,
    ...LOG_LEVELS.map((level) => metrics.totals.logs[level.key]),
  );

  const age = fetchedAt === null ? null : Math.max(0, Math.round((now - fetchedAt) / 1000));

  return (
    <section className="card p-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[16px] font-bold">Monitoring</p>
          <p className="mt-[6px] max-w-[62ch] text-[14px] text-[var(--mut)]">
            L’état de l’instance, tous serveurs confondus : ce que consomme le
            process, ce que Discord répond, ce que le bot exécute. Les compteurs
            valent pour la période affichée ; les jauges, pour l’instant présent.
          </p>
          <p className="mt-[6px] max-w-[62ch] text-[13px] text-[var(--muted2)]">
            {persistence.enabled
              ? `Historique conservé ${String(persistence.retentionDays)} jour(s) en base : il survit aux redémarrages du bot. ${fmtNumber(persistence.stored)} mesures enregistrées${persistence.oldest ? `, depuis le ${fmtDateTime(persistence.oldest)}` : ""}.`
              : "Historique en mémoire seule : une heure glissante, perdue à chaque redémarrage du bot. Pour le conserver, régler METRICS_RETENTION_DAYS côté bot."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[var(--muted2)]">
            {!live
              ? "Période close"
              : age === null
                ? "—"
                : age < 5
                  ? "À l’instant"
                  : `Il y a ${String(age)} s`}
          </span>
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="Période observée"
          >
            {PERIODS.map((choice) => {
              const active = choice.id === periodId;
              return (
                <button
                  key={choice.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    pickPeriod(choice.id);
                  }}
                  className={`rounded-[8px] border px-[10px] py-[5px] text-[12px] font-semibold transition-colors ${
                    active
                      ? "border-[var(--acc-bd)] bg-[var(--acc-bg)] text-[var(--tx)]"
                      : "border-[var(--bd)] text-[var(--mut)] hover:text-[var(--tx)]"
                  }`}
                >
                  {choice.label}
                </button>
              );
            })}

            {/* Une date libre, bornée à ce que le bot garde réellement : proposer
                un calendrier ouvert ne produirait que des journées vides sans
                explication — la même règle que le sélecteur de jour des logs. */}
            <input
              type="date"
              value={periodId === "day" ? pickedDay : ""}
              aria-label="Choisir une journée"
              min={persistence.oldest ? dayKey(persistence.oldest) : undefined}
              max={dayKey(Date.now())}
              onChange={(event) => {
                if (event.target.value) pickPeriod("day", event.target.value);
              }}
              className={`field h-[30px] w-auto px-[8px] py-0 text-[12px] ${
                periodId === "day" ? "border-[var(--acc-bd)] bg-[var(--acc-bg)]" : ""
              }`}
            />
          </div>

          <span className="mx-1 h-[18px] w-px bg-[var(--bd)]" aria-hidden="true" />

          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="Cadence de rafraîchissement"
            hidden={!live}
          >
            {REFRESH_CHOICES.map((choice) => {
              const active = choice.value === refreshMs;
              return (
                <button
                  key={choice.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setRefreshMs(choice.value);
                  }}
                  className={`rounded-[8px] border px-[10px] py-[5px] text-[12px] font-semibold transition-colors ${
                    active
                      ? "border-[var(--acc-bd)] bg-[var(--acc-bg)] text-[var(--tx)]"
                      : "border-[var(--bd)] text-[var(--mut)] hover:text-[var(--tx)]"
                  }`}
                >
                  {choice.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              void load(windowOf());
            }}
            disabled={loading}
            className="rounded-[9px] border border-[var(--bd)] px-4 py-[7px] text-[13px] font-semibold disabled:opacity-50"
          >
            {loading ? "Lecture…" : "Rafraîchir"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-[10px] border border-[var(--bd)] bg-[var(--acc-bg)] px-4 py-[9px] text-[13px] text-[var(--mut)]">
          {error}
        </p>
      ) : null}

      {metrics.window.truncated ? (
        <p className="mt-3 rounded-[10px] border border-[var(--bd)] bg-[var(--acc-bg)] px-4 py-[9px] text-[13px] text-[var(--mut)]">
          Période trop chargée pour être rendue en entier : seul son dernier
          tronçon est affiché. Le début manque, il n’est pas vide.
        </p>
      ) : null}

      {/* Le chiffre de tête : depuis quand ça tourne. C'est la première chose
          qu'on vient vérifier après une mise à jour ou une frayeur. */}
      <div className="mt-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[18px]">
        <div>
          <p className="flex items-center gap-[7px] text-[13px] text-[var(--mut)]">
            <span
              aria-hidden="true"
              className="inline-block h-[9px] w-[9px] rounded-full"
              style={{
                background: metrics.discord.ready
                  ? SEVERITY_COLOR.good
                  : SEVERITY_COLOR.crit,
              }}
            />
            {metrics.discord.ready ? "Connecté à Discord" : "Déconnecté de Discord"}
            <span className="text-[var(--muted2)]">
              · {WS_STATUS[metrics.discord.status] ?? `état ${String(metrics.discord.status)}`}
            </span>
          </p>
          <p className="mt-[2px] font-display text-[44px] font-bold leading-none text-[var(--tx)]">
            {fmtDuration(metrics.process.uptimeSeconds)}
          </p>
          <p className="mt-[6px] text-[13px] text-[var(--muted2)]">
            Démarré le {fmtDateTime(metrics.startedAt)}
            {metrics.process.version ? ` · version ${metrics.process.version}` : ""}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="text-[var(--muted2)]">Serveurs</dt>
            <dd className="m-0 font-semibold tabular-nums text-[var(--tx)]">
              {fmtNumber(metrics.discord.guilds)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted2)]">Membres</dt>
            <dd className="m-0 font-semibold tabular-nums text-[var(--tx)]">
              {fmtNumber(metrics.discord.members)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted2)]">Salons</dt>
            <dd className="m-0 font-semibold tabular-nums text-[var(--tx)]">
              {fmtNumber(metrics.discord.channels)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted2)]">Modules</dt>
            <dd className="m-0 font-semibold tabular-nums text-[var(--tx)]">
              {fmtNumber(metrics.modules.public)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted2)]">Commandes</dt>
            <dd className="m-0 font-semibold tabular-nums text-[var(--tx)]">
              {fmtNumber(metrics.modules.commands)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted2)]">Tâches</dt>
            <dd className="m-0 font-semibold tabular-nums text-[var(--tx)]">
              {fmtNumber(metrics.tasks)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label={`Latence Discord · ${SEVERITY_LABEL[pingSeverity]}`}
          value={ping === null ? "—" : `${fmtNumber(ping)} ms`}
          hint="Aller-retour de la passerelle"
          severity={pingSeverity}
          spark={{
            // Les mesures absentes sont écartées, pas remplacées par zéro :
            // une latence inconnue n'est pas une latence nulle.
            values: history
              .slice(-12)
              .map((sample) => sample.ping)
              .filter((value): value is number => value !== null),
            color: "var(--viz-1)",
          }}
        />
        <Tile
          label={`Processeur · ${SEVERITY_LABEL[cpuSeverity]}`}
          value={`${fmtNumber(metrics.process.cpuPercent)} %`}
          hint={`${String(metrics.system.cpus)} cœur(s) · charge ${(metrics.system.loadAvg[0] ?? 0).toFixed(2)}`}
          severity={cpuSeverity}
          spark={{
            values: history.slice(-12).map((sample) => sample.cpu),
            color: "var(--viz-2)",
          }}
        />
        <Tile
          label={`Mémoire du bot · ${SEVERITY_LABEL[heapSeverity]}`}
          value={fmtBytes(metrics.process.rss)}
          hint={`Tas ${fmtBytes(metrics.process.heapUsed)} sur ${fmtBytes(metrics.process.heapLimit)} autorisés`}
          severity={heapSeverity}
          spark={{
            values: history.slice(-12).map((sample) => sample.rss),
            color: "var(--viz-1)",
          }}
        />
        <Tile
          label={`Boucle d’évènements · ${SEVERITY_LABEL[lagSeverity]}`}
          value={`${metrics.process.eventLoopLagMs.toFixed(1)} ms`}
          hint={`Pire retard ${metrics.process.eventLoopLagMaxMs.toFixed(1)} ms`}
          severity={lagSeverity}
          spark={{
            values: history.slice(-12).map((sample) => sample.lag),
            color: "var(--viz-2)",
          }}
        />
        <Tile
          label={`Commandes · ${windowLabel}`}
          value={fmtNumber(metrics.totals.commands)}
          hint={`${fmtNumber(metrics.totals.commandErrors)} en échec sur la période`}
        />
        <Tile
          label={`Interactions · ${windowLabel}`}
          value={fmtNumber(metrics.totals.interactions)}
          hint={`${fmtNumber(metrics.totals.components)} composants · ${fmtNumber(metrics.totals.modals)} modales`}
        />
        <Tile
          label={`Erreurs · ${windowLabel} · ${SEVERITY_LABEL[errorSeverity]}`}
          value={fmtNumber(errorsWindow)}
          hint={`${fmtNumber(warningsWindow)} alertes · ${(errorsWindow / hoursObserved).toFixed(1)} erreur(s) par heure`}
          severity={errorSeverity}
        />
        <Tile
          label={`API Discord · ${windowLabel}`}
          value={fmtNumber(metrics.totals.restRequests)}
          hint={`${fmtNumber(metrics.totals.rateLimits)} limite(s) de débit atteinte(s)`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <MetricChart
          title="Latence de la passerelle"
          unit="ms"
          times={times}
          domain={domain}
          gapMs={gapMs}
          zeroBased={false}
          series={[series("Latence", "var(--viz-1)", (sample) => sample.ping)]}
        />
        <MetricChart
          title="Processeur"
          unit="% d’un cœur"
          times={times}
          domain={domain}
          gapMs={gapMs}
          series={[series("Processeur", "var(--viz-2)", (sample) => sample.cpu)]}
        />
        <MetricChart
          title="Mémoire"
          unit="Mo"
          times={times}
          domain={domain}
          gapMs={gapMs}
          zeroBased={false}
          format={(value) => `${value.toLocaleString("fr-FR")}`}
          series={[
            series("Résidente", "var(--viz-1)", (sample) => toMiB(sample.rss)),
            series("Tas V8", "var(--viz-2)", (sample) => toMiB(sample.heap)),
          ]}
        />
        <MetricChart
          title="Retard de la boucle d’évènements"
          unit="ms"
          times={times}
          domain={domain}
          gapMs={gapMs}
          series={[series("Retard moyen", "var(--viz-2)", (sample) => sample.lag)]}
        />
        <MetricChart
          title="Activité"
          unit={perBucket}
          times={times}
          domain={domain}
          gapMs={gapMs}
          series={[
            series("Commandes", "var(--viz-1)", (sample) => sample.commands),
            series("Interactions", "var(--viz-2)", (sample) => sample.interactions),
          ]}
        />
        <MetricChart
          title="Alertes et erreurs"
          unit={perBucket}
          times={times}
          domain={domain}
          gapMs={gapMs}
          series={[
            series("Alertes", "var(--viz-warn)", (sample) => sample.warnings),
            series("Erreurs", "var(--viz-crit)", (sample) => sample.errors),
          ]}
        />
        <MetricChart
          title="Requêtes vers l’API Discord"
          unit={perBucket}
          times={times}
          domain={domain}
          gapMs={gapMs}
          series={[series("Requêtes", "var(--viz-1)", (sample) => sample.rest)]}
        />
        <MetricChart
          title="Serveurs connectés"
          unit="serveurs"
          times={times}
          domain={domain}
          gapMs={gapMs}
          zeroBased={false}
          series={[series("Serveurs", "var(--viz-1)", (sample) => sample.guilds)]}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
          <p className="text-[14px] font-semibold">Commandes les plus appelées</p>
          <p className="mt-[4px] text-[12px] text-[var(--muted2)]">
            Cumul de toute la vie de l’instance — conservé d’un redémarrage à
            l’autre — avec la durée moyenne d’exécution et les échecs.
          </p>
          {topCommands.length === 0 ? (
            <p className="mt-3 text-[13px] text-[var(--mut)]">
              Aucune commande exécutée pour l’instant.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--bd)]">
              {topCommands.map((command) => (
                <BarRow
                  key={command.name}
                  label={`/${command.name}`}
                  value={command.count}
                  max={maxCommand}
                  color="var(--viz-1)"
                  detail={`${String(command.avgMs)} ms${command.errors > 0 ? ` · ${String(command.errors)} échec(s)` : ""}`}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
          <p className="text-[14px] font-semibold">Lignes de log par niveau</p>
          <p className="mt-[4px] text-[12px] text-[var(--muted2)]">
            Sur la période affichée, tous modules confondus. Le détail se lit
            dans l’onglet Logs.
          </p>
          <ul className="mt-3 divide-y divide-[var(--bd)]">
            {LOG_LEVELS.map((level) => (
              <BarRow
                key={level.key}
                label={level.label}
                value={metrics.totals.logs[level.key]}
                max={maxLog}
                color={level.color}
              />
            ))}
          </ul>
        </div>

        <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
          <p className="text-[14px] font-semibold">Machine hôte</p>
          <div className="mt-3 flex flex-col gap-3">
            <Meter
              label="Mémoire vive du serveur"
              used={metrics.system.totalMem - metrics.system.freeMem}
              total={metrics.system.totalMem}
              detail={`${fmtBytes(metrics.system.totalMem - metrics.system.freeMem)} sur ${fmtBytes(metrics.system.totalMem)}`}
            />
            {/* Rapporté au plafond de V8 et non à `heapTotal` : cette dernière
                n'est que la réserve du moment, agrandie à la demande — un bot
                parfaitement sain y afficherait 95 % en permanence. */}
            <Meter
              label="Tas V8 (sur le plafond autorisé)"
              used={metrics.process.heapUsed}
              total={metrics.process.heapLimit}
              detail={`${fmtBytes(metrics.process.heapUsed)} sur ${fmtBytes(metrics.process.heapLimit)}`}
            />
          </div>
          <div className="mt-2 divide-y divide-[var(--bd)]">
            <Fact
              label="Charge moyenne (1, 5, 15 min)"
              value={metrics.system.loadAvg
                .map((value) => value.toFixed(2))
                .join(" · ")}
            />
            <Fact label="Cœurs" value={fmtNumber(metrics.system.cpus)} />
            <Fact
              label="Plateforme"
              value={`${metrics.process.platform} · ${metrics.process.arch}`}
            />
            <Fact label="Node.js" value={metrics.process.node} />
            <Fact label="PID" value={String(metrics.process.pid)} />
          </div>
        </div>

        <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
          <p className="text-[14px] font-semibold">Instance</p>
          <div className="mt-2 divide-y divide-[var(--bd)]">
            <Fact
              label="Base de données"
              value={
                metrics.db.bytes === null
                  ? "taille inconnue"
                  : fmtBytes(metrics.db.bytes)
              }
            />
            <Fact
              label="Journal WAL"
              value={metrics.db.walBytes === null ? "—" : fmtBytes(metrics.db.walBytes)}
            />
            <Fact
              label="Réserve actuelle du tas"
              value={`${fmtBytes(metrics.process.heapTotal)} (plafond ${fmtBytes(metrics.process.heapLimit)})`}
            />
            <Fact
              label="Mémoire hors tas"
              value={fmtBytes(metrics.process.external + metrics.process.arrayBuffers)}
            />
            <Fact
              label="Connexion Discord"
              value={fmtDuration(metrics.discord.uptimeSeconds)}
            />
            <Fact
              label="Modules chargés"
              value={`${fmtNumber(metrics.modules.total)} dont ${fmtNumber(metrics.modules.total - metrics.modules.public)} interne(s)`}
            />
            <Fact
              label="Période affichée"
              value={
                metrics.window.samples > 0
                  ? `${fmtDuration(windowSeconds)} · ${fmtNumber(metrics.window.samples)} mesures · un point = ${fmtStep(bucketMs)}`
                  : "en cours de constitution"
              }
            />
            <Fact
              label="Historique"
              value={
                persistence.enabled
                  ? `${String(persistence.retentionDays)} j en base · ${fmtNumber(persistence.stored)} mesures`
                  : "mémoire seule (perdu au redémarrage)"
              }
            />
          </div>
        </div>
      </div>

      {/* Les mêmes chiffres en toutes lettres : une courbe se survole à la
          souris, un tableau se lit au clavier, se copie et se relit sans
          distinguer les couleurs. */}
      <details className="mt-4 rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
        <summary className="cursor-pointer text-[14px] font-semibold">
          Tableau des dernières mesures
        </summary>
        {times.length === 0 ? (
          <p className="mt-3 text-[13px] text-[var(--mut)]">
            Aucune mesure enregistrée pour l’instant.
          </p>
        ) : (
          <div className="mt-3 max-h-[320px] overflow-auto">
            <table className="w-full min-w-[640px] border-collapse text-[12px] tabular-nums">
              <thead className="sticky top-0 bg-[var(--surf-solid)] text-left text-[var(--mut)]">
                <tr>
                  <th className="py-[6px] pr-3 font-semibold">Heure</th>
                  <th className="py-[6px] pr-3 font-semibold">Latence</th>
                  <th className="py-[6px] pr-3 font-semibold">CPU</th>
                  <th className="py-[6px] pr-3 font-semibold">Mémoire</th>
                  <th className="py-[6px] pr-3 font-semibold">Retard</th>
                  <th className="py-[6px] pr-3 font-semibold">Cmd</th>
                  <th className="py-[6px] pr-3 font-semibold">Inter.</th>
                  <th className="py-[6px] pr-3 font-semibold">Alertes</th>
                  <th className="py-[6px] pr-3 font-semibold">Erreurs</th>
                  <th className="py-[6px] font-semibold">API</th>
                </tr>
              </thead>
              <tbody className="text-[var(--tx)]">
                {[...history]
                  .reverse()
                  .slice(0, 40)
                  .map((sample) => (
                    <tr key={sample.t} className="border-t border-[var(--bd)]">
                      <td className="py-[6px] pr-3">
                        {new Date(sample.t).toLocaleTimeString("fr-FR")}
                      </td>
                      <td className="py-[6px] pr-3">
                        {sample.ping === null ? "—" : `${String(sample.ping)} ms`}
                      </td>
                      <td className="py-[6px] pr-3">{String(sample.cpu)} %</td>
                      <td className="py-[6px] pr-3">{fmtBytes(sample.rss)}</td>
                      <td className="py-[6px] pr-3">{sample.lag.toFixed(1)} ms</td>
                      <td className="py-[6px] pr-3">{String(sample.commands)}</td>
                      <td className="py-[6px] pr-3">{String(sample.interactions)}</td>
                      <td className="py-[6px] pr-3">{String(sample.warnings)}</td>
                      <td className="py-[6px] pr-3">{String(sample.errors)}</td>
                      <td className="py-[6px]">{String(sample.rest)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </section>
  );
}
