import { CLIENT_ID } from './site';

const API = 'https://discord.com/api/v10';

/** Un serveur tel que renvoyé par `GET /users/@me/guilds`. */
export interface Guild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

const MANAGE_GUILD = 1n << 5n;
const ADMINISTRATOR = 1n << 3n;

/** L'utilisateur peut-il configurer ce serveur (Gérer le serveur / Admin / propriétaire) ? */
export function canManage(guild: Guild): boolean {
  if (guild.owner) return true;
  try {
    const perms = BigInt(guild.permissions);
    return (perms & ADMINISTRATOR) !== 0n || (perms & MANAGE_GUILD) !== 0n;
  } catch {
    return false;
  }
}

export function guildIconUrl(guild: Pick<Guild, 'id' | 'icon'>): string | null {
  return guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
    : null;
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'identify guilds',
    state,
    prompt: 'none',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/** Échange le code OAuth2 contre un access token. */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string } | null> {
  const secret = process.env.DISCORD_CLIENT_SECRET;
  if (!secret) return null;
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: secret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as { access_token: string } | null;
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

export async function fetchUser(accessToken: string): Promise<DiscordUser | null> {
  const res = await fetch(`${API}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as DiscordUser | null;
}

/**
 * Cache mémoire des serveurs par token. L'endpoint `/users/@me/guilds` est
 * fortement rate-limité (429) ; sans cache, chaque toggle du dashboard le
 * rappelle et finit par renvoyer `null` → l'utilisateur est renvoyé au login.
 */
const guildsCache = new Map<string, { at: number; guilds: Guild[] }>();
const GUILDS_TTL_MS = 60_000;
/** Borne le cache : évite de garder indéfiniment des access tokens en mémoire. */
const GUILDS_CACHE_MAX = 500;

function evictGuildsCache(): void {
  const now = Date.now();
  for (const [key, entry] of guildsCache) {
    if (now - entry.at > GUILDS_TTL_MS * 5) guildsCache.delete(key);
  }
  // Toujours trop gros ? On retire les plus anciens (ordre d'insertion des Map).
  while (guildsCache.size > GUILDS_CACHE_MAX) {
    const oldest = guildsCache.keys().next().value;
    if (!oldest) break;
    guildsCache.delete(oldest);
  }
}

/** Serveurs de l'utilisateur connecté (token OAuth2), avec cache anti-429. */
export async function fetchUserGuilds(accessToken: string): Promise<Guild[] | null> {
  evictGuildsCache();
  const cached = guildsCache.get(accessToken);
  if (cached && Date.now() - cached.at < GUILDS_TTL_MS) return cached.guilds;

  const res = await fetch(`${API}/users/@me/guilds`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  }).catch(() => null);

  // Erreur transitoire (429, réseau…) : on garde l'ancienne liste si on l'a.
  if (!res?.ok) return cached?.guilds ?? null;

  const data = (await res.json().catch(() => null)) as Guild[] | null;
  if (Array.isArray(data)) {
    guildsCache.set(accessToken, { at: Date.now(), guilds: data });
    return data;
  }
  return cached?.guilds ?? null;
}

/**
 * Identifiants des serveurs où le bot est présent (via DISCORD_BOT_TOKEN).
 * Renvoie `null` si le token n'est pas configuré — le dashboard affiche alors
 * « Ajouter » partout sans distinction.
 */
export async function fetchBotGuildIds(): Promise<Set<string> | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  const res = await fetch(`${API}/users/@me/guilds?limit=200`, {
    headers: { authorization: `Bot ${token}` },
    next: { revalidate: 30 },
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as Array<{ id: string }> | null;
  return Array.isArray(data) ? new Set(data.map((g) => g.id)) : null;
}
