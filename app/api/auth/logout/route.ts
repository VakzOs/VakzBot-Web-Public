import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth';

/** Déconnexion : efface la session puis renvoie à l'accueil. */
export async function GET(request: Request) {
  await clearSession();
  return NextResponse.redirect(new URL('/', new URL(request.url).origin));
}
