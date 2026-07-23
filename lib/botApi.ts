/**
 * Client serveur vers l'API HTTP du bot (VPS). Jamais appelé depuis le
 * navigateur : le token reste secret côté serveur.
 *
 * Variables d'environnement (Vercel) :
 * - BOT_API_URL   : URL publique de l'API du bot (ex. http://IP:3210).
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

export function saveModuleConfig(
  guildId: string,
  moduleName: string,
  config: unknown,
): Promise<ApiModule | null> {
  return call<ApiModule>(`/api/guilds/${guildId}/modules/${moduleName}/config`, {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
}

export interface DeployState {
  branches: string[];
  status: { phase?: string; state?: string; message?: string; updatedAt?: string } | null;
  result: { status?: string; commit?: string; finishedAt?: string } | null;
}

export function getDeploy(): Promise<DeployState | null> {
  return call<DeployState>('/api/deploy');
}

export function triggerDeploy(
  actorId: string,
  branch?: string,
): Promise<{ ok: boolean } | null> {
  return call<{ ok: boolean }>(
    '/api/deploy',
    { method: 'POST', body: JSON.stringify(branch ? { branch } : {}) },
    actorId,
  );
}
