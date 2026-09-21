import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DashNav } from '@/components/DashNav';
import { getSession } from '@/lib/auth';
import { getTranslation } from '@/lib/i18n';
import { getInvitations, invitationsConfigured } from '@/lib/invitations';
import { AccesClient } from './AccesClient';

export async function generateMetadata() {
  const { t } = await getTranslation();
  return { title: t('invitations.proprio.titre') };
}

export const dynamic = 'force-dynamic';

/**
 * « Codes d'accès » : la porte du bot, ses codes, les demandes et les serveurs
 * entrés.
 *
 * Page d'INSTANCE, et non d'un serveur : ce qui se règle ici ne concerne aucun
 * serveur en particulier, d'où une adresse sans `[guildId]` — un segment fixe
 * l'emporte sur le segment dynamique voisin, et un identifiant Discord ne
 * s'écrit pas « acces ». Le propriétaire du bot est seul à y entrer ; pour les
 * autres la page n'existe pas (`notFound`) plutôt que de se refuser, ce qui
 * reviendrait à en annoncer l'existence.
 *
 * Elle reste, comme `app/ajouter`, dans un dossier à elle : cette
 * fonctionnalité est propre à une instance et doit pouvoir quitter le dépôt
 * sans laisser d'import orphelin dans un fichier partagé. Ce qu'elle laisse
 * ailleurs tient en un lien, sur la liste des serveurs.
 */
export default async function AccesPage() {
  const { t } = await getTranslation();
  const session = await getSession();
  if (!session) redirect('/api/auth/login');

  const owner = process.env.BOT_OWNER_ID;
  if (!owner || session.userId !== owner) notFound();

  // Sans API configurée, rien n'est consultable : le panneau le dit lui-même
  // plutôt que de montrer des listes vides. `null` porte cette ignorance
  // jusqu'au client.
  const state = invitationsConfigured() ? await getInvitations(session.userId) : null;

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
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] border border-[var(--bd)] bg-[var(--surf)] text-[26px]">
              🔑
            </span>
            <div>
              <h1 className="font-display text-[26px] font-bold">
                {t('invitations.proprio.titre')}
              </h1>
              <p className="mt-[3px] text-[14px] text-[var(--mut)]">
                {t('invitations.proprio.intro')}
              </p>
            </div>
          </div>

          <div className="mt-8">
            <AccesClient initial={state} />
          </div>
        </div>
      </main>
    </>
  );
}
