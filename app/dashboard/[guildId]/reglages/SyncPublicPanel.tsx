'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import type { PublishableModule, SyncPublicState, SyncTarget } from '@/lib/botApi';
import { runSyncPublicAction, saveSyncExcludesAction, syncPublicStateAction } from '../actions';

/**
 * Le panneau « Miroir public » : ce qui part sur les dépôts publics, et ce qui reste.
 *
 * Une **fonctionnalité** est une unité qui vit dans DEUX dépôts : son dossier
 * côté bot, ses pages côté dashboard. On la coche une fois, les deux moitiés
 * partent ensemble — retirer le module sans retirer sa page laisserait sur le
 * site public un écran qui ne peut pas fonctionner.
 *
 * Trois garde-fous sont à l'œuvre, et l'écran doit les rendre visibles :
 *   1. une exclusion peut casser la compilation du dépôt public (un fichier
 *      retiré reste importé ailleurs) — le bot dit à l'avance lesquelles ;
 *   2. la liste n'est appliquée qu'une fois ENREGISTRÉE, la publication lisant
 *      la base et non l'écran ;
 *   3. l'hôte CONSTRUIT le snapshot avant de pousser et annule s'il ne compile
 *      pas, ce qui rend la répétition générale sincère plutôt que rassurante.
 */

const CATEGORY_LABELS: Record<string, string> = {
  security: '🛡️ Sécurité & Modération',
  community: '👥 Communauté',
  engagement: '✨ Engagement',
  operations: '⚙️ Opérations',
  fun: '🎮 Fun & Jeux',
};

const CATEGORY_ORDER = ['security', 'community', 'engagement', 'operations', 'fun'];

const TARGET_LABELS: Record<SyncTarget, string> = {
  bot: 'Bot',
  site: 'Dashboard',
};

/** Rythme de rafraîchissement pendant qu'une publication tourne. */
const POLL_MS = 3000;

function fmtDate(value: string | undefined): string {
  if (!value) return 'jamais';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'jamais' : date.toLocaleString('fr-FR');
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Tout ce qui doit partir avec `name`, de proche en proche.
 *
 * Exclure `economy` sans emporter les six modules qui l'importent publierait
 * un dépôt qui ne compile pas. La fermeture est transitive.
 */
function closure(name: string, byName: Map<string, PublishableModule>): string[] {
  const seen = new Set<string>([name]);
  const queue = [name];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const dependent of byName.get(current)?.requiredBy ?? []) {
      if (seen.has(dependent)) continue;
      seen.add(dependent);
      queue.push(dependent);
    }
  }
  seen.delete(name);
  return [...seen];
}

export function SyncPublicPanel({ initial }: { initial: SyncPublicState | null }) {
  const [state, setState] = useState(initial);
  const [features, setFeatures] = useState<Set<string>>(() => new Set(initial?.features ?? []));
  const [extrasBot, setExtrasBot] = useState((initial?.extras?.bot ?? []).join('\n'));
  const [extrasSite, setExtrasSite] = useState((initial?.extras?.site ?? []).join('\n'));
  const [commitMessage, setCommitMessage] = useState('');
  const [target, setTarget] = useState<SyncTarget>('bot');
  const [rejected, setRejected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const modules = useMemo(() => state?.modules ?? [], [state]);
  const byName = useMemo(() => new Map(modules.map((m) => [m.name, m])), [modules]);

  const status = state?.status;
  const result = state?.result;
  // « En cours » vient de l'hôte, pas d'un drapeau local : rouvrir la page
  // pendant une publication doit montrer qu'elle tourne.
  const running = Boolean(
    state?.pending ||
      state?.runningLog ||
      status?.state === 'running' ||
      status?.state === 'pending',
  );

  /**
   * L'écran diffère-t-il de la base ?
   *
   * Question vitale : « Publier » n'envoie que l'ordre, le bot relit la liste
   * EN BASE. Sans ce contrôle, une case cochée sans enregistrer est ignorée en
   * silence — et on cherche pourquoi l'exclusion « ne marche pas ».
   */
  const dirty = useMemo(() => {
    const savedFeatures = new Set(state?.features ?? []);
    if (savedFeatures.size !== features.size) return true;
    for (const name of features) if (!savedFeatures.has(name)) return true;
    const same = (a: string[], b: string[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    return (
      !same(lines(extrasBot), state?.extras?.bot ?? []) ||
      !same(lines(extrasSite), state?.extras?.site ?? [])
    );
  }, [features, extrasBot, extrasSite, state]);

  const refresh = useCallback(async () => {
    const next = await syncPublicStateAction();
    if (next) setState(next);
  }, []);

  // Tant que l'hôte travaille, on redemande : la construction du snapshot dure
  // plusieurs minutes, et le journal est le seul signe de vie pendant ce temps.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, refresh]);

  /** Les fonctionnalités cochées qui casseraient la compilation. */
  const breaking = useMemo(
    () =>
      [...features]
        .map((name) => byName.get(name))
        .filter((m): m is PublishableModule => Boolean(m))
        .filter((m) => m.coreBound || m.requiredBy.some((dep) => !features.has(dep))),
    [features, byName],
  );

  function toggleFeature(entry: PublishableModule, next: boolean) {
    setMessage(null);
    setFeatures((current) => {
      const updated = new Set(current);
      if (next) {
        updated.add(entry.name);
        // Cocher une fonctionnalité dont d'autres dépendent les emporte :
        // laisser l'admin découvrir la dépendance à l'échec du build serait le
        // punir d'une information que le bot a déjà.
        for (const dependent of closure(entry.name, byName)) updated.add(dependent);
      } else {
        updated.delete(entry.name);
      }
      return updated;
    });
  }

  function save() {
    setMessage(null);
    setRejected([]);
    startTransition(async () => {
      const res = await saveSyncExcludesAction([...features], {
        bot: lines(extrasBot),
        site: lines(extrasSite),
      });
      if (!res.ok) {
        setMessage('Le bot est injoignable : la liste n’a pas été enregistrée.');
        return;
      }
      // On réaligne sur ce que le bot a RETENU : une ligne refusée doit
      // disparaître d'elle-même, sans quoi l'écran ment.
      setFeatures(new Set(res.features));
      setExtrasBot(res.extras.bot.join('\n'));
      setExtrasSite(res.extras.site.join('\n'));
      setRejected(res.rejected);
      setMessage(
        res.rejected.length > 0
          ? `Liste enregistrée, ${res.rejected.length} chemin(s) refusé(s).`
          : 'Liste enregistrée.',
      );
      await refresh();
    });
  }

  function run(dryRun: boolean) {
    setMessage(null);
    setConfirming(false);
    startTransition(async () => {
      const res = await runSyncPublicAction(dryRun, target, commitMessage.trim() || undefined);
      setMessage(
        res.ok
          ? dryRun
            ? `Répétition générale (${TARGET_LABELS[target]}) demandée : rien ne sera poussé.`
            : `Publication (${TARGET_LABELS[target]}) demandée.`
          : 'Demande refusée (hôte injoignable, ou une publication est déjà en cours).',
      );
      await refresh();
    });
  }

  const grouped = useMemo(() => {
    const groups = new Map<string, PublishableModule[]>();
    for (const entry of modules) {
      const list = groups.get(entry.category) ?? [];
      list.push(entry);
      groups.set(entry.category, list);
    }
    return CATEGORY_ORDER.filter((id) => groups.has(id)).map((id) => ({
      id,
      label: CATEGORY_LABELS[id] ?? id,
      modules: groups.get(id) ?? [],
    }));
  }, [modules]);

  if (!state) {
    return (
      <div className="rounded-[18px] border border-[var(--bd)] bg-[var(--surf)] p-[22px]">
        <p className="text-[16px] font-bold">Miroir public</p>
        <p className="mt-[6px] text-[14px] text-[var(--mut)]">
          Le bot est injoignable : impossible de lire la liste des fonctionnalités.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-[18px] rounded-[18px] border border-[var(--acc-bd)] bg-[var(--acc-bg)] p-[22px]">
      <div className="max-w-[640px]">
        <p className="text-[16px] font-bold">Ce qui part sur les miroirs publics</p>
        <p className="mt-[6px] text-[14px] text-[var(--mut)]">
          La publication recopie l’état courant d’un dépôt privé en un seul
          commit, sans son historique. Une fonctionnalité décochée est retirée
          des <strong>deux</strong> dépôts : son dossier côté bot, ses pages côté
          dashboard.
        </p>
        <p className="mt-[6px] text-[13px] text-[var(--muted2)]">
          L’hôte construit le résultat avant de pousser et annule s’il ne compile
          pas. La répétition générale fait tout sauf le{' '}
          <code className="code text-[13px]">git push</code>.
        </p>
      </div>

      {/* --- Les fonctionnalités, par catégorie --- */}
      <div className="space-y-[14px]">
        {grouped.map((group) => (
          <div
            key={group.id}
            className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]"
          >
            <p className="text-[14px] font-semibold">{group.label}</p>
            <div className="mt-[10px] grid gap-[8px] sm:grid-cols-2">
              {group.modules.map((entry) => {
                const checked = features.has(entry.name);
                const orphans = entry.requiredBy.filter((dep) => !features.has(dep));
                return (
                  <label
                    key={entry.name}
                    className="flex items-start gap-[10px] rounded-[10px] border border-transparent px-[10px] py-[8px] hover:border-[var(--bd)]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleFeature(entry, e.target.checked)}
                      disabled={pending || running}
                      className="mt-[3px] shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-[14px]">
                        {entry.emoji} {entry.name}
                      </span>
                      {/* Le lien entre les deux dépôts, dit explicitement : une
                          case cochée, ce sont des fichiers des DEUX côtés. */}
                      <span className="mt-[3px] block text-[12px] text-[var(--muted2)]">
                        bot&nbsp;: {entry.botPaths.length} chemin
                        {entry.botPaths.length > 1 ? 's' : ''}
                        {' · '}
                        site&nbsp;:{' '}
                        {entry.webPaths.length > 0
                          ? `${entry.webPaths.length} chemin${entry.webPaths.length > 1 ? 's' : ''}`
                          : 'rien'}
                        {' — '}
                        <span className={checked ? 'text-[#d29922]' : 'text-[var(--muted2)]'}>
                          {checked ? 'non publiée' : 'publiée'}
                        </span>
                      </span>
                      {entry.coreBound ? (
                        <span className="mt-[3px] block text-[12px] text-[#e5534b]">
                          Le cœur du bot l’importe en dur : l’exclure casse la
                          compilation du dépôt public.
                        </span>
                      ) : null}
                      {checked && orphans.length > 0 ? (
                        <span className="mt-[3px] block text-[12px] text-[#d29922]">
                          Encore publié(s) et dépendant(s) : {orphans.join(', ')}.
                        </span>
                      ) : null}
                      {checked && entry.webPaths.length === 0 ? (
                        <span className="mt-[3px] block text-[12px] text-[var(--muted2)]">
                          Rien à retirer côté dashboard.
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* --- Le socle, en lecture seule --- */}
      {state.baseline && state.baseline.length > 0 ? (
        <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
          <p className="text-[14px] font-semibold">Toujours exclu</p>
          <p className="mt-[4px] text-[13px] text-[var(--muted2)]">
            Réglé sur le serveur qui héberge le bot, pas ici : ce qui ne doit
            jamais sortir ne se confie pas à une liste modifiable depuis un
            navigateur. Pour le changer,{' '}
            <code className="code text-[12px]">ALWAYS_EXCLUDES</code> dans l’unit{' '}
            <code className="code text-[12px]">vakzbot-sync.service</code>.
          </p>
          <ul className="mt-[10px] font-mono text-[13px] text-[var(--mut)]">
            {state.baseline.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* --- Les chemins libres, un dépôt à la fois --- */}
      <div className="grid gap-[14px] lg:grid-cols-2">
        {(['bot', 'site'] as const).map((repo) => (
          <div
            key={repo}
            className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]"
          >
            <label className="block text-[14px] font-semibold" htmlFor={`sync-extras-${repo}`}>
              Autres chemins — dépôt {TARGET_LABELS[repo]}
            </label>
            <p className="mt-[4px] text-[13px] text-[var(--muted2)]">
              Un par ligne, relatif à la racine de ce dépôt.{' '}
              <code className="code text-[12px]">*</code> et{' '}
              <code className="code text-[12px]">?</code> sont des jokers.
              Exemple&nbsp;:{' '}
              <code className="code text-[12px]">
                {repo === 'bot' ? 'docs/*.md' : 'app/essais'}
              </code>
            </p>
            <textarea
              id={`sync-extras-${repo}`}
              value={repo === 'bot' ? extrasBot : extrasSite}
              onChange={(e) =>
                repo === 'bot' ? setExtrasBot(e.target.value) : setExtrasSite(e.target.value)
              }
              disabled={pending || running}
              rows={4}
              spellCheck={false}
              className="field mt-[10px] w-full font-mono text-[13px] disabled:opacity-50"
            />
          </div>
        ))}
      </div>

      {rejected.length > 0 ? (
        <div className="rounded-[12px] border border-[#e5534b] bg-[var(--surf)] p-[14px] text-[13px]">
          <p className="font-semibold text-[#e5534b]">Chemins refusés par le bot</p>
          <p className="mt-[4px] text-[var(--mut)]">
            Un chemin ne peut ni commencer par «&nbsp;-&nbsp;» ou «&nbsp;/&nbsp;»,
            ni contenir «&nbsp;..&nbsp;» ou une espace, ni viser{' '}
            <code className="code text-[12px]">.git</code>. En revanche{' '}
            <code className="code text-[12px]">*</code> et{' '}
            <code className="code text-[12px]">?</code> sont des jokers —{' '}
            <code className="code text-[12px]">docs/*.md</code> fonctionne.
          </p>
          <ul className="mt-[6px] font-mono">
            {rejected.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {breaking.length > 0 ? (
        <div className="rounded-[12px] border border-[#d29922] bg-[var(--surf)] p-[14px] text-[13px]">
          <p className="font-semibold text-[#d29922]">
            Ces exclusions casseront probablement la compilation
          </p>
          <ul className="mt-[6px]">
            {breaking.map((entry) => (
              <li key={entry.name}>
                <span className="font-mono">{entry.name}</span>
                {entry.coreBound ? ' — importé en dur par le cœur' : ''}
              </li>
            ))}
          </ul>
          <p className="mt-[6px] text-[var(--mut)]">
            La publication sera annulée par l’hôte au moment de construire. Fais
            une répétition générale pour le vérifier sans rien risquer.
          </p>
        </div>
      ) : null}

      {/* --- Ce qui partirait vraiment --- */}
      {!dirty && state.resolved ? (
        <details className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
          <summary className="cursor-pointer text-[14px] font-semibold">
            Ce qui serait retiré ({state.resolved.bot.length} côté bot,{' '}
            {state.resolved.site.length} côté dashboard)
          </summary>
          <p className="mt-[6px] text-[13px] text-[var(--muted2)]">
            Fonctionnalités résolues en chemins réels. Une case, ce sont souvent
            plusieurs fichiers — schéma et migrations compris.
          </p>
          <div className="mt-[10px] grid gap-[14px] lg:grid-cols-2">
            {(['bot', 'site'] as const).map((repo) => (
              <div key={repo}>
                <p className="text-[13px] font-semibold">{TARGET_LABELS[repo]}</p>
                <ul className="mt-[4px] font-mono text-[12px] text-[var(--mut)]">
                  {state.resolved[repo].length === 0 ? (
                    <li className="font-sans italic">rien d’exclu</li>
                  ) : (
                    state.resolved[repo].map((path) => <li key={path}>{path}</li>)
                  )}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {/* --- Le message du commit publié --- */}
      <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
        <label className="block text-[14px] font-semibold" htmlFor="sync-message">
          Message du commit{' '}
          <span className="font-normal text-[var(--muted2)]">(facultatif)</span>
        </label>
        <p className="mt-[4px] text-[13px] text-[var(--muted2)]">
          Devient le sujet du commit publié. La ligne automatique — date et
          commit privé d’origine — passe en dessous&nbsp;: c’est le seul lien
          entre les deux historiques, on ne la perd jamais.
        </p>
        <input
          id="sync-message"
          type="text"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          disabled={pending || running}
          maxLength={200}
          placeholder="Retire La Chatterie des miroirs publics"
          className="field mt-[10px] w-full text-[14px] disabled:opacity-50"
        />
      </div>

      {/* --- Actions --- */}
      <div className="flex flex-wrap items-center gap-[10px]">
        <button
          type="button"
          onClick={save}
          disabled={pending || running}
          className="rounded-[10px] border border-[var(--bd)] px-[16px] py-[10px] text-[14px] font-semibold disabled:opacity-50"
        >
          {pending ? 'Enregistrement…' : 'Enregistrer la liste'}
        </button>

        <label className="flex items-center gap-2 text-[14px] text-[var(--mut)]">
          Dépôt
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value === 'site' ? 'site' : 'bot')}
            disabled={pending || running}
            className="field w-auto text-[13px] disabled:opacity-50"
          >
            <option value="bot">🤖 Bot</option>
            <option value="site">🖥️ Dashboard</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => run(true)}
          disabled={pending || running || dirty}
          className="rounded-[10px] border border-[var(--bd)] px-[16px] py-[10px] text-[14px] font-semibold disabled:opacity-50"
        >
          Répétition générale
        </button>
        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => run(false)}
              disabled={pending || running || dirty}
              className="rounded-[10px] bg-[#e5534b] px-[18px] py-[10px] text-[14px] font-semibold text-white disabled:opacity-50"
            >
              Confirmer la publication ({TARGET_LABELS[target]})
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-[10px] border border-[var(--bd)] px-[16px] py-[10px] text-[14px] font-semibold"
            >
              Annuler
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={pending || running || dirty}
            className="rounded-[10px] bg-[var(--acc)] px-[18px] py-[10px] text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {running ? 'Publication en cours…' : 'Publier'}
          </button>
        )}
      </div>

      {confirming ? (
        <p className="text-[13px] text-[var(--mut)]">
          La publication est définitive : le dépôt public est lisible par tout le
          monde, et les forks s’y réalignent chaque nuit.
        </p>
      ) : null}

      {dirty ? (
        <p className="text-[13px] text-[#d29922]">
          Modifications non enregistrées. La publication lit la liste telle
          qu’elle est en base — enregistre d’abord, sinon ce que tu vois ici ne
          sera pas appliqué.
        </p>
      ) : null}

      {message ? <p className="text-[13px] text-[var(--mut)]">{message}</p> : null}

      {/* --- Progression --- */}
      {running ? (
        <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
          <p className="text-[14px] font-semibold">
            {status?.dryRun === false ? 'Publication' : 'Répétition générale'} en cours
            {status?.target ? ` — ${TARGET_LABELS[status.target as SyncTarget] ?? status.target}` : ''}
          </p>
          {status?.message ? (
            <p className="mt-[4px] text-[13px] text-[var(--mut)]">{status.message}</p>
          ) : null}
          {state.runningLog ? (
            <pre className="mt-[10px] max-h-[260px] overflow-auto whitespace-pre-wrap rounded-[10px] bg-[var(--bg)] p-[12px] font-mono text-[12px]">
              {state.runningLog}
            </pre>
          ) : null}
        </div>
      ) : null}

      {/* --- Dernier résultat --- */}
      {!running && result ? (
        <div className="rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[16px]">
          <p className="text-[14px] font-semibold">
            {result.status === 'success' ? '✅' : '⚠️'} Dernière exécution —{' '}
            {result.dryRun ? 'répétition générale' : 'publication'}
            {result.target
              ? ` (${TARGET_LABELS[result.target as SyncTarget] ?? result.target})`
              : ''}
            <span className="ml-2 text-[12px] font-normal text-[var(--muted2)]">
              {fmtDate(result.finishedAt)}
            </span>
          </p>
          {result.stat ? (
            <pre className="mt-[10px] max-h-[220px] overflow-auto whitespace-pre-wrap rounded-[10px] bg-[var(--bg)] p-[12px] font-mono text-[12px]">
              {result.stat}
            </pre>
          ) : null}
          {result.status !== 'success' && result.log ? (
            <pre className="mt-[10px] max-h-[220px] overflow-auto whitespace-pre-wrap rounded-[10px] bg-[var(--bg)] p-[12px] font-mono text-[12px]">
              {result.log.slice(-2000)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
