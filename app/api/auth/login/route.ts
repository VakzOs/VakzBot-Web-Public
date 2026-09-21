import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authorizeUrl } from '@/lib/discord';

/**
 * Une destination interne, ou `null`.
 *
 * Ce paramètre finit en `Location:` après le retour de Discord : accepter autre
 * chose qu'un chemin de CE site en ferait une redirection ouverte, offerte à
 * qui sait forger un lien. D'où la double garde — un seul `/` en tête (`//evil`
 * est une URL absolue pour un navigateur), et pas d'anti-slash.
 */
function safeReturn(value: string | null): string | null {
  if (!value || !value.startsWith('/')) return null;
  if (value.startsWith('//') || value.includes('\\')) return null;
  return value;
}

/** Démarre la connexion Discord : pose un state anti-CSRF puis redirige. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const state = randomBytes(16).toString('hex');
  const jar = await cookies();

  jar.set('mb_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });

  // Où revenir après la connexion. Le défaut reste le dashboard : c'est de là
  // qu'on se connecte neuf fois sur dix. Le cookie meurt avec l'aller-retour.
  const retour = safeReturn(url.searchParams.get('retour'));
  if (retour) {
    jar.set('mb_oauth_retour', retour, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 600,
    });
  } else {
    jar.delete('mb_oauth_retour');
  }

  return NextResponse.redirect(authorizeUrl(`${origin}/api/auth/callback`, state));
}
