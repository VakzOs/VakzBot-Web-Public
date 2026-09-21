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

/**
 * Titre et description se lisent dans les locales, comme le reste du site : ils
 * s'affichent dans l'onglet du navigateur et dans les aperçus de partage, et un
 * texte figé ici laissait du français à un visiteur anglophone. D'où
 * `generateMetadata` (asynchrone) plutôt qu'un objet constant — la langue de la
 * requête ne se connaît pas au chargement du module.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslation();
  const accroche = t('site.accroche');
  const description = t('site.description');
  const titre = `${site.name} — ${accroche}`;

  return {
    metadataBase: new URL('https://vakzbot.vercel.app'),
    title: {
      default: titre,
      template: `%s · ${site.name}`,
    },
    description,
    openGraph: {
      title: titre,
      description,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: titre,
      description,
    },
    ...(site.avatarUrl
      ? { icons: { icon: site.avatarUrl, shortcut: site.avatarUrl, apple: site.avatarUrl } }
      : {}),
  };
}

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
