# Mission 12 — Couverture des routes relevées dans AUD-033

Relecture de `8f2e6178` et de l’inventaire `preuves/routes-source.csv` de l’audit produit du 27 novembre. Les conclusions de cette table proviennent de la lecture des routes et des preuves de l’audit. Le statut navigateur correspond à cette recette de mission.

| Route | Qualification | Cas à vérifier dans le navigateur |
|---|---|---|
| `/agence/[orgId]/diagnostics/[diagnosticId]` | Redirection voulue | Un diagnostic de bien ouvre la section Diagnostics du bien. Un diagnostic de lot ouvre la fiche correspondante. Une référence inconnue revient aux alertes. |
| `/agence/[orgId]/incidents/[incidentId]` | Redirection voulue | La liste affiche l’incident indiqué par `sel` dans l’espace du rôle connecté. |
| `/agence/[orgId]/lots/[lotId]` | Redirection voulue | La fiche imbriquée dans le parc affiche le lot. Un lot absent revient au parc. |
| `/artisan/panne` | État de panne non essayé | Une lecture infructueuse affiche l’aide. Un accès ordinaire avec lecture réussie renvoie à l’accueil artisan. |
| `/conditions/versions/[document]/[version]` | Version valide non essayée | Une paire réellement archivée affiche le texte et ses dates. Une version inconnue retourne 404. Le rendu de version est couvert par `conditions-versions-pages.test.ts`. |
| `/espaces` | Sélecteur non essayé avec plusieurs destinations | L’espace unique entraîne une redirection prévue. Une invitation en attente ou plusieurs accès font apparaître le sélecteur. |
| `/invitations/[invitationId]` | Invitation destinée au compte non essayée | Une invitation fictive valide doit aboutir à la décision du destinataire connecté. La connexion préalable est attendue pour une visite anonyme. |
| `/nouveau-mot-de-passe` | Véritable session de récupération non essayée dans le balayage | La demande fictive de récupération ouvre une session qui autorise le formulaire. Une visite ordinaire applique la garde. |
| `/quittance/[quittanceId]` | Référence périmée dans la matrice | Les deux 404 du balayage utilisaient la même référence. Le rapport a par ailleurs lu une quittance créée pour Acacias. Rejouer avec une quittance issue du jeu de recette actuel. |

Les consultations de code ci-dessus n’établissent pas de nouveau défaut de ces routes. Les variantes d’accès à confirmer séparément sont le retrait d’un mandat du portefeuille, un tiers délégué et un accès provisoire de supervision. Le dépôt contient déjà les scénarios navigateur « artisan refusé » dans `decision-artisan-motifs.spec.ts` et « ancien locataire » dans `lot61-espace-locataire.spec.ts`.
