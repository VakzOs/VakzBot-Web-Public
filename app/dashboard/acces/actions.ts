'use server';

import { getSession } from '@/lib/auth';
import {
  type InvitationsState,
  createInviteCode,
  deleteInviteCode,
  dismissInviteRequest,
  replyToRequest,
  setGuildBlocked,
  setInviteRequire,
  setInviteRevoked,
  setInviteSiteUrl,
  setInvitedGuild,
} from '@/lib/invitations';

/**
 * Les actions du panneau « Codes d'accès » du dashboard.
 *
 * Une server action est un endpoint HTTP, pas un bouton : cacher le panneau du
 * propriétaire — ou le ranger derrière une page du dashboard — ne protégerait
 * rien. Chaque action repasse donc par `assertOwner()`, et le bot revérifie de
 * son côté que `x-actor-id` vaut bien `BOT_OWNER_ID` — la garde est doublée
 * parce qu'une seule ne se voit pas quand elle tombe.
 *
 * Ce qui est ouvert à tout compte connecté — présenter un code, déposer une
 * demande — reste dans `app/ajouter` : c'est par définition le geste de
 * quelqu'un qui n'a encore aucun droit ici, et ce n'est pas du dashboard.
 */

/** L'identifiant du propriétaire du bot, ou une erreur. */
async function assertOwner(): Promise<string> {
  const session = await getSession();
  const owner = process.env.BOT_OWNER_ID;
  if (!session || !owner || session.userId !== owner) throw new Error('accès refusé');
  return session.userId;
}

export async function createCodeAction(input: {
  label: string;
  maxUses: number;
  expiresInDays: number;
}): Promise<InvitationsState | null> {
  return createInviteCode(await assertOwner(), input);
}

export async function revokeCodeAction(
  id: string,
  revoked: boolean,
): Promise<InvitationsState | null> {
  return setInviteRevoked(await assertOwner(), id, revoked);
}

export async function deleteCodeAction(id: string): Promise<InvitationsState | null> {
  return deleteInviteCode(await assertOwner(), id);
}

export async function setRequireAction(require: boolean): Promise<InvitationsState | null> {
  return setInviteRequire(await assertOwner(), require);
}

export async function setSiteUrlAction(url: string): Promise<InvitationsState | null> {
  return setInviteSiteUrl(await assertOwner(), url);
}

export type ReplyOutcome =
  | { status: 'ok'; state: InvitationsState; delivered: boolean }
  | { status: 'error' };

/**
 * Répond à une demande. Renvoie l'état ET si le message privé est parti :
 * les deux comptent, et les confondre laisserait croire à un échec quand seule
 * la notification a manqué.
 */
export async function replyRequestAction(input: {
  userId: string;
  message: string;
  code?: string;
}): Promise<ReplyOutcome> {
  const result = await replyToRequest(await assertOwner(), input);
  if (!result) return { status: 'error' };
  const { delivered, ...state } = result;
  return { status: 'ok', state, delivered };
}

export async function dismissRequestAction(userId: string): Promise<InvitationsState | null> {
  return dismissInviteRequest(await assertOwner(), userId);
}

export async function setGuildAction(input: {
  guildId: string;
  allowed: boolean;
  leave?: boolean;
}): Promise<InvitationsState | null> {
  return setInvitedGuild(await assertOwner(), input);
}

/** Ferme l'instance à un serveur, ou la lui rouvre. */
export async function setGuildBlockAction(input: {
  guildId: string;
  blocked: boolean;
  reason?: string;
  leave?: boolean;
}): Promise<InvitationsState | null> {
  return setGuildBlocked(await assertOwner(), input);
}
