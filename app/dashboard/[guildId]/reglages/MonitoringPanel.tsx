"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BotMetricSample, BotMetrics, MetricsWindow } from "@/lib/botApi";
import type { Translate } from "@/lib/i18n";
import { useT } from "@/components/I18n";
import { dayKey, formatDateTime, formatDayLong, useTimeZone } from "@/lib/dates";
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
  /** Sert aussi de clé de traduction (`reglages.monitoring.periodes.<id>`). */
  id: string;
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
    kind: "live",
    // Cinq minutes : à ce pas, chaque mesure est un point à elle seule et la
    // courbe avance visiblement à chaque rafraîchissement.
    window: () => ({ from: Date.now() - 300_000, to: Date.now() }),
  },
  { id: "1h", kind: "live", window: () => ({ from: Date.now() - 3_600_000, to: Date.now() }) },
  { id: "6h", kind: "live", window: () => ({ from: Date.now() - 21_600_000, to: Date.now() }) },
  {
    id: "today",
    kind: "live",
    window: () => ({ from: startOfDay(new Date()), to: Date.now() }),
  },
  { id: "yesterday", kind: "fixed", window: () => dayWindow(1) },
  { id: "before", kind: "fixed", window: () => dayWindow(2) },
  {
    id: "month",
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

/** La journée entière désignée par un `YYYY-MM-DD` saisi dans le sélecteur. */
function windowOfDayKey(key: string): MetricsWindow | null {
  const [year, month, day] = key.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;
  const start = new Date(year, month - 1, day).getTime();
  return { from: start, to: start + DAY_MS };
}


/** Cadences de rafraîchissement proposées. `0` = en pause. */
const REFRESH_CHOICES = [
  { value: 15_000, key: "15s" },
  { value: 30_000, key: "30s" },
  { value: 60_000, key: "1min" },
  { value: 0, key: "pause" },
] as const;

/** Octets en unité lisible. Le bot en renvoie toujours des octets bruts. */
function fmtBytes(t: Translate, bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes))
    return t("reglages.duree.inconnue");
  if (bytes < 1024) return `${String(Math.round(bytes))} ${t("reglages.octets.o")}`;
  const units = [
    t("reglages.octets.ko"),
    t("reglages.octets.mo"),
    t("reglages.octets.go"),
    t("reglages.octets.to"),
  ];
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

function fmtNumber(format: string, value: number): string {
  return Math.round(value).toLocaleString(format);
}

/** Durée en clair : « 3 j 4 h », « 12 min », « 48 s ». */
function fmtDuration(t: Translate, seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0)
    return t("reglages.duree.inconnue");
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return t("reglages.duree.joursHeures", { j: days, h: hours });
  if (hours > 0) return t("reglages.duree.heuresMinutes", { h: hours, m: minutes });
  if (minutes > 0) return t("reglages.duree.minutes", { n: minutes });
  return t("reglages.duree.secondes", { n: Math.round(seconds) });
}

/** Un pas de temps en clair : « 15 s », « 1 min 30 s », « 2 h ». */
function fmtStep(t: Translate, ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return t("reglages.duree.secondes", { n: seconds });
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) {
    return rest > 0
      ? t("reglages.duree.minutesSecondes", { m: minutes, s: rest })
      : t("reglages.duree.minutes", { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  const restMin = minutes % 60;
  return restMin > 0
    ? t("reglages.duree.heuresMinutes", { h: hours, m: restMin })
    : t("reglages.duree.heures", { h: hours });
}


/** Les niveaux de log, du plus bavard au plus grave, avec leur teinte. */
const LOG_LEVELS = [
  { key: "trace", color: "var(--viz-idle)" },
  { key: "debug", color: "var(--viz-idle)" },
  { key: "info", color: "var(--viz-1)" },
  { key: "warn", color: "var(--viz-warn)" },
  { key: "error", color: "var(--viz-crit)" },
  { key: "fatal", color: "var(--viz-crit)" },
] as const;

/**
 * Statuts de la connexion WebSocket, tels que discord.js les numérote.
 *
 * Un numéro que discord.js ajouterait plus tard n'a pas de traduction : on
 * affiche alors le numéro brut plutôt qu'une clé crue.
 */
function wsStatusLabel(t: Translate, status: number): string {
  return status >= 0 && status <= 8
    ? t(`reglages.monitoring.ws.${String(status)}`)
    : t("reglages.monitoring.etatBrut", { n: status });
}

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
function severityLabel(t: Translate, severity: Severity): string {
  return t(`reglages.monitoring.gravite.${severity}`);
}

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
  const { t } = useT();
  const format = t("langue.format");
  const ratio = max > 0 ? Math.max(0.02, value / max) : 0;
  return (
    <li className="py-[7px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-[2px]">
        <span className="text-[13px] font-semibold text-[var(--tx)]">{label}</span>
        <span className="text-[12px] tabular-nums text-[var(--mut)]">
          {fmtNumber(format, value)}
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
  const { t } = useT();
  const format = t("langue.format");
  const timeZone = useTimeZone();
  const [metrics, setMetrics] = useState<BotMetrics | null>(initial);
  // Zéro plutôt que `Date.now()` : l'horloge du serveur n'est pas celle du
  // lecteur, et « il y a 0 s » d'un côté contre « il y a 1 s » de l'autre suffit
  // à faire échouer l'hydratation — React re-rend alors toute la page (#418).
  // L'effet d'horloge recale les deux dès le montage, et l'âge vaut bien zéro à
  // l'instant où la photo arrive.
  const [fetchedAt, setFetchedAt] = useState<number | null>(initial ? 0 : null);
  const [refreshMs, setRefreshMs] = useState<number>(15_000);
  // La période courante : un préréglage, ou une date choisie au calendrier.
  const [periodId, setPeriodId] = useState<string>("1h");
  const [pickedDay, setPickedDay] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    initial ? null : t("reglages.monitoring.injoignable"),
  );
  // L'horloge qui fait vieillir le « il y a N s » : la mesure ne change pas
  // entre deux appels, mais son âge, si — et c'est lui qui dit si on regarde
  // une photo fraîche ou un écran resté ouvert toute la nuit.
  const [now, setNow] = useState(0);

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
          setError(t("reglages.monitoring.figees"));
        }
      } catch {
        if (alive.current) setError(t("reglages.monitoring.refusee"));
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    [guildId, t],
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
      const key = day || dayKey(Date.now(), timeZone);
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
    // Le montage pose d'un coup les deux repères laissés à zéro pour
    // l'hydratation, avant que le battement de seconde ne prenne le relais.
    setNow(Date.now());
    setFetchedAt((at) => (at === 0 ? Date.now() : at));
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
        <p className="text-[16px] font-bold">{t("reglages.monitoring.titre")}</p>
        <p className="mt-[6px] text-[14px] text-[var(--mut)]">
          {error ?? t("reglages.monitoring.aucuneMesure")}
          {t("reglages.monitoring.seRemplira")}
        </p>
        <button
          type="button"
          onClick={() => {
            void load(windowOf());
          }}
          disabled={loading}
          className="mt-4 rounded-[9px] border border-[var(--bd)] px-4 py-[7px] text-[14px] font-semibold disabled:opacity-50"
        >
          {loading
            ? t("reglages.monitoring.lecture")
            : t("reglages.monitoring.reessayer")}
        </button>
      </section>
    );
  }

  // Un point de courbe ne couvre pas toujours un échantillon : sur une fenêtre
  // large, le bot en regroupe plusieurs. L'unité affichée suit ce pas réel,
  // sinon « par 15 s » mentirait d'un facteur vingt sur sept jours.
  const bucketMs = Math.max(1000, metrics.window.bucketMs || metrics.sampleIntervalMs);
  const perBucket = t("reglages.monitoring.courbes.parPas", {
    pas: fmtStep(t, bucketMs),
  });
  // Ce que le panneau a REÇU, pas ce qu'il a demandé : sur une période close,
  // les deux coïncident ; sur une période glissante, la borne haute a déjà
  // vieilli de quelques secondes, et c'est celle des chiffres affichés.
  const windowLabel =
    periodId === "day" || !period
      ? formatDayLong(format, metrics.window.from, timeZone)
      : t(`reglages.monitoring.periodes.${period.id}`);
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
          <p className="text-[16px] font-bold">
            {t("reglages.monitoring.titre")}
          </p>
          <p className="mt-[6px] max-w-[62ch] text-[14px] text-[var(--mut)]">
            {t("reglages.monitoring.aide")}
          </p>
          <p className="mt-[6px] max-w-[62ch] text-[13px] text-[var(--muted2)]">
            {persistence.enabled
              ? t("reglages.monitoring.historiqueEnBase", {
                  jours: persistence.retentionDays,
                  mesures: fmtNumber(format, persistence.stored),
                  depuis: persistence.oldest
                    ? t("reglages.monitoring.historiqueDepuis", {
                        date: formatDateTime(
                          format,
                          persistence.oldest,
                          timeZone,
                        ),
                      })
                    : "",
                })
              : t("reglages.monitoring.historiqueMemoire")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[var(--muted2)]">
            {!live
              ? t("reglages.monitoring.periodeClose")
              : age === null
                ? t("reglages.duree.inconnue")
                : age < 5
                  ? t("reglages.monitoring.instant")
                  : t("reglages.monitoring.ilYA", { n: age })}
          </span>
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label={t("reglages.monitoring.periodeObservee")}
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
                  {t(`reglages.monitoring.periodes.${choice.id}`)}
                </button>
              );
            })}

            {/* Une date libre, bornée à ce que le bot garde réellement : proposer
                un calendrier ouvert ne produirait que des journées vides sans
                explication — la même règle que le sélecteur de jour des logs. */}
            <input
              type="date"
              value={periodId === "day" ? pickedDay : ""}
              aria-label={t("reglages.monitoring.choisirJournee")}
              min={persistence.oldest ? dayKey(persistence.oldest, timeZone) : undefined}
              // `now` vaut zéro jusqu'au montage : pas de borne haute plutôt
              // qu'un 1970 rendu par le serveur.
              max={now > 0 ? dayKey(now, timeZone) : undefined}
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
            aria-label={t("reglages.monitoring.cadence")}
            hidden={!live}
          >
            {REFRESH_CHOICES.map((choice) => {
              const active = choice.value === refreshMs;
              return (
                <button
                  key={choice.key}
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
                  {t(`reglages.monitoring.cadences.${choice.key}`)}
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
            {loading
              ? t("reglages.monitoring.lecture")
              : t("reglages.monitoring.rafraichir")}
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
          {t("reglages.monitoring.tronquee")}
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
            {metrics.discord.ready
              ? t("reglages.monitoring.connecte")
              : t("reglages.monitoring.deconnecte")}
            <span className="text-[var(--muted2)]">
              · {wsStatusLabel(t, metrics.discord.status)}
            </span>
          </p>
          <p className="mt-[2px] font-display text-[44px] font-bold leading-none text-[var(--tx)]">
            {fmtDuration(t, metrics.process.uptimeSeconds)}
          </p>
          <p className="mt-[6px] text-[13px] text-[var(--muted2)]">
            {t("reglages.monitoring.demarreLe", {
              date: formatDateTime(format, metrics.startedAt, timeZone),
            })}
            {metrics.process.version
              ? t("reglages.monitoring.version", {
                  version: metrics.process.version,
                })
              : ""}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="text-[var(--muted2)]">
              {t("reglages.monitoring.compteurs.serveurs")}
            </dt>
            <dd className="m-0 font-semibold tabular-nums text-[var(--tx)]">
              {fmtNumber(format, metrics.discord.guilds)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted2)]">
              {t("reglages.monitoring.compteurs.membres")}
            </dt>
            <dd className="m-0 font-semibold tabular-nums text-[var(--tx)]">
              {fmtNumber(format, metrics.discord.members)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted2)]">
              {t("reglages.monitoring.compteurs.salons")}
            </dt>
            <dd className="m-0 font-semibold tabular-nums text-[var(--tx)]">
              {fmtNumber(format, metrics.discord.channels)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted2)]">
              {t("reglages.monitoring.compteurs.modules")}
            </dt>
            <dd className="m-0 font-semibold tabular-nums text-[var(--tx)]">
              {fmtNumber(format, metrics.modules.public)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted2)]">
              {t("reglages.monitoring.compteurs.commandes")}
            </dt>
            <dd className="m-0 font-semibold tabular-nums text-[var(--tx)]">
              {fmtNumber(format, metrics.modules.commands)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted2)]">
              {t("reglages.monitoring.compteurs.taches")}
            </dt>
            <dd className="m-0 font-semibold tabular-nums text-[var(--tx)]">
              {fmtNumber(format, metrics.tasks)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label={t("reglages.monitoring.tuiles.latence", {
            gravite: severityLabel(t, pingSeverity),
          })}
          value={
            ping === null
              ? t("reglages.duree.inconnue")
              : `${fmtNumber(format, ping)} ms`
          }
          hint={t("reglages.monitoring.tuiles.latenceAide")}
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
          label={t("reglages.monitoring.tuiles.processeur", {
            gravite: severityLabel(t, cpuSeverity),
          })}
          value={`${fmtNumber(format, metrics.process.cpuPercent)} %`}
          hint={t("reglages.monitoring.tuiles.processeurAide", {
            coeurs: metrics.system.cpus,
            charge: (metrics.system.loadAvg[0] ?? 0).toFixed(2),
          })}
          severity={cpuSeverity}
          spark={{
            values: history.slice(-12).map((sample) => sample.cpu),
            color: "var(--viz-2)",
          }}
        />
        <Tile
          label={t("reglages.monitoring.tuiles.memoire", {
            gravite: severityLabel(t, heapSeverity),
          })}
          value={fmtBytes(t, metrics.process.rss)}
          hint={t("reglages.monitoring.tuiles.memoireAide", {
            utilise: fmtBytes(t, metrics.process.heapUsed),
            plafond: fmtBytes(t, metrics.process.heapLimit),
          })}
          severity={heapSeverity}
          spark={{
            values: history.slice(-12).map((sample) => sample.rss),
            color: "var(--viz-1)",
          }}
        />
        <Tile
          label={t("reglages.monitoring.tuiles.boucle", {
            gravite: severityLabel(t, lagSeverity),
          })}
          value={`${metrics.process.eventLoopLagMs.toFixed(1)} ms`}
          hint={t("reglages.monitoring.tuiles.boucleAide", {
            pire: metrics.process.eventLoopLagMaxMs.toFixed(1),
          })}
          severity={lagSeverity}
          spark={{
            values: history.slice(-12).map((sample) => sample.lag),
            color: "var(--viz-2)",
          }}
        />
        <Tile
          label={t("reglages.monitoring.tuiles.commandes", {
            periode: windowLabel,
          })}
          value={fmtNumber(format, metrics.totals.commands)}
          hint={t("reglages.monitoring.tuiles.commandesAide", {
            n: fmtNumber(format, metrics.totals.commandErrors),
          })}
        />
        <Tile
          label={t("reglages.monitoring.tuiles.interactions", {
            periode: windowLabel,
          })}
          value={fmtNumber(format, metrics.totals.interactions)}
          hint={t("reglages.monitoring.tuiles.interactionsAide", {
            composants: fmtNumber(format, metrics.totals.components),
            modales: fmtNumber(format, metrics.totals.modals),
          })}
        />
        <Tile
          label={t("reglages.monitoring.tuiles.erreurs", {
            periode: windowLabel,
            gravite: severityLabel(t, errorSeverity),
          })}
          value={fmtNumber(format, errorsWindow)}
          hint={t("reglages.monitoring.tuiles.erreursAide", {
            alertes: fmtNumber(format, warningsWindow),
            parHeure: (errorsWindow / hoursObserved).toFixed(1),
          })}
          severity={errorSeverity}
        />
        <Tile
          label={t("reglages.monitoring.tuiles.api", { periode: windowLabel })}
          value={fmtNumber(format, metrics.totals.restRequests)}
          hint={t("reglages.monitoring.tuiles.apiAide", {
            n: fmtNumber(format, metrics.totals.rateLimits),
          })}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <MetricChart
          title={t("reglages.monitoring.courbes.latence")}
          unit="ms"
          times={times}
          domain={domain}
          gapMs={gapMs}
          zeroBased={false}
          series={[
            series(
              t("reglages.monitoring.courbes.latenceSerie"),
              "var(--viz-1)",
              (sample) => sample.ping,
            ),
          ]}
        />
        <MetricChart
          title={t("reglages.monitoring.courbes.processeur")}
          unit={t("reglages.monitoring.courbes.processeurUnite")}
          times={times}
          domain={domain}
          gapMs={gapMs}
          series={[
            series(
              t("reglages.monitoring.courbes.processeur"),
              "var(--viz-2)",
              (sample) => sample.cpu,
            ),
          ]}
        />
        <MetricChart
          title={t("reglages.monitoring.courbes.memoire")}
          unit={t("reglages.monitoring.courbes.memoireUnite")}
          times={times}
          domain={domain}
          gapMs={gapMs}
          zeroBased={false}
          format={(value) => value.toLocaleString(format)}
          series={[
            series(
              t("reglages.monitoring.courbes.residente"),
              "var(--viz-1)",
              (sample) => toMiB(sample.rss),
            ),
            series(
              t("reglages.monitoring.courbes.tasV8"),
              "var(--viz-2)",
              (sample) => toMiB(sample.heap),
            ),
          ]}
        />
        <MetricChart
          title={t("reglages.monitoring.courbes.boucle")}
          unit="ms"
          times={times}
          domain={domain}
          gapMs={gapMs}
          series={[
            series(
              t("reglages.monitoring.courbes.retardMoyen"),
              "var(--viz-2)",
              (sample) => sample.lag,
            ),
          ]}
        />
        <MetricChart
          title={t("reglages.monitoring.courbes.activite")}
          unit={perBucket}
          times={times}
          domain={domain}
          gapMs={gapMs}
          series={[
            series(
              t("reglages.monitoring.courbes.commandes"),
              "var(--viz-1)",
              (sample) => sample.commands,
            ),
            series(
              t("reglages.monitoring.courbes.interactions"),
              "var(--viz-2)",
              (sample) => sample.interactions,
            ),
          ]}
        />
        <MetricChart
          title={t("reglages.monitoring.courbes.alertesErreurs")}
          unit={perBucket}
          times={times}
          domain={domain}
          gapMs={gapMs}
          series={[
            series(
              t("reglages.monitoring.courbes.alertes"),
              "var(--viz-warn)",
              (sample) => sample.warnings,
            ),
            series(
              t("reglages.monitoring.courbes.erreurs"),
              "var(--viz-crit)",
              (sample) => sample.errors,
            ),
          ]}
        />
        <MetricChart
          title={t("reglages.monitoring.courbes.api")}
          unit={perBucket}
          times={times}
          domain={domain}
          gapMs={gapMs}
          series={[
            series(
              t("reglages.monitoring.courbes.requetes"),
              "var(--viz-1)",
              (sample) => sample.rest,
            ),
          ]}
        />
        <MetricChart
          title={t("reglages.monitoring.courbes.serveurs")}
          unit={t("reglages.monitoring.courbes.serveursUnite")}
          times={times}
          domain={domain}
          gapMs={gapMs}
          zeroBased={false}
          series={[
            series(
              t("reglages.monitoring.courbes.serveursSerie"),
              "var(--viz-1)",
              (sample) => sample.guilds,
            ),
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
          <p className="text-[14px] font-semibold">
            {t("reglages.monitoring.topCommandes.titre")}
          </p>
          <p className="mt-[4px] text-[12px] text-[var(--muted2)]">
            {t("reglages.monitoring.topCommandes.aide")}
          </p>
          {topCommands.length === 0 ? (
            <p className="mt-3 text-[13px] text-[var(--mut)]">
              {t("reglages.monitoring.topCommandes.aucune")}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--bd)]">
              {topCommands.map((command) => (
                <BarRow
                  key={command.name}
                  // `name` identifie la commande (le nom français, clé du
                  // cumul), `label` la nomme dans la langue du site — c'est
                  // sous ce nom-là que le membre la tape.
                  label={`/${command.label ?? command.name}`}
                  value={command.count}
                  max={maxCommand}
                  color="var(--viz-1)"
                  detail={
                    t("reglages.monitoring.topCommandes.detail", {
                      ms: command.avgMs,
                    }) +
                    (command.errors > 0
                      ? t("reglages.monitoring.topCommandes.echecs", {
                          n: command.errors,
                        })
                      : "")
                  }
                />
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
          <p className="text-[14px] font-semibold">
            {t("reglages.monitoring.logs.titre")}
          </p>
          <p className="mt-[4px] text-[12px] text-[var(--muted2)]">
            {t("reglages.monitoring.logs.aide")}
          </p>
          <ul className="mt-3 divide-y divide-[var(--bd)]">
            {LOG_LEVELS.map((level) => (
              <BarRow
                key={level.key}
                label={t(`reglages.monitoring.logs.${level.key}`)}
                value={metrics.totals.logs[level.key]}
                max={maxLog}
                color={level.color}
              />
            ))}
          </ul>
        </div>

        <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
          <p className="text-[14px] font-semibold">
            {t("reglages.monitoring.hote.titre")}
          </p>
          <div className="mt-3 flex flex-col gap-3">
            <Meter
              label={t("reglages.monitoring.hote.memoireVive")}
              used={metrics.system.totalMem - metrics.system.freeMem}
              total={metrics.system.totalMem}
              detail={t("reglages.monitoring.hote.surTotal", {
                utilise: fmtBytes(
                  t,
                  metrics.system.totalMem - metrics.system.freeMem,
                ),
                total: fmtBytes(t, metrics.system.totalMem),
              })}
            />
            {/* Rapporté au plafond de V8 et non à `heapTotal` : cette dernière
                n'est que la réserve du moment, agrandie à la demande — un bot
                parfaitement sain y afficherait 95 % en permanence. */}
            <Meter
              label={t("reglages.monitoring.hote.tasV8")}
              used={metrics.process.heapUsed}
              total={metrics.process.heapLimit}
              detail={t("reglages.monitoring.hote.surTotal", {
                utilise: fmtBytes(t, metrics.process.heapUsed),
                total: fmtBytes(t, metrics.process.heapLimit),
              })}
            />
          </div>
          <div className="mt-2 divide-y divide-[var(--bd)]">
            <Fact
              label={t("reglages.monitoring.hote.charge")}
              value={metrics.system.loadAvg
                .map((value) => value.toFixed(2))
                .join(" · ")}
            />
            <Fact
              label={t("reglages.monitoring.hote.coeurs")}
              value={fmtNumber(format, metrics.system.cpus)}
            />
            <Fact
              label={t("reglages.monitoring.hote.plateforme")}
              value={`${metrics.process.platform} · ${metrics.process.arch}`}
            />
            <Fact
              label={t("reglages.monitoring.hote.node")}
              value={metrics.process.node}
            />
            <Fact
              label={t("reglages.monitoring.hote.pid")}
              value={String(metrics.process.pid)}
            />
          </div>
        </div>

        <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
          <p className="text-[14px] font-semibold">
            {t("reglages.monitoring.instance.titre")}
          </p>
          <div className="mt-2 divide-y divide-[var(--bd)]">
            <Fact
              label={t("reglages.monitoring.instance.base")}
              value={
                metrics.db.bytes === null
                  ? t("reglages.monitoring.instance.tailleInconnue")
                  : fmtBytes(t, metrics.db.bytes)
              }
            />
            <Fact
              label={t("reglages.monitoring.instance.wal")}
              value={
                metrics.db.walBytes === null
                  ? t("reglages.duree.inconnue")
                  : fmtBytes(t, metrics.db.walBytes)
              }
            />
            <Fact
              label={t("reglages.monitoring.instance.reserveTas")}
              value={t("reglages.monitoring.instance.reserveTasValeur", {
                reserve: fmtBytes(t, metrics.process.heapTotal),
                plafond: fmtBytes(t, metrics.process.heapLimit),
              })}
            />
            <Fact
              label={t("reglages.monitoring.instance.horsTas")}
              value={fmtBytes(t, metrics.process.external + metrics.process.arrayBuffers)}
            />
            <Fact
              label={t("reglages.monitoring.instance.connexion")}
              value={fmtDuration(t, metrics.discord.uptimeSeconds)}
            />
            <Fact
              label={t("reglages.monitoring.instance.modulesCharges")}
              value={t("reglages.monitoring.instance.modulesChargesValeur", {
                total: fmtNumber(format, metrics.modules.total),
                internes: fmtNumber(
                  format,
                  metrics.modules.total - metrics.modules.public,
                ),
              })}
            />
            <Fact
              label={t("reglages.monitoring.instance.periode")}
              value={
                metrics.window.samples > 0
                  ? t("reglages.monitoring.instance.periodeValeur", {
                      duree: fmtDuration(t, windowSeconds),
                      mesures: fmtNumber(format, metrics.window.samples),
                      pas: fmtStep(t, bucketMs),
                    })
                  : t("reglages.monitoring.instance.periodeConstitution")
              }
            />
            <Fact
              label={t("reglages.monitoring.instance.historique")}
              value={
                persistence.enabled
                  ? t("reglages.monitoring.instance.historiqueValeur", {
                      jours: persistence.retentionDays,
                      mesures: fmtNumber(format, persistence.stored),
                    })
                  : t("reglages.monitoring.instance.historiqueMemoire")
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
          {t("reglages.monitoring.tableau.titre")}
        </summary>
        {times.length === 0 ? (
          <p className="mt-3 text-[13px] text-[var(--mut)]">
            {t("reglages.monitoring.tableau.aucune")}
          </p>
        ) : (
          <div className="mt-3 max-h-[320px] overflow-auto">
            <table className="w-full min-w-[640px] border-collapse text-[12px] tabular-nums">
              <thead className="sticky top-0 bg-[var(--surf-solid)] text-left text-[var(--mut)]">
                <tr>
                  <th className="py-[6px] pr-3 font-semibold">
                    {t("reglages.monitoring.tableau.heure")}
                  </th>
                  <th className="py-[6px] pr-3 font-semibold">
                    {t("reglages.monitoring.tableau.latence")}
                  </th>
                  <th className="py-[6px] pr-3 font-semibold">
                    {t("reglages.monitoring.tableau.cpu")}
                  </th>
                  <th className="py-[6px] pr-3 font-semibold">
                    {t("reglages.monitoring.tableau.memoire")}
                  </th>
                  <th className="py-[6px] pr-3 font-semibold">
                    {t("reglages.monitoring.tableau.retard")}
                  </th>
                  <th className="py-[6px] pr-3 font-semibold">
                    {t("reglages.monitoring.tableau.cmd")}
                  </th>
                  <th className="py-[6px] pr-3 font-semibold">
                    {t("reglages.monitoring.tableau.inter")}
                  </th>
                  <th className="py-[6px] pr-3 font-semibold">
                    {t("reglages.monitoring.tableau.alertes")}
                  </th>
                  <th className="py-[6px] pr-3 font-semibold">
                    {t("reglages.monitoring.tableau.erreurs")}
                  </th>
                  <th className="py-[6px] font-semibold">
                    {t("reglages.monitoring.tableau.api")}
                  </th>
                </tr>
              </thead>
              <tbody className="text-[var(--tx)]">
                {[...history]
                  .reverse()
                  .slice(0, 40)
                  .map((sample) => (
                    <tr key={sample.t} className="border-t border-[var(--bd)]">
                      <td className="py-[6px] pr-3">
                        {new Date(sample.t).toLocaleTimeString(format)}
                      </td>
                      <td className="py-[6px] pr-3">
                        {sample.ping === null
                          ? t("reglages.duree.inconnue")
                          : `${String(sample.ping)} ms`}
                      </td>
                      <td className="py-[6px] pr-3">{String(sample.cpu)} %</td>
                      <td className="py-[6px] pr-3">{fmtBytes(t, sample.rss)}</td>
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
