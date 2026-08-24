import { site } from '@/lib/site';

/** Bloc d'appel à l'action final. */
export function CTA() {
  return (
    <section id="heberger" className="container-site scroll-mt-[70px] py-[96px]">
      <div
        className="relative overflow-hidden rounded-[28px] border border-[var(--bd)] px-8 py-16 text-center"
        style={{ background: 'linear-gradient(160deg, var(--cta-from), transparent)' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-140px] h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-[var(--glow)] blur-[110px]"
        />
        <div className="relative">
          <h2 className="mx-auto max-w-[560px] font-display text-[32px] font-bold tracking-[-0.02em] sm:text-[40px]">
            Prêt à équiper ton serveur&nbsp;?
          </h2>
          <p className="mx-auto mt-[18px] max-w-[540px] text-[17px] leading-[1.6] text-[var(--mut)]">
            {site.name} est <strong className="text-[var(--tx)]">open source</strong> et{' '}
            <strong className="text-[var(--tx)]">auto-hébergé</strong> : clone le dépôt, lance ta
            propre instance, puis configure tout via <code className="code text-[14px]">/config</code>{' '}
            ou le dashboard web.
          </p>
          <a
            href={site.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-accent mt-8 rounded-[14px] px-[30px] py-4 text-[16px] shadow-[0_18px_40px_-14px_var(--glow)]"
          >
            Héberger le bot →
          </a>
        </div>
      </div>
    </section>
  );
}
