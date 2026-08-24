import Link from 'next/link';

/** Onglets Conditions / Confidentialité (deux routes distinctes). */
export function LegalTabs({ active }: { active: 'terms' | 'privacy' }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      className="rounded-[10px] px-[18px] py-[10px] text-[14px] font-semibold transition-colors"
      style={
        on
          ? { background: 'var(--acc)', color: '#fff' }
          : { background: 'transparent', color: 'var(--mut)' }
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="mb-10 inline-flex rounded-[14px] border border-[var(--bd)] bg-[var(--surf)] p-[5px]">
      {tab('/terms', 'Conditions', active === 'terms')}
      {tab('/privacy', 'Confidentialité', active === 'privacy')}
    </div>
  );
}
