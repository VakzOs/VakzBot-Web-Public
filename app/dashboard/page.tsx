import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DashNav } from '@/components/DashNav';
import { getSession } from '@/lib/auth';
import { canManage, fetchBotGuildIds, fetchUserGuilds, guildIconUrl } from '@/lib/discord';
import { botApiConfigured, getAccessForGuilds } from '@/lib/botApi';
import { site } from '@/lib/site';
import { getTranslation } from '@/lib/i18n';

export async function generateMetadata() {
  const { t } = await getTranslation();
  return { title: t('dashboard.titre') };
}
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { t } = await getTranslation();
  const session = await getSession();
  if (!session) redirect('/api/auth/login');

  const guilds = await fetchUserGuilds(session.accessToken);
  if (!guilds) redirect('/api/auth/login');

  // Discord ne connaît que ses propres permissions : un modérateur à qui le
  // serveur a donné un grade n'y apparaît pas gérable. On demande donc au bot
  // ce que valent les AUTRES serveurs pour cet utilisateur — il écarte de
  // lui-même ceux où il n'est pas, et ne nomme que ceux qui ouvrent quelque
  // chose.
  const manageable = guilds.filter(canManage);
  const rest = guilds.filter((g) => !canManage(g));
  const delegated = botApiConfigured()
    ? await getAccessForGuilds(
        session.userId,
        rest.map((g) => g.id),
      )
    : {};
  const visible = [...manageable, ...rest.filter((g) => delegated[g.id])];
  const botGuildIds = await fetchBotGuildIds();

  const isOwner =
    Boolean(process.env.BOT_OWNER_ID) && session.userId === process.env.BOT_OWNER_ID;

  return (
    <>
      <DashNav session={{ username: session.username, avatar: session.avatar }} />
      <main className="container-dash min-h-[70vh] pb-20 pt-11">
        <div className="fu">
          <h1 className="font-display text-[32px] font-bold tracking-[-0.02em]">
            {t('dashboard.serveurs.titre')}
          </h1>
          <p className="mt-2 text-[16px] text-[var(--mut)]">
            {t('dashboard.serveurs.intro', { nom: site.name })}
          </p>

          {/* Les codes d'accès : ce qui décide QUI peut ajouter le bot ne
              concerne aucun serveur en particulier, et c'est donc ici — sur la
              liste des serveurs, où l'on arrive en se connectant — plutôt que
              dans les réglages de l'un d'eux. Réservé au propriétaire du bot,
              qui est seul à voir ce lien comme il est seul à ouvrir la page.
              Cette poignée de lignes part avec `app/dashboard/acces` le jour
              où la fonctionnalité n'est plus du voyage. */}
          {isOwner ? (
            <Link
              href="/dashboard/acces"
              className="mt-5 inline-block rounded-[10px] border border-[var(--acc-bd)] px-[15px] py-[9px] text-[13px] font-semibold text-[var(--acc2)] transition-colors hover:bg-[var(--surf-hover)]"
            >
              {t('invitations.proprio.lien')}
            </Link>
          ) : null}

          {visible.length === 0 ? (
            <div className="card mt-8 p-8 text-center text-[var(--mut)]">
              {t('dashboard.serveurs.aucun')}
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((guild) => {
                const icon = guildIconUrl(guild);
                const hasBot = botGuildIds?.has(guild.id) ?? false;
                const showConfig = hasBot || !botGuildIds;
                return (
                  <div
                    key={guild.id}
                    className="flex items-center gap-[14px] rounded-[18px] border border-[var(--bd)] bg-[var(--surf)] p-[18px]"
                  >
                    {icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={icon} alt="" className="h-12 w-12 shrink-0 rounded-[14px]" />
                    ) : (
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-gradient-to-br from-[var(--acc)] to-[var(--acc2)] text-[18px] font-bold text-white">
                        {guild.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-[var(--tx)]">
                        {guild.name}
                      </p>
                      <p
                        className="mt-[3px] text-[12px]"
                        style={{ color: hasBot ? '#34d399' : 'var(--muted2)' }}
                      >
                        {hasBot
                          ? t('dashboard.serveurs.present')
                          : botGuildIds
                            ? t('dashboard.serveurs.absent')
                            : t('dashboard.serveurs.inconnu')}
                      </p>
                      {/* À quel titre ce serveur est dans la liste : sans cette
                          ligne, un dashboard qui n'ouvre que deux modules
                          ressemble à une panne. */}
                      {delegated[guild.id]?.grades.length ? (
                        <p className="mt-[2px] truncate text-[12px] text-[var(--mut)]">
                          {delegated[guild.id]?.grades.join(', ')}
                        </p>
                      ) : null}
                    </div>
                    {showConfig ? (
                      <Link
                        href={`/dashboard/${guild.id}`}
                        className="shrink-0 rounded-[10px] bg-[var(--acc)] px-[15px] py-[9px] text-[13px] font-semibold text-white"
                      >
                        {t('dashboard.serveurs.configurer')}
                      </Link>
                    ) : (
                      <a
                        href={site.githubUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-[10px] border border-[var(--acc-bd)] px-[15px] py-[9px] text-[13px] font-semibold text-[var(--acc2)]"
                      >
                        {t('dashboard.serveurs.heberger')}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
