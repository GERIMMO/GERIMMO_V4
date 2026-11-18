# PR #345 — reprise ciblée des 49 échecs navigateur, 18 novembre 2026

Base du travail : `6234b3b037665e2670e63bca20c233e6f080500b`, branche `codex/ux-accueil-proprietaire-20261118`.
CI examinée : https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44395490692 (233 réussites, 49 échecs Playwright).
Un seul agent. Créneau autorisé 21:48:42–22:18:42 UTC. Aucune fusion, migration en production, publication, ouverture des ventes ou envoi réel.

## Résultat borné

46 des 49 scénarios initialement en échec ont un rejeu local réussi ; 3 restent non résolus. Les rejeux intermédiaires ne sont pas additionnés.
Une consultation propriétaire supplémentaire partageant le titre du test superadmin a réussi ; elle est exclue de ce décompte.
CI complète non lancée : les prérequis locaux demandés ne sont pas tous satisfaits. Aucun push pour ne pas déclencher cette CI prématurément. PR à conserver en brouillon, verdict NO GO publication.

## Causes communes (49 échecs couverts par la classification)

| Famille | Nombre | Cause observée / correction |
|---|---:|---|
| Abonnement | 3 | Formulaire mensuel/annuel recherché alors que la fermeture des ventes affiche des tarifs informatifs. Tests conservés, non déclarés réussis. |
| Réception des loyers et impayés | 6 | Ancienne modale remplacée par un détail natif. Gestes, repli/réouverture, saisie conservée, paliers, quittance et montants contrôlés. |
| Artisan | 4 | Registre et devis dans des rubriques, informations validées repliées, nouvelles étiquettes de créneaux ; navigation adaptée, assertions PDF et financières maintenues. |
| Dossiers logement / incident | 19 | Sections désormais dans des onglets, ancres et liens ; distinction « Disponible » / vraie action requise. Contrôles de lecture seule, documents, métrologie, accès clavier conservés. |
| Supervision | 11 | Huit scénarios CI tardifs arrivent à Connexion après la limite d’inactivité. Nouvelle connexion réelle + TOTP fictif, sans modification de sécurité. Navigation et automatismes renommés. L’attente des animations de l’annuaire retenait une ancienne promesse alors que playState était finished ; désormais relue à chaque frame, avec la même limite de 5 s et axe conservé. |
| Compte et authentification | 2 | Inscription progressive et première activation : champs et bouton actualisés, changement de mot de passe / second facteur vérifiés. |
| Finances | 2 | « Restant dû », « Attendu », accès « Bilan de l’année ». Encaissement unique de 840 € et affectation unique de 640 € conservés. |
| Consentements et recommandés | 2 | Accès au suivi propriétaire déplacé ; retrait des consentements et configuration fournisseur absente testés sans prestataire réel. |

## Banc et preuves

Banc entièrement fictif local, PostgreSQL sur 127.0.0.1:56542, base `gerimmo_ci_ux_browser_api`, API 54297, application compilée 3100, boîte fictive 55520. Seed officiel `seed-parcours.mjs` rejoué avant les parcours artisan ; l’absence initiale d’acceptation des conditions artisan venait du seed incomplet du banc, pas d’une régression. Nom de base explicitement ajouté à la liste locale autorisée, contraintes loopback et utilisateur maintenues.
Build réussi. ESLint ciblé : voir `eslint-final.log`. TypeScript : premier processus interrompu par sa limite mémoire, reprise avec mémoire adaptée réussie (code 0), `typescript-final.log`.
Traces CI originales dans `output/ci-345-navigateurs-20261118/traces`. Journaux et traces locales conservés dans le même dossier de preuves (sous-dossiers résultats).
Aucun test supprimé, ignoré ou délai augmenté. Aucune modification du code applicatif, de calcul, de droit ou de migration.

## Reprise minimale nécessaire

- Abonnement : préparer un scénario isolé de souscription réellement autorisée pour vérifier le formulaire et sa sortie ; garder aussi les assertions de prix dans l’état fermé. Ne pas ouvrir les ventes pour satisfaire les tests. L’ancien scénario `window.location.assign()` ne prouve pas un clic de souscription et n’a pas été déclaré valide.
- Pour tout autre résultat non résolu ci-dessous, consulter la dernière trace indiquée avant de changer le code ; les parcours qui ont réussi ne sont pas à recommencer sans modification pertinente.
- Une seule CI complète, sur le futur SHA exact, seulement après résolution locale de tous les scénarios restants.

## Dernier résultat par scénario initial

| Fichier / scénario | Dernier résultat | Preuve |
|---|---|---|
| `abonnement.spec.ts` — en annuel, le montant prélevé en une fois est affiché | Non résolu | `CI44395490692` |
| `abonnement.spec.ts` — les deux lots de démonstration coûtent 7,98 € sur l’abonnement unique | Non résolu | `CI44395490692` |
| `abonnement.spec.ts` — quitter le formulaire annuel vers un paiement simulé ne demande pas de confirmer la sortie | Non résolu | `CI44395490692` |
| `alerte-impaye-proprietaire.spec.ts` — impayé de deux mois à 1440px : total sur la ligne, alerte fermée à la réception complète | Réussi | `replay.log` |
| `alerte-impaye-proprietaire.spec.ts` — impayé de deux mois à 390px : total sur la ligne, alerte fermée à la réception complète | Réussi | `replay.log` |
| `artisan-fin-mission.spec.ts` — devis privé : compléter son identité puis reprendre sans ressaisir ni altérer la version validée | Réussi | `replay-final.log` |
| `artisan-fin-mission.spec.ts` — intervention acceptée : démarrage, photo, bilan, facture (creation) et réception gestionnaire | Réussi | `fin.log` |
| `artisan-fin-mission.spec.ts` — intervention acceptée : démarrage, photo, bilan, facture (sci) et réception gestionnaire | Réussi | `fin.log` |
| `bail-signe-non-actif.spec.ts` — proprietaire › bail signé et documents lisibles sans activation | Réussi | `replay-final.log` |
| `bail-signe-non-actif.spec.ts` — superadmin › bail signé et documents lisibles sans activation | Réussi | `replay-final.log` |
| `compte-securite.spec.ts` — on active puis on retire son second facteur sans l'aide de personne | Réussi | `replay.log` |
| `compte-securite.spec.ts` — on change son mot de passe depuis son compte, et l'ancien ne vaut plus rien | Réussi | `replay.log` |
| `consommations-patrimoine.spec.ts` — consommations : relevé locataire, facture et décompte à 1440px | Réussi | `replay.log` |
| `consommations-patrimoine.spec.ts` — consommations : relevé locataire, facture et décompte à 390px | Réussi | `replay.log` |
| `consommations-patrimoine.spec.ts` — consommations : relevé locataire, facture et décompte à 768px | Réussi | `replay.log` |
| `contre-audit-proprietaire.spec.ts` — fiche de lot : accès direct, clavier et retour à 1440px | Réussi | `selected.log` |
| `contre-audit-proprietaire.spec.ts` — fiche de lot : accès direct, clavier et retour à 390px | Réussi | `selected.log` |
| `contre-audit-proprietaire.spec.ts` — fiche de lot : accès direct, clavier et retour à 768px | Réussi | `selected.log` |
| `contre-audit-proprietaire.spec.ts` — incident : décider puis consulter l’historique à 1440px | Réussi | `complements.log` |
| `contre-audit-proprietaire.spec.ts` — incident : décider puis consulter l’historique à 390px | Réussi | `complements.log` |
| `contre-audit-proprietaire.spec.ts` — la fiche conserve les dépenses, les documents et l’historique sans modale | Réussi | `selected.log` |
| `depot-document-lot.spec.ts` — propriétaire : un document déposé depuis la fiche du lot y apparaît à 1440px | Réussi | `selected.log` |
| `depot-document-lot.spec.ts` — propriétaire : un document déposé depuis la fiche du lot y apparaît à 390px | Réussi | `selected.log` |
| `diagnostic-rapport-range.spec.ts` — un rapport rangé en « Autre » se déclare comme DPE du lot et lève le blocage | Réussi | `selected.log` |
| `dossier-proprietaire.spec.ts` — propriétaire : repères et rubriques accessibles à 1440px | Réussi | `selected.log` |
| `dossier-proprietaire.spec.ts` — propriétaire : repères et rubriques accessibles à 390px | Réussi | `selected.log` |
| `dossier-proprietaire.spec.ts` — propriétaire : un bail commencé se reprend partout, sans brouillon vierge en double | Réussi | `selected.log` |
| `encaissement-reste.spec.ts` — PAY01 : Encaisser le reste transmet sa commande et solde une seule fois le loyer | Réussi | `replay.log` |
| `equipes.spec.ts` — supervision : pause et reprise des passages sans exécution du traitement | Réussi | `selected.log` |
| `lot3-loyer-facture.spec.ts` — propriétaire : loyer confirmé et dépôt de facture conservé (SCI) | Réussi | `cloture.log` |
| `lot3-loyer-facture.spec.ts` — propriétaire : loyer confirmé et dépôt de facture conservé (nom propre) | Réussi | `derniers.log` |
| `lot3-loyer-facture.spec.ts` — une échéance de 640 € après cession apparaît uniquement chez le titulaire à la date du loyer | Réussi | `fin.log` |
| `navigation-matin.spec.ts` — Tour du matin de la supervision › arrive sur le bureau de direction et retrouve les destinations dans le menu mobile | Réussi | `selected.log` |
| `navigation-matin.spec.ts` — Tour du matin de la supervision › le menu complet est accessible sur ordinateur sans ouvrir le bouton mobile | Réussi | `selected.log` |
| `parcours-artisan.spec.ts` — le registre privé se télécharge seulement au clic, depuis la facturation et les clients | Réussi | `replay.log` |
| `reception-loyer-proprietaire.spec.ts` — réception du loyer à 1440px : échéance, pas reçu, partiel puis solde | Réussi | `soldes.log` |
| `reception-loyer-proprietaire.spec.ts` — réception du loyer à 390px : échéance, pas reçu, partiel puis solde | Réussi | `soldes.log` |
| `recommandes-consentements.spec.ts` — 1440px › consentements et recommandé à 1440px : retrait, configuration absente et suivi durable | Réussi | `replay.log` |
| `recommandes-consentements.spec.ts` — 390px › consentements et recommandé à 390px : retrait, configuration absente et suivi durable | Réussi | `replay.log` |
| `relocation-bail.spec.ts` — relocation : le nouveau brouillon reprend les conditions du bail précédent, signalées et effaçables, à 1440px | Réussi | `selected.log` |
| `relocation-bail.spec.ts` — relocation : le nouveau brouillon reprend les conditions du bail précédent, signalées et effaçables, à 390px | Réussi | `selected.log` |
| `reseau-couverture.spec.ts` — Couverture du réseau, côté supervision › la couverture se lit commune par commune, sans aucune décision d’ouverture ni de rattachement | Réussi | `selected.log` |
| `supervision-consignes.spec.ts` — présentation mobile › consignes et relais restent lisibles sans débordement | Réussi | `selected.log` |
| `supervision-consignes.spec.ts` — présentation ordinateur › consignes et relais restent lisibles sans débordement | Réussi | `selected.log` |
| `supervision-consignes.spec.ts` — une consigne exige une version activée, conserve sa preuve et reste suspendable | Réussi | `selected.log` |
| `supervision-consultation.spec.ts` — consultation superadmin › les commandes proposées correspondent au rôle connecté | Réussi | `selected.log` |
| `support-bailleur.spec.ts` — le bailleur retrouve la réponse apportée à sa demande par la supervision | Réussi | `replay.log` |
| `utilisateurs.spec.ts` — annuaire lisible, filtres cumulés et ouverture du bon compte | Réussi | `cloture.log` |
| `utilisateurs.spec.ts` — les abonnements et la trésorerie restent deux lectures distinctes | Réussi | `replay.log` |
