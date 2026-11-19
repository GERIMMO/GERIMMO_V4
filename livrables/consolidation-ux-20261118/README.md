# Consolidation UX 1 à 12B — 18 novembre 2026

## Candidat et périmètre

Les 17 commits UX sont conservés intégralement, dans leur ordre, de `08ac5207` à `0a94046fc84efd12cde4b131618b95e2892dff3e` (liste complète : `commits-ux.txt`). Leur ancêtre commun avec `main` est exactement `dca396418053c9edb01351a6dd5b39dd9a087dc4`, production de référence et tête GitHub de main vérifiée durant cette consolidation. Aucune correction publiée n'est remplacée. Le commit qui ajoute ce dossier ne modifie pas le code applicatif.

Périmètre : accueil et inscription propriétaire, finances, incidents, locataire, facturation artisan, console dirigeant, logement, baux et documents, devis et créneaux, invitations, abonnement et aide fiscale, harmonisation. Les preuves avant/après de chaque chantier sont conservées dans les autres dossiers `livrables/ux-*` de cette même branche. Les PR #339/#340, l'ancien atelier, les stashes et les modifications tarifaires ne sont pas intégrés.

## Vérifications exécutées sur le code final UX

| Contrôle | Résultat et limite |
|---|---|
| Tests ciblés | **348 réussis, 0 échec, 0 ignoré**, 27 suites ; voir `tests.log`. Ce nombre n'additionne pas les tests antérieurs ni les scénarios navigateur. |
| TypeScript et ESLint | Codes de sortie 0 ; ESLint sur les fichiers source/tests modifiés. Voir `controles.json`. |
| Inscription complète | 390 px particulier et 1440 px SCI : envoi dans boîte fictive locale, confirmation de l'e-mail, choix du mot de passe, consentement et arrivée propriétaire, sans adresse obligatoire (`parcours-resultats.json`). |
| Baux et GED | Particulier et SCI : loyer de 640 €, quatre onglets et persistance après rechargement ; recherche, classement accessible, référence conservée, rendu et téléchargement effectif du PDF de 59 030 octets ; filtre devis. 8 contrôles réussis, aucune erreur JavaScript (`navigation-resultats.json`). Bail incomplet également affiché aux deux formats. |
| Finances | Écritures existantes fictives : 800 € de recettes, 75 + 180 = 255 € de dépenses, bilan 545 €. Échéance novembre : attendu 800 €, couvert 800 €, restant 0 €. Valeurs identiques avant/après navigation et rechargement, à 390 et 1440 px. |
| Quittance | Quittance existante fictive de 800 € : accès autorisé, contenu rendu et génération PDF de 161 129 octets aux deux formats. Ce contrôle relit une quittance déjà émise ; il ne prétend pas rejouer toute une première location. |
| Incidents | Particulier/SCI, 390/1440 px : quatre rubriques, devis et facture de 100 €, aucune déclaration de règlement, saisie non soumise conservée, historique, clôture et notation accessibles, anciennes ancres conservées, liste Tous et propositions accessibles. 4 scénarios réussis (`incidents-resultats.json`). |
| Abonnement | Écran connecté lisible, détails accessibles, absence de bouton de paiement et de débordement aux deux formats. Les essais calendaires, statuts et présentations commerciales sont aussi couverts par les suites ciblées. Aucun appel Stripe réel ni changement d'abonnement. |

Ces contrôles navigateur utilisent l'application réelle locale et les rôles du banc fictif, PostgreSQL **17.6** et l'émulateur Supabase du dépôt. Ils ne remplacent pas la CI sur PostgreSQL 18/PostgREST ni une recette de production. Les formats mobiles sont simulés dans Chromium, pas sur téléphones physiques.

Deux erreurs de banc ont été corrigées sans modification applicative : raccordement du stockage au dossier des PDF correspondant au clone ; sélection explicite du total financier principal plutôt que de tous les sous-totaux par titulaire. Les scénarios concernés ont ensuite réussi. Aucune régression applicative P0/P1 reproduite dans ce rejeu ciblé.

## Migration isolée

Seule migration nouvelle : `app/supabase/migrations/20261118093000_inscription_proprietaire_progressive.sql`. Elle retire uniquement l'obligation d'adresse de la fonction d'initialisation propriétaire. Sur **deux clones fictifs**, comparaison exacte avant/après, permissions et SECURITY DEFINER inchangés, mêmes nombres de comptes et organisations ; un rejeu inattendu est explicitement refusé. Voir `migration.json`. Aucun accès de production utilisé.

## Validation restant requise

La PR reste **en brouillon** jusqu'au résultat de la CI complète sur son SHA exact. La CI comprend la reconstruction des bases, les contrôles PostgreSQL/PostgREST, le build et les parcours navigateur. Les anciennes assertions E2E doivent être confrontées aux présentations UX nouvelles : en particulier `app/e2e/abonnement.spec.ts` recherche encore un récapitulatif de paiement lorsque les ventes sont fermées, alors que l'UX 11B conserve le vrai parcours uniquement lorsque la souscription est autorisée. Cette incompatibilité de test est à confirmer dans la CI ; aucun test n'a été supprimé ou ignoré pour obtenir un résultat vert.

Pas de nouveau test Stripe, pas de nouveau paiement, aucune publication. Les suites déjà validées par chantier restent les preuves des autres profils et états ; ce document ne prétend pas renouveler un audit exhaustif.

## Livraison future, après validation et autorisation

1. CI complète verte sur le SHA exact, traitement des échecs directement liés à l'UX, revue et fusion protégée ; CI du SHA de main.
2. Sauvegarde fraîche autorisée et restauration isolée vérifiée ; confirmation des migrations réellement manquantes.
3. Simulation puis application de la seule migration manquante par le workflow protégé, **avant** promotion de l'application. Ne pas rejouer une migration déjà enregistrée.
4. Promotion contrôlée, vérification du SHA servi et recette ciblée des quatre espaces. Maintenir les nouvelles souscriptions payantes fermées.

Aucune fusion, sauvegarde/export de production, migration réelle, promotion ou ouverture des ventes n'est effectuée par cette consolidation. Les workflows et les paramètres de publication ne sont pas modifiés.
