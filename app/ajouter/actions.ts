'use server';

import { getSession } from '@/lib/auth';
import { type RedeemReason, redeemInvite, requestInvite } from '@/lib/invitations';

/**
 * Les actions de la page « Ajouter le bot ».
 *
 * Elles sont ouvertes à tout compte connecté, et c'est voulu : présenter un
 * code ou demander qu'on en tire un, c'est par définition le geste de
 * quelqu'un qui n'a encore aucun droit ici. Ce qui les borne vit côté bot
 * (validité du code, usages restants, cadence des demandes).
 *
 * Ce qui DISTRIBUE les codes — la porte, le générateur, les réponses — n'est
 * pas ici : c'est `app/dashboard/acces`, et chacune de ces actions-là vérifie
 * le propriétaire. Une server action est un endpoint HTTP, pas un bouton :
 * ranger le panneau ailleurs ne protégerait rien, seule la garde protège.
 */

export type RedeemOutcome =
  | { status: 'ok'; minutes: number }
  | { status: 'error'; reason: RedeemReason | 'offline' | 'anonymous' };

/**
 * Présente un code au nom du visiteur connecté.
 *
 * Les minutes restantes sont calculées ici plutôt que rendues telles quelles :
 * une date brute passée au navigateur se formate différemment sur le serveur et
 * chez le lecteur, et c'est l'hydratation qui en fait les frais.
 */
export async function redeemCodeAction(code: string): Promise<RedeemOutcome> {
  const session = await getSession();
  if (!session) return { status: 'error', reason: 'anonymous' };

  const result = await redeemInvite(session.userId, code);
  if (!result) return { status: 'error', reason: 'offline' };
  if (!result.ok) return { status: 'error', reason: result.reason };

  const left = new Date(result.expiresAt).getTime() - Date.now();
  return { status: 'ok', minutes: Math.max(1, Math.round(left / 60_000)) };
}

export type RequestOutcome =
  | { status: 'ok'; notified: boolean }
  | { status: 'error'; reason: 'too_soon' | 'not_needed' | 'offline' | 'anonymous' };

/**
 * Dépose une demande de code au nom du visiteur connecté.
 *
 * Le pseudo part d'ici, pris de la session : le formulaire ne le demande pas,
 * et ne doit pas pouvoir le dicter. Le bot le redemande de toute façon à
 * Discord — celui-ci ne sert que s'il ne voit pas la personne.
 */
export async function requestCodeAction(message: string): Promise<RequestOutcome> {
  const session = await getSession();
  if (!session) return { status: 'error', reason: 'anonymous' };

  const result = await requestInvite(session.userId, session.username, message);
  if (!result) return { status: 'error', reason: 'offline' };
  if (!result.ok) return { status: 'error', reason: result.reason };
  return { status: 'ok', notified: result.notified };
}
