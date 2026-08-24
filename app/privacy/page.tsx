import Link from 'next/link';
import { LegalNav } from '@/components/LegalNav';
import { MiniFooter } from '@/components/MiniFooter';
import { LegalTabs } from '@/components/LegalTabs';
import { site } from '@/lib/site';

export const metadata = { title: 'Politique de confidentialité' };

const LAST_UPDATED = '15 juillet 2026';

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-[10px] font-display text-[20px] font-semibold text-[var(--tx)]">{children}</h2>
  );
}

const S = ({ children }: { children: React.ReactNode }) => (
  <strong className="text-[var(--tx)]">{children}</strong>
);

export default function PrivacyPage() {
  return (
    <>
      <LegalNav />
      <main className="container-legal min-h-[70vh] pb-20 pt-[52px]">
        <LegalTabs active="privacy" />

        <div className="fu">
          <h1 className="font-display text-[34px] font-bold tracking-[-0.02em]">
            Politique de confidentialité
          </h1>
          <p className="mt-[10px] text-[14px] text-[var(--muted2)]">
            Dernière mise à jour : {LAST_UPDATED}
          </p>

          <div className="mt-9 flex flex-col gap-8 text-[16px] leading-[1.7] text-[var(--mut)]">
            <section>
              <p className="mb-4">
                Cette politique explique quelles données Meow Bot traite, pourquoi, et comment tu
                peux les faire supprimer. Nous collectons le strict nécessaire au fonctionnement du
                bot.
              </p>
              <div className="rounded-[16px] border border-[var(--acc-bd)] bg-[var(--acc-bg)] p-[18px] text-[15px]">
                🔓 <S>Auto-hébergement — tu es souverain de tes données.</S> Meow Bot est{' '}
                <S>open source</S>. Cette politique ne s&apos;applique qu&apos;à{' '}
                <S>cette instance et ce site</S>. Si tu fais tourner ta propre instance du bot (ton
                serveur, ta base de données), <S>tes données restent chez toi</S> : personne
                d&apos;autre n&apos;y a accès, et c&apos;est toi qui en es responsable.
              </div>
            </section>
            <section>
              <H2>1. Données que nous traitons</H2>
              <p className="mb-[10px]">Selon les modules activés sur ton serveur, le bot peut stocker :</p>
              <ul className="flex list-disc flex-col gap-2 pl-[22px]">
                <li>
                  <S>Identifiants Discord</S> : identifiants (ID) de serveurs, salons, rôles et
                  utilisateurs — jamais tes mots de passe.
                </li>
                <li>
                  <S>Configuration par serveur</S> : réglages des modules que tu définis.
                </li>
                <li>
                  <S>Données de fonctionnalités</S> : niveaux et XP, soldes d&apos;économie et
                  inventaires, avertissements et sanctions, suggestions et votes, tickets et leurs
                  transcriptions, anniversaires, rappels, messages planifiés.
                </li>
                <li>
                  <S>Contenu de messages</S> : certains modules (auto-modération, niveaux, logs,
                  tickets) lisent le contenu des messages pour fonctionner. Ce contenu est traité en
                  temps réel et n&apos;est conservé que lorsque la fonctionnalité l&apos;exige (ex.
                  transcription d&apos;un ticket, journal de logs).
                </li>
              </ul>
            </section>
            <section>
              <H2>2. Connexion au dashboard (OAuth2)</H2>
              <p>
                Si tu te connectes au tableau de bord, Discord nous transmet via OAuth2 ton profil de
                base (identifiant, nom, avatar) et la liste de tes serveurs, uniquement pour afficher
                ceux que tu peux gérer. Ta session est conservée dans un cookie sécurisé. Nous ne
                voyons jamais ton mot de passe Discord.
              </p>
            </section>
            <section>
              <H2>3. Pourquoi (finalités)</H2>
              <p>
                Ces données servent exclusivement à fournir les fonctionnalités du bot que tu as
                activées. Nous ne vendons pas tes données et ne les utilisons pas à des fins
                publicitaires.
              </p>
            </section>
            <section>
              <H2>4. Partage</H2>
              <p className="mb-[10px]">
                Les données ne sont partagées qu&apos;avec les prestataires nécessaires au service :
              </p>
              <ul className="flex list-disc flex-col gap-2 pl-[22px]">
                <li>
                  <S>Discord</S> (fonctionnement du bot et authentification) ;
                </li>
                <li>
                  l&apos;<S>hébergeur</S> du bot et le site (déployé sur Vercel) qui stockent les
                  données techniques nécessaires ;
                </li>
                <li>
                  pour certaines alertes, des <S>sources externes publiques</S> (Twitch, YouTube,
                  Reddit, flux RSS…) sont interrogées, sans leur transmettre tes données.
                </li>
              </ul>
            </section>
            <section>
              <H2>5. Conservation</H2>
              <p>
                Les données sont conservées tant que le bot est présent sur ton serveur et que la
                fonctionnalité concernée est utilisée. Si le bot est retiré d&apos;un serveur, les
                données de configuration associées peuvent être supprimées.
              </p>
            </section>
            <section>
              <H2>6. Tes droits</H2>
              <p className="mb-3">
                Tu peux demander l&apos;accès à tes données, leur rectification ou leur suppression.
              </p>
              <div className="rounded-[16px] border border-[rgba(52,211,153,.3)] bg-[rgba(52,211,153,.07)] p-[18px] text-[15px]">
                🧹 <S>Suppression en un clic.</S> Depuis le{' '}
                <Link href="/dashboard" className="font-semibold text-[var(--acc2)]">
                  tableau de bord
                </Link>
                , choisis un serveur que tu administres et utilise <S>« Supprimer mes données »</S> :
                le bot efface <S>immédiatement et définitivement</S> tout ce qu&apos;il a stocké pour
                ce serveur (configuration, niveaux, économie, tickets, suggestions…) puis quitte le
                serveur.
              </div>
              <p className="mt-3">
                Tu peux aussi simplement retirer le bot du serveur ou désactiver un module. Pour
                toute autre demande, écris-nous (voir Contact).
              </p>
            </section>
            <section>
              <H2>7. Mineurs</H2>
              <p>
                Meow Bot suit les Conditions de Discord : le service n&apos;est pas destiné aux
                personnes n&apos;ayant pas l&apos;âge minimum requis pour utiliser Discord.
              </p>
            </section>
            <section>
              <H2>8. Contact</H2>
              <p>
                Pour toute question ou demande relative à tes données, contacte-nous sur Discord :{' '}
                <span className="font-semibold text-[var(--acc2)]">{site.contactDiscord}</span>.
              </p>
            </section>
          </div>
        </div>
      </main>
      <MiniFooter />
    </>
  );
}
