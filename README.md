# Meow Bot — Panel web (version publique)

Panel de configuration de [Meow Bot](https://github.com/VakzOs/Vakz-Bot-Public), construit avec **Next.js (App Router)**, **TypeScript** et **Tailwind CSS**, déployé sur **Vercel**.

Cette version **publique et allégée** ne contient **que le tableau de bord** : pas de page d'accueil ni de pages légales. La racine (**/**) redirige directement vers **/dashboard**.

- **/dashboard** — connexion Discord (OAuth2), liste de tes serveurs gérables, et **configuration en direct** : activer/désactiver chaque module, éditer sa config via des **formulaires** (sélecteurs de salon/rôle, listes…), et (pour le propriétaire du bot) déclencher une **mise à jour** avec choix de branche + statut/dernier résultat. L'édition passe par l'API HTTP du bot (voir `BOT_API_URL` / `BOT_API_TOKEN`). Sans elle, le dashboard reste en lecture seule.

> Le **bot** Discord, lui, ne tourne pas sur Vercel (process persistant nécessaire) : il reste
> hébergé sur le VPS. Ce dépôt ne contient que le panel web.

## Variables d'environnement (obligatoire)

À renseigner sur Vercel (**Settings → Environment Variables**), puis **redéployer** :

| Variable | Rôle | Où la trouver |
| --- | --- | --- |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | Connexion OAuth2 du dashboard | [Developer Portal](https://discord.com/developers/applications) → ton app → General Information → *Application ID* |
| `DISCORD_CLIENT_SECRET` | Échange OAuth2 du dashboard | Developer Portal → OAuth2 → *Client Secret* |
| `AUTH_SECRET` | Signature des sessions du dashboard | Génère-la : `openssl rand -hex 32` |
| `NEXT_PUBLIC_BOT_AVATAR_URL` *(optionnel)* | Avatar du bot en icône du site (favicon + logo) | clic droit sur l'avatar du bot dans Discord → *Copier le lien de l'image* |
| `DISCORD_BOT_TOKEN` *(optionnel)* | Détecte les serveurs où le bot est déjà présent | Developer Portal → Bot → *Token* (le même que sur le VPS) |
| `BOT_API_URL` *(config live)* | URL publique **HTTPS** de l'API du bot | ex. `https://meowapi.tondomaine.com` (via tunnel/reverse-proxy) |
| `BOT_API_TOKEN` *(config live)* | Token partagé avec l'API du bot | même valeur que `WEB_API_TOKEN` côté bot (`openssl rand -hex 32`) |
| `BOT_OWNER_ID` *(optionnel)* | Autorise le panneau « Mettre à jour » (déclenche `/maj`) | ton identifiant Discord (le même que sur le VPS) |

### Configuration en direct (API du bot)

Le dashboard modifie la config **via l'API HTTP du bot** (le SQLite du VPS n'est pas joignable
depuis Vercel). Sur le VPS, dans le `.env` du bot :

```
WEB_API_TOKEN=<le même secret que BOT_API_TOKEN>
WEB_API_PORT=3210
```

puis `docker compose up -d --build`. **Place l'API derrière HTTPS** (le token ne doit pas transiter
en clair) :

- **Cloudflare Tunnel** (recommandé, aucun port à ouvrir) : ajoute un *public hostname* pointant
  vers `http://<hôte>:3210`, et mets `BOT_API_URL=https://<ce-hostname>`.
- **Caddy** (profil Compose `proxy` côté bot) : `CADDY_DOMAIN` + `CADDY_EMAIL`, ports 80/443 ouverts.

Sans `BOT_API_URL`/`BOT_API_TOKEN`, le dashboard reste en lecture seule.

## Redirection OAuth2 (obligatoire pour le dashboard)

Dans le Developer Portal → **OAuth2 → Redirects**, ajoute :

```
https://<ton-domaine-vercel>/api/auth/callback
```

(et `http://localhost:3000/api/auth/callback` pour le dev local). Sans ça, Discord refusera la connexion au dashboard.

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # puis remplis les valeurs
npm run dev
# http://localhost:3000
```

## Contenu éditable

- `lib/site.ts` — nom, slogan, liens, statistiques, avatar (`BOT_AVATAR_URL`), contact Discord (`contactDiscord`).
- `lib/modules.ts` — la liste des modules (par catégorie) et des commandes mises en avant.

## Déploiement sur Vercel

1. Sur [vercel.com](https://vercel.com) → **Add New → Project** → importe ce repo GitHub.
2. Vercel détecte automatiquement Next.js — aucun réglage nécessaire (`npm run build`).
3. Renseigne les variables d'environnement ci-dessus.
4. Déploie. Chaque `git push` sur `main` redéploie le site.
