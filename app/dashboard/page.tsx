import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DashNav } from '@/components/DashNav';
import { getSession } from '@/lib/auth';
import { canManage, fetchBotGuildIds, fetchUserGuilds, guildIconUrl } from '@/lib/discord';
import { site } from '@/lib/site';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/api/auth/login');

  const guilds = await fetchUserGuilds(session.accessToken);
  if (!guilds) redirect('/api/auth/login');

  const manageable = guilds.filter(canManage);
  const botGuildIds = await fetchBotGuildIds();

  return (
    <>
      <DashNav session={{ username: session.username, avatar: session.avatar }} />
      <main className="container-dash min-h-[70vh] pb-20 pt-11">
        <div className="fu">
          <h1 className="font-display text-[32px] font-bold tracking-[-0.02em]">Mes serveurs</h1>
          <p className="mt-2 text-[16px] text-[var(--mut)]">
            Les serveurs où tu peux gérer la configuration. Choisis-en un pour configurer Meow Bot.
          </p>

          {manageable.length === 0 ? (
            <div className="card mt-8 p-8 text-center text-[var(--mut)]">
              Aucun serveur gérable trouvé sur ton compte.
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {manageable.map((guild) => {
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
                        {hasBot ? '● présent' : botGuildIds ? '○ bot absent' : '—'}
                      </p>
                    </div>
                    {showConfig ? (
                      <Link
                        href={`/dashboard/${guild.id}`}
                        className="shrink-0 rounded-[10px] bg-[var(--acc)] px-[15px] py-[9px] text-[13px] font-semibold text-white"
                      >
                        Configurer
                      </Link>
                    ) : (
                      <a
                        href={site.githubUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-[10px] border border-[var(--acc-bd)] px-[15px] py-[9px] text-[13px] font-semibold text-[var(--acc2)]"
                      >
                        Héberger
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
