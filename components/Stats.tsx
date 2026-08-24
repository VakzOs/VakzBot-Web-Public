import { site } from '@/lib/site';

/** Bande de statistiques sous le hero (4 cartes centrées). */
export function Stats() {
  return (
    <section className="container-site">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {site.stats.map((s) => (
          <div
            key={s.label}
            className="rounded-[18px] border border-[var(--bd)] bg-[var(--surf)] px-1 py-[26px] text-center"
          >
            <div className="font-display text-[34px] font-extrabold tracking-[-0.02em] text-[var(--tx)]">
              {s.value}
            </div>
            <div className="mt-1 text-[14px] text-[var(--mut)]">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
