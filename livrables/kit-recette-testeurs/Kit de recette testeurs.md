# Kit de recette — testeurs (5 personas)

> Préparé le **2026-09-27** pour la recette de Gerimmo par des testeurs amis, sur
> **https://www.gerimmo.app**, avec de **vrais paiements** et la fonction interne
> **« Aide et retours »** pour toute remontée. Les testeurs n'ont rien à fournir :
> chacun joue un **personnage fictif** dont toutes les pièces sont prêtes ; seule
> son adresse e-mail est réelle.

## Ce qu'il y a dans le kit

| Dossier | Pour qui | Contenu |
|---|---|---|
| `00-commun/` | tous | « À lire en premier » (règles, calendrier, paiements, courriels), fiche de remontée d'information |
| `01-agence-immobiliere/` | Nadia Bensaïd, Horizon Gestion | 50 tests (dont 8 facultatifs), « Mon personnage », 37 pièces fictives (logo, signature, diagnostics, dossier locataire, garant, bail signé, photos d'incident, appel du syndic, congé, devis, imports CSV, tests négatifs) |
| `02-locataire-de-l-agence/` | Camille Roussel | 20 tests, 6 pièces : assurance, pièces réclamées, exemplaire signé, photos d'incident |
| `03-proprietaire-bailleur/` | Sophie Lemaire | 26 tests (dont le paiement réel), 25 pièces : diagnostics de ses deux biens, dossier de son locataire, bail signé, justificatifs du livre recettes-dépenses |
| `04-locataire-du-proprietaire/` | Thomas Girard | 15 tests, 6 pièces : assurance, pièces réclamées, exemplaire signé, photo d'incident |
| `05-artisan/` | Karim Haddad, Haddad Plomberie Chauffage | 16 tests, 10 pièces : décennale, RC pro, URSSAF, Kbis, RIB, photos de chantier, deux factures |
| `06-coordinateur/` | le porteur | guide (préparation, ouverture de l'agence, validation de l'artisan, retours, paiements, nettoyage), tableau d'affectation, suivi consolidé |
| `zips/` | à envoyer | une archive par dossier |

Chaque dossier persona contient : `00-A-lire-en-premier.pdf`, `01-Fiche-de-tests-….pdf`,
`02-Mon-personnage-….pdf`, `03-Fiche-de-remontee.pdf`, `04-Suivi-des-tests-….xlsx` et
`documents/`. Les fichiers `.md` sont la version texte des fiches (non incluse dans
les archives).

## Le fil rouge

1. **J0** — le coordinateur vérifie Santé (Stripe en clé réelle, portail client),
   ouvre « Horizon Gestion (recette) » depuis la console, envoie les archives.
2. **J1** — l'agence s'installe (profil, résidence et lots, clé, diagnostics, mandat),
   la propriétaire s'inscrit et souscrit, l'artisan s'inscrit ; le coordinateur le valide.
3. **J2** — mise en location : fiches, invitations, pièces réclamées, bail signé
   (circuit manuel), état des lieux d'entrée, dépôt de garantie, carnet d'artisans.
4. **J3** — loyers : avis, relance à 1 jour, encaissement, quittance ; prorata et
   paiement partiel côté propriétaire.
5. **J3–J5** — incidents : fuite (agence, créneau choisi par la locataire) et
   radiateur (propriétaire, dates proposées par le locataire, « autre cause »).
6. **J5–J7** — messages, documents, charges, comptabilité, clôture, rapport de
   gestion au mandant, fiscalité ; imports et agent en facultatif ; pour finir,
   congé, état des lieux de sortie et restitution du dépôt.

## Choix faits pour coller à l'application (relevés dans le code au 27/09)

- **Chaque pièce est unique** : Gerimmo refuse un fichier déjà rangé dans la même
  organisation (empreinte SHA-256). D'où un « bail signé » distinct du PDF généré,
  des copies de secours pour les diagnostics, et des pièces réparties entre le
  gestionnaire et le locataire sans recouvrement.
- **Pas de photo d'état des lieux** : la grille se saisit à l'écran (états Neuf,
  Bon, Usagé, Mauvais, Absent ; compteurs et clés tapés) ; « Mon personnage » donne
  les valeurs.
- **Formats acceptés** : PDF complets, JPEG, PNG ; logo sous 200 Ko (version
  600 × 150 fournie), signature 660 × 200 ; CSV en UTF-8 avec BOM, `;`, point décimal,
  dates AAAA-MM-JJ.
- **Identifiants fictifs mais bien formés** : SIREN en 000… (clé de Luhn juste),
  IBAN sur un code banque fictif (clés justes), téléphones de la plage réservée à la
  fiction. Le SIRET de l'artisan est vérifié à la main par la supervision.
- **Aucune adresse inventée** : les personnages secondaires (mandant, garant, agent)
  utilisent des alias « + » de l'adresse du testeur agence, pour ne jamais faire
  rebondir un envoi.
- **Paiements réels** : propriétaire 5,99 €/mois pour son second bien ; agence
  39 €/mois jusqu'à 10 lots sous mandat actif si elle est ouverte en essai ; carte
  débitée à la fin de l'essai.
- **Remontée** : « Aide et retours » n'envoie aucun courriel de réponse et les
  nouveaux signalements (gravité « Majeur » par défaut) n'apparaissent pas dans
  « Aujourd'hui » : le guide du coordinateur en tient compte.

Tous les documents fictifs portent un filigrane « SPÉCIMEN — DOCUMENT FICTIF » et
une mention en pied ; aucun ne reprend l'apparence d'un titre officiel.

## Régénérer

Tout est produit par `_generateur/generer_kit.py` (voir `_generateur/LISEZ-MOI.md`) :
données dans `univers.py`, tests dans `tests_*.py`, textes dans `textes_*.py`.

## Liens

- [[Recette de production]] — le tour de production fait par l'agent le 27/09.
- [[Retours utilisateurs]] — la fonction de remontée utilisée par les testeurs.
- [[Recette - test par sprint et persona]] — l'historique des recettes par sprint.
