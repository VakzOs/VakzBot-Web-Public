'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { canManage, fetchUserGuilds } from '@/lib/discord';
import {
  type ShopItem,
  type ShopItemInput,
  createGuildItem,
  deleteGuildItem,
  publishModule,
  purgeGuild,
  saveModuleConfig,
  setItemLimit,
  toggleModule,
  triggerDeploy,
  updateGuildItem,
} from '@/lib/botApi';

/** Vérifie que l'utilisateur connecté peut bien gérer ce serveur. */
async function assertCanManage(guildId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('non authentifié');
  const guilds = await fetchUserGuilds(session.accessToken);
  const guild = guilds?.find((g) => g.id === guildId && canManage(g));
  if (!guild) throw new Error('accès refusé');
}

export async function toggleModuleAction(
  guildId: string,
  moduleName: string,
  enabled: boolean,
): Promise<{ ok: boolean }> {
  await assertCanManage(guildId);
  const result = await toggleModule(guildId, moduleName, enabled);
  // Pas de revalidatePath : l'affichage optimiste côté client suffit et évite
  // un re-render (donc un rappel de l'API Discord des serveurs) à chaque clic.
  return { ok: result !== null };
}

export async function saveConfigAction(
  guildId: string,
  moduleName: string,
  config: unknown,
): Promise<{ ok: boolean }> {
  await assertCanManage(guildId);
  const result = await saveModuleConfig(guildId, moduleName, config);
  revalidatePath(`/dashboard/${guildId}/${moduleName}`);
  return { ok: result !== null };
}

export async function publishAction(guildId: string, moduleName: string): Promise<{ ok: boolean }> {
  await assertCanManage(guildId);
  const result = await publishModule(guildId, moduleName);
  return { ok: result?.ok === true };
}

export async function purgeGuildAction(guildId: string): Promise<{ ok: boolean }> {
  await assertCanManage(guildId);
  const session = await getSession();
  if (!session) throw new Error('non authentifié');
  // Le bot re-vérifie que cet utilisateur peut gérer le serveur avant de purger.
  const result = await purgeGuild(guildId, session.userId);
  return { ok: result?.ok === true };
}

// --- Catalogue d'objets -----------------------------------------------------

/** Renvoie l'identifiant de l'utilisateur, après vérification de ses droits. */
async function actorForGuild(guildId: string): Promise<string> {
  await assertCanManage(guildId);
  const session = await getSession();
  if (!session) throw new Error('non authentifié');
  return session.userId;
}

export async function createItemAction(
  guildId: string,
  data: ShopItemInput,
): Promise<{ ok: boolean; item?: ShopItem }> {
  const actorId = await actorForGuild(guildId);
  // Le bot re-vérifie les droits de l'acteur et borne les valeurs.
  const result = await createGuildItem(guildId, actorId, data);
  return result ? { ok: true, item: result.item } : { ok: false };
}

export async function updateItemAction(
  guildId: string,
  itemId: string,
  data: ShopItemInput,
): Promise<{ ok: boolean; item?: ShopItem | null }> {
  const actorId = await actorForGuild(guildId);
  const result = await updateGuildItem(guildId, actorId, itemId, data);
  return result ? { ok: true, item: result.item } : { ok: false };
}

export async function deleteItemAction(guildId: string, itemId: string): Promise<{ ok: boolean }> {
  const actorId = await actorForGuild(guildId);
  const result = await deleteGuildItem(guildId, actorId, itemId);
  return { ok: result?.ok === true };
}

/**
 * Fixe le plafond GLOBAL d'objets par serveur. Réservé au propriétaire du bot
 * (le bot revérifie via isOwner). `max` = null => illimité.
 */
export async function setItemLimitAction(
  max: number | null,
): Promise<{ ok: boolean; max?: number | null }> {
  const session = await getSession();
  if (!session) throw new Error('non authentifié');
  const owner = process.env.BOT_OWNER_ID;
  if (!owner || session.userId !== owner) throw new Error('accès refusé');
  const result = await setItemLimit(session.userId, max);
  return result ? { ok: true, max: result.max } : { ok: false };
}

export async function deployAction(guildId: string, branch?: string): Promise<{ ok: boolean }> {
  await assertCanManage(guildId);
  // Le déploiement est réservé au propriétaire du bot : l'UI cache le bouton,
  // mais une action serveur reste un endpoint HTTP — on revérifie ici ET côté bot.
  const session = await getSession();
  if (!session) throw new Error('non authentifié');
  const owner = process.env.BOT_OWNER_ID;
  if (!owner || session.userId !== owner) throw new Error('accès refusé');
  const result = await triggerDeploy(session.userId, branch);
  return { ok: result?.ok === true };
}
