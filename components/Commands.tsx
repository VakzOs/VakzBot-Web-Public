import { commands } from '@/lib/modules';

/** Section « Commandes » (fond alterné bg2, bords haut/bas). */
export function Commands() {
  return (
    <section
      id="commandes"
      className="mt-[96px] scroll-mt-[70px] border-y border-[var(--bd)] bg-[var(--bg2)] py-[88px]"
    >
      <div className="container-site">
        <div className="mx-auto max-w-[640px] text-center">
          <h2 className="font-display text-[32px] font-bold tracking-[-0.02em] sm:text-[40px]">
            Des commandes claires et rapides
          </h2>
          <p className="mt-4 text-[17px] text-[var(--mut)]">
            Des slash-commands modernes, avec autocomplétion et permissions par rôle.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-[900px] gap-[14px] sm:grid-cols-2">
          {commands.map((command) => (
            <div
              key={command.name}
              className="flex items-start gap-4 rounded-[16px] border border-[var(--bd)] bg-[var(--surf)] p-[18px]"
            >
              <code className="shrink-0 rounded-[9px] bg-[var(--codebg)] px-[11px] py-[6px] font-mono text-[14px] font-semibold text-[var(--acc2)]">
                {command.name}
              </code>
              <p className="mt-[3px] text-[14px] leading-[1.5] text-[var(--mut)]">
                {command.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
