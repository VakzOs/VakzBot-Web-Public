import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createSession } from '@/lib/auth';
import { exchangeCode, fetchUser } from '@/lib/discord';

/** Retour de Discord : vérifie le state, échange le code, crée la session. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const jar = await cookies();
  const expectedState = jar.get('mb_oauth_state')?.value;
  jar.delete('mb_oauth_state');

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL('/?erreur=oauth', url.origin));
  }

  const token = await exchangeCode(code, `${url.origin}/api/auth/callback`);
  if (!token?.access_token) {
    return NextResponse.redirect(new URL('/?erreur=token', url.origin));
  }

  const user = await fetchUser(token.access_token);
  if (!user) {
    return NextResponse.redirect(new URL('/?erreur=user', url.origin));
  }

  await createSession({
    userId: user.id,
    username: user.global_name ?? user.username,
    avatar: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
      : null,
    accessToken: token.access_token,
  });

  return NextResponse.redirect(new URL('/dashboard', url.origin));
}
