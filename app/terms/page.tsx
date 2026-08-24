import { LegalNav } from '@/components/LegalNav';
import { MiniFooter } from '@/components/MiniFooter';
import { LegalTabs } from '@/components/LegalTabs';
import { site } from '@/lib/site';

export const metadata = { title: 'Conditions d’utilisation' };

const LAST_UPDATED = '15 juillet 2026';

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-[10px] font-display text-[20px] font-semibold text-[var(--tx)]">{children}</h2>
  );
}

export default function TermsPage() {
  return (
    <>
      <LegalNav />
      <main className="container-legal min-h-[70vh] pb-20 pt-[52px]">
        <LegalTabs active="terms" />

        <div className="fu">
          <h1 className="font-display text-[34px] font-bold tracking-[-0.02em]">
            Conditions d&apos;utilisation
          </h1>
          <p className="mt-[10px] text-[14px] text-[var(--muted2)]">
            Dernière mise à jour : {LAST_UPDATED}
          </p>

          <div className="mt-9 flex flex-col gap-8 text-[16px] leading-[1.7] text-[var(--mut)]">
            <section>
              <H2>1. Acceptation</H2>
              <p>
                En ajoutant Meow Bot à un serveur Discord ou en utilisant ses commandes, tu acceptes
                les présentes conditions. Si tu n&apos;es pas d&apos;accord, n&apos;utilise pas le bot
                et retire-le de ton serveur.
              </p>
            </section>
            <section>
              <H2>2. Description du service</H2>
              <p>
                Meow Bot est un bot Discord gratuit proposant des modules de modération, de niveaux,
                d&apos;économie, de tickets, de suggestions, d&apos;alertes et d&apos;autres
                utilitaires. Le service est fourni « tel quel », sans garantie de disponibilité, et
                peut évoluer ou être interrompu à tout moment.
              </p>
            </section>
            <section>
              <H2>3. Utilisation acceptable</H2>
              <p className="mb-[10px]">Tu t&apos;engages à ne pas utiliser Meow Bot pour :</p>
              <ul className="flex list-disc flex-col gap-[6px] pl-[22px]">
                <li>enfreindre les Conditions d&apos;utilisation ou les Règles de Discord ;</li>
                <li>harceler, abuser ou nuire à d&apos;autres utilisateurs ;</li>
                <li>
                  contourner des restrictions, spammer, ou tenter de perturber le fonctionnement du
                  bot ou de son infrastructure ;
                </li>
                <li>diffuser des contenus illégaux.</li>
              </ul>
              <p className="mt-[10px]">
                En tant qu&apos;administrateur d&apos;un serveur, tu es responsable de la
                configuration du bot et de la façon dont tes membres l&apos;utilisent.
              </p>
            </section>
            <section>
              <H2>4. Disponibilité et modifications</H2>
              <p>
                Le service peut connaître des interruptions, des bugs ou des changements de
                fonctionnalités. Nous nous réservons le droit de modifier, suspendre ou arrêter tout
                ou partie du service, ainsi que ces conditions, à tout moment. Les changements
                importants seront reflétés par la date de mise à jour ci-dessus.
              </p>
            </section>
            <section>
              <H2>5. Limitation de responsabilité</H2>
              <p>
                Meow Bot est fourni gratuitement et sans garantie. Dans les limites permises par la
                loi, nous ne pouvons être tenus responsables des pertes de données, dommages ou
                préjudices résultant de l&apos;utilisation ou de l&apos;indisponibilité du bot.
              </p>
            </section>
            <section>
              <H2>6. Contact</H2>
              <p>
                Pour toute question relative à ces conditions, contacte-nous sur Discord :{' '}
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
