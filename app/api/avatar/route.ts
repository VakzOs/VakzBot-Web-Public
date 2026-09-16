import { NextResponse } from 'next/server';
import { fetchBotAvatarUrl } from '@/lib/discord';
import { DEFAULT_AVATAR_URL } from '@/lib/site';

/**
 * L'avatar du bot, en redirection vers le CDN de Discord.
 *
 * Une redirection plutôt qu'un relais d'octets : le navigateur va chercher
 * l'image chez Discord, qui la sert mieux que nous, et la CSP l'autorise déjà
 * (`img-src … https://cdn.discordapp.com`). Le token, lui, reste ici — le
 * navigateur ne voit que `/api/avatar` puis une URL publique.
 *
 * Une route plutôt qu'une valeur calculée dans `lib/site.ts` : ce fichier est
 * importé par des composants `'use client'`, où `DISCORD_BOT_TOKEN` n'a rien à
 * faire. Les six composants qui affichent l'avatar n'ont ainsi rien à changer.
 */
export const revalidate = 3600;

export async function GET() {
  const url = (await fetchBotAvatarUrl()) ?? DEFAULT_AVATAR_URL;
  return NextResponse.redirect(url, {
    status: 307,
    // Le cache navigateur évite un aller-retour par image affichée ; la route
    // elle-même se rafraîchit toutes les heures (`revalidate`).
    headers: { 'cache-control': 'public, max-age=3600' },
  });
}
