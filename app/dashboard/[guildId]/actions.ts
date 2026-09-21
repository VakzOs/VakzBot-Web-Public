'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { requestLocale } from '@/lib/i18n';
import {
  PUBLISH_ACTION,
  SCOPE_LANGUE,
  SCOPE_SAUVEGARDE,
  modulePermission,
  requireAccess,
  requireModuleAction,
  requireOpenModule,
} from '@/lib/access';
import {
  type Grade,
  type BackupSaveResult,
  type BackupState,
  type BotLogQuery,
  type BotLogs,
  type BotMetrics,
  type MetricsWindow,
  type GachaCharacter,
  type GachaCharacterInput,
  type BranchRefresh,
  type DeployState,
  type GachaImportResult,
  type PresenceState,
  type RestartResult,
  type RestoreOutcome,
  type SaveResult,
  type ShopItem,
  type ShopItemInput,
  type SyncPublicState,
  type SyncTarget,
  getSyncPublic,
  runSyncPublic,
  setSyncExcludes,
  createGachaCharacter,
  createGuildItem,
  deleteGachaCharacter,
  deleteGuildBackup,
  deleteGuildItem,
  getBotLogs,
  getDeploy,
  getMetrics,
  getGuildBackup,
  publishModule,
  purgeGuild,
  restoreGuildBackup,
  runModuleAction,
  saveModuleConfig,
  setGachaImport,
  setGuildBackup,
  setGuildLocale,
  refreshDeployBranches,
  setItemLimit,
  setPresence,
  setRestart,
  setWishlistLimit,
  toggleModule,
  triggerDeploy,
  updateGachaCharacter,
  updateGuildItem,
  setChatterieAccess,
  setGuildGrades,
  wipeChatterie,
} from '@/lib/botApi';

/**
 * Le nom des modules dont le dashboard porte une page à part : leur permission
 * ne se déduit pas de l'URL comme celle d'une page de module.
 */
const MODULE_OBJETS = 'items';
const MODULE_GACHA = 'gacha';

export async function toggleModuleAction(
  guildId: string,
  moduleName: string,
  enabled: boolean,
): Promise<{ ok: boolean }> {
  const actorId = await requireAccess(guildId, modulePermission(moduleName));
  const result = await toggleModule(guildId, moduleName, enabled, actorId);
  // Pas de revalidatePath : l'affichage optimiste côté client suffit et évite
  // un re-render (donc un rappel de l'API Discord des serveurs) à chaque clic.
  return { ok: result !== null };
}

export async function saveConfigAction(
  guildId: string,
  moduleName: string,
  config: unknown,
): Promise<SaveResult> {
  const actorId = await requireOpenModule(guildId, moduleName);
  const result = await saveModuleConfig(guildId, moduleName, config, actorId);
  revalidatePath(`/dashboard/${guildId}/${moduleName}`);
  return result;
}

export async function publishAction(guildId: string, moduleName: string): Promise<{ ok: boolean }> {
  // Publier un panneau est un geste : il se délègue sous son propre nom.
  const actorId = await requireModuleAction(guildId, moduleName, PUBLISH_ACTION);
  const result = await publishModule(guildId, moduleName, actorId);
  return { ok: result?.ok === true };
}

/**
 * Lance une action de module (publier, tester, envoyer maintenant…). Le message
 * renvoyé vient du bot et est affiché tel quel à l'admin.
 */
export async function runModuleActionAction(
  guildId: string,
  moduleName: string,
  actionId: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; message: string | null }> {
  const actorId = await requireModuleAction(guildId, moduleName, actionId);
  const result = await runModuleAction(guildId, moduleName, actionId, actorId, input);
  // L'action peut avoir modifié la config (messageId publié, salon piège créé…).
  revalidatePath(`/dashboard/${guildId}/${moduleName}`);
  return result;
}

/**
 * Change la langue dans laquelle le bot parle sur ce serveur.
 *
 * C'est un réglage de serveur : la même garde que le reste du dashboard, plus
 * l'identité de l'acteur, que le bot revérifie de son côté. Pas de
 * `revalidatePath` — le sélecteur reflète déjà le choix, et un re-render
 * rappellerait l'API des serveurs de Discord pour rien.
 */
export async function setBotLocaleAction(
  guildId: string,
  locale: string,
): Promise<{ ok: boolean; locale?: string }> {
  const actorId = await requireAccess(guildId, SCOPE_LANGUE);
  const result = await setGuildLocale(guildId, locale, actorId);
  return { ok: result?.ok === true, ...(result?.locale ? { locale: result.locale } : {}) };
}

export async function purgeGuildAction(guildId: string): Promise<{ ok: boolean }> {
  // Irréversible : réservé aux administrateurs du serveur, jamais délégué.
  await requireAccess(guildId);
  const session = await getSession();
  if (!session) throw new Error('non authentifié');
  // Le bot re-vérifie que cet utilisateur peut gérer le serveur avant de purger.
  const result = await purgeGuild(guildId, session.userId);
  return { ok: result?.ok === true };
}

/**
 * Remplace les grades du serveur.
 *
 * Distribuer le pouvoir ne se délègue pas : administrateurs du serveur
 * seulement, ici ET côté bot — une server action reste un endpoint HTTP, et
 * masquer le panneau ne protégerait rien. Le bot renvoie ce qu'il a retenu
 * (rôles disparus et modules inconnus écartés) : c'est cette liste que le
 * panneau réaffiche.
 */
export async function setGradesAction(
  guildId: string,
  grades: Array<Omit<Grade, 'id'> & { id?: string }>,
): Promise<{ ok: boolean; grades?: Grade[] }> {
  const actorId = await requireAccess(guildId);
  const result = await setGuildGrades(guildId, actorId, grades);
  return result?.ok ? { ok: true, grades: result.grades } : { ok: false };
}

// --- Catalogue d'objets -----------------------------------------------------

/**
 * L'identifiant de l'utilisateur, après vérification qu'il ADMINISTRE ce
 * serveur (propriétaire ou « Gérer le serveur »).
 *
 * C'est la garde de ce qui ne se délègue pas : purge, délégations, réglages
 * d'instance. Ce qui se délègue passe par `requireAccess(guildId, permission)`,
 * qu'un administrateur franchit de toute façon.
 */
async function actorForGuild(guildId: string): Promise<string> {
  return requireAccess(guildId);
}

export async function createItemAction(
  guildId: string,
  data: ShopItemInput,
): Promise<{ ok: boolean; item?: ShopItem }> {
  const actorId = await requireAccess(guildId, modulePermission(MODULE_OBJETS));
  // Le bot re-vérifie les droits de l'acteur et borne les valeurs.
  const result = await createGuildItem(guildId, actorId, data);
  return result ? { ok: true, item: result.item } : { ok: false };
}

export async function updateItemAction(
  guildId: string,
  itemId: string,
  data: ShopItemInput,
): Promise<{ ok: boolean; item?: ShopItem | null }> {
  const actorId = await requireAccess(guildId, modulePermission(MODULE_OBJETS));
  const result = await updateGuildItem(guildId, actorId, itemId, data);
  return result ? { ok: true, item: result.item } : { ok: false };
}

export async function deleteItemAction(guildId: string, itemId: string): Promise<{ ok: boolean }> {
  const actorId = await requireAccess(guildId, modulePermission(MODULE_OBJETS));
  const result = await deleteGuildItem(guildId, actorId, itemId);
  return { ok: result?.ok === true };
}

/**
 * Fixe le plafond GLOBAL d'objets par serveur. Réservé au propriétaire du bot
 * (le bot revérifie via isOwner). `max` = null => illimité.
 */
/**
 * Ouvre ou referme La Chatterie sur un serveur. Réglage d'instance : le bot
 * refuse tout autre acteur, et l'on revérifie ici — une server action reste un
 * endpoint HTTP, que masquer le bouton ne protège pas.
 */
export async function setChatterieAccessAction(
  targetGuildId: string,
  allowed: boolean,
): Promise<{ ok: boolean; allowed?: string[] }> {
  const session = await getSession();
  if (!session) throw new Error('non authentifié');
  const owner = process.env.BOT_OWNER_ID;
  if (!owner || session.userId !== owner) throw new Error('accès refusé');
  const result = await setChatterieAccess(session.userId, targetGuildId, allowed);
  return result ? { ok: true, allowed: result.allowed } : { ok: false };
}

/**
 * Efface les parties de La Chatterie sur un serveur. Destructeur : réservé au
 * propriétaire, revérifié ici, et borné au serveur nommé.
 */
export async function wipeChatterieAction(
  targetGuildId: string,
): Promise<{ ok: boolean; deleted?: number }> {
  const session = await getSession();
  if (!session) throw new Error('non authentifié');
  const owner = process.env.BOT_OWNER_ID;
  if (!owner || session.userId !== owner) throw new Error('accès refusé');
  const result = await wipeChatterie(session.userId, targetGuildId);
  return result ? { ok: true, deleted: result.deleted } : { ok: false };
}

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

export async function deployAction(
  guildId: string,
  branch?: string,
  mode?: string,
): Promise<{ ok: boolean }> {
  await requireAccess(guildId);
  // Le déploiement est réservé au propriétaire du bot : l'UI cache le bouton,
  // mais une action serveur reste un endpoint HTTP — on revérifie ici ET côté bot.
  const session = await getSession();
  if (!session) throw new Error('non authentifié');
  const owner = process.env.BOT_OWNER_ID;
  if (!owner || session.userId !== owner) throw new Error('accès refusé');
  // Une action serveur reçoit ce qu'on lui envoie, pas ce que le `<select>`
  // propose : tout ce qui n'est pas `cache` retombe sur la reconstruction
  // complète. Le bot refait ce filtrage de son côté.
  const result = await triggerDeploy(session.userId, branch, mode === 'cache' ? 'cache' : 'full');
  return { ok: result?.ok === true };
}

/**
 * L'état d'une mise à jour en cours : étape, journal, résultat.
 *
 * Interrogé en boucle pendant un `/maj` — c'est le seul moyen de savoir où en
 * est l'updater, qui travaille sur l'hôte. Renvoie `null` quand le bot est
 * injoignable : c'est ATTENDU au milieu d'une mise à jour, puisqu'elle le
 * redémarre. L'appelant doit le lire comme « ça redémarre », pas comme un
 * échec.
 */
export async function getDeployAction(guildId: string): Promise<DeployState | null> {
  const actorId = await actorForGuild(guildId);
  const owner = process.env.BOT_OWNER_ID;
  if (!owner || actorId !== owner) throw new Error('accès refusé');
  return getDeploy(actorId);
}

/**
 * Redemande au dépôt la liste des branches déployables.
 *
 * Réservé au propriétaire du bot, comme le déploiement lui-même : l'UI cache le
 * panneau aux autres, mais une action serveur reste un endpoint HTTP.
 */
export async function refreshDeployBranchesAction(
  guildId: string,
): Promise<BranchRefresh | null> {
  const actorId = await actorForGuild(guildId);
  const owner = process.env.BOT_OWNER_ID;
  if (!owner || actorId !== owner) throw new Error('accès refusé');
  return refreshDeployBranches(actorId);
}

// --- Gacha : personnages maison ---------------------------------------------

export async function createGachaCharacterAction(
  guildId: string,
  data: GachaCharacterInput,
): Promise<{ ok: boolean; character?: GachaCharacter }> {
  const actorId = await requireAccess(guildId, modulePermission(MODULE_GACHA));
  // Le bot re-vérifie les droits, borne les valeurs et dérive rang et valeur de
  // la rareté : rien de tout cela ne se décide ici.
  const result = await createGachaCharacter(guildId, actorId, data);
  return result ? { ok: true, character: result.character } : { ok: false };
}

export async function updateGachaCharacterAction(
  guildId: string,
  characterId: string,
  data: GachaCharacterInput,
): Promise<{ ok: boolean; character?: GachaCharacter | null }> {
  const actorId = await requireAccess(guildId, modulePermission(MODULE_GACHA));
  const result = await updateGachaCharacter(guildId, actorId, characterId, data);
  return result ? { ok: true, character: result.character } : { ok: false };
}

export async function deleteGachaCharacterAction(
  guildId: string,
  characterId: string,
): Promise<{ ok: boolean }> {
  const actorId = await requireAccess(guildId, modulePermission(MODULE_GACHA));
  const result = await deleteGachaCharacter(guildId, actorId, characterId);
  return { ok: Boolean(result?.ok) };
}

/**
 * Planification et relance de l'import du catalogue.
 *
 * Le catalogue est partagé par tous les serveurs : l'acteur doit être le
 * propriétaire du bot, ce que le bot revérifie de son côté — ce contrôle-ci
 * n'éviterait qu'un aller-retour inutile.
 */
/**
 * Les logs du bot. Rafraîchis à la demande plutôt qu'en flux : on les consulte
 * quand on se pose une question, on ne laisse pas tourner une console.
 *
 * `date` bascule du tampon mémoire vers l'archive sur disque du bot ; `levels`
 * et `search` s'appliquent aux deux.
 */
export async function getBotLogsAction(
  guildId: string,
  options: BotLogQuery = {},
): Promise<BotLogs | null> {
  const actorId = await actorForGuild(guildId);
  return getBotLogs(actorId, options);
}

/**
 * L'état de santé de l'instance, rafraîchi en boucle par le panneau Monitoring.
 *
 * Réservé au propriétaire du bot, qui le revérifie de son côté. Pas de
 * `revalidatePath` ici : un appel toutes les quinze secondes qui re-rendrait la
 * page rappellerait l'API Discord des serveurs jusqu'au 429, et renverrait
 * l'admin au login pour un graphique.
 */
export async function getMetricsAction(
  guildId: string,
  window?: MetricsWindow,
): Promise<BotMetrics | null> {
  const actorId = await actorForGuild(guildId);
  const owner = process.env.BOT_OWNER_ID;
  if (!owner || actorId !== owner) throw new Error('accès refusé');
  // La langue du site se relit ici plutôt que de venir du panneau : celui-ci
  // rappelle l'action toutes les quinze secondes, et un paramètre de plus à
  // transporter finirait par se désaccorder du cookie.
  return getMetrics(actorId, window, await requestLocale());
}

/** Fixe le plafond de souhaits, global au bot (propriétaire uniquement). */
export async function setWishlistLimitAction(
  guildId: string,
  max: number,
): Promise<{ max: number } | null> {
  const actorId = await actorForGuild(guildId);
  return setWishlistLimit(actorId, max);
}

export async function setGachaImportAction(
  guildId: string,
  patch: { auto?: boolean; cron?: string; run?: boolean },
): Promise<GachaImportResult> {
  const actorId = await actorForGuild(guildId);
  return setGachaImport(actorId, patch);
}

/**
 * Remplace les statuts de profil du bot.
 *
 * Le statut vaut pour toute l'instance : l'UI cache le panneau aux autres, mais
 * une action serveur reste un endpoint HTTP — on revérifie ici ET côté bot.
 */
export async function setPresenceAction(
  guildId: string,
  lines: string[],
): Promise<PresenceState | null> {
  const actorId = await actorForGuild(guildId);
  const owner = process.env.BOT_OWNER_ID;
  if (!owner || actorId !== owner) throw new Error('accès refusé');
  return setPresence(actorId, lines);
}

/**
 * Règle la cadence de redémarrage, et/ou redémarre tout de suite.
 *
 * Le bot revérifie les droits de l'acteur et valide l'expression cron : rien de
 * tout cela ne se décide ici.
 */
export async function setRestartAction(
  guildId: string,
  patch: { auto?: boolean; cron?: string; now?: boolean },
): Promise<RestartResult> {
  const actorId = await actorForGuild(guildId);
  const owner = process.env.BOT_OWNER_ID;
  if (!owner || actorId !== owner) throw new Error('accès refusé');
  return setRestart(actorId, patch);
}

// --- Sauvegarde du serveur ---------------------------------------------------

/**
 * Règle la planification et/ou lance une sauvegarde tout de suite.
 *
 * Le bot revérifie les droits de l'acteur, valide l'expression cron et borne la
 * rétention : rien de tout cela ne se décide ici.
 */
export async function setBackupAction(
  guildId: string,
  patch: {
    auto?: boolean;
    cron?: string;
    keep?: number;
    includeData?: boolean;
    channelId?: string | null;
    run?: boolean;
  },
): Promise<BackupSaveResult> {
  const actorId = await requireAccess(guildId, SCOPE_SAUVEGARDE);
  return setGuildBackup(guildId, actorId, patch);
}

/** Supprime une sauvegarde déposée, et renvoie l'état à jour du panneau. */
export async function deleteBackupAction(
  guildId: string,
  name: string,
): Promise<{ ok: boolean; state?: BackupState | null }> {
  const actorId = await requireAccess(guildId, SCOPE_SAUVEGARDE);
  const result = await deleteGuildBackup(guildId, actorId, name);
  if (result?.ok !== true) return { ok: false };
  return { ok: true, state: await getGuildBackup(guildId, actorId) };
}

/**
 * Restaure le serveur depuis une sauvegarde déposée sur le bot.
 *
 * Écrase les données du serveur : la confirmation est demandée côté dashboard,
 * et le bot n'applique le fichier qu'en une transaction — jamais à moitié.
 */
export async function restoreBackupAction(
  guildId: string,
  input: { file: string; recreate: boolean; data: boolean },
): Promise<RestoreOutcome> {
  const actorId = await requireAccess(guildId, SCOPE_SAUVEGARDE);
  const outcome = await restoreGuildBackup(guildId, actorId, input);
  // Toute la configuration du serveur vient de changer.
  if (outcome.ok) revalidatePath(`/dashboard/${guildId}`);
  return outcome;
}

/**
 * Garde des actions de publication : propriétaire du bot, et rien d'autre.
 *
 * Une action serveur est un endpoint HTTP — cacher le panneau ne protège rien.
 * Le bot revérifie de son côté, mais le refus doit venir d'ici aussi, sinon un
 * appel direct atteindrait l'API avec l'identité du site.
 */
async function assertOwner(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error('non authentifié');
  const owner = process.env.BOT_OWNER_ID;
  if (!owner || session.userId !== owner) throw new Error('accès refusé');
  return session.userId;
}

/** Rafraîchit l'état de la publication (liste, avancement, dernier résultat). */
export async function syncPublicStateAction(): Promise<SyncPublicState | null> {
  const actorId = await assertOwner();
  return getSyncPublic(actorId);
}

/**
 * Enregistre la liste des chemins à ne pas publier.
 *
 * Renvoie ce que le bot a réellement retenu : la case cochée pour un motif
 * refusé doit se décocher toute seule, avec la raison affichée à côté.
 */
export async function saveSyncExcludesAction(
  features: string[],
  extras: Record<SyncTarget, string[]>,
): Promise<{
  ok: boolean;
  features: string[];
  extras: Record<SyncTarget, string[]>;
  rejected: string[];
}> {
  const actorId = await assertOwner();
  const result = await setSyncExcludes(actorId, features, extras);
  if (!result) return { ok: false, features: [], extras: { bot: [], site: [] }, rejected: [] };
  return {
    ok: true,
    features: result.features,
    extras: result.extras,
    rejected: result.rejected,
  };
}

/**
 * Demande la publication à l'hôte. `dryRun` est le défaut côté bot : on ne
 * pousse que si cet appel dit explicitement le contraire.
 */
export async function runSyncPublicAction(
  dryRun: boolean,
  target: SyncTarget,
  message?: string,
): Promise<{ ok: boolean; requestedAt?: string }> {
  const actorId = await assertOwner();
  // Le bot renettoie et tronque : ce qui arrive ici vient d'un navigateur.
  const result = await runSyncPublic(actorId, dryRun, target, message);
  if (!result?.ok) return { ok: false };
  return { ok: true, requestedAt: result.requestedAt };
}
