/**
 * Le catalogue de la vitrine : quelles catégories, quels modules, dans quel
 * ordre. **Aucun texte ici** — titres, accroches et descriptions vivent dans
 * `locales/<langue>/catalogue.json`, sous les identifiants ci-dessous.
 *
 * C'est ce qui permet d'ajouter une langue sans toucher à ce fichier : la
 * structure est la même pour tout le monde, seuls les mots changent. Les
 * identifiants de module reprennent ceux du bot (`BotModule.name`) pour qu'une
 * clé se retrouve d'un dépôt à l'autre.
 */
export interface Category {
  id: string;
  emoji: string;
  /** Identifiants des modules de la catégorie (clés de `catalogue.modules.*`). */
  modules: string[];
}

export const categories: Category[] = [
  {
    id: 'security',
    emoji: '🛡️',
    modules: [
      'automod',
      'moderation',
      'logs',
      'reports',
      'rules',
      'verification',
      'configbackup',
    ],
  },
  {
    id: 'community',
    emoji: '👥',
    modules: [
      'welcome',
      'birthdays',
      'suggestions',
      'tickets',
      'reactionroles',
      'interactivemessages',
      'interserver',
      'stickymessages',
      'autoroles',
      'streamalerts',
      'streamer',
    ],
  },
  {
    id: 'engagement',
    emoji: '✨',
    modules: [
      'levels',
      'economy',
      'giveaways',
      'advent',
      'starboard',
      'customcommands',
      'wordreactions',
      'messageprofiles',
    ],
  },
  {
    id: 'utility',
    emoji: '🧰',
    modules: [
      'reminders',
      'scheduledmessages',
      'serverstats',
      'tempvoice',
      'freegames',
      'patchnotes',
      'info',
    ],
  },
  {
    id: 'fun',
    emoji: '🎮',
    modules: ['music', 'games', 'items', 'bingo', 'market', 'route'],
  },
];

/**
 * Les quelques commandes qui restent côté membre. Le staff ne passe plus par le
 * chat : tout se règle au dashboard. Ne listent donc ici que les commandes
 * qu'un membre tape pour JOUER ou consulter son profil — pas une commande de
 * configuration.
 *
 * **Le nom se traduit aussi.** Le bot déploie ses commandes serveur par
 * serveur, dans la langue du serveur, noms compris : c'est `/rang` chez l'un et
 * `/rank` chez l'autre. Afficher un nom figé ici laisserait donc du français
 * dans une page anglaise. Nom et description vivent ensemble sous
 * `catalogue.commandes.<id>` (`nom`, `texte`) ; plusieurs commandes d'une même
 * ligne se séparent par « · » dans la traduction, comme elles s'affichent.
 */
export const commands: string[] = [
  'rang',
  'solde',
  'inventaire',
  'hdv',
  'route',
  'minijeux',
  'play',
  'suggestion',
];

/** Les dix modules qui défilent dans les bulles du hero. */
export const heroBubbles: { id: string; emoji: string }[] = [
  { id: 'economy', emoji: '💰' },
  { id: 'tickets', emoji: '🎟️' },
  { id: 'giveaways', emoji: '🎉' },
  { id: 'streamalerts', emoji: '📣' },
  { id: 'welcome', emoji: '👋' },
  { id: 'suggestions', emoji: '💡' },
  { id: 'automod', emoji: '🛡️' },
  { id: 'levels', emoji: '📈' },
  { id: 'starboard', emoji: '⭐' },
  { id: 'reminders', emoji: '⏰' },
];
