import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DashNav } from '@/components/DashNav';
import { canOpenModule, guildActor } from '@/lib/access';
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
  const actor = await guildActor(guildId);
  if (actor.status === 'anonymous') redirect('/api/auth/login');
  if (actor.status === 'forbidden') notFound();
  const { session, guild, access } = actor;
  // Un gradé qui n'a rien sur ce module n'a pas à en voir la page. Celui qui
  // n'en a qu'un bloc l'ouvre : le bot ne lui servira que ce bloc-là.
  if (!canOpenModule(access, moduleName)) notFound();

  if (!botApiConfigured()) redirect(`/dashboard/${guildId}`);

  // Libellés du module et de ses champs dans la langue du dashboard : ils
  // viennent du bot, qui les rend dans la langue demandée.
  const [data, meta] = await Promise.all([
    getGuildModules(guildId, locale, session.userId),
    getGuildMeta(guildId, session.userId),
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
            {/* L'interrupteur vaut pour tout le serveur : il demande le module
                entier, et disparaît pour qui n'en tient qu'un bloc. */}
            {mod.partial ? null : (
              <ModuleToggle guildId={guildId} moduleName={mod.name} initial={mod.enabled} />
            )}
          </div>

          {mod.partial ? (
            <p className="mt-6 rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-4 text-[13px] text-[var(--mut)]">
              {t('dashboard.module.partiel')}
            </p>
          ) : null}

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
                // Absent pour qui tient le module entier : le formulaire offre
                // alors tous les gestes.
                verbs={mod.verbs}
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
