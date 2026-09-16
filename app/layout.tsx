import type { Metadata } from 'next';
import { Space_Grotesk, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import { site } from '@/lib/site';
import { getTranslation } from '@/lib/i18n';
import { I18nProvider } from '@/components/I18n';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space',
  display: 'swap',
});
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter-tight',
  display: 'swap',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://vakzbot.vercel.app'),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  openGraph: {
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
  },
  ...(site.avatarUrl
    ? { icons: { icon: site.avatarUrl, shortcut: site.avatarUrl, apple: site.avatarUrl } }
    : {}),
};

/**
 * Applique le thème avant le premier paint (pas de flash). Défaut : sombre
 * (identité premium), sauf si l'utilisateur a explicitement choisi clair, ou
 * si le système préfère le clair et qu'aucun choix n'est mémorisé.
 */
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`;

/**
 * La langue est résolue ICI, une fois par requête (cookie puis `Accept-Language`),
 * et posée sur `<html lang>` — sans quoi un lecteur d'écran lirait de l'anglais
 * avec une prononciation française. Lire le cookie rend le rendu dynamique :
 * c'est la contrepartie assumée d'un site traduit sans préfixe de langue dans
 * l'URL.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dict, locales } = await getTranslation();

  return (
    <html
      lang={locale}
      className={`${spaceGrotesk.variable} ${interTight.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <I18nProvider locale={locale} dict={dict} locales={locales}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
