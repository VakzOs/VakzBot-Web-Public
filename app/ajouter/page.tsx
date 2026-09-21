import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { getSession } from '@/lib/auth';
import { getTranslation } from '@/lib/i18n';
import { getInviteRequirement, getMyRequest, invitationsConfigured } from '@/lib/invitations';
import { AjouterClient } from './AjouterClient';

export async function generateMetadata() {
  const { t } = await getTranslation();
  return { title: t('invitations.titre') };
}

export const dynamic = 'force-dynamic';

/**
 * « Ajouter le bot » : la page où l'on présente un code d'accès.
 *
 * Le bot est auto-hébergé — il tourne sur le VPS de son propriétaire, à ses
 * frais — et n'a donc pas vocation à être ajouté par n'importe qui. Un code
 * tiré par le propriétaire depuis le dashboard ouvre le droit d'ajouter le bot
 * à UN serveur ; le bot le relit à son arrivée et repart s'il ne trouve rien.
 *
 * Elle ne sert qu'un visiteur : celui qui vient présenter un code, ou en
 * demander un. Le propriétaire, lui, gère la porte et les codes depuis le
 * dashboard (`app/dashboard/acces`) — ce n'est pas la même page parce que ce
 * n'est pas le même geste : ici on n'a encore aucun droit, là on les
 * distribue.
 */
export default async function AjouterPage() {
  const { t } = await getTranslation();
  const session = await getSession();

  // Sans API configurée, rien n'est vérifiable : on le dit plutôt que de laisser
  // saisir un code dans le vide. `null` porte cette ignorance jusqu'au client.
  const requirement = invitationsConfigured() ? await getInviteRequirement() : null;

  // Ce qu'on a répondu à ce visiteur, s'il a demandé un code. C'est le canal
  // qui marche à tous les coups : le message privé du bot échoue dès qu'aucun
  // serveur n'est commun, ce qui est le cas de quiconque demande un code.
  const maDemande =
    session && invitationsConfigured() ? await getMyRequest(session.userId) : null;

  return (
    <>
      <Nav />
      <main className="container-site min-h-[70vh] pb-20 pt-14">
        <div className="fu">
          <h1 className="font-display text-[34px] font-bold tracking-[-0.02em]">
            {t('invitations.titre')}
          </h1>
          <p className="mt-3 max-w-[680px] text-[16px] leading-[1.7] text-[var(--mut)]">
            {t('invitations.intro')}
          </p>

          <ol className="mt-6 max-w-[680px] space-y-2 text-[15px] leading-[1.6] text-[var(--mut)]">
            {['une', 'deux', 'trois'].map((etape, index) => (
              <li key={etape} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--surf)] text-[13px] font-bold text-[var(--acc2)]">
                  {index + 1}
                </span>
                {t(`invitations.etapes.${etape}`)}
              </li>
            ))}
          </ol>

          <AjouterClient
            require={requirement?.require ?? null}
            connected={Boolean(session)}
            maDemande={maDemande}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
