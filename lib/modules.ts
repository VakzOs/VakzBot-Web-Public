export interface ModuleItem {
  name: string;
  description: string;
}

export interface Category {
  id: string;
  title: string;
  emoji: string;
  blurb: string;
  modules: ModuleItem[];
}

/** Les modules du bot, regroupés par catégorie (miroir de `/config`). */
export const categories: Category[] = [
  {
    id: 'security',
    title: 'Sécurité & Modération',
    emoji: '🛡️',
    blurb: 'Garde ton serveur sain et sous contrôle.',
    modules: [
      { name: 'Automod', description: 'Filtres anti-spam, liens, mots interdits et raids.' },
      { name: 'Modération', description: 'Sanctions, casier par membre, historique complet.' },
      { name: 'Logs', description: 'Journalisation des événements et purge de messages.' },
      { name: 'Signalements', description: 'Les membres signalent au staff, avec suivi.' },
      { name: 'Règlement', description: 'Règlement interactif avec validation.' },
      { name: 'Vérification', description: 'Filtre les nouveaux arrivants avant l’accès.' },
      { name: 'Sauvegarde config', description: 'Exporte et restaure la configuration du serveur.' },
    ],
  },
  {
    id: 'community',
    title: 'Communauté',
    emoji: '👥',
    blurb: 'Accueille, anime et fais grandir ta communauté.',
    modules: [
      { name: 'Bienvenue', description: 'Messages et carte-image d’accueil personnalisables.' },
      { name: 'Anniversaires', description: 'Souhaite les anniversaires automatiquement.' },
      { name: 'Suggestions', description: 'Votes, classement, recherche, récompenses.' },
      { name: 'Tickets', description: 'Support en salon ou fil privé, archivage inclus.' },
      { name: 'Rôles-réactions', description: 'Attribue des rôles via des réactions ou boutons.' },
      { name: 'Messages interactifs', description: 'Embeds réutilisables avec boutons de rôle et liens.' },
      { name: 'Interserveurs', description: 'Relie des salons de serveurs différents.' },
      { name: 'Messages épinglés', description: 'Un message qui reste toujours en bas d’un salon.' },
      { name: 'Rôles automatiques', description: 'Rôles à l’arrivée et rôle en vocal.' },
      { name: 'Alertes stream & flux', description: 'Twitch, YouTube, Reddit, RSS et Dealabs.' },
    ],
  },
  {
    id: 'engagement',
    title: 'Engagement',
    emoji: '✨',
    blurb: 'Récompense l’activité et fidélise tes membres.',
    modules: [
      { name: 'Niveaux', description: 'XP messages et vocal, cartes de rang, classement.' },
      { name: 'Économie', description: 'Monnaie, boutiques, récompenses quotidiennes, vocal.' },
      { name: 'Giveaways', description: 'Concours par bouton avec tirage automatique.' },
      { name: 'Calendrier de l’Avent', description: 'Une récompense par jour en décembre.' },
      { name: 'Starboard', description: 'Met en avant les messages les plus appréciés.' },
      { name: 'Commandes personnalisées', description: 'Auto-réponses texte ou embed avec variables.' },
      { name: 'Réactions de mots', description: 'Réactions automatiques sur mots-clés.' },
      { name: 'Profils de messages', description: 'Fais parler le bot sous un pseudo et un avatar.' },
    ],
  },
  {
    id: 'utility',
    title: 'Utilitaires',
    emoji: '🧰',
    blurb: 'Les outils qui font gagner du temps au quotidien.',
    modules: [
      { name: 'Rappels', description: 'Rappels programmés pour toi ou le serveur.' },
      { name: 'Messages programmés', description: 'Publie des messages à intervalles réguliers.' },
      { name: 'Compteurs de serveur', description: 'Salons vocaux affichant membres, boosts, rôles…' },
      { name: 'Salons vocaux temporaires', description: 'Join-to-create avec panneau de gestion complet.' },
      { name: 'Jeux gratuits', description: 'Annonce Steam, Epic Games et GOG.' },
      { name: 'Patchnotes', description: 'Suit les notes de mise à jour de jeux et logiciels.' },
    ],
  },
  {
    id: 'fun',
    title: 'Fun',
    emoji: '🎮',
    blurb: 'De quoi divertir ta communauté.',
    modules: [
      { name: 'Jeux', description: 'Mini-jeux et statistiques par membre.' },
      { name: 'Objets', description: 'Inventaire, objets à collectionner et à échanger.' },
      { name: 'Bingo', description: 'Organise des parties de bingo animées.' },
    ],
  },
];

export interface CommandItem {
  name: string;
  description: string;
}

/** Sélection de commandes phares à mettre en avant. */
export const commands: CommandItem[] = [
  { name: '/config', description: 'Ouvre le panneau central pour activer et régler chaque module.' },
  { name: '/niveau', description: 'Affiche ta carte de rang et ta progression d’XP.' },
  { name: '/solde · /daily', description: 'Consulte ta monnaie et récupère ta récompense quotidienne.' },
  { name: '/suggestion', description: 'Propose une idée soumise au vote de la communauté.' },
  { name: '/jeuxgratuits', description: 'Liste les jeux gratuits à récupérer du moment.' },
  { name: '/rappel', description: 'Programme un rappel pour ne rien oublier.' },
  { name: '/dire', description: 'Fais parler le bot sous un profil personnalisé (staff).' },
  { name: '/report', description: 'Signale un membre au staff en toute discrétion.' },
];
