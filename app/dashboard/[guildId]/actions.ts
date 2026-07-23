'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { canManage, fetchUserGuilds } from '@/lib/discord';
import {
  publishModule,
  purgeGuild,
  saveModuleConfig,
  toggleModule,
  triggerDeploy,
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

export async function publishAction(
  guildId: string,
  moduleName: string,
): Promise<{ ok: boolean }> {
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

export async function deployAction(
  guildId: string,
  branch?: string,
): Promise<{ ok: boolean }> {
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
