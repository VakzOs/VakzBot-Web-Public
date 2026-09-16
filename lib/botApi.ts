/**
 * Client serveur vers l'API HTTP du bot (VPS). Jamais appelé depuis le
 * navigateur : le token reste secret côté serveur.
 *
 * Variables d'environnement (Vercel) :
 * - BOT_API_URL   : URL publique HTTPS de l'API du bot
 *                   (ex. https://meowapi.tondomaine.com). Le token part dans
 *                   l'en-tête Authorization : jamais de http:// en clair.
 * - BOT_API_TOKEN : même valeur que WEB_API_TOKEN côté bot.
 */
const BASE = process.env.BOT_API_URL?.replace(/\/+$/, '');
const TOKEN = process.env.BOT_API_TOKEN;

export function botApiConfigured(): boolean {
  return Boolean(BASE && TOKEN);
}

export type ConfigFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'color'
  | 'channel'
  | 'voiceChannel'
  | 'category'
  | 'role'
  | 'channels'
  | 'roles'
  | 'select'
  | 'multiselect'
  | 'tags'
  | 'list';

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Valeur par défaut à la création d'une nouvelle ligne de liste. */
  default?: unknown;
  /** Type `list` : sous-champs de chaque ligne (clé « pointée » possible). */
  item?: ConfigField[];
  /** Type `list` : clé d'identifiant auto-généré à la création d'une ligne. */
  idKey?: string;
  /** Type `list` : libellé du bouton d'ajout. */
  addLabel?: string;
}

/** Une action ponctuelle d'un module, rendue comme un bouton (voir le bot). */
export interface ModuleAction {
  id: string;
  label: string;
  help: string | null;
  style: 'primary' | 'secondary' | 'danger';
  /** Si présent, on demande confirmation avant de lancer l'action. */
  confirm: string | null;
  /** Champs à saisir avant de lancer l'action. */
  fields: ConfigField[] | null;
}

export interface ConfigGroup {
  key?: string;
  label?: string;
  description?: string;
  fields: ConfigField[];
}

export interface ApiModule {
  name: string;
  label: string;
  description: string;
  category: string;
  emoji: string;
  enabled: boolean;
  config: Record<string, unknown>;
  configUI: ConfigGroup[] | null;
  publishable?: boolean;
  actions?: ModuleAction[];
}

export interface GuildChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
}
export interface GuildRole {
  id: string;
  name: string;
  color: number;
}
export interface GuildMeta {
  channels: GuildChannel[];
  roles: GuildRole[];
}

export interface GuildModules {
  guild: { id: string; name: string } | null;
  botPresent: boolean;
  modules: ApiModule[];
}

async function call<T>(path: string, init?: RequestInit, actorId?: string): Promise<T | null> {
  if (!BASE || !TOKEN) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        // Identité de l'utilisateur qui agit : le bot re-vérifie ses droits
        // (propriétaire du serveur / du bot) côté serveur, sans se fier au seul token.
        ...(actorId ? { 'x-actor-id': actorId } : {}),
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

export function getGuildModules(guildId: string): Promise<GuildModules | null> {
  return call<GuildModules>(`/api/guilds/${guildId}/modules`);
}

export function toggleModule(
  guildId: string,
  moduleName: string,
  enabled: boolean,
): Promise<ApiModule | null> {
  return call<ApiModule>(`/api/guilds/${guildId}/modules/${moduleName}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export function publishModule(
  guildId: string,
  moduleName: string,
): Promise<{ ok: boolean; error?: string } | null> {
  return call<{ ok: boolean; error?: string }>(
    `/api/guilds/${guildId}/modules/${moduleName}/publish`,
    { method: 'POST', body: '{}' },
  );
}

/**
 * Lance une action de module. Contrairement à `call`, on garde le corps même en
 * cas d'échec : le bot y met le message à afficher à l'admin (« aucun salon
 * configuré », « source injoignable »…).
 */
export async function runModuleAction(
  guildId: string,
  moduleName: string,
  actionId: string,
  actorId: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; message: string | null }> {
  if (!BASE || !TOKEN) return { ok: false, message: null };
  try {
    const res = await fetch(
      `${BASE}/api/guilds/${guildId}/modules/${moduleName}/actions/${actionId}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TOKEN}`,
          'content-type': 'application/json',
          'x-actor-id': actorId,
        },
        body: JSON.stringify({ input }),
        cache: 'no-store',
      },
    );
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      message?: string | null;
    } | null;
    return { ok: res.ok && body?.ok === true, message: body?.message ?? null };
  } catch {
    return { ok: false, message: null };
  }
}

export function purgeGuild(
  guildId: string,
  actorId: string,
): Promise<{ ok: boolean; deleted?: number } | null> {
  return call<{ ok: boolean; deleted?: number }>(
    `/api/guilds/${guildId}/purge`,
    { method: 'POST', body: '{}' },
    actorId,
  );
}

export function getGuildMeta(guildId: string): Promise<GuildMeta | null> {
  return call<GuildMeta>(`/api/guilds/${guildId}/meta`);
}

/** Un champ refusé par la validation du bot (chemin dans la config + raison). */
export interface ConfigIssue {
  path: string;
  message: string;
}

/**
 * Issue d'un enregistrement. On distingue « le bot n'a pas répondu » de « le bot
 * a répondu et a refusé » : confondre les deux ferait accuser le réseau alors
 * que c'est la config qui est en cause (ou un bot pas encore à jour).
 */
export type SaveResult =
  | { ok: true }
  | { ok: false; reason: 'unreachable' }
  | { ok: false; reason: 'rejected'; status: number; issues: ConfigIssue[] };

/**
 * Enregistre la config d'un module. En cas de refus, on garde le corps de la
 * réponse : le bot y liste les champs fautifs, seule façon pour l'admin de
 * savoir quoi corriger maintenant que le dashboard est le seul point d'entrée.
 */
export async function saveModuleConfig(
  guildId: string,
  moduleName: string,
  config: unknown,
): Promise<SaveResult> {
  if (!BASE || !TOKEN) return { ok: false, reason: 'unreachable' };
  try {
    const res = await fetch(`${BASE}/api/guilds/${guildId}/modules/${moduleName}/config`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ config }),
      cache: 'no-store',
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { issues?: ConfigIssue[] } | null;
    return { ok: false, reason: 'rejected', status: res.status, issues: body?.issues ?? [] };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}

// --- Catalogue d'objets (module « Objets ») ---------------------------------

/** Raretés reconnues (de la plus commune à la plus rare). */
export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Effet déclenché à l'utilisation d'un objet (`/utiliser`). */
/**
 * Un effet à l'utilisation. Le site ne connaît pas la forme de chaque type :
 * elle est décrite par `effectsUI`, servi par le bot avec le catalogue.
 */
export type ItemEffect = { type: string } & Record<string, unknown>;

/** Contrôle à afficher pour un champ d'effet (voir `effects-ui.ts` du bot). */
export type EffectFieldType =
  | 'number'
  | 'percent'
  | 'text'
  | 'textarea'
  | 'role'
  | 'item'
  | 'select';

/** Un champ éditable d'un effet. */
export interface EffectField {
  key: string;
  label: string;
  type: EffectFieldType;
  /** Valeur posée à la création de l'effet. */
  default: string | number;
  help?: string;
  placeholder?: string;
  /** Types `number` / `percent`. */
  min?: number;
  max?: number;
  /** Types `text` / `textarea`. */
  maxLength?: number;
  /** Type `select` : choix possibles. */
  options?: { value: string; label: string }[];
  /** Largeur sur une grille de 6 colonnes (défaut : pleine largeur). */
  span?: number;
}

/** Description d'un type d'effet, telle que servie par le bot. */
export interface EffectSpec {
  type: string;
  label: string;
  help: string;
  /** `required` = `/utiliser` exige un membre visé. */
  target: 'none' | 'required' | 'option';
  fields: EffectField[];
}

/** Un objet du catalogue tel que renvoyé/édité par l'API du bot. */
export interface ShopItem {
  id: string;
  name: string;
  emoji: string;
  description: string;
  rarity: string;
  price: number;
  buyable: boolean;
  tradable: boolean;
  droppable: boolean;
  usable: boolean;
  roleReward: string | null;
  /** Effets à l'utilisation, sérialisés en JSON (voir ItemEffect). */
  effects: string;
  /** true = consommé (supprimé) à l'usage ; false = réutilisable. */
  consumable: boolean;
  /** Délai (s) entre deux usages si non consommable (0 = aucun). */
  cooldownSeconds: number;
}

/** Données éditables d'un objet (création : `name` obligatoire côté serveur). */
export type ShopItemInput = Partial<Omit<ShopItem, 'id'>>;

export interface ItemsList {
  items: ShopItem[];
  /** Nombre maximum d'objets, ou `null` si illimité. */
  max: number | null;
  /**
   * Effets disponibles et leurs champs. Absent si le bot est antérieur à
   * l'éditeur générique : l'éditeur d'effets est alors masqué.
   */
  effectsUI?: EffectSpec[];
}

export function getGuildItems(guildId: string): Promise<ItemsList | null> {
  return call<ItemsList>(`/api/guilds/${guildId}/items`);
}

export function createGuildItem(
  guildId: string,
  actorId: string,
  data: ShopItemInput,
): Promise<{ item: ShopItem } | null> {
  return call<{ item: ShopItem }>(
    `/api/guilds/${guildId}/items`,
    { method: 'POST', body: JSON.stringify(data) },
    actorId,
  );
}

export function updateGuildItem(
  guildId: string,
  actorId: string,
  itemId: string,
  data: ShopItemInput,
): Promise<{ item: ShopItem | null } | null> {
  return call<{ item: ShopItem | null }>(
    `/api/guilds/${guildId}/items/${itemId}`,
    { method: 'POST', body: JSON.stringify(data) },
    actorId,
  );
}

export function deleteGuildItem(
  guildId: string,
  actorId: string,
  itemId: string,
): Promise<{ ok: boolean } | null> {
  return call<{ ok: boolean }>(
    `/api/guilds/${guildId}/items/${itemId}`,
    { method: 'DELETE' },
    actorId,
  );
}

/** Fixe le plafond GLOBAL d'objets par serveur (propriétaire uniquement). */
export function setItemLimit(
  actorId: string,
  max: number | null,
): Promise<{ max: number | null } | null> {
  return call<{ max: number | null }>(
    '/api/items/limit',
    { method: 'POST', body: JSON.stringify({ max }) },
    actorId,
  );
}

/**
 * Façon de reconstruire demandée à l'updater hôte, côté bot.
 *
 * - `full` : `docker compose up -d --build --force-recreate` — tous les
 *   conteneurs sont recréés, le bot redémarre à coup sûr. C'est le défaut, et
 *   ce qu'un bot antérieur à ce champ fait de toute façon.
 * - `cache` : `docker compose up -d --build bot` — seul le service du bot est
 *   visé, et le conteneur n'est recréé que si l'image a réellement changé. Une
 *   mise à jour sans changement ne coupe donc pas le bot.
 */
export type DeployMode = 'full' | 'cache';

export interface DeployState {
  /** Les branches du dépôt, à défaut le repli `DEPLOY_BRANCHES` du bot. */
  branches: string[];
  /**
   * Quand la liste a été récupérée sur le dépôt. `null` = jamais : on regarde
   * alors le repli du `.env`, pas l'état réel du dépôt.
   *
   * Absente d'un bot antérieur : le bouton de récupération reste alors masqué.
   */
  fetchedAt?: string | null;
  status: {
    /** Étape en cours : picked_up, fetching, switching, pulling, building… */
    phase?: string;
    /** running | success | failure. */
    state?: string;
    message?: string;
    branch?: string;
    /** Mode de reconstruction. Absent d'un bot ou d'un updater antérieurs. */
    mode?: string;
    requestedAt?: string;
    updatedAt?: string;
  } | null;
  result: {
    status?: string;
    branch?: string;
    /** Commit AVANT la mise à jour : sans lui, « ça a marché » ne dit pas quoi. */
    beforeCommit?: string;
    commit?: string;
    /** Mode de reconstruction appliqué. Absent d'un updater antérieur. */
    mode?: string;
    finishedAt?: string;
    /** Fin du journal de l'updater. Absent d'un bot antérieur. */
    log?: string;
  } | null;
  /**
   * Journal de la mise à jour EN COURS, `null` si rien ne tourne.
   *
   * Le résultat n'arrive qu'à la fin : sans ce journal, une mise à jour est une
   * minute de silence. Absent d'un bot antérieur — le suivi se limite alors aux
   * étapes.
   */
  runningLog?: string | null;
}

export function getDeploy(actorId?: string): Promise<DeployState | null> {
  return call<DeployState>('/api/deploy', undefined, actorId);
}

/** Ce que rend une demande de récupération des branches. */
export interface BranchRefresh {
  /** L'updater hôte a répondu. `false` = personne à l'écoute, liste inchangée. */
  ok: boolean;
  branches: string[];
  fetchedAt: string | null;
}

/**
 * Redemande la liste des branches au dépôt.
 *
 * Le bot ne la connaît pas lui-même : il passe la commande à l'updater hôte,
 * seul à avoir le dépôt et les identifiants git, et attend sa réponse. D'où un
 * appel qui peut prendre quelques secondes.
 */
export function refreshDeployBranches(actorId: string): Promise<BranchRefresh | null> {
  return call<BranchRefresh>('/api/deploy/branches', { method: 'POST' }, actorId);
}

/**
 * Déclenche une mise à jour. `mode` est toujours envoyé : un bot qui ne connaît
 * pas encore le champ l'ignore et reconstruit complètement, ce qui est
 * justement `full`.
 */
export function triggerDeploy(
  actorId: string,
  branch?: string,
  mode: DeployMode = 'full',
): Promise<{ ok: boolean } | null> {
  return call<{ ok: boolean }>(
    '/api/deploy',
    { method: 'POST', body: JSON.stringify({ ...(branch ? { branch } : {}), mode }) },
    actorId,
  );
}

// --- Tâches planifiées -------------------------------------------------------

export interface BotTask {
  name: string;
  /** Expression cron déclarée par le module, `null` si inconnue. */
  cron: string | null;
  module: string | null;
}

/**
 * Les tâches que le planificateur exécute **réellement**.
 *
 * Ce n'est pas la même chose que ce que la configuration laisse supposer : une
 * expression cron invalide est ignorée en silence, et la tâche correspondante
 * n'apparaît alors simplement pas.
 */
export function getBotTasks(actorId: string): Promise<{ tasks: BotTask[] } | null> {
  return call<{ tasks: BotTask[] }>('/api/tasks', undefined, actorId);
}

// --- Logs du bot -------------------------------------------------------------

/** Une ligne du tampon de logs du bot. */
export interface BotLogRecord {
  /** Horodatage en millisecondes. */
  time: number;
  /** Niveau pino : 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal. */
  level: number;
  /** Module émetteur, quand la ligne en porte un. */
  scope?: string;
  msg: string;
  /** Message de l'erreur attachée, le cas échéant. */
  err?: string;
}

/** Les six niveaux pino, du plus bavard au plus grave. */
export const BOT_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
export type BotLogLevel = (typeof BOT_LOG_LEVELS)[number];

/**
 * Ce que l'archive du bot contient RÉELLEMENT.
 *
 * Le dashboard s'en sert pour n'offrir que les dates qui existent : promettre
 * un calendrier ouvert alors que la rétention s'arrête à trente jours ne
 * produirait que des pages vides sans explication.
 */
export interface BotLogArchive {
  enabled: boolean;
  /** Nombre de jours gardés. 0 quand l'archive est désactivée. */
  retentionDays: number;
  /** Niveau plancher archivé : en dessous, rien n'est gravé sur disque. */
  minLevel: BotLogLevel;
  /** Jours disponibles (`YYYY-MM-DD`), du plus récent au plus ancien. */
  days: string[];
  /** Occupation disque réelle de l'archive, en octets. */
  bytes: number;
}

export interface BotLogs {
  logs: BotLogRecord[];
  /** Qui a répondu : le tampon mémoire (« maintenant ») ou l'archive (un jour donné). */
  source: 'buffer' | 'archive';
  /** Jour lu, quand la source est l'archive. */
  date?: string;
  /** Taille du tampon : au-delà, les lignes les plus anciennes sont perdues. */
  capacity: number;
  /** Lignes actuellement en mémoire (source `buffer`). */
  buffered?: number;
  /** Horodatage de la plus ancienne ligne en mémoire (source `buffer`). */
  oldest?: number | null;
  archive: BotLogArchive;
}

export interface BotLogQuery {
  limit?: number;
  /** Niveaux cochés. Vide = tous. */
  levels?: readonly BotLogLevel[];
  /** Jour à lire (`YYYY-MM-DD`). Absent = tampon mémoire, c'est-à-dire « maintenant ». */
  date?: string;
  /** Recherche plein texte : module, message ou message d'erreur. */
  search?: string;
}

/**
 * Les logs du bot, à deux distances derrière la même fonction.
 *
 * Sans `date`, c'est le tampon mémoire : les dernières lignes, vidées à chaque
 * redémarrage — un hublot sur ce qui vient de se passer. Avec une `date`, c'est
 * l'archive sur disque du bot, qui survit aux redémarrages et remonte jusqu'à
 * sa rétention. La réponse dit toujours laquelle a répondu.
 *
 * Réservé au propriétaire — les logs d'une instance multi-serveurs parlent de
 * tous les serveurs à la fois.
 */
export function getBotLogs(
  actorId: string,
  options: BotLogQuery = {},
): Promise<BotLogs | null> {
  const query = new URLSearchParams();
  if (options.limit !== undefined) query.set('limit', String(options.limit));
  if (options.levels?.length) query.set('levels', options.levels.join(','));
  if (options.date) query.set('date', options.date);
  if (options.search) query.set('search', options.search);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return call<BotLogs>(`/api/logs${suffix}`, undefined, actorId);
}

// --- Monitoring de l'instance ------------------------------------------------

/** Un point de l'historique du bot. Tout y est déjà agrégé sur l'intervalle. */
export interface BotMetricSample {
  /** Fin de l'intervalle, en millisecondes. */
  t: number;
  /** Mémoire résidente du process, en octets. */
  rss: number;
  /** Tas V8 utilisé, en octets. */
  heap: number;
  /** Part de CPU consommée, en % d'un cœur (100 = un cœur plein). */
  cpu: number;
  /** Retard de la boucle d'évènements, en millisecondes. */
  lag: number;
  /** Latence de la passerelle Discord. `null` tant qu'aucun heartbeat n'est revenu. */
  ping: number | null;
  guilds: number;
  members: number;
  commands: number;
  interactions: number;
  errors: number;
  warnings: number;
  /** Requêtes envoyées à l'API Discord pendant l'intervalle. */
  rest: number;
  rateLimits: number;
}

/** Ce qu'on sait d'une slash command depuis le démarrage du bot. */
export interface BotCommandMetric {
  name: string;
  module: string | null;
  count: number;
  errors: number;
  avgMs: number;
  lastAt: number | null;
}

/**
 * Une période observée : deux instants, en millisecondes.
 *
 * Le bot ne connaît pas « hier » ni « le mois » — il ne saurait pas dans quel
 * fuseau les entendre. C'est le panneau qui calcule ses bornes dans le fuseau du
 * navigateur ; le bot se contente de les borner et de rendre ce qu'il a.
 */
export interface MetricsWindow {
  from: number;
  to: number;
}

/**
 * L'état de santé de l'instance : jauges de l'instant ET historique.
 *
 * L'historique est écrit en base par le bot : il **survit à ses redémarrages**,
 * dans la limite de sa rétention (`METRICS_RETENTION_DAYS`). Quand celle-ci est
 * nulle — ou que la base ne répond pas — le bot retombe sur son tampon mémoire
 * d'une heure et le dit dans `persistence`, pour que le panneau ne promette
 * jamais un passé qu'il n'a pas.
 */
export interface BotMetrics {
  /** Horodatage de la lecture, côté bot : origine des axes de temps. */
  now: number;
  /** Démarrage du process courant, en millisecondes. */
  startedAt: number;
  /** Pas d'échantillonnage : inutile d'interroger le bot plus souvent. */
  sampleIntervalMs: number;
  /** La fenêtre effectivement rendue. */
  window: {
    from: number;
    to: number;
    /** Durée couverte par un point de l'historique : le pas, ou un multiple. */
    bucketMs: number;
    /** Nombre de mesures brutes agrégées. */
    samples: number;
    /** Vrai quand le début de la période manque : trop de mesures à porter. */
    truncated: boolean;
  };
  /** Ce que le bot garde réellement. */
  persistence: {
    /** Faux quand l'historique n'est qu'un tampon mémoire, perdu au redémarrage. */
    enabled: boolean;
    retentionDays: number;
    /** Échantillons stockés, toutes fenêtres confondues. */
    stored: number;
    /** Plus ancienne mesure disponible, en millisecondes. */
    oldest: number | null;
  };
  process: {
    uptimeSeconds: number;
    pid: number;
    node: string;
    platform: string;
    arch: string;
    version: string | null;
    rss: number;
    heapUsed: number;
    /** Réserve actuelle de V8 pour le tas — pas un plafond : elle s'agrandit. */
    heapTotal: number;
    /** Plafond réel du tas (`--max-old-space-size`) : le seul vrai dénominateur. */
    heapLimit: number;
    external: number;
    arrayBuffers: number;
    cpuPercent: number;
    eventLoopLagMs: number;
    eventLoopLagMaxMs: number;
  };
  system: {
    totalMem: number;
    freeMem: number;
    cpus: number;
    loadAvg: number[];
  };
  discord: {
    ready: boolean;
    ping: number | null;
    uptimeSeconds: number | null;
    guilds: number;
    members: number;
    channels: number;
    status: number;
  };
  /** Compteurs de la FENÊTRE demandée, et non « depuis le démarrage ». */
  totals: {
    commands: number;
    interactions: number;
    components: number;
    modals: number;
    autocomplete: number;
    commandErrors: number;
    restRequests: number;
    rateLimits: number;
    logs: Record<BotLogLevel, number>;
  };
  /** Commandes les plus appelées, cumul de toute la vie de l'instance. */
  commands: BotCommandMetric[];
  /** Tâches réellement enregistrées par le planificateur. */
  tasks: number;
  modules: { total: number; public: number; commands: number };
  db: { bytes: number | null; walBytes: number | null };
  /** L'historique, du plus ancien au plus récent. */
  history: BotMetricSample[];
}

/**
 * L'état de santé du bot, réservé au propriétaire : ces chiffres couvrent tous
 * les serveurs à la fois et décrivent la machine hôte.
 */
export function getMetrics(
  actorId: string,
  window?: MetricsWindow,
): Promise<BotMetrics | null> {
  const query = window
    ? `?from=${String(Math.round(window.from))}&to=${String(Math.round(window.to))}`
    : '';
  return call<BotMetrics>(`/api/metrics${query}`, undefined, actorId);
}

// --- Gacha : plafond de souhaits ---------------------------------------------

/**
 * Plafond de souhaits par membre, GLOBAL au bot.
 *
 * La liste de souhaits vaut sur tous les serveurs : son plafond aussi. Un
 * plafond par serveur ne contraindrait que le geste d'ajouter — on atteindrait
 * la limite ici, on irait ajouter ailleurs, et tout resterait actif partout.
 */
export function getWishlistLimit(): Promise<{ max: number } | null> {
  return call<{ max: number }>('/api/gacha/wishlist-limit');
}

export function setWishlistLimit(
  actorId: string,
  max: number,
): Promise<{ max: number } | null> {
  return call<{ max: number }>(
    '/api/gacha/wishlist-limit',
    { method: 'POST', body: JSON.stringify({ max }) },
    actorId,
  );
}

// --- Statuts de profil du bot (propriétaire) ---------------------------------

/**
 * Les « messages de profil » : le statut personnalisé affiché sous le nom du
 * bot. Il vaut pour tous les serveurs — un seul bot, un seul statut — donc il se
 * règle une fois pour l'instance, pas serveur par serveur.
 *
 * Lecture comprise, le bot exige le propriétaire : le token dit « le site
 * parle », pas QUI parle. D'où l'`actorId` sur le GET.
 */
export interface PresenceState {
  /** Liste en vigueur (celle du dashboard, ou celle d'origine si jamais réglée). */
  lines: string[];
  /** Liste d'origine, pour pouvoir y revenir. */
  defaults: string[];
  /** Statut réellement affiché en ce moment. */
  current: string | null;
  maxLines: number;
  maxLength: number;
}

export function getPresence(actorId: string): Promise<PresenceState | null> {
  return call<PresenceState>('/api/presence', undefined, actorId);
}

export function setPresence(actorId: string, lines: string[]): Promise<PresenceState | null> {
  return call<PresenceState>(
    '/api/presence',
    { method: 'POST', body: JSON.stringify({ lines }) },
    actorId,
  );
}

// --- Redémarrage périodique du bot (propriétaire) ----------------------------

/**
 * Cadence de redémarrage. Le bot ne se relance pas lui-même : il s'arrête
 * proprement et le superviseur (docker `restart: unless-stopped`, systemd, pm2)
 * le remonte.
 */
export interface RestartState {
  auto: boolean;
  cron: string;
  lastRestartAt: string | null;
  /** Démarrage du processus courant : l'uptime se calcule à partir de là. */
  startedAt: string;
  /** La tâche est-elle réellement enregistrée côté planificateur ? */
  scheduled: boolean;
  presets: { label: string; cron: string }[];
}

export function getRestart(actorId: string): Promise<RestartState | null> {
  return call<RestartState>('/api/restart', undefined, actorId);
}

export type RestartResult =
  | { ok: true; state: RestartState; restarting: boolean }
  | { ok: false; error: string };

/**
 * Règle la cadence, et/ou redémarre tout de suite.
 *
 * Comme l'import du gacha, cet appel **remonte le code d'erreur** du bot : le
 * planificateur ignorant en silence une expression cron qu'il ne comprend pas,
 * on doit pouvoir dire « expression invalide » plutôt que de laisser croire à un
 * redémarrage programmé qui ne tomberait jamais.
 */
export async function setRestart(
  actorId: string,
  patch: { auto?: boolean; cron?: string; now?: boolean },
): Promise<RestartResult> {
  if (!BASE || !TOKEN) return { ok: false, error: 'unavailable' };
  try {
    const res = await fetch(`${BASE}/api/restart`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'x-actor-id': actorId,
      },
      body: JSON.stringify(patch),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as
      | (RestartState & { error?: string; restarting?: boolean })
      | null;
    if (!res.ok || !body) return { ok: false, error: body?.error ?? 'unavailable' };
    return { ok: true, state: body, restarting: body.restarting === true };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

// --- Gacha : personnages maison ---------------------------------------------

export interface GachaCharacter {
  id: string;
  guildId: string | null;
  source: string;
  /** Univers de tirage : anime | jeu. Les deux catalogues se tirent séparément. */
  universe: string;
  name: string;
  series: string;
  imageUrl: string;
  gender: string;
  rank: number;
  value: number;
  rarity: string;
  isAdult: boolean;
  disabled: boolean;
}

/**
 * Ce qu'un serveur peut renseigner. Ni `rank` ni `value` : ils découlent de la
 * rareté choisie, par la même échelle que le catalogue importé. Les laisser
 * saisir permettrait de créer un personnage maison qui sortirait plus souvent
 * que les stars.
 */
export interface GachaCharacterInput {
  name?: string;
  series?: string;
  imageUrl?: string;
  gender?: string;
  rarity?: string;
  isAdult?: boolean;
  universe?: string;
}

export interface GachaCharacters {
  characters: GachaCharacter[];
  rarities: string[];
}

export function getGuildGachaCharacters(guildId: string): Promise<GachaCharacters | null> {
  return call<GachaCharacters>(`/api/guilds/${guildId}/gacha/characters`);
}

export function createGachaCharacter(
  guildId: string,
  actorId: string,
  data: GachaCharacterInput,
): Promise<{ character: GachaCharacter } | null> {
  return call<{ character: GachaCharacter }>(
    `/api/guilds/${guildId}/gacha/characters`,
    { method: 'POST', body: JSON.stringify(data) },
    actorId,
  );
}

export function updateGachaCharacter(
  guildId: string,
  actorId: string,
  characterId: string,
  data: GachaCharacterInput,
): Promise<{ character: GachaCharacter | null } | null> {
  return call<{ character: GachaCharacter | null }>(
    `/api/guilds/${guildId}/gacha/characters/${characterId}`,
    { method: 'POST', body: JSON.stringify(data) },
    actorId,
  );
}

export function deleteGachaCharacter(
  guildId: string,
  actorId: string,
  characterId: string,
): Promise<{ ok: boolean } | null> {
  return call<{ ok: boolean }>(
    `/api/guilds/${guildId}/gacha/characters/${characterId}`,
    { method: 'DELETE' },
    actorId,
  );
}

// --- Gacha : import du catalogue (propriétaire du bot) -----------------------

export interface GachaImportState {
  auto: boolean;
  cron: string;
  /**
   * Cadences proposées par le bot. Absentes d'une version antérieure du bot :
   * le panneau n'affiche alors simplement pas de raccourcis.
   */
  presets?: { label: string; cron: string }[];
  lastRunAt: string | null;
  running: boolean;
}

export function getGachaImport(): Promise<GachaImportState | null> {
  return call<GachaImportState>('/api/gacha/import');
}

export type GachaImportResult =
  | { ok: true; state: GachaImportState }
  | { ok: false; error: string };

/**
 * Règle la planification, et/ou lance un import tout de suite.
 *
 * Contrairement aux autres appels, celui-ci **remonte le code d'erreur** du bot
 * plutôt que de se contenter d'un échec muet : c'est ce qui permet de dire
 * « cette expression cron est invalide » au lieu de laisser croire à un import
 * programmé qui ne tournerait jamais, le planificateur du bot ignorant en
 * silence une expression qu'il ne comprend pas.
 */
export async function setGachaImport(
  actorId: string,
  patch: { auto?: boolean; cron?: string; run?: boolean },
): Promise<GachaImportResult> {
  if (!BASE || !TOKEN) return { ok: false, error: 'unavailable' };
  try {
    const res = await fetch(`${BASE}/api/gacha/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'x-actor-id': actorId,
      },
      body: JSON.stringify(patch),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as
      | (GachaImportState & { error?: string })
      | null;
    if (!res.ok || !body) return { ok: false, error: body?.error ?? 'unavailable' };
    return { ok: true, state: body };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

// --- Sauvegarde du serveur ---------------------------------------------------

/** Réglages de sauvegarde d'un serveur (voir le module `configbackup` du bot). */
export interface BackupSettings {
  /** Sauvegarde automatique selon `cron`. */
  auto: boolean;
  /** Expression cron à 5 champs, évaluée dans le fuseau du bot. */
  cron: string;
  /** Nombre de sauvegardes conservées sur le disque du bot. */
  keep: number;
  /** Inclure les données des membres (argent, objets, Route…). */
  includeData: boolean;
  /** Salon où déposer une copie du fichier. `null` = aucun. */
  channelId: string | null;
  /** Dernière exécution (ms epoch, 0 = jamais). */
  lastRunAt: number;
  lastStatus: '' | 'ok' | 'error';
  lastError: string;
  lastFile: string;
}

/** Une sauvegarde présente sur le disque du bot. */
export interface StoredBackup {
  name: string;
  size: number;
  createdAt: string;
}

/** Bilan d'une sauvegarde lancée depuis le dashboard. */
export interface BackupRun {
  ok: boolean;
  error?: string;
  file?: string;
  size?: number;
  modules?: number;
  rows?: number;
  pruned?: number;
  delivered?: boolean;
}

export interface BackupState {
  settings: BackupSettings;
  backups: StoredBackup[];
  totalSize: number;
  /** Cadences proposées par le bot (l'expression reste libre). */
  presets: { label: string; cron: string }[];
  /** Tables volontairement hors sauvegarde, pour pouvoir le dire à l'admin. */
  excludedTables: string[];
  /** Présent quand l'appel a aussi lancé une sauvegarde. */
  run?: BackupRun | null;
}

export function getGuildBackup(guildId: string, actorId: string): Promise<BackupState | null> {
  return call<BackupState>(`/api/guilds/${guildId}/backup`, undefined, actorId);
}

/** Issue d'un enregistrement de réglages (ou d'une sauvegarde à la demande). */
export type BackupSaveResult =
  | { ok: true; state: BackupState }
  | { ok: false; error: string };

/**
 * Enregistre les réglages, et/ou lance une sauvegarde tout de suite.
 *
 * Comme pour l'import du gacha, on **remonte le code d'erreur** du bot : il
 * refuse une expression cron qu'il ne saurait pas exécuter, et l'admin doit
 * l'apprendre maintenant plutôt qu'en constatant, des semaines plus tard,
 * qu'aucune sauvegarde n'a jamais tourné.
 */
export async function setGuildBackup(
  guildId: string,
  actorId: string,
  patch: {
    auto?: boolean;
    cron?: string;
    keep?: number;
    includeData?: boolean;
    channelId?: string | null;
    run?: boolean;
  },
): Promise<BackupSaveResult> {
  if (!BASE || !TOKEN) return { ok: false, error: 'unavailable' };
  try {
    const res = await fetch(`${BASE}/api/guilds/${guildId}/backup`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'x-actor-id': actorId,
      },
      body: JSON.stringify(patch),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as (BackupState & { error?: string }) | null;
    if (!res.ok || !body) return { ok: false, error: body?.error ?? 'unavailable' };
    return { ok: true, state: body };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

/** Bilan d'une restauration, tel que le bot le renvoie. */
export interface RestoreResult {
  applied: string[];
  skippedUnknown: string[];
  skippedInvalid: string[];
  fromOtherGuild: boolean;
  hadReferences: boolean;
  references: {
    rolesCreated: number;
    rolesReused: number;
    channelsCreated: number;
    channelsReused: number;
    failed: number;
  };
  hadData: boolean;
  data: { total: number; inserted: Record<string, number>; skippedTables: string[] } | null;
}

export type RestoreOutcome =
  | { ok: true; result: RestoreResult }
  | { ok: false; error: string };

/** Restaure le serveur depuis une sauvegarde déjà déposée sur le bot. */
export async function restoreGuildBackup(
  guildId: string,
  actorId: string,
  input: { file: string; recreate: boolean; data: boolean },
): Promise<RestoreOutcome> {
  if (!BASE || !TOKEN) return { ok: false, error: 'unavailable' };
  try {
    const res = await fetch(`${BASE}/api/guilds/${guildId}/backup/restore`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'x-actor-id': actorId,
      },
      body: JSON.stringify(input),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: RestoreResult;
      error?: string;
    } | null;
    if (!res.ok || !body?.ok || !body.result) {
      return { ok: false, error: body?.error ?? 'unavailable' };
    }
    return { ok: true, result: body.result };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

/**
 * Restaure depuis un fichier téléversé par l'admin. Le corps part **brut** :
 * une sauvegarde complète dépasse vite la limite d'une action serveur Next, et
 * la ré-encapsuler en JSON la ferait grossir pour rien.
 */
export async function uploadGuildBackup(
  guildId: string,
  actorId: string,
  file: ArrayBuffer,
  opts: { recreate: boolean; data: boolean },
): Promise<RestoreOutcome> {
  if (!BASE || !TOKEN) return { ok: false, error: 'unavailable' };
  const query = `?recreate=${opts.recreate ? '1' : '0'}&data=${opts.data ? '1' : '0'}`;
  try {
    const res = await fetch(`${BASE}/api/guilds/${guildId}/backup/upload${query}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/octet-stream',
        'x-actor-id': actorId,
      },
      body: file,
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: RestoreResult;
      error?: string;
    } | null;
    if (!res.ok || !body?.ok || !body.result) {
      return { ok: false, error: body?.error ?? 'unavailable' };
    }
    return { ok: true, result: body.result };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

export function deleteGuildBackup(
  guildId: string,
  actorId: string,
  name: string,
): Promise<{ ok: boolean } | null> {
  return call<{ ok: boolean }>(
    `/api/guilds/${guildId}/backup/files/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
    actorId,
  );
}

/**
 * Récupère le fichier lui-même, pour le renvoyer au navigateur. Le token du bot
 * ne quittant jamais le serveur, le téléchargement passe forcément par ici.
 */
export async function fetchGuildBackupFile(
  guildId: string,
  actorId: string,
  name: string,
): Promise<Response | null> {
  if (!BASE || !TOKEN) return null;
  try {
    const res = await fetch(
      `${BASE}/api/guilds/${guildId}/backup/files/${encodeURIComponent(name)}`,
      {
        headers: { authorization: `Bearer ${TOKEN}`, 'x-actor-id': actorId },
        cache: 'no-store',
      },
    );
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/** Un serveur figurant dans la liste d'autorisation de La Chatterie. */
export interface ChatterieGuildAccess {
  id: string;
  /** Le nom quand le bot connaît le serveur, son identifiant sinon. */
  name: string;
  icon: string | null;
}

/**
 * La liste d'AUTORISATION de La Chatterie, réservée au propriétaire du bot.
 *
 * Vide, le jeu est ouvert partout ; non vide, seuls les serveurs qui y figurent
 * y ont accès. L'API répond 403 à tout autre acteur.
 */
export function getChatterieAccess(
  actorId: string,
): Promise<{ guilds: ChatterieGuildAccess[]; allowed: string[] } | null> {
  return call<{ guilds: ChatterieGuildAccess[]; allowed: string[] }>(
    '/api/owner/chatterie-access',
    undefined,
    actorId,
  );
}

export function setChatterieAccess(
  actorId: string,
  guildId: string,
  allowed: boolean,
): Promise<{ allowed: string[] } | null> {
  return call<{ allowed: string[] }>(
    '/api/owner/chatterie-access',
    { method: 'POST', body: JSON.stringify({ guildId, allowed }) },
    actorId,
  );
}

/**
 * Efface les parties de La Chatterie d'un serveur. Réservé au propriétaire du
 * bot, et volontairement limité à un serveur nommé.
 */
export function wipeChatterie(
  actorId: string,
  guildId: string,
): Promise<{ deleted: number } | null> {
  return call<{ deleted: number }>(
    '/api/owner/chatterie-wipe',
    { method: 'POST', body: JSON.stringify({ guildId }) },
    actorId,
  );
}

/** Les deux dépôts publiables : le bot, et le dashboard. */
export const SYNC_TARGETS = ['bot', 'site'] as const;
export type SyncTarget = (typeof SYNC_TARGETS)[number];

/**
 * Une fonctionnalité, vue par l'écran de publication.
 *
 * Elle occupe des chemins dans DEUX dépôts : le bot et le site. Les premiers
 * sont déduits du code par le bot, les seconds déclarés par le module — le bot
 * ne lit pas le dépôt du dashboard.
 */
export interface PublishableModule {
  name: string;
  category: string;
  emoji: string;
  /** Exclue des deux miroirs à la fois. */
  excluded: boolean;
  /** Ce qu'elle occupe dans le dépôt du bot. */
  botPaths: string[];
  /** Ce qu'elle occupe dans le dépôt du site. Vide = rien côté dashboard. */
  webPaths: string[];
  /**
   * Le cœur du bot l'importe en dur : l'exclure casse la compilation du dépôt
   * public tant que le couplage n'est pas défait.
   */
  coreBound: boolean;
  /** Modules qui importent celui-ci ; ils doivent partir avec lui. */
  requiredBy: string[];
}

export interface SyncPublicState {
  modules: PublishableModule[];
  /** Les fonctionnalités exclues, par nom. */
  features: string[];
  /** Chemins libres — ce qui n'appartient à aucune fonctionnalité. */
  extras: Record<SyncTarget, string[]>;
  /**
   * Ce qui partirait vraiment pour chaque dépôt, fonctionnalités résolues.
   *
   * C'est la seule façon de vérifier AVANT de publier qu'une case cochée
   * recouvre bien ce qu'on croit : une case, ce sont huit chemins.
   */
  resolved: Record<SyncTarget, string[]>;
  /**
   * Le socle réglé sur l'hôte (`ALWAYS_EXCLUDES`) : toujours exclu, quoi que
   * dise la liste. Non modifiable d'ici — ce qui ne doit jamais sortir ne se
   * confie pas à un navigateur. `null` tant qu'aucune publication n'a eu lieu.
   */
  baseline?: string[] | null;
  /** Une publication attend déjà l'hôte : en relancer une n'aurait pas de sens. */
  pending: boolean;
  status: {
    phase?: string;
    state?: string;
    message?: string;
    dryRun?: boolean;
    target?: string;
    requestedAt?: string;
    updatedAt?: string;
  } | null;
  result: {
    status?: string;
    dryRun?: boolean;
    target?: string;
    finishedAt?: string;
    /** Le `git show --stat` de ce qui a été publié. */
    stat?: string;
    log?: string;
  } | null;
  /** Journal de la publication EN COURS, `null` si rien ne tourne. */
  runningLog?: string | null;
}

/**
 * L'état de la publication vers les miroirs publics. Réservé au propriétaire
 * du bot : l'API répond 403 à tout autre acteur.
 */
export function getSyncPublic(actorId: string): Promise<SyncPublicState | null> {
  return call<SyncPublicState>('/api/owner/sync-public', undefined, actorId);
}

/**
 * Enregistre la liste des chemins à ne pas publier.
 *
 * `rejected` nomme les motifs refusés par le bot. Les fondre dans un simple
 * échec priverait l'admin du seul message qui dit quoi corriger — une case qui
 * ne reste pas cochée, sans explication, est un bug aux yeux de qui l'utilise.
 */
export function setSyncExcludes(
  actorId: string,
  features: string[],
  extras: Record<SyncTarget, string[]>,
): Promise<{
  features: string[];
  extras: Record<SyncTarget, string[]>;
  rejected: string[];
} | null> {
  return call<{
    features: string[];
    extras: Record<SyncTarget, string[]>;
    rejected: string[];
  }>('/api/owner/sync-public', { method: 'POST', body: JSON.stringify({ features, extras }) }, actorId);
}

/**
 * Demande la publication à l'hôte. `dryRun` prépare tout sans pousser — c'est
 * le défaut, ici comme côté bot : le miroir est public, un push ne se reprend
 * pas.
 */
export function runSyncPublic(
  actorId: string,
  dryRun: boolean,
  target: SyncTarget,
  message?: string,
): Promise<{ ok: boolean; requestedAt: string; dryRun: boolean } | null> {
  return call<{ ok: boolean; requestedAt: string; dryRun: boolean }>(
    '/api/owner/sync-public/run',
    { method: 'POST', body: JSON.stringify({ dryRun, target, message }) },
    actorId,
  );
}
