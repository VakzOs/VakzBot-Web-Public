'use client';

import { useEffect, useState } from 'react';

/** Bascule clair/sombre (classe `dark` sur <html> + persistance localStorage). */
export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const root = document.documentElement;
    const next = !root.classList.contains('dark');
    root.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      /* localStorage indisponible : on garde juste l'état de session */
    }
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title="Thème clair / sombre"
      aria-label="Basculer le thème clair / sombre"
      className="inline-flex items-center justify-center rounded-[10px] border px-3 py-2 text-[15px] leading-none"
      style={{ background: 'var(--surf)', borderColor: 'var(--bd)', color: 'var(--tx)' }}
    >
      {dark ? '☀' : '☾'}
    </button>
  );
}
