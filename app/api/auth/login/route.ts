import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authorizeUrl } from '@/lib/discord';

/** Démarre la connexion Discord : pose un state anti-CSRF puis redirige. */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const state = randomBytes(16).toString('hex');

  (await cookies()).set('mb_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });

  return NextResponse.redirect(authorizeUrl(`${origin}/api/auth/callback`, state));
}
