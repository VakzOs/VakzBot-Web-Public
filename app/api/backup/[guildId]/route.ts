import { NextResponse } from 'next/server';
import { SCOPE_SAUVEGARDE, can, guildActor } from '@/lib/access';
import { fetchGuildBackupFile, uploadGuildBackup } from '@/lib/botApi';

/**
 * Téléchargement et restauration d'un fichier de sauvegarde.
 *
 * Ces deux opérations passent par une route plutôt que par une action serveur :
 * le fichier doit transiter en **binaire** (le token du bot ne quittant jamais
 * le serveur, c'est nous qui le relayons), et une sauvegarde complète dépasse
 * largement la limite de corps d'une action serveur Next.
 */

export const dynamic = 'force-dynamic';

/**
 * Vérifie la session et le droit à la sauvegarde de CE serveur ; renvoie l'ID
 * de l'acteur.
 *
 * Une sauvegarde contient les données des membres : il y faut la permission qui
 * la nomme, qu'un administrateur a de toute façon. Le bot revérifie de son
 * côté — ce contrôle évite surtout un aller-retour.
 */
async function actorFor(guildId: string): Promise<string | null> {
  const actor = await guildActor(guildId);
  if (actor.status !== 'ok' || !can(actor.access, SCOPE_SAUVEGARDE)) return null;
  return actor.session.userId;
}

/** GET /api/backup/:guildId?file=… — renvoie le fichier au navigateur. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ guildId: string }> },
): Promise<Response> {
  const { guildId } = await params;
  const actorId = await actorFor(guildId);
  if (!actorId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const name = new URL(request.url).searchParams.get('file') ?? '';
  // Le bot valide le nom de son côté ; on refuse ici tout ce qui pourrait
  // ressembler à un chemin plutôt que de le lui transmettre.
  if (!/^[A-Za-z0-9_-]+\.json\.gz$/.test(name)) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }

  const upstream = await fetchGuildBackupFile(guildId, actorId, name);
  if (!upstream) return NextResponse.json({ error: 'unknown_file' }, { status: 404 });

  return new Response(upstream.body, {
    headers: {
      'content-type': 'application/gzip',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  });
}

/** POST /api/backup/:guildId?recreate=1&data=1 — restaure depuis un fichier téléversé. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ guildId: string }> },
): Promise<Response> {
  const { guildId } = await params;
  const actorId = await actorFor(guildId);
  if (!actorId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const file = await request.arrayBuffer();
  if (file.byteLength === 0) return NextResponse.json({ error: 'empty' }, { status: 400 });

  const outcome = await uploadGuildBackup(guildId, actorId, file, {
    recreate: url.searchParams.get('recreate') !== '0',
    data: url.searchParams.get('data') !== '0',
  });
  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 400 });
}
