/**
 * Configuration centrale du site. Modifie ces valeurs pour ton bot.
 *
 * ⚠️ INVITE / DASHBOARD : renseigne les variables d'environnement (sur Vercel :
 * Settings → Environment Variables, puis redéploie) :
 * - NEXT_PUBLIC_DISCORD_CLIENT_ID : Application ID du bot (Developer Portal).
 * - DISCORD_CLIENT_SECRET : secret OAuth2 (Developer Portal → OAuth2).
 * - AUTH_SECRET : chaîne aléatoire longue (ex. `openssl rand -hex 32`).
 * - DISCORD_BOT_TOKEN (optionnel) : token du bot, pour détecter sur quels
 *   serveurs il est déjà présent dans le dashboard.
 */
export const CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? '';

/**
 * Avatar du bot, utilisé comme icône du site (favicon + logo).
 *
 * Par défaut, il est demandé à Discord : `/api/avatar` interroge l'API avec
 * `DISCORD_BOT_TOKEN` et redirige vers le CDN. Chaque instance affiche donc SON
 * bot, sans rien coder en dur — une URL d'avatar contient l'identifiant de
 * l'application, et ce dépôt est publié.
 *
 * `NEXT_PUBLIC_BOT_AVATAR_URL` reste prioritaire, pour qui veut une autre image
 * ou n'a pas configuré de token.
 *
 * Cette constante est lue par des composants `'use client'` : elle ne contient
 * donc qu'un chemin, jamais de secret. Le token ne quitte pas le serveur.
 */
export const DEFAULT_AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/0.png';

export const BOT_AVATAR_URL = process.env.NEXT_PUBLIC_BOT_AVATAR_URL || '/api/avatar';

/** Permissions demandées à l'invitation (gestion serveur complète du bot). */
const INVITE_PERMISSIONS = '1512399759079';

export function inviteUrl(guildId?: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    permissions: INVITE_PERMISSIONS,
    scope: 'bot applications.commands',
  });
  if (guildId) {
    params.set('guild_id', guildId);
    params.set('disable_guild_select', 'true');
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export const site = {
  name: 'Meow Bot',
  avatarUrl: BOT_AVATAR_URL,
  tagline: 'Le bot tout-en-un pour animer, modérer et gérer ton serveur Discord.',
  description:
    'Modération, niveaux, économie, tickets, suggestions, giveaways, alertes stream, jeux gratuits… plus de 30 modules configurables depuis le dashboard.',
  inviteUrl: inviteUrl(),
  githubUrl: 'https://github.com/VakzOs/Vakz-Bot-Public',
  // Laisse vide pour masquer le lien correspondant dans le pied de page.
  supportUrl: '',
  // Contact affiché sur les pages légales (Conditions / Confidentialité).
  contactDiscord: '@vakzos',
  stats: [
    { value: '38', label: 'modules' },
    { value: '40+', label: 'commandes' },
    { value: 'FR/EN', label: '2 langues' },
    { value: '100%', label: 'gratuit' },
  ],
};

export type Site = typeof site;
