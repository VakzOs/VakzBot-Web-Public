import Link from 'next/link';
import { site } from '@/lib/site';

/** Pied de page de la vitrine. */
export function Footer() {
  return (
    <footer className="border-t border-[var(--bd)]">
      <div className="container-site flex flex-wrap items-center justify-between gap-[22px] py-9">
        <div className="flex items-center gap-[11px] font-display text-[17px] font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={site.avatarUrl} alt="" className="h-[30px] w-[30px] rounded-[9px]" /> Meow Bot
        </div>

        <div className="flex flex-wrap items-center gap-[26px] text-[14px] text-[var(--mut)]">
          <Link href="/#modules" className="transition-colors hover:text-[var(--tx)]">
            Modules
          </Link>
          <Link href="/#commandes" className="transition-colors hover:text-[var(--tx)]">
            Commandes
          </Link>
          <a
            href={site.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-[var(--tx)]"
          >
            GitHub
          </a>
          <Link href="/terms" className="transition-colors hover:text-[var(--tx)]">
            Conditions
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-[var(--tx)]">
            Confidentialité
          </Link>
        </div>

        <p className="text-[14px] text-[var(--muted2)]">© {new Date().getFullYear()} Meow Bot</p>
      </div>
    </footer>
  );
}
