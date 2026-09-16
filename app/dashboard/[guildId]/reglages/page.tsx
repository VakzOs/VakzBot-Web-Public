import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DashNav } from "@/components/DashNav";
import { getSession } from "@/lib/auth";
import { canManage, fetchUserGuilds } from "@/lib/discord";
import {
  botApiConfigured,
  getBotTasks,
  getChatterieAccess,
  getDeploy,
  getGachaImport,
  getGuildBackup,
  getGuildMeta,
  getMetrics,
  getPresence,
  getRestart,
  getSyncPublic,
  getWishlistLimit,
} from "@/lib/botApi";
import { getTranslation } from "@/lib/i18n";
import { SettingsClient } from "./SettingsClient";

export async function generateMetadata() {
  const { t } = await getTranslation();
  return { title: t("reglages.titre") };
}
export const dynamic = "force-dynamic";

/**
 * Les réglages qui ne se rangent pas dans un module.
 *
 * Deux niveaux cohabitent ici : ce qui appartient au SERVEUR — sa sauvegarde —
 * et ce qui pilote l'INSTANCE du bot : son état de santé, la mise à jour, le redémarrage périodique,
 * statuts affichés sous son nom, tâches planifiées, catalogue du gacha. Le premier est ouvert à qui peut gérer le serveur ; le second reste
 * réservé au propriétaire du bot, et ses panneaux disparaissent pour les autres.
 */
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const { t } = await getTranslation();
  const session = await getSession();
  if (!session) redirect("/api/auth/login");

  const guilds = await fetchUserGuilds(session.accessToken);
  if (!guilds) redirect("/api/auth/login");
  const guild = guilds.find((g) => g.id === guildId && canManage(g));
  if (!guild) notFound();

  const isOwner =
    Boolean(process.env.BOT_OWNER_ID) &&
    session.userId === process.env.BOT_OWNER_ID;
  if (!botApiConfigured()) redirect(`/dashboard/${guildId}`);

  // Les panneaux d'instance ne sont même pas interrogés pour un simple admin de
  // serveur : le bot les refuserait, et la page n'a pas à attendre ces réponses.
  const [
    backup,
    meta,
    metrics,
    deploy,
    tasks,
    gachaImport,
    wishlist,
    presence,
    restart,
    chatterie,
    syncPublic,
  ] = await Promise.all([
      getGuildBackup(guildId, session.userId),
      getGuildMeta(guildId),
      isOwner ? getMetrics(session.userId) : null,
      isOwner ? getDeploy() : null,
      isOwner ? getBotTasks(session.userId) : null,
      isOwner ? getGachaImport() : null,
      isOwner ? getWishlistLimit() : null,
      isOwner ? getPresence(session.userId) : null,
      isOwner ? getRestart(session.userId) : null,
      isOwner ? getChatterieAccess(session.userId) : null,
      isOwner ? getSyncPublic(session.userId) : null,
    ]);

  return (
    <>
      <DashNav
        session={{ username: session.username, avatar: session.avatar }}
      />
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
              ⚙️
            </span>
            <div>
              <h1 className="font-display text-[26px] font-bold">
                {t("reglages.titre")}
              </h1>
              <p className="mt-[3px] text-[14px] text-[var(--mut)]">
                {isOwner
                  ? t("reglages.introProprio")
                  : t("reglages.introAdmin")}
              </p>
            </div>
          </div>

          <div className="mt-8">
            <SettingsClient
              guildId={guildId}
              isOwner={isOwner}
              backup={backup}
              channels={meta?.channels ?? []}
              metrics={metrics}
              deploy={deploy}
              tasks={tasks?.tasks ?? []}
              gachaImport={gachaImport}
              wishlistLimit={wishlist?.max ?? null}
              guildName={guild.name}
              chatterieAccess={chatterie}
              presence={presence}
              restart={restart}
              syncPublic={syncPublic}
            />
          </div>
        </div>
      </main>
    </>
  );
}
