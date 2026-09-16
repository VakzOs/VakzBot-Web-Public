# `drapeaux.woff2`

Les drapeaux des langues, en police plutôt qu'en images.

Windows ne contient **aucun** glyphe de drapeau : `🇫🇷` n'est pas un caractère
mais une paire d'« indicateurs régionaux » (🇫 + 🇷) que la police est censée
composer en une image, et Segoe UI Emoji ne le fait pas. Le navigateur affiche
alors deux lettres dans des carrés. Aucun CSS n'y peut rien — le dessin n'est
pas dans la police du système. La seule façon d'avoir un vrai drapeau est donc
d'en fournir un dessin ; ce fichier en fournit **258 d'un coup**, un par pays,
sans rien à déposer quand une langue s'ajoute.

- Source : [`twemoji-colr-font`](https://www.npmjs.com/package/twemoji-colr-font)
  (Twemoji compilé en COLR/CPAL, vectoriel et coloré), sous
  [SIL Open Font License 1.1](./LICENCE-twemoji.txt).
- Réduite aux seuls indicateurs régionaux : 476 ko → 76 ko.

Régénérer (en dehors du dépôt, puis recopier le `.woff2`) :

```bash
pip install fonttools brotli
npm pack twemoji-colr-font && tar xzf twemoji-colr-font-*.tgz
python3 -m fontTools.subset package/twemoji.woff2 \
  --unicodes="U+1F1E6-1F1FF" --layout-features="*" \
  --flavor=woff2 --output-file=drapeaux.woff2
```

Le `@font-face` est déclaré dans `app/globals.css`, avec
`unicode-range: U+1F1E6-1F1FF` : le navigateur ne télécharge la police que s'il
a un drapeau à dessiner, et elle ne peut remplacer aucun autre caractère.
