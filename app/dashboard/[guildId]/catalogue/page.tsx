import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DashNav } from '@/components/DashNav';
import { getSession } from '@/lib/auth';
import { canManage, fetchUserGuilds } from '@/lib/discord';
import { botApiConfigured, getGuildItems, getGuildMeta } from '@/lib/botApi';
import { ItemsClient } from './ItemsClient';

export const metadata = { title: 'Catalogue d’objets' };
export const dynamic = 'force-dynamic';

export default async function CataloguePage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await getSession();
  if (!session) redirect('/api/auth/login');

  const guilds = await fetchUserGuilds(session.accessToken);
  if (!guilds) redirect('/api/auth/login');
  const guild = guilds.find((g) => g.id === guildId && canManage(g));
  if (!guild) notFound();

  if (!botApiConfigured()) redirect(`/dashboard/${guildId}`);

  const [data, meta] = await Promise.all([getGuildItems(guildId), getGuildMeta(guildId)]);
  // Le plafond d'objets est un réglage d'instance : seul le propriétaire du bot le règle.
  const canManageLimit =
    Boolean(process.env.BOT_OWNER_ID) && session.userId === process.env.BOT_OWNER_ID;

  return (
    <>
      <DashNav session={{ username: session.username, avatar: session.avatar }} />
      <main className="container-dash min-h-[70vh] pb-20 pt-11">
        <div className="fu">
          <Link
            href={`/dashboard/${guildId}`}
            className="text-[14px] text-[var(--mut)] transition-colors hover:text-[var(--tx)]"
          >
            ← {guild.name}
          </Link>

          <div className="mt-4 flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] border border-[var(--bd)] bg-[var(--surf)] text-[26px]">
              🎁
            </span>
            <div>
              <h1 className="font-display text-[26px] font-bold">Catalogue d’objets</h1>
              <p className="mt-[3px] text-[14px] text-[var(--mut)]">
                Crée, modifie et supprime les objets de la boutique de ce serveur.
              </p>
            </div>
          </div>

          <div className="mt-8">
            {data ? (
              <ItemsClient
                guildId={guildId}
                initialItems={data.items}
                max={data.max}
                roles={meta?.roles ?? []}
                canManageLimit={canManageLimit}
              />
            ) : (
              <div className="card p-6 text-[14px] text-[var(--mut)]">
                Impossible de récupérer le catalogue (API du bot injoignable). Réessaie plus tard,
                ou gère les objets sur Discord avec <code className="code">/config</code>.
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
