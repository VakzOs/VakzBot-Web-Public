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
 * Avatar du bot, utilisé comme icône du site (favicon + logo). Colle ici l'URL
 * de l'image (clic droit sur l'avatar du bot dans Discord → « Copier le lien de
 * l'image »), ou renseigne NEXT_PUBLIC_BOT_AVATAR_URL sur Vercel. Vide = l'icône
 * Discord par défaut est utilisée.
 */
export const BOT_AVATAR_URL =
  process.env.NEXT_PUBLIC_BOT_AVATAR_URL ??
  'https://cdn.discordapp.com/avatars/1519303965475602600/69c3cd52cfad04feaf0b38380881fa7d.webp?size=128';

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
    'Modération, niveaux, économie, tickets, suggestions, giveaways, alertes stream, jeux gratuits… plus de 30 modules configurables via un simple /config.',
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
