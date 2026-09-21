import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DashNav } from '@/components/DashNav';
import { SCOPE_LANGUE, SCOPE_SAUVEGARDE, can, guildActor } from '@/lib/access';
import { guildIconUrl } from '@/lib/discord';
import { botApiConfigured, getGuildLocale, getGuildModules } from '@/lib/botApi';
import { site } from '@/lib/site';
import { getTranslation, type Translate } from '@/lib/i18n';
import { categories } from '@/lib/modules';
import { ModulesClient } from './ModulesClient';
import { BotLangSelector } from './BotLangSelector';
import { DangerZone } from './DangerZone';

export async function generateMetadata() {
  const { t } = await getTranslation();
  return { title: t('dashboard.serveur.titre') };
}
export const dynamic = 'force-dynamic';

export default async function GuildPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { t, locale } = await getTranslation();
  const actor = await guildActor(guildId);
  if (actor.status === 'anonymous') redirect('/api/auth/login');
  if (actor.status === 'forbidden') notFound();
  const { session, guild, access } = actor;

  const icon = guildIconUrl(guild);
  // Un gradé ne voit que ce que son grade ouvre : le bot ne lui sert que ces
  // modules-là, et les réglages transversaux se demandent un par un.
  const isManager = access.level === 'manager';

  // Les libellés des modules sont rendus par le bot : on lui dit dans quelle
  // langue le dashboard est affiché. Les deux lectures partent ensemble — la
  // page ne s'affiche pas plus vite si elles se suivent.
  const [data, botLocale] = botApiConfigured()
    ? await Promise.all([
        getGuildModules(guildId, locale, session.userId),
        can(access, SCOPE_LANGUE) ? getGuildLocale(guildId) : null,
      ])
    : [null, null];

  return (
    <>
      <DashNav session={{ username: session.username, avatar: session.avatar }} />
      <main className="container-dash min-h-[70vh] pb-20 pt-11">
        <div className="fu">
          <Link
            href="/dashboard"
            className="text-[14px] text-[var(--mut)] transition-colors hover:text-[var(--tx)]"
          >
            {t('dashboard.serveur.retour')}
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
              <p className="mt-[3px] text-[14px] text-[var(--mut)]">
                {t('dashboard.serveur.sousTitre', { nom: site.name })}
              </p>
            </div>
            {/* Les réglages hébergent la sauvegarde du serveur et les grades :
                ouverts à tous ceux qui peuvent le gérer, pas au seul
                propriétaire du bot — et à un gradé s'il tient la sauvegarde. */}
            {isManager || can(access, SCOPE_SAUVEGARDE) ? (
              <Link
                href={`/dashboard/${guildId}/reglages`}
                className="ml-auto shrink-0 rounded-[10px] border border-[var(--bd)] px-[16px] py-[9px] text-[14px] font-semibold transition-colors hover:border-[var(--acc-bd)]"
              >
                {t('dashboard.serveur.reglages')}
              </Link>
            ) : null}
          </div>

          {/* Dire au gradé À QUEL TITRE il est là : sans cette ligne, un
              dashboard qui ne montre que deux modules ressemble à une panne. */}
          {access.grades.length > 0 ? (
            <p className="mt-6 rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-4 text-[13px] text-[var(--mut)]">
              {t('dashboard.serveur.grade', { grades: access.grades.join(', ') })}
            </p>
          ) : null}

          {/* La langue du bot n'a de sens que si le bot répond : sans son API,
              on ne connaît ni les langues disponibles ni celle en vigueur. */}
          {data?.botPresent && botLocale ? (
            <div className="mt-8">
              <BotLangSelector
                guildId={guildId}
                current={botLocale.locale}
                locales={botLocale.locales}
              />
            </div>
          ) : null}

          <div className="mt-8">
            {data ? (
              data.botPresent ? (
                <ModulesClient guildId={guildId} modules={data.modules} />
              ) : (
                <div className="card p-6 text-center">
                  <p className="text-[var(--tx)]">
                    {t('dashboard.serveur.botAbsent', { nom: site.name })}
                  </p>
                  <p className="mt-1 text-[14px] text-[var(--mut)]">
                    {t('dashboard.serveur.botAbsentAide', { nom: site.name })}
                  </p>
                  <a
                    href={site.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-accent mt-4 px-4 py-2 text-[14px]"
                  >
                    {t('dashboard.serveur.botAbsentBouton')}
                  </a>
                </div>
              )
            ) : (
              <ReadOnlyModules t={t} />
            )}
          </div>

          {/* Effacer le serveur ne se délègue pas : administrateurs seulement. */}
          {data && isManager ? (
            <div className="mt-10">
              <DangerZone guildId={guildId} guildName={guild.name} />
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}

/**
 * Repli lecture seule quand l'API du bot n'est pas (encore) joignable.
 *
 * Les textes viennent du catalogue du SITE (`locales/<langue>/catalogue.json`),
 * pas du bot : c'est précisément le cas où le bot ne répond pas.
 */
function ReadOnlyModules({ t }: { t: Translate }) {
  return (
    <>
      <div className="mb-8 rounded-[16px] border border-amber-500/30 bg-amber-500/5 p-5 text-[14px] text-[var(--mut)]">
        {t('dashboard.serveur.lectureSeule')}
      </div>
      <div className="flex flex-col gap-[34px]">
        {categories.map((category) => (
          <section key={category.id}>
            <h2 className="flex items-center gap-[10px] font-display text-[18px] font-semibold">
              <span className="text-[20px]">{category.emoji}</span>{' '}
              {t(`catalogue.categories.${category.id}.titre`)}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {category.modules.map((id) => (
                <div key={id} className="card p-4">
                  <p className="text-[15px] font-semibold text-[var(--tx)]">
                    {t(`catalogue.modules.${id}.nom`)}
                  </p>
                  <p className="mt-1 text-[13px] text-[var(--mut)]">
                    {t(`catalogue.modules.${id}.description`)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
