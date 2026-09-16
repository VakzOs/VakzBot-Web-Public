# Meow Bot — Site web

Vitrine + dashboard de [Meow Bot](https://github.com/VakzOs/Vakz-Bot-Public), construit avec **Next.js (App Router)**, **TypeScript** et **Tailwind CSS**, déployé sur **Vercel**.

- **/** — vitrine : présentation, modules, commandes, bouton **« Héberger le bot »** (GitHub). Meow Bot est **auto-hébergé** : chacun fait tourner sa propre instance, il n'y a pas d'invitation d'une instance publique.
- **/dashboard** — connexion Discord (OAuth2) puis liste de tes serveurs gérables, avec l'indication des serveurs où le bot est déjà présent.
- **/dashboard/&lt;serveur&gt;** — **configuration en direct** : activer/désactiver chaque module, éditer sa config via des **formulaires** (sélecteurs de salon/rôle, listes…) sur une page par module, et supprimer définitivement les données du serveur. L'édition passe par l'API HTTP du bot (voir `BOT_API_URL` / `BOT_API_TOKEN`). Sans elle, le dashboard reste en lecture seule.
- **/dashboard/&lt;serveur&gt;/catalogue** — les objets de la boutique du serveur : création, rareté, effets (le plafond d'objets reste réservé au propriétaire du bot).
- **/dashboard/&lt;serveur&gt;/gacha-personnages** — les personnages « maison », tirables sur ce serveur seulement, en plus du catalogue global.
- **/dashboard/&lt;serveur&gt;/reglages** — **sauvegarde du serveur** : sauvegarder à la demande, planifier des sauvegardes automatiques (expression cron), télécharger, restaurer (depuis une sauvegarde déposée sur le bot ou un fichier), et régler la rétention. Une sauvegarde contient toute la configuration **et** les données du serveur (argent, objets et inventaires, Route de l'Infini, niveaux…). Ouvert à qui peut gérer le serveur ; les panneaux d'instance restent réservés au propriétaire du bot : **monitoring**, mise à jour, **redémarrage périodique** (cadence cron + « redémarrer maintenant »), **statuts du bot** (les messages de profil affichés sous son nom, tirés au hasard à chaque démarrage), **logs**, tâches planifiées, catalogue du gacha.
- Le panneau **Monitoring** est un tableau de bord de santé, en lecture seule : uptime et état de la connexion Discord, latence de la passerelle, processeur, mémoire, retard de la boucle d'évènements, activité (commandes et interactions), alertes et erreurs, requêtes vers l'API Discord, commandes les plus appelées, machine hôte et taille de la base. Chaque chiffre est doublé d'une courbe — la question est rarement « combien ? », presque toujours « est-ce que ça monte ? ».
- La **période s'y choisit** : temps réel (les cinq dernières minutes, qui avancent), 1 h, 6 h, aujourd'hui, hier, avant-hier, le mois en cours, ou une **journée au calendrier**. Les bornes sont calculées dans le fuseau du navigateur et envoyées au bot en millisecondes : « hier » veut dire hier pour l'administrateur qui regarde, pas pour le fuseau du VPS. Une période glissante se rafraîchit toute seule (15 s, ajustable ou en pause) ; une période close ne se rafraîchit pas — la réinterroger ne peut rien apprendre, et le panneau l'affiche comme telle. Les courbes viennent de la base du bot : elles **survivent à ses redémarrages**, dans la limite de sa rétention (`METRICS_RETENTION_DAYS`, un mois par défaut), et le panneau annonce ce qui est réellement gardé. Un arrêt du bot laisse un **trou visible** dans la courbe plutôt qu'une ligne droite inventée, et un tableau des dernières mesures donne les mêmes chiffres en toutes lettres.
- Le panneau **Logs** lit les logs applicatifs du bot à deux distances : « Maintenant » montre sa mémoire vive (vidée à chaque redémarrage), et choisir une date lit son archive sur disque. Les niveaux se cochent librement (« Alertes + Erreurs » plutôt qu'un seuil), et la recherche porte sur le module, le message et l'erreur. La rétention réelle et l'occupation disque sont affichées telles que le bot les mesure — elles se règlent de son côté (`LOG_RETENTION_DAYS`, `LOG_ARCHIVE_LEVEL`), pas ici.
- **/terms** et **/privacy** — Conditions d'utilisation et Politique de confidentialité.

> Le **bot** Discord, lui, ne tourne pas sur Vercel (process persistant nécessaire) : il reste
> hébergé sur le VPS. Ce dépôt ne contient que le site web.

## Variables d'environnement

À renseigner sur Vercel (**Settings → Environment Variables**), puis **redéployer**.
*(requis)* = le dashboard ne fonctionne pas sans ; *(config live)* = sans les deux,
le dashboard reste en lecture seule ; le reste est facultatif.

| Variable | Rôle | Où la trouver |
| --- | --- | --- |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` *(requis)* | Connexion OAuth2 du dashboard | [Developer Portal](https://discord.com/developers/applications) → ton app → General Information → *Application ID* |
| `DISCORD_CLIENT_SECRET` *(requis)* | Échange OAuth2 du dashboard | Developer Portal → OAuth2 → *Client Secret* |
| `AUTH_SECRET` *(requis)* | Signature des sessions du dashboard | Génère-la : `openssl rand -hex 32` |
| `DISCORD_BOT_TOKEN` *(facultatif)* | Détecte les serveurs où le bot est déjà présent | Developer Portal → Bot → *Token* (le même que sur le VPS) |
| `BOT_API_URL` *(config live)* | URL publique **HTTPS** de l'API du bot | ex. `https://meowapi.tondomaine.com` (via tunnel/reverse-proxy) |
| `BOT_API_TOKEN` *(config live)* | Token partagé avec l'API du bot | même valeur que `WEB_API_TOKEN` côté bot (`openssl rand -hex 32`) |
| `BOT_OWNER_ID` *(facultatif)* | Débloque les panneaux réservés au propriétaire du bot : mise à jour (déclenche `/maj`), redémarrage, statuts, logs, tâches, catalogue gacha, plafonds, accès à La Chatterie | ton identifiant Discord (le même que sur le VPS) |
| `NEXT_PUBLIC_BOT_AVATAR_URL` *(facultatif)* | Force l'icône du site (favicon + logo). Non renseignée, l'avatar est demandé à Discord avec `DISCORD_BOT_TOKEN` ; sans token, c'est l'avatar Discord anonyme | clic droit sur l'avatar du bot dans Discord → *Copier le lien de l'image* |

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

## Scripts npm

À lancer à la racine du dépôt :

| Script | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement sur http://localhost:3000. |
| `npm run build` | Build de production — celui que Vercel exécute. |
| `npm run start` | Sert le build de production en local. |
| `npm run lint` | ESLint (`eslint-config-next`). |
| `npm run gen:emoji` | Regénère le sélecteur d'emojis du catalogue (`app/dashboard/[guildId]/catalogue/emoji-data.ts`). |

## Contenu éditable

- `lib/site.ts` — nom, slogan, liens, statistiques, avatar (`BOT_AVATAR_URL`), contact Discord (`contactDiscord`).
- `lib/modules.ts` — la liste des modules (par catégorie) et des commandes mises en avant.

## Déploiement sur Vercel

1. Sur [vercel.com](https://vercel.com) → **Add New → Project** → importe ce repo GitHub.
2. Vercel détecte automatiquement Next.js — aucun réglage nécessaire (`npm run build`).
3. Renseigne les variables d'environnement ci-dessus.
4. Déploie. Chaque `git push` sur `main` redéploie le site.

> `next.config.mjs` applique les en-têtes de sécurité (CSP, HSTS…) et fixe
> `Access-Control-Allow-Origin` sur un domaine précis : remplace-le par le tien
> si tu déploies le site sur ton propre domaine.

## Mise à jour automatique (`FORCE_UPDATE`)

Ton site suit **automatiquement** les mises à jour publiées : chaque nuit à
01:10 UTC (2 h 10 ou 3 h 10 à Paris selon la saison), le workflow
`.github/workflows/auto-update.yml` réaligne ta branche principale sur [`VakzOs/VakzBot-Web-Public`](https://github.com/VakzOs/VakzBot-Web-Public),
et Vercel redéploie tout seul le push qui en résulte. Le bot fait la même chose
de son côté avec `FORCE_UPDATE` dans son `.env`.

- **Fast-forward uniquement** : si tu as tes propres commits (site personnalisé),
  l'historique diverge et le workflow **ne touche à rien** — tu fusionnes
  l'upstream quand tu veux.
- **Pour le désactiver** : *Settings → Secrets and variables → Actions →
  Variables* → `FORCE_UPDATE` = `false`. Variable absente = mise à jour
  automatique **active**.
- Variables optionnelles du même écran : `FORCE_UPDATE_BRANCH` (branche
  suivie, `main` par défaut) et `FORCE_UPDATE_UPSTREAM` (dépôt source).
