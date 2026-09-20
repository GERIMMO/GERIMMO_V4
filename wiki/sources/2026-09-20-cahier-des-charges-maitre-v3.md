# Gerimmo — référence maître V3 et ordre de travail

Adopté le 20 septembre 2026 à la demande explicite du porteur : « Respecte ce derniers cahier des charges ».

## Référence et priorité

Le PDF **GERIMMO — Cahier des charges maître V3**, 26 pages et 100 sections, devient la référence produit prioritaire en cas de divergence avec les demandes et notes antérieures. Les sections 48 à 100 complètent les premières sections ; elles ne sont pas facultatives. Leur réalisation est progressive, conformément aux sections 47 et 100.

Source : `/tmp/codex-remote-attachments/01a099d3-eb6d-76b0-89c5-3f552b29fbdc/9AEB81A7-03CB-442D-B45B-F1C6734D560A/1-GERIMMO_V3_Cahier_des_charges_Codex.pdf`

Empreinte SHA-256 : `6c0f0e312b9bca3ee3c5d600ff571e692357a855b653a33e64973cd338fa7c4a`

Le document original reste inchangé. Les couleurs existantes sont conservées, conformément à la préférence exprimée par le porteur et compatible avec ce cahier des charges.

## Ordre obligatoire

1. Auditer le code **actuel**, les données et migrations, les parcours, la sécurité, les tests et les services. Classer les écarts P0/P1/P2/P3.
2. Définir la V1 exploitable, avec critères de validation par rôle.
3. Corriger les P0 (blocages production) puis P1 (indispensables V1).
4. Tester les parcours complets, permissions, erreurs et résilience.
5. Déployer les lots autorisés et vérifiés, puis contrôler la production réelle.
6. Instrumenter les usages ; accompagner les premiers propriétaires par les canaux validés.
7. Construire progressivement apprentissage, pilotage, automatisation et expansion à partir des résultats mesurés.

Une publication réussie ou un grand nombre de tests ne suffit pas à déclarer la V1 terminée. Les moteurs Brain, Watch, Dev, Lab, Growth et Expansion restent dans la cible ; ils ne doivent pas retarder la V1.

## Périmètre à appliquer

- Mise en location **après sélection du locataire** : logement suffisamment renseigné, invitation, dossier et pièces manquantes, garant, bail, entrée et archivage. Les visites et candidats non retenus sont hors périmètre (§4).
- Loyers utilisables sans connexion bancaire obligatoire : réception déclarée, paiement enregistré, quittance si applicable, retard, alertes, suivi et historique (§5, §55).
- Incidents techniques jusqu'à clôture, devis maîtrisé par l'artisan et rendez-vous coordonné ; les troubles de voisinage sont hors périmètre du traitement des incidents (§6, §56–58). Cette exclusion ne justifie pas à elle seule de retirer une clause contractuelle existante.
- Informations et actions adaptées aux sept rôles : supervision, administrateur d'agence, agent, propriétaire autonome, propriétaire géré, locataire, artisan. Isolation des portefeuilles et organisations côté serveur et base.
- Documents : origine, dossier, droits, statut, version, échéance et historique ; données manquantes explicites, documents finalisés préservés (§53–54).
- Tableaux de bord orientés actions, messages et notifications utiles, agenda et alertes menant au bon dossier, recherche respectant les droits (§50–63).
- Supervision contrôlée, MFA, traçabilité, support et observabilité ; aucun accès supplémentaire implicite pour une automatisation (§7–8, §63–68, §84–88).
- Les métriques futures distinguent mesure, estimation, hypothèse, recommandation et décision. Aucune donnée de croissance, rentabilité ou couverture territoriale inventée (§22, §38, §44).

## Autonomie

Les anciennes demandes de « carte blanche » s'appliquent désormais dans le cadre des §10 et §27 :

- **Niveau 1** : corrections UI, textes, tests, instrumentation et petits correctifs vérifiables réalisés de façon autonome.
- **Niveau 2** : fonctionnalités limitées et optimisations de parcours avec validation technique, environnement de recette, surveillance et retour arrière adaptés au risque.
- **Niveau 3** : décision humaine pour prix, paiements, dépenses, contrats/CGU, droits administrateur, sécurité critique, données personnelles sensibles, suppression, migration destructive ou changement juridique/structurel majeur. Préparer d'abord un résultat concret et vérifiable avant de solliciter la décision nécessaire.

Aucun abonnement, campagne, message externe, paiement ou traitement permanent n'est déclenché par la seule adoption du document.

## Premier état des lieux — limites de preuve

Ce relevé prépare l'audit obligatoire ; **ce n'est pas un audit exhaustif ni une validation de production au 20 septembre**.

| Constat | Preuve consultée | Conséquence |
|---|---|---|
| Le code local est plus ancien que GitHub | Local `36a3200a58cabaff54cd2ceb7a58e86bfd340dde` ; GitHub `main` relu au 20/09 : `83da9b011b449c62a82d2f692d529e59e2287f6f`, PR 66 | Partir du code distant actuel avant toute modification applicative ; préserver les brouillons locaux. |
| La PR 66 annonce santé du service, proposition des automatismes, région Paris, confidentialité et modèles d'authentification | Commit GitHub et diff consultés | Relire et tester ces ajouts plutôt que les recréer. Le statut actuel du déploiement n'a pas été revérifié dans cette étape. |
| Contrats individuels et 54 modèles étaient publiés le 14/09 | Rapport `outputs/suivi-contrats-catalogue-gerimmo.md` ; PR 56 et vérifications historiques | Preuves datées, à compléter par la recette du code actuel ; pas une conformité aux 100 sections. |
| Le catalogue local contient un bon de visite et des libellés de candidature | `app/src/lib/documents/catalogue.ts`, `catalogue-options.ts`, assembleurs du catalogue | Écart au §4 à recontrôler sur `main`. Adapter le périmètre proposé sans effacer les documents déjà produits. |
| Deux éléments locaux restent non publiés | Migration `20260914200000_factures_et_modeles_agence.sql` et modification de `e2e/local/ordre-migrations.txt` | Brouillon non validé. Comparer aux migrations actuelles avant réutilisation ; les effets de facturation et contractuels relèvent du niveau 3. |
| Les pièces justificatives de tous les parcours et services réels ne sont pas réunies dans cette étape | Le précédent rapport distingue tests locaux, génération PDF et limites ouvertes | Ne pas déclarer tous les boutons, envois, paiements ou restaurations vérifiés. |

## Plan V1 à préciser par l'audit

Les priorités ci-dessous sont des **axes de vérification**, pas une liste de bugs déjà démontrés.

| Priorité | Vérification et résultat attendu |
|---|---|
| P0 | Absence de fuite inter-organisations, secrets et droits contrôlés ; migrations compatibles, erreurs bloquantes reproduites/corrigées ; sauvegarde et restauration isolée prouvées ; configuration de lancement et services essentiels vérifiés. |
| P1 | Parcours complet propriétaire → logement → locataire retenu → pièces → bail → entrée → loyer → paiement → quittance ; parcours incident → devis → accord → rendez-vous → intervention → clôture ; écrans et accès testés pour chaque rôle. |
| P1 | Documents cohérents et immuables après finalisation, invitation et communication opérationnelles ; impayés et alertes utiles ; erreurs d'envoi et historique visibles ; comportement mobile. |
| P2 | Améliorations de compréhension, recherche et traitements groupés restant hors blocages V1 ; instrumentation complémentaire et réduction des frictions observées. |
| P3 | Études, acquisition, automatisations avancées, mesure économique et expansion par territoire, après les prérequis de qualité et de mesure. |

Pour chaque parcours, conserver une preuve : rôle, écran/action, préconditions, données fictives utilisées, résultat attendu/obtenu, contrôle API/permissions/base/historique, anomalie, correction et retest. Inclure double clic, rafraîchissement, session expirée, réseau interrompu, droits insuffisants et accès à une autre organisation.

## Livrables de clôture attendus

- Matrice de couverture des 100 sections, avec statuts opérationnel / partiel / absent / non vérifié et preuves datées.
- Audit et anomalies priorisés, corrections et résultats de recette par persona.
- Liste précise des applications tierces : déjà intégrées, configuration restante, code manquant éventuel, tests réels restant à effectuer. Ne pas présenter une intégration absente comme une simple clé à ajouter.
- Publication : commits, migrations, URL et contrôles en production ; procédure de retour arrière et restauration éprouvée.
- Décisions humaines réellement nécessaires et risques résiduels explicités.

**État de cette étape :** référence lue et adoptée, écarts initiaux et ordre d'exécution consignés. Aucune nouvelle modification de l'application ni publication effectuée dans cette étape.


## Suite de la reprise

Le dépôt actuel est maintenant disponible dans une branche isolée. Audit initial de toutes les sections dans `app/docs/audit-cahier-maitre-v3-20260920.md` et JSON associé. Les preuves et limites sont distinctes ; aucune conformité intégrale annoncée.
