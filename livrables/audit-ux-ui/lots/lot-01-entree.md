# Lot 1 — Pages d'entrée (inscription, connexion, liens reçus)

Version dca39641 · banc fictif · 390 / 768 / 1440 px (téléphone et tablette simulés) · 9 écrans vus.
Planches : `../captures/E01.jpg` à `../captures/E09.jpg` (1440 à gauche, 390 à droite).

## Test des 10 secondes

| Écran | Où suis-je ? | Que faire ? | Où cliquer ? | Verdict |
|---|---|---|---|---|
| E01 Connexion | Oui | Oui | Oui | Réussi |
| E02 Inscription | Oui | Oui, mais long | Bouton en bas de 9 champs et de deux pavés de texte | Moyen |
| E03 Mot de passe oublié | Oui | Oui | Oui | Réussi |
| E05 Lien reçu | Oui | Non si le message « cookie » apparaît | « Rouvrir le lien » | Moyen |
| E06 Inscription artisan | Oui | Oui | Oui | Réussi, mais autre style |
| E07 Invitation artisan, lien faux | Faux sentiment d'être invité | Crée un compte pour rien | — | Échec |
| E08 Caution, lien faux | Titre trompeur | Aucune action proposée | Rien | Échec |
| E09 Lien expiré | Oui | Oui, après lecture d'un long paragraphe | « Recevoir un nouveau lien » | Moyen |

## Ce qui fonctionne

- Connexion et mot de passe oublié sont sobres, un seul formulaire, une seule action.
- La phrase « Propriétaire, locataire ou artisan : la même adresse e-mail ouvre votre espace » rassure.
- La photo en ambiance, à gauche sur ordinateur, donne une vraie impression haut de gamme.
- Les liens « Ouvrir mon espace » et « Inscrire mon entreprise » orientent bien chaque profil.

## Défauts significatifs

| Page | Capture | Problème observé | Conséquence | Solution proposée | Priorité |
|---|---|---|---|---|---|
| E02 Inscription | `E02.jpg` | Neuf champs avant tout essai : prénom, nom, adresse, code postal, ville, téléphone, statut, e-mail, parrainage. S'y ajoutent un pavé de 8 lignes sur le parrainage et une liste tronquée « Personne physiq » à 1440. | C'est le moment où l'on perd le plus de prospects : l'effort demandé paraît disproportionné pour « essayer ». | Ne demander que l'e-mail et le nom, puis le statut. L'adresse sera demandée au premier document produit. Remplacer le pavé de parrainage par un lien replié « J'ai un code de parrainage ». Élargir la liste. | P1 |
| E02 Inscription | `E02.jpg` | L'accroche de gauche mêle « récapitulatif 2044 » et une réserve (« Le réseau d'artisans dépend de la commune du bien… »). | Jargon fiscal et précaution juridique au moment où l'on veut donner envie. | Trois bénéfices simples (« Vos baux, vos loyers, vos quittances, au même endroit »). Les réserves vont sur la page Tarifs. | P2 |
| E07 Invitation artisan | `E07.jpg` | Un lien d'invitation faux ou expiré affiche « Vous avez reçu une invitation » et propose de créer un compte. | L'artisan s'inscrit puis découvre qu'il n'est relié à personne. | Vérifier le lien avant l'affichage. Sinon : « Ce lien d'invitation n'est plus valable. Demandez au propriétaire de vous renvoyer l'invitation. » | P2 |
| E08 Signature de la caution | `E08.jpg` | Le titre « Confirmer votre numéro de mobile » reste affiché au-dessus de « Ce lien n'est pas valable », et rien n'est proposé ensuite. | Le garant bloqué ne sait ni pourquoi ni qui contacter : une signature de bail peut s'arrêter là. | Titre « Ce lien n'est plus valable », et une action : « Demandez au propriétaire un nouveau lien » (avec son nom si connu). | P2 |
| E09 Lien expiré | `E09.jpg` | Explication de six lignes, avec « ouvert dans un autre navigateur que celui de la demande (anciens liens) ». | L'utilisateur lit un message technique au lieu d'agir. | Une phrase : « Ce lien a expiré ou a déjà servi. » Puis le bouton « Recevoir un nouveau lien » en évidence. Le détail technique peut être replié. | P2 |
| E05 Lien reçu | `E05.jpg` | En cas d'échec, le message parle de « cookie de sécurité » et demande d'« autoriser les cookies ». | Message incompréhensible pour un non-technicien. | « Ouvrez le lien sur le même téléphone ou ordinateur que celui où vous avez fait la demande », avec « Recevoir un nouveau lien ». | P3 |
| E06 Inscription artisan | `E06.jpg` | Gabarit différent des autres pages d'entrée : barre haute, bandeau sombre, grand vide à 1440, au lieu de la photo et de la colonne de formulaire. | Rupture de cohérence entre les trois profils dès la première page. | Reprendre le gabarit commun (photo à gauche sur ordinateur) avec une accroche propre aux artisans. | P3 |
| E01 à E09 au téléphone | `E01.jpg` | Une petite icône de feuille, décorative, est posée à côté du logo. | Elle ressemble à un bouton inactif ; l'utilisateur tape dessus sans résultat. | La retirer en mobile, ou l'intégrer au logo. | P3 |
| E06, E07 | `E06.jpg` | « Si un gestionnaire a déjà créé votre fiche » : un mot d'agence dans un parcours de propriétaires. | Vocabulaire étranger aux particuliers. | « Si un propriétaire a déjà enregistré votre entreprise ». | P3 |

## Notes (sur 5 : simplicité / esthétique / cohérence)

E01 5/4/4 · E02 2/3/3 · E03 5/4/5 · E05 3/4/4 · E06 4/3/2 · E07 3/3/2 · E08 2/3/3 · E09 3/4/4.
E04 (choix du mot de passe avec un lien valable) est évalué dans le parcours d'invitation du locataire (lot locataire).
