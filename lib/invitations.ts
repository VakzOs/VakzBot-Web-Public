/**
 * Client serveur vers les endpoints d'invitation du bot.
 *
 * Volontairement séparé de `lib/botApi.ts`, et il ne s'agit pas d'un oubli :
 * cette fonctionnalité est propre à une instance et n'a pas vocation à être
 * publiée. Rassemblée dans un fichier à elle — comme ses pages, ses textes et
 * son module côté bot — elle se retire d'un dépôt sans laisser un import
 * orphelin dans un fichier partagé. Le prix est une quinzaine de lignes
 * d'appel HTTP en double ; c'est moins cher qu'un fichier commun qu'on ne peut
 * plus exclure.
 *
 * Comme `botApi.ts`, ce module lit `BOT_API_TOKEN` : il ne s'importe que depuis
 * un composant serveur, une server action ou une route `app/api/**`. Depuis un
 * `'use client'`, on n'en importe que des **types**.
 */

const BASE = process.env.BOT_API_URL?.replace(/\/+$/, '');
const TOKEN = process.env.BOT_API_TOKEN;

export function invitationsConfigured(): boolean {
  return Boolean(BASE && TOKEN);
}

async function call<T>(path: string, init?: RequestInit, actorId?: string): Promise<T | null> {
  if (!BASE || !TOKEN) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        // Qui agit. Le bot re-vérifie de son côté que c'est bien le
        // propriétaire pour tout ce qui est réservé : masquer un bouton ne
        // protège rien, et une server action est un endpoint HTTP.
        ...(actorId ? { 'x-actor-id': actorId } : {}),
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

/** Ce qui empêche un code de servir. `null` tant qu'il sert encore. */
export type CodeProblem = 'revoked' | 'expired' | 'exhausted';

export interface InviteCode {
  id: string;
  code: string;
  label: string;
  /** Serveurs que ce code peut ouvrir. `0` = sans limite. */
  maxUses: number;
  uses: number;
  /** Codes présentés sur le site et pas encore employés : ils réservent un usage. */
  pending: number;
  problem: CodeProblem | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * Un serveur tel que le panneau le montre.
 *
 * La liste n'est pas celle des autorisations mais leur UNION avec ce que
 * Discord montre : un serveur entré quand la porte était ouverte n'a aucune
 * autorisation à son nom, et c'est pourtant celui-là qu'on vient chercher le
 * jour où l'on veut faire sortir le bot. D'où deux drapeaux plutôt qu'un —
 * `present` dit où est le bot, `invited` ce qui lui a été donné, et les quatre
 * combinaisons existent.
 */
export interface BotGuild {
  guildId: string;
  name: string;
  icon: string | null;
  /** Le bot y est-il encore ? Une autorisation survit à un départ. */
  present: boolean;
  /**
   * Une autorisation est-elle écrite à son nom ? Non = entré porte ouverte.
   *
   * Absent tant que le bot n'est pas passé à la version qui le rend : le site
   * se déploie en une minute, lui au rythme de son updater.
   */
  invited?: boolean;
  /** Taille du serveur, quand le bot y est. */
  members: number | null;
  ownerId: string | null;
  /** Pseudo de qui possède le serveur : c'est à lui qu'on parle avant de partir. */
  owner: string | null;
  /** Arrivée du bot sur le serveur. */
  joinedAt: string | null;
  codeId: string | null;
  code: string | null;
  /** Mémo du code (« pour Léa ») : à qui ce serveur avait été ouvert. */
  codeLabel: string;
  userId: string | null;
  /** Pseudo de qui a présenté le code. */
  addedBy: string | null;
  /** Date de l'autorisation. `null` quand il n'y en a pas. */
  createdAt: string | null;
  /**
   * L'instance lui est-elle fermée ?
   *
   * Un blocage l'emporte sur tout le reste : porte ouverte comprise, code
   * encore valide compris. Absent tant que le bot n'est pas passé à la version
   * qui le rend.
   */
  blocked?: boolean;
  /** Pourquoi, pour le propriétaire du bot seul. Jamais dit au serveur. */
  blockedReason?: string;
  blockedAt?: string | null;
}

/**
 * Une demande de code, telle que le propriétaire la lit.
 *
 * `username` est le pseudo de session au moment de la demande ; `name`, `tag`,
 * `avatar` et `accountCreatedAt` viennent de Discord, redemandés par le bot.
 * Tout ce second groupe peut être `null` — Discord ne répond pas toujours — et
 * le premier reste alors le repli.
 */
export interface InviteRequest {
  userId: string;
  /** Pseudo au moment de la demande. */
  username: string;
  message: string;
  createdAt: string;
  /** Nom affiché sur Discord. */
  name: string | null;
  tag: string | null;
  avatar: string | null;
  /** Création du compte Discord : un compte du jour n'est pas un compte de 2017. */
  accountCreatedAt: string | null;
  /** Ce que le propriétaire a répondu. Vide tant qu'il n'a pas répondu. */
  reply: string;
  /** Le code accordé, s'il l'a été. */
  grantedCode: string;
  /** Null tant que la demande attend. */
  answeredAt: string | null;
}

export interface InvitationsState {
  /** Faut-il un code pour ajouter le bot ? */
  require: boolean;
  /** L'adresse du site, telle que le bot la cite à qui n'a pas de code. */
  siteUrl: string;
  /** Durée de validité d'un code présenté, en minutes. */
  claimMinutes: number;
  /** Demandes en attente, la plus ancienne d'abord : l'ordre où répondre. */
  requests: InviteRequest[];
  codes: InviteCode[];
  guilds: BotGuild[];
}

const OWNER = '/api/owner/invitations';

/** L'état complet du panneau du propriétaire. */
export function getInvitations(actorId: string): Promise<InvitationsState | null> {
  return call<InvitationsState>(OWNER, undefined, actorId);
}

function post(path: string, actorId: string, body: unknown): Promise<InvitationsState | null> {
  return call<InvitationsState>(path, { method: 'POST', body: JSON.stringify(body) }, actorId);
}

export function createInviteCode(
  actorId: string,
  input: { label: string; maxUses: number; expiresInDays: number },
): Promise<InvitationsState | null> {
  return post(OWNER, actorId, input);
}

export function setInviteRevoked(
  actorId: string,
  id: string,
  revoked: boolean,
): Promise<InvitationsState | null> {
  return post(`${OWNER}/revoke`, actorId, { id, revoked });
}

export function deleteInviteCode(actorId: string, id: string): Promise<InvitationsState | null> {
  return post(`${OWNER}/delete`, actorId, { id });
}

export function setInviteRequire(
  actorId: string,
  require: boolean,
): Promise<InvitationsState | null> {
  return post(`${OWNER}/require`, actorId, { require });
}

export function setInviteSiteUrl(actorId: string, url: string): Promise<InvitationsState | null> {
  return post(`${OWNER}/site`, actorId, { url });
}

/**
 * Autorise un serveur sans code, ou retire son autorisation — et fait partir le
 * bot si on le demande : retirer l'autorisation d'un serveur où il est déjà ne
 * l'en fait pas sortir.
 */
export function setInvitedGuild(
  actorId: string,
  input: { guildId: string; allowed: boolean; leave?: boolean },
): Promise<InvitationsState | null> {
  return post(`${OWNER}/guild`, actorId, input);
}

/**
 * Ferme l'instance à un serveur, ou la lui rouvre.
 *
 * Bloquer retire l'autorisation au passage et fait sortir le bot si on le
 * demande : sans cela, faire partir un serveur ne valait qu'un instant — rien
 * n'empêchait de l'y remettre dans la minute.
 */
export function setGuildBlocked(
  actorId: string,
  input: { guildId: string; blocked: boolean; reason?: string; leave?: boolean },
): Promise<InvitationsState | null> {
  return post(`${OWNER}/block`, actorId, input);
}

/**
 * Répond à une demande : un mot, un code, ou les deux.
 *
 * `delivered` dit si le message privé est parti. Il échoue dès qu'aucun serveur
 * n'est commun — le cas de tous ceux qui demandent un code — et ce n'est pas
 * une perte : la réponse attend son auteur sur le site.
 */
export function replyToRequest(
  actorId: string,
  input: { userId: string; message: string; code?: string },
): Promise<(InvitationsState & { delivered: boolean }) | null> {
  return call<InvitationsState & { delivered: boolean }>(
    `${OWNER}/reply`,
    { method: 'POST', body: JSON.stringify(input) },
    actorId,
  );
}

/** Écarte une demande : elle a donné son code, ou elle n'aura pas de suite. */
export function dismissInviteRequest(
  actorId: string,
  userId: string,
): Promise<InvitationsState | null> {
  return post(`${OWNER}/request`, actorId, { userId });
}

/** Faut-il un code sur cette instance ? `null` si le bot est injoignable. */
export function getInviteRequirement(): Promise<{ require: boolean } | null> {
  return call<{ require: boolean }>('/api/invitations');
}

/** Pourquoi un code n'a pas été accepté. */
export type RedeemReason = 'unknown' | CodeProblem;

export type RedeemResponse =
  | { ok: true; expiresAt: string }
  | { ok: false; reason: RedeemReason };

/** Ma propre demande, et ce qu'on m'a répondu. */
export interface MyRequest {
  message: string;
  createdAt: string;
  reply: string;
  grantedCode: string;
  answeredAt: string | null;
}

/**
 * La demande du visiteur connecté, s'il en a une.
 *
 * C'est par là que la réponse du propriétaire atteint vraiment son
 * destinataire : le message privé du bot échoue dès qu'aucun serveur n'est
 * commun, ce qui est le cas de quiconque demande un code.
 */
export async function getMyRequest(actorId: string): Promise<MyRequest | null> {
  const body = await call<{ request: MyRequest | null }>('/api/invitations/mine', undefined, actorId);
  return body?.request ?? null;
}

export type RequestResponse =
  | { ok: true; notified: boolean; cooldownMinutes: number }
  | { ok: false; reason: 'too_soon' | 'not_needed' };

/**
 * Dépose une demande de code. Le bot l'écrit, puis prévient le propriétaire en
 * message privé — `notified` dit si ce message est bien parti ; la demande, elle,
 * est gardée dans tous les cas.
 */
export function requestInvite(
  actorId: string,
  username: string,
  message: string,
): Promise<RequestResponse | null> {
  return call<RequestResponse>(
    '/api/invitations/request',
    { method: 'POST', body: JSON.stringify({ username, message }) },
    actorId,
  );
}

/**
 * Présente un code au nom d'un membre. Le bot garde la promesse une demi-heure,
 * le temps d'aller choisir son serveur chez Discord.
 */
export function redeemInvite(actorId: string, code: string): Promise<RedeemResponse | null> {
  return call<RedeemResponse>('/api/invitations/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }, actorId);
}
