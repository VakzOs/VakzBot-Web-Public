import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SESSION_COOKIE = 'mb_session';
const SESSION_DAYS = 7;

/** Contenu de la session : l'utilisateur Discord + son token OAuth2. */
export interface Session {
  userId: string;
  username: string;
  avatar: string | null;
  accessToken: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET manquant (variable d’environnement)');
  return new TextEncoder().encode(secret);
}

/** Signe la session et la pose en cookie httpOnly. */
export async function createSession(session: Session): Promise<void> {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

/** Lit et vérifie la session courante ; `null` si absente ou invalide. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const { userId, username, avatar, accessToken } = payload as Record<string, unknown>;
    if (typeof userId !== 'string' || typeof accessToken !== 'string') return null;
    return {
      userId,
      username: typeof username === 'string' ? username : 'utilisateur',
      avatar: typeof avatar === 'string' ? avatar : null,
      accessToken,
    };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
