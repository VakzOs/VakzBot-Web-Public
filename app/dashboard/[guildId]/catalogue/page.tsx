import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DashNav } from '@/components/DashNav';
import { canModule, guildActor } from '@/lib/access';
import { botApiConfigured, getGuildItems, getGuildMeta } from '@/lib/botApi';
import { getTranslation } from '@/lib/i18n';
import { ItemsClient } from './ItemsClient';

export async function generateMetadata() {
  const { t } = await getTranslation();
  return { title: t('objets.titre') };
}
export const dynamic = 'force-dynamic';

export default async function CataloguePage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { t } = await getTranslation();
  const actor = await guildActor(guildId);
  if (actor.status === 'anonymous') redirect('/api/auth/login');
  if (actor.status === 'forbidden') notFound();
  const { session, guild, access } = actor;
  // Le catalogue d'objets EST le module « Objets » : même délégation.
  if (!canModule(access, 'items')) notFound();

  if (!botApiConfigured()) redirect(`/dashboard/${guildId}`);

  const [data, meta] = await Promise.all([
    getGuildItems(guildId),
    getGuildMeta(guildId, session.userId),
  ]);
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
              <h1 className="font-display text-[26px] font-bold">{t('objets.titre')}</h1>
              <p className="mt-[3px] text-[14px] text-[var(--mut)]">{t('objets.intro')}</p>
            </div>
          </div>

          <div className="mt-8">
            {data ? (
              <ItemsClient
                guildId={guildId}
                initialItems={data.items}
                max={data.max}
                roles={meta?.roles ?? []}
                effectsUI={data.effectsUI ?? []}
                canManageLimit={canManageLimit}
              />
            ) : (
              <div className="card p-6 text-[14px] text-[var(--mut)]">
                {t('objets.injoignable')}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
