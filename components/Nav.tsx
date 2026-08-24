import Link from 'next/link';
import { site } from '@/lib/site';
import { ThemeToggle } from './ThemeToggle';

const links = [
  { href: '/#modules', label: 'Modules' },
  { href: '/#commandes', label: 'Commandes' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: site.githubUrl, label: 'GitHub', external: true },
];

/** Barre de navigation de la vitrine (sticky, blur, thème + « Héberger »). */
export function Nav() {
  return (
    <header
      className="sticky top-0 z-50 border-b border-[var(--bd)] bg-[var(--nav)] backdrop-blur-[14px]"
    >
      <nav className="container-site flex h-[66px] items-center justify-between">
        <Link href="/" className="flex items-center gap-[11px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={site.avatarUrl}
            alt=""
            className="h-[34px] w-[34px] rounded-[10px] shadow-[0_6px_18px_-6px_var(--glow)]"
          />
          <span className="font-display text-[19px] font-bold">Meow Bot</span>
        </Link>

        <div className="hidden items-center gap-[30px] text-[15px] md:flex">
          {links.map((l) =>
            l.external ? (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--mut)] transition-colors hover:text-[var(--tx)]"
              >
                {l.label}
              </a>
            ) : (
              <Link
                key={l.label}
                href={l.href}
                className="text-[var(--mut)] transition-colors hover:text-[var(--tx)]"
              >
                {l.label}
              </Link>
            ),
          )}
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <a
            href={site.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-accent px-[18px] py-[10px] text-[15px]"
          >
            Héberger
          </a>
        </div>
      </nav>
    </header>
  );
}
