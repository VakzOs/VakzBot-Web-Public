/** @type {import('next').NextConfig} */

/**
 * En-têtes de sécurité appliqués à toutes les routes (pages + API).
 * Correctifs suite à un audit du site en production.
 */
const securityHeaders = [
  // HSTS : force HTTPS sur le domaine et tous ses sous-domaines.
  // Avant d'ajouter ce domaine à la liste preload des navigateurs,
  // vérifier que TOUS les sous-domaines servent du HTTPS valide.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // Anti-clickjacking : interdit l'intégration du site dans une iframe.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Empêche le navigateur de deviner le type MIME (attaque par sniffing).
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Limite les informations de referrer transmises aux sites tiers.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Désactive les API navigateur dont le site n'a pas besoin.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  // CORS : restreint l'accès cross-origin au seul domaine du site
  // (remplace le "Access-Control-Allow-Origin: *" trop permissif).
  {
    key: 'Access-Control-Allow-Origin',
    value: 'https://meowbot.vkzdev.com',
  },
  // Content Security Policy.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js injecte des scripts inline nécessaires à l'hydratation.
      // TODO : passer à une CSP basée sur nonce (middleware) pour
      // supprimer 'unsafe-inline'.
      "script-src 'self' 'unsafe-inline'",
      // Tailwind et styles inline de Next.
      "style-src 'self' 'unsafe-inline'",
      // Avatars/icônes Discord (bot, utilisateurs et serveurs du dashboard).
      "img-src 'self' data: https://cdn.discordapp.com https://cdn.discord.com",
      "font-src 'self'",
      // Le navigateur n'appelle que nos propres routes /api/*.
      "connect-src 'self'",
      // L'OAuth Discord se fait par redirection serveur (307), pas par formulaire.
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
