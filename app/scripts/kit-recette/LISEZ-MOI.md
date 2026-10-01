# Kit de recette — générateur

Fabrique le dossier remis à un testeur (« À lire en premier », fiche de tests,
« Mon personnage », fiche de remontée, tableau de suivi et toutes les pièces
fictives), puis l'archive zip.

```bash
# depuis app/ ; GERIMMO_CHROME pointe un Chromium déjà installé si celui
# attendu par Playwright n'est pas téléchargé
GERIMMO_CHROME=/opt/pw-browsers/chromium \
  node scripts/kit-recette/fabriquer.mjs --sortie /tmp/kits
```

Prérequis : Playwright (déjà dans les dépendances), `python3` avec `openpyxl`
(tableau de suivi), `zip`.

- `donnees/proprietaire.mjs` — le personnage, les biens, les chiffres et le
  texte des tests du kit « Propriétaire bailleur ». C'est le seul fichier à
  modifier pour changer le scénario.
- `kit.mjs` — les PDF de lecture ; `documents.mjs` — les pièces fictives
  (diagnostics, bulletins, bail signé, factures…) ; `images.mjs` — signature et
  « photos » d'incident ; `suivi.py` — le tableau xlsx.
- `commun.mjs` — rendu Chromium, mini-balisage des fiches (`{champ}`,
  `[valeur]`, `<<bouton>>`, `@@fichier@@`), identifiants fictifs formellement
  valides (SIRET, IBAN banque 99999, TVA).

Les pièces portent toutes le filigrane « SPÉCIMEN » : elles n'ont aucune valeur
et ne reproduisent aucun document officiel. Les locataires et l'artisan restent
ceux des autres kits (Thomas Girard, Karim Haddad) pour que les tests croisés
restent cohérents.
