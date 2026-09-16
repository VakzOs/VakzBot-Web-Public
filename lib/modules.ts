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
    ],
  },
  {
    id: 'fun',
    emoji: '🎮',
    modules: ['music', 'games', 'items', 'bingo'],
  },
];

/**
 * Sélection de commandes phares. Le NOM ne se traduit pas : c'est la commande
 * réellement enregistrée sur Discord. Seule sa description est dans les locales
 * (`catalogue.commandes.<id>`).
 */
export interface CommandItem {
  id: string;
  name: string;
}

export const commands: CommandItem[] = [
  { id: 'classement', name: '/classement' },
  { id: 'niveau', name: '/niveau' },
  { id: 'solde', name: '/solde · /daily' },
  { id: 'suggestion', name: '/suggestion' },
  { id: 'jeuxgratuits', name: '/jeuxgratuits' },
  { id: 'play', name: '/play' },
  { id: 'rappel', name: '/rappel' },
  { id: 'dire', name: '/dire' },
  { id: 'report', name: '/report' },
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
