import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Accent Discord blurple + violet.
        brand: {
          DEFAULT: '#5865f2',
          400: '#a78bfa',
          600: '#4752c4',
        },
        // Tokens sémantiques adossés aux variables CSS (voir globals.css).
        bg: 'var(--bg)',
        bg2: 'var(--bg2)',
        surf: 'var(--surf)',
        surfhover: 'var(--surf-hover)',
        surfsolid: 'var(--surf-solid)',
        line: 'var(--bd)',
        tx: 'var(--tx)',
        mut: 'var(--mut)',
        muted2: 'var(--muted2)',
        acc: 'var(--acc)',
        acc2: 'var(--acc2)',
      },
      fontFamily: {
        sans: ['var(--font-inter-tight)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space)', 'var(--font-inter-tight)', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
