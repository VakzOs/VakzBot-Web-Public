"use client";

import { useId, useMemo, useRef, useState } from "react";

/**
 * Le graphique du panneau Monitoring : une courbe dans le temps, rien d'autre.
 *
 * Trois partis pris qui expliquent la forme du code :
 *
 * 1. **Aucune bibliothèque.** La CSP du site (`next.config.mjs`) n'autorise
 *    aucun script externe, et une courbe reste une liste de points reliés : ce
 *    fichier fait moins de trois cents lignes là où un moteur de graphiques en
 *    ajouterait cent kilo-octets au bundle du dashboard.
 * 2. **Une seule échelle par graphique.** Jamais deux axes verticaux : caler
 *    deux grandeurs différentes sur une même hauteur invente une corrélation
 *    qui n'est pas dans les mesures. Deux grandeurs = deux graphiques.
 * 3. **L'axe du temps est un vrai axe.** Les points se placent à leur
 *    horodatage, pas à leur rang : les mesures n'ont pas toutes le même pas
 *    (quinze secondes pour la journée écoulée, cinq minutes au-delà) et il en
 *    manque là où le bot était arrêté. Au rang, une heure de mesures fines
 *    occuperait la moitié du graphique, et une panne de trois heures
 *    disparaîtrait entre deux points collés.
 * 4. **Le SVG s'étire, ses traits non.** Le tracé vit dans un `viewBox` fixe
 *    déformé par `preserveAspectRatio="none"` — c'est ce qui rend le graphique
 *    fluide sans mesurer la largeur en JavaScript — et `vector-effect` garde
 *    l'épaisseur des traits constante. Aucun texte n'entre dans le SVG : il
 *    subirait la même déformation. Les libellés sont du HTML posé autour.
 */

/** Une série : des valeurs alignées sur les horodatages du graphique. */
export interface ChartSeries {
  label: string;
  /** Couleur de la série (variable CSS du thème). */
  color: string;
  /** Une valeur par horodatage ; `null` = mesure absente, la courbe se coupe. */
  values: (number | null)[];
}

interface MetricChartProps {
  title: string;
  /** Ce que mesure l'axe vertical, en clair (« ms », « % », « / 15 s »). */
  unit: string;
  /** Horodatages, du plus ancien au plus récent. */
  times: number[];
  series: ChartSeries[];
  /** Mise en forme d'une valeur (axe, légende, infobulle). */
  format?: (value: number) => string;
  /** Hauteur de la zone tracée, en pixels. */
  height?: number;
  /** Plancher imposé à l'axe (les débits partent de zéro, les latences non). */
  zeroBased?: boolean;
  /**
   * Bornes de l'axe du temps. Par défaut, la première et la dernière mesure.
   *
   * Les passer explicitement dit la vérité sur une période plus large que
   * l'historique disponible : un bot démarré il y a deux heures laisse alors
   * les cinq jours précédents vides, au lieu d'étirer ses deux heures sur toute
   * la largeur.
   */
  domain?: [number, number];
  /**
   * Écart au-delà duquel la courbe se coupe, en millisecondes.
   *
   * C'est ce qui rend une panne visible : sans lui, les deux mesures qui
   * encadrent trois heures d'arrêt seraient reliées par une droite que personne
   * n'a mesurée.
   */
  gapMs?: number;
}

/** Repère du `viewBox` : arbitraire, puisque le SVG est étiré à la largeur dispo. */
const VIEW_W = 1000;

/**
 * Arrondit une amplitude d'axe à une valeur lisible.
 *
 * Les paliers sont resserrés (jusqu'à 1,5 ou 2,5 × 10ⁿ) parce qu'un axe trop
 * généreux écrase la courbe : une latence qui culmine à 240 ms lue sur un axe
 * gradué jusqu'à 500 semble plate, et c'est précisément le pic qu'on cherchait.
 */
const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

function niceSpan(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = NICE_STEPS.find((candidate) => normalized <= candidate) ?? 10;
  return step * magnitude;
}

function defaultFormat(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString("fr-FR");
}

/**
 * Un instant, écrit selon l'échelle de la période.
 *
 * « 14:32 » suffit sur une heure et ne dit plus rien sur un mois, où les deux
 * bouts de l'axe afficheraient la même heure à trente jours d'intervalle.
 */
function stamp(time: number, spanMs: number): string {
  const date = new Date(time);
  if (spanMs >= 7 * 86_400_000) {
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  }
  const clock = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (spanMs >= 86_400_000) {
    return `${date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${clock}`;
  }
  return clock;
}

export function MetricChart({
  title,
  unit,
  times,
  series,
  format = defaultFormat,
  height = 132,
  zeroBased = true,
  domain,
  gapMs,
}: MetricChartProps) {
  const gradientId = useId();
  const plot = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const scale = useMemo(() => {
    let max = 0;
    let min = Number.POSITIVE_INFINITY;
    for (const entry of series) {
      for (const value of entry.values) {
        if (value === null || !Number.isFinite(value)) continue;
        if (value > max) max = value;
        if (value < min) min = value;
      }
    }
    if (!Number.isFinite(min)) min = 0;
    // Une courbe de latence qui oscille entre 40 et 45 ms est plate sur un axe
    // parti de zéro : on ne force le plancher que là où zéro veut dire quelque
    // chose (un débit), et on garde une marge basse ailleurs.
    const floor = zeroBased ? 0 : Math.max(0, Math.floor(min * 0.85));
    // L'amplitude est arrondie à partir du plancher, pas depuis zéro : sur un
    // axe qui commence à 66, c'est la hauteur de la courbe qui doit tomber
    // juste, pas la graduation d'un zéro qui n'est pas affiché.
    const ceiling = floor + niceSpan(Math.max(max - floor, 1));
    return { min: floor, max: ceiling };
  }, [series, zeroBased]);

  const points = times.length;
  const span = Math.max(1, scale.max - scale.min);

  const first = domain?.[0] ?? times[0] ?? 0;
  const last = domain?.[1] ?? times[times.length - 1] ?? first + 1;
  const timeSpan = Math.max(1, last - first);

  /** Abscisse d'un point : sa place dans le temps. */
  const xAt = (index: number): number => {
    const time = times[index];
    if (time === undefined) return VIEW_W;
    return Math.min(VIEW_W, Math.max(0, ((time - first) / timeSpan) * VIEW_W));
  };

  /** Vrai quand rien n'a été mesuré entre ce point et le précédent. */
  const brokenBefore = (index: number): boolean => {
    if (index === 0 || gapMs === undefined) return false;
    const current = times[index];
    const previous = times[index - 1];
    if (current === undefined || previous === undefined) return false;
    return current - previous > gapMs;
  };
  const yAt = (value: number): number =>
    height - ((value - scale.min) / span) * height;

  /**
   * Le tracé d'une série, coupé à chaque trou.
   *
   * Relier deux points de part et d'autre d'une mesure absente dessinerait une
   * droite que personne n'a mesurée : la coupure dit « on ne sait pas ».
   */
  const pathOf = (values: (number | null)[]): string => {
    let path = "";
    let open = false;
    values.forEach((value, index) => {
      if (value === null || !Number.isFinite(value)) {
        open = false;
        return;
      }
      if (brokenBefore(index)) open = false;
      const command = open ? "L" : "M";
      path += `${command}${xAt(index).toFixed(1)},${yAt(value).toFixed(1)} `;
      open = true;
    });
    return path.trim();
  };

  /** L'aire sous une courbe continue, refermée sur la ligne de base. */
  const areaOf = (values: (number | null)[]): string => {
    const segments: string[] = [];
    let current: string[] = [];
    let firstIndex = 0;
    values.forEach((value, index) => {
      if (value === null || !Number.isFinite(value) || brokenBefore(index)) {
        if (current.length > 1) {
          segments.push(
            `M${xAt(firstIndex).toFixed(1)},${String(height)} ${current.join(" ")} L${xAt(index - 1).toFixed(1)},${String(height)} Z`,
          );
        }
        current = [];
        // Un trou de temps interrompt l'aire mais ne jette pas la mesure : elle
        // ouvre le segment suivant.
        if (value !== null && Number.isFinite(value)) {
          firstIndex = index;
          current.push(`L${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`);
        }
        return;
      }
      if (current.length === 0) firstIndex = index;
      current.push(`L${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`);
    });
    if (current.length > 1) {
      segments.push(
        `M${xAt(firstIndex).toFixed(1)},${String(height)} ${current.join(" ")} L${xAt(values.length - 1).toFixed(1)},${String(height)} Z`,
      );
    }
    return segments.join(" ");
  };

  /** Dernière valeur connue d'une série : ce que la légende affiche. */
  const lastValue = (values: (number | null)[]): number | null => {
    for (let index = values.length - 1; index >= 0; index -= 1) {
      const value = values[index];
      if (value !== null && value !== undefined && Number.isFinite(value)) return value;
    }
    return null;
  };

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const node = plot.current;
    if (!node || points === 0) return;
    const rect = node.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    // On cherche la mesure la plus proche dans le TEMPS, pas le point de même
    // rang : sur une courbe trouée, les deux ne désignent pas le même instant.
    const target = first + ratio * timeSpan;
    let closest = 0;
    let best = Number.POSITIVE_INFINITY;
    times.forEach((time, index) => {
      const distance = Math.abs(time - target);
      if (distance < best) {
        best = distance;
        closest = index;
      }
    });
    setHover(closest);
  };

  const empty = points < 2;
  const hovered = hover !== null && hover >= 0 && hover < points ? hover : null;

  return (
    <figure className="m-0 rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[14px] font-semibold text-[var(--tx)]">{title}</span>
        <span className="text-[12px] text-[var(--muted2)]">{unit}</span>
      </figcaption>

      {/* La légende accompagne toute série multiple : l'identité d'une courbe ne
          doit jamais reposer sur la seule couleur. Elle porte aussi la dernière
          valeur, qui est la question qu'on pose en premier. Sur une série
          unique, la pastille disparaît — le titre dit déjà ce qui est tracé, et
          il ne reste que la valeur du moment. */}
      <ul className="mt-[6px] flex flex-wrap gap-x-4 gap-y-1 p-0 text-[12px]">
        {series.map((entry) => {
          const value = lastValue(entry.values);
          return (
            <li key={entry.label} className="flex items-center gap-[6px]">
              {series.length > 1 ? (
                <span
                  aria-hidden="true"
                  className="inline-block h-[8px] w-[8px] shrink-0 rounded-full"
                  style={{ background: entry.color }}
                />
              ) : null}
              <span className="text-[var(--mut)]">{entry.label}</span>
              <span className="font-semibold tabular-nums text-[var(--tx)]">
                {value === null ? "—" : format(value)}
              </span>
            </li>
          );
        })}
      </ul>

      {empty ? (
        <p className="mt-4 rounded-[10px] border border-dashed border-[var(--bd)] px-4 py-6 text-center text-[13px] text-[var(--mut)]">
          Pas encore assez de mesures pour tracer une courbe. Le bot
          échantillonne toutes les quinze secondes.
        </p>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            {/* Graduations en HTML : dans le SVG étiré, un texte se déformerait. */}
            <div
              className="flex w-[52px] shrink-0 flex-col justify-between py-[1px] text-right text-[11px] tabular-nums text-[var(--muted2)]"
              style={{ height }}
              aria-hidden="true"
            >
              <span>{format(scale.max)}</span>
              <span>{format(scale.min)}</span>
            </div>

            <div
              ref={plot}
              className="relative min-w-0 flex-1"
              style={{ height }}
              onMouseMove={onMove}
              onMouseLeave={() => {
                setHover(null);
              }}
            >
              <svg
                viewBox={`0 0 ${String(VIEW_W)} ${String(height)}`}
                preserveAspectRatio="none"
                className="h-full w-full overflow-visible"
                role="img"
                aria-label={`${title} (${unit})`}
              >
                <defs>
                  {series.map((entry, index) => (
                    <linearGradient
                      key={entry.label}
                      id={`${gradientId}-${String(index)}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={entry.color} stopOpacity="0.16" />
                      <stop offset="100%" stopColor={entry.color} stopOpacity="0.01" />
                    </linearGradient>
                  ))}
                </defs>

                {/* Grille discrète : trois lignes pleines, jamais en pointillé. */}
                {[0, 0.5, 1].map((ratio) => (
                  <line
                    key={ratio}
                    x1="0"
                    x2={VIEW_W}
                    y1={height * ratio}
                    y2={height * ratio}
                    stroke="var(--bd)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}

                {series.map((entry, index) => (
                  <path
                    key={`aire-${entry.label}`}
                    d={areaOf(entry.values)}
                    fill={`url(#${gradientId}-${String(index)})`}
                  />
                ))}
                {series.map((entry) => (
                  <path
                    key={`trait-${entry.label}`}
                    d={pathOf(entry.values)}
                    fill="none"
                    stroke={entry.color}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>

              {/* Curseur : une ligne verticale suit la souris, l'infobulle dit
                  quelles valeurs se lisent à cet instant précis. */}
              {hovered !== null ? (
                <div
                  className="pointer-events-none absolute top-0 w-px bg-[var(--muted2)]"
                  style={{
                    height,
                    left: `${String((xAt(hovered) / VIEW_W) * 100)}%`,
                  }}
                  aria-hidden="true"
                />
              ) : null}
            </div>
          </div>

          <div className="mt-[6px] flex justify-between pl-[60px] text-[11px] tabular-nums text-[var(--muted2)]">
            <span>{stamp(first, timeSpan)}</span>
            <span>{stamp(last, timeSpan)}</span>
          </div>

          {/* L'infobulle sous le graphique plutôt qu'en surimpression : elle ne
              masque jamais la courbe qu'on est en train de lire, et garde la
              même place d'un graphique à l'autre. */}
          <p className="mt-[6px] min-h-[18px] text-[12px] text-[var(--mut)]" aria-live="off">
            {hovered !== null ? (
              <>
                <span className="tabular-nums">
                  {stamp(times[hovered] ?? 0, Math.min(timeSpan, 86_399_000))}
                </span>
                {series.map((entry) => {
                  const value = entry.values[hovered];
                  return (
                    <span key={entry.label} className="ml-3">
                      <span
                        aria-hidden="true"
                        className="mr-[5px] inline-block h-[8px] w-[8px] rounded-full align-[-1px]"
                        style={{ background: entry.color }}
                      />
                      {value === null || value === undefined
                        ? "—"
                        : `${format(value)} ${unit}`}
                    </span>
                  );
                })}
              </>
            ) : null}
          </p>
        </>
      )}
    </figure>
  );
}
