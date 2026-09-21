import { getSession, type Session } from './auth';
import { canManage, fetchUserGuilds, type Guild } from './discord';
import { botApiConfigured, getAccessForGuilds, type GuildAccess } from './botApi';

/**
 * Qui peut quoi sur le dashboard d'un serveur.
 *
 * Deux sources, et il faut les deux :
 *   - **Discord** (OAuth2) dit qui est propriétaire du serveur ou a « Gérer le
 *     serveur ». C'est tout ce que le site sait seul — et c'était, jusqu'ici,
 *     tout ce qui ouvrait le dashboard.
 *   - **Le bot** dit ce qu'un serveur a délégué à ses **grades** : « Modérateur »
 *     ouvre Modération et l'anti-spam, et rien d'autre. Discord n'en sait rien :
 *     ce sont les réglages du bot, ils vivent dans sa base.
 *
 * Tout passe donc par le bot dès qu'on sort des administrateurs. Et comme une
 * server action est un endpoint HTTP, cette garde ne remplace pas celle du bot :
 * elle la double, parce que masquer un bouton ne protège rien.
 */

/**
 * La permission qui ouvre un module ENTIER : ses réglages, son interrupteur et
 * ses boutons d'action.
 */
export function modulePermission(moduleName: string): string {
  return `module:${moduleName}`;
}

/** La permission qui n'ouvre qu'un bloc de réglages d'un module. */
export function modulePartPermission(moduleName: string, part: string): string {
  return `module:${moduleName}/${part}`;
}

/** La permission qui n'ouvre qu'un bouton d'action du module. */
export function moduleActionPermission(moduleName: string, actionId: string): string {
  return `module:${moduleName}@${actionId}`;
}

/** L'identifiant réservé du bouton qui publie le panneau d'un module. */
export const PUBLISH_ACTION = 'publier';

/**
 * L'acteur a-t-il quelque chose à faire sur ce module — tout, ou au moins un de
 * ses blocs, un de ses verbes, un de ses boutons ?
 *
 * C'est la question d'une PAGE : elle s'ouvre dès qu'il reste quelque chose à y
 * faire — ne serait-ce qu'un bouton « republier ». Le bot, lui, sert la page
 * amputée de ce qui n'est pas ouvert et refuse d'écrire le reste : la garde
 * fine est de son côté, pas du nôtre.
 */
export function canOpenModule(access: GuildAccess | null, moduleName: string): boolean {
  if (!access) return false;
  if (access.level === 'manager') return true;
  const whole = modulePermission(moduleName);
  return access.permissions.some(
    (permission) =>
      permission === whole ||
      permission.startsWith(`${whole}/`) ||
      permission.startsWith(`${whole}@`),
  );
}

/** L'acteur peut-il lancer CE bouton — par le module entier ou par lui seul ? */
export function canRunAction(
  access: GuildAccess | null,
  moduleName: string,
  actionId: string,
): boolean {
  return (
    can(access, modulePermission(moduleName)) ||
    can(access, moduleActionPermission(moduleName, actionId))
  );
}

/** Changer la langue dans laquelle le bot parle sur ce serveur. */
export const SCOPE_LANGUE = 'serveur.langue';

/** Sauvegarder et restaurer le serveur. */
export const SCOPE_SAUVEGARDE = 'serveur.sauvegarde';

/** L'acteur a-t-il CETTE permission ? Un `manager` les a toutes. */
export function can(access: GuildAccess | null, permission: string): boolean {
  if (!access) return false;
  return access.level === 'manager' || access.permissions.includes(permission);
}

/** Raccourci : l'acteur peut-il configurer CE module ? */
export function canModule(access: GuildAccess | null, moduleName: string): boolean {
  return can(access, modulePermission(moduleName));
}

/**
 * Ce qu'une page apprend de son visiteur.
 *
 * `anonymous` — pas de session, ou Discord muet : il faut repasser par le
 * login, pas afficher un refus. `forbidden` — l'utilisateur existe et n'a rien
 * à faire ici. Les fondre donnerait une page introuvable à qui devait
 * simplement se reconnecter.
 */
export type GuildActor =
  | { status: 'ok'; session: Session; guild: Guild; access: GuildAccess }
  | { status: 'anonymous' }
  | { status: 'forbidden' };

/** Les droits du visiteur sur ce serveur, Discord et bot réunis. */
export async function guildActor(guildId: string): Promise<GuildActor> {
  const session = await getSession();
  if (!session) return { status: 'anonymous' };
  const guilds = await fetchUserGuilds(session.accessToken);
  if (!guilds) return { status: 'anonymous' };
  const guild = guilds.find((g) => g.id === guildId);
  // Pas membre du serveur : il n'y a rien à déléguer à quelqu'un qui n'y est pas.
  if (!guild) return { status: 'forbidden' };

  if (canManage(guild)) {
    return { status: 'ok', session, guild, access: { level: 'manager', permissions: [], grades: [] } };
  }

  // Sans l'API du bot, le dashboard reste lisible en lecture seule — mais aucune
  // délégation n'est connaissable : elles vivent dans la base du bot.
  if (!botApiConfigured()) return { status: 'forbidden' };

  const access = await getAccessForGuilds(session.userId, [guildId]);
  const mine = access[guildId];
  if (!mine) return { status: 'forbidden' };
  return { status: 'ok', session, guild, access: mine };
}

/**
 * Garde d'une server action : renvoie l'identifiant de l'acteur, ou lève.
 *
 * Sans `permission`, exige un administrateur du serveur (`manager`) : c'est le
 * niveau de ce qui ne se délègue pas — purge, grades, réglages d'instance.
 * Avec, exige cette permission-là, qu'un administrateur a de toute façon.
 */
export async function requireAccess(guildId: string, permission?: string): Promise<string> {
  const actor = await guildActor(guildId);
  if (actor.status === 'anonymous') throw new Error('non authentifié');
  if (actor.status === 'forbidden') throw new Error('accès refusé');
  if (permission ? !can(actor.access, permission) : actor.access.level !== 'manager') {
    throw new Error('accès refusé');
  }
  return actor.session.userId;
}

/**
 * Garde d'une action qui ÉDITE les réglages d'un module.
 *
 * Elle laisse passer un gradé partiel — celui qui n'a que « Anti-spam » — parce
 * que c'est le bot qui recolle : il repart de la config en place et ne réécrit
 * que les blocs ouverts, quoi que le formulaire ait renvoyé. Exiger le module
 * entier ici fermerait la porte à la délégation par bloc ; ne rien exiger la
 * laisserait grande ouverte.
 */
export async function requireOpenModule(guildId: string, moduleName: string): Promise<string> {
  const actor = await guildActor(guildId);
  if (actor.status === 'anonymous') throw new Error('non authentifié');
  if (actor.status === 'forbidden') throw new Error('accès refusé');
  if (!canOpenModule(actor.access, moduleName)) throw new Error('accès refusé');
  return actor.session.userId;
}

/**
 * Garde d'une action qui LANCE un bouton de module.
 *
 * Un bouton se délègue seul : « republier un message épinglé » se confie sans
 * confier la liste des messages. Exiger le module entier ici fermerait la porte
 * à la maille la plus fine du système.
 */
export async function requireModuleAction(
  guildId: string,
  moduleName: string,
  actionId: string,
): Promise<string> {
  const actor = await guildActor(guildId);
  if (actor.status === 'anonymous') throw new Error('non authentifié');
  if (actor.status === 'forbidden') throw new Error('accès refusé');
  if (!canRunAction(actor.access, moduleName, actionId)) throw new Error('accès refusé');
  return actor.session.userId;
}
