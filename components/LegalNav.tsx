import Link from 'next/link';
import { site } from '@/lib/site';
import { ThemeToggle } from './ThemeToggle';

/** Nav minimale des pages légales (logo + thème), container 820px. */
export function LegalNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--bd)] bg-[var(--nav)] backdrop-blur-[14px]">
      <nav className="container-legal flex h-[66px] items-center justify-between">
        <Link href="/" className="flex items-center gap-[11px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={site.avatarUrl}
            alt=""
            className="h-[34px] w-[34px] rounded-[10px] shadow-[0_6px_18px_-6px_var(--glow)]"
          />
          <span className="font-display text-[19px] font-bold">Meow Bot</span>
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
