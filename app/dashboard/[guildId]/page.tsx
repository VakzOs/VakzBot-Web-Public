import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DashNav } from '@/components/DashNav';
import { getSession } from '@/lib/auth';
import { canManage, fetchUserGuilds, guildIconUrl } from '@/lib/discord';
import { botApiConfigured, getDeploy, getGuildModules } from '@/lib/botApi';
import { site } from '@/lib/site';
import { categories } from '@/lib/modules';
import { ModulesClient } from './ModulesClient';
import { DangerZone } from './DangerZone';

export const metadata = { title: 'Configuration' };
export const dynamic = 'force-dynamic';

export default async function GuildPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await getSession();
  if (!session) redirect('/api/auth/login');

  const guilds = await fetchUserGuilds(session.accessToken);
  if (!guilds) redirect('/api/auth/login');

  const guild = guilds.find((g) => g.id === guildId && canManage(g));
  if (!guild) notFound();

  const icon = guildIconUrl(guild);
  const canDeploy = Boolean(process.env.BOT_OWNER_ID) && session.userId === process.env.BOT_OWNER_ID;

  const data = botApiConfigured() ? await getGuildModules(guildId) : null;
  const deploy = canDeploy && botApiConfigured() ? await getDeploy() : null;

  return (
    <>
      <DashNav session={{ username: session.username, avatar: session.avatar }} />
      <main className="container-dash min-h-[70vh] pb-20 pt-11">
        <div className="fu">
          <Link
            href="/dashboard"
            className="text-[14px] text-[var(--mut)] transition-colors hover:text-[var(--tx)]"
          >
            ← Mes serveurs
          </Link>

          <div className="mt-4 flex items-center gap-4">
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" className="h-14 w-14 rounded-[18px]" />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-[18px] bg-gradient-to-br from-[var(--acc)] to-[var(--acc2)] text-[22px] font-bold text-white">
                {guild.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <h1 className="font-display text-[26px] font-bold">{guild.name}</h1>
              <p className="mt-[3px] text-[14px] text-[var(--mut)]">Configuration de Meow Bot</p>
            </div>
          </div>

          <div className="mt-8">
            {data ? (
              data.botPresent ? (
                <ModulesClient
                  guildId={guildId}
                  modules={data.modules}
                  canDeploy={canDeploy}
                  deploy={deploy}
                />
              ) : (
                <div className="card p-6 text-center">
                  <p className="text-[var(--tx)]">Meow Bot n&apos;est pas présent sur ce serveur.</p>
                  <p className="mt-1 text-[14px] text-[var(--mut)]">
                    Meow Bot est auto-hébergé : chacun fait tourner sa propre instance.
                  </p>
                  <a
                    href={site.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-accent mt-4 px-4 py-2 text-[14px]"
                  >
                    Héberger le bot (GitHub)
                  </a>
                </div>
              )
            ) : (
              <ReadOnlyModules />
            )}
          </div>

          {data ? (
            <div className="mt-10">
              <DangerZone guildId={guildId} guildName={guild.name} />
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}

/** Repli lecture seule quand l'API du bot n'est pas (encore) joignable. */
function ReadOnlyModules() {
  return (
    <>
      <div className="mb-8 rounded-[16px] border border-amber-500/30 bg-amber-500/5 p-5 text-[14px] text-[var(--mut)]">
        ⚠️ L&apos;édition en direct n&apos;est pas disponible (API du bot non configurée ou
        injoignable). En attendant, configure tout sur Discord avec <code className="code">/config</code>.
      </div>
      <div className="flex flex-col gap-[34px]">
        {categories.map((category) => (
          <section key={category.id}>
            <h2 className="flex items-center gap-[10px] font-display text-[18px] font-semibold">
              <span className="text-[20px]">{category.emoji}</span> {category.title}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {category.modules.map((mod) => (
                <div key={mod.name} className="card p-4">
                  <p className="text-[15px] font-semibold text-[var(--tx)]">{mod.name}</p>
                  <p className="mt-1 text-[13px] text-[var(--mut)]">{mod.description}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
