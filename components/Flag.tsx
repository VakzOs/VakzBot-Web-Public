/**
 * Le drapeau d'une langue.
 *
 * Un `<span>` et rien de plus : le drapeau est l'emoji que la langue déclare
 * dans son `commun.json`, et c'est la police embarquée `Drapeaux`
 * (`app/globals.css`, provenance dans `public/polices/LISEZMOI.md`) qui le
 * dessine — y compris sous Windows, dont la police système ne contient aucun
 * glyphe de drapeau.
 *
 * Il n'y a donc rien à fournir par langue : la police couvre les 258 pays, et
 * ajouter une langue reste « déposer un dossier dans `locales/` ».
 *
 * `aria-hidden` parce qu'un drapeau ne désigne pas une langue : il accompagne
 * toujours son nom écrit, qui est ce que lisent les lecteurs d'écran.
 */
export function Flag({ flag, className }: { flag: string; className?: string }) {
  return (
    <span aria-hidden className={className} style={{ lineHeight: 1 }}>
      {flag}
    </span>
  );
}
