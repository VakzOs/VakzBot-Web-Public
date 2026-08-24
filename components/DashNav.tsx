import Link from 'next/link';
import { site } from '@/lib/site';
import { ThemeToggle } from './ThemeToggle';

interface DashSession {
  username: string;
  avatar: string | null;
}

/** Nav du dashboard : logo + tag « Dashboard » + thème + utilisateur. */
export function DashNav({ session }: { session: DashSession }) {
  const initial = session.username.slice(0, 1).toUpperCase();
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--bd)] bg-[var(--nav)] backdrop-blur-[14px]">
      <nav className="container-dash flex h-[66px] items-center justify-between">
        <Link href="/" className="flex items-center gap-[11px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={site.avatarUrl}
            alt=""
            className="h-[34px] w-[34px] rounded-[10px] shadow-[0_6px_18px_-6px_var(--glow)]"
          />
          <span className="font-display text-[19px] font-bold">Meow Bot</span>
          <span className="ml-[2px] border-l border-[var(--bd)] pl-3 text-[13px] text-[var(--mut)]">
            Dashboard
          </span>
        </Link>

        <div className="flex items-center gap-[14px]">
          <ThemeToggle />
          <div className="flex items-center gap-[9px]">
            {session.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.avatar} alt="" className="h-8 w-8 rounded-full" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[var(--acc)] to-[var(--acc2)] text-[14px] font-bold text-white">
                {initial}
              </span>
            )}
            <span className="hidden text-[14px] font-semibold text-[var(--tx)] sm:block">
              {session.username}
            </span>
          </div>
          <a
            href="/api/auth/logout"
            className="text-[13px] text-[var(--mut)] transition-colors hover:text-[var(--tx)]"
          >
            Déconnexion
          </a>
        </div>
      </nav>
    </header>
  );
}
