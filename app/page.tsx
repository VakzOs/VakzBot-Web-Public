import { redirect } from 'next/navigation';

// Version publique : pas de page d'accueil ni de pages légales.
// La racine mène directement au tableau de bord, qui exige une
// connexion Discord (redirection vers /api/auth/login si non connecté).
export default function Home() {
  redirect('/dashboard');
}
