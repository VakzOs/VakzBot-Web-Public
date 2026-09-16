import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DashNav } from '@/components/DashNav';
import { getSession } from '@/lib/auth';
import { canManage, fetchUserGuilds } from '@/lib/discord';
import { botApiConfigured, getGuildMeta, getGuildModules } from '@/lib/botApi';
import { getTranslation } from '@/lib/i18n';
import { ModuleForm } from './ModuleForm';
import { ModuleToggle } from './ModuleToggle';

export async function generateMetadata() {
  const { t } = await getTranslation();
  return { title: t('dashboard.module.titre') };
}
export const dynamic = 'force-dynamic';

export default async function ModulePage({
  params,
}: {
  params: Promise<{ guildId: string; module: string }>;
}) {
  const { guildId, module: moduleName } = await params;
  const { t, locale } = await getTranslation();
  const session = await getSession();
  if (!session) redirect('/api/auth/login');

  const guilds = await fetchUserGuilds(session.accessToken);
  if (!guilds) redirect('/api/auth/login');
  const guild = guilds.find((g) => g.id === guildId && canManage(g));
  if (!guild) notFound();

  if (!botApiConfigured()) redirect(`/dashboard/${guildId}`);

  // Libellés du module et de ses champs dans la langue du dashboard : ils
  // viennent du bot, qui les rend dans la langue demandée.
  const [data, meta] = await Promise.all([
    getGuildModules(guildId, locale),
    getGuildMeta(guildId),
  ]);
  const mod = data?.modules.find((m) => m.name === moduleName);
  if (!mod) notFound();

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
              {mod.emoji}
            </span>
            <div>
              <h1 className="font-display text-[26px] font-bold">{mod.label}</h1>
              <p className="mt-[3px] text-[14px] text-[var(--mut)]">{mod.description}</p>
            </div>
            <ModuleToggle guildId={guildId} moduleName={mod.name} initial={mod.enabled} />
          </div>

          <div className="mt-8">
            {(mod.configUI && mod.configUI.length > 0) || (mod.actions?.length ?? 0) > 0 ? (
              <ModuleForm
                guildId={guildId}
                moduleName={mod.name}
                enabled={mod.enabled}
                config={mod.config}
                groups={mod.configUI ?? []}
                channels={meta?.channels ?? []}
                roles={meta?.roles ?? []}
                publishable={mod.publishable ?? false}
                actions={mod.actions ?? []}
              />
            ) : (
              <div className="card p-6 text-[14px] text-[var(--mut)]">
                {t('dashboard.module.sansReglage')}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
