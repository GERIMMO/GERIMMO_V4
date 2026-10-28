# Clôture locale — patrimoine, consommations et finances

État au 28 octobre 2026 : **tous les contrôles locaux prévus sont terminés ; publication non effectuée**. Tous les scénarios précédemment en échec disposent d’une reprise réussie. Ce document conserve les résultats et leurs limites, dont les quatre routes sans données de recette. Il ne constitue pas une validation des prestataires réels ou de la production.

## Version et périmètre

- Base publiée utilisée : `22f13b6e2eeb0618a9efa2e65878dfd4b0f42776`.
- Branche locale : `codex/patrimoine-consommations-20261028`, modifications non publiées par cette passe.
- Évolutions intégrées aux fiches existantes : contrats de fourniture et d’entretien, compteurs, relevés locataires, factures et répartition, paiement vers le journal, régularisation annuelle, profils fiscaux du détenteur, assistant privé, compléments des relances et recommandé.
- Parcours réutilisés : personnes et détentions, biens/lots, baux et états des lieux, signatures, GED, messagerie, finances et échéances. Les acquis de ces parcours ne sont pas présentés comme des fonctionnalités nouvellement créées.
- Banc local : PostgreSQL, API émulée, données fictives et bases unité/API séparées. La base `gerimmo_ci_patrimoine_cloture` et son clone `_api` ont été reconstruits avec **444 migrations finales** dans l’ordre exact du manifeste et le seed. Le serveur et la base `livraison_api` utilisés par la recette active n’ont pas été touchés.

## Résultats attestés

Les nombres correspondent à des exécutions distinctes ; ils ne s’additionnent pas pour former un total de tests uniques.

| Contrôle | Résultat | Statut et portée | Preuve |
| --- | --- | --- | --- |
| Suite principale finale | **11 989 réussis, 0 échec, 39 ignorés** | Vérifié après les dernières corrections : 831 fichiers réussis, 7 ignorés sur 838 ; 189,90 s. Les 39 tests ignorés ne sont pas des réussites. | [Résumé](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/suite-finale-livraison.json), [journal](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/suite-finale-livraison.log) |
| Ajout de la catégorie entretien aux rappels | **25 réussis, 0 échec**, 2 fichiers | Vérifié après cette dernière modification ciblée : `accueil-taches-proprietaire` et `consommations-integration`. | [Journal](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/rappels-entretien.log) |
| Compléments API | **100 réussis, 0 échec** | Tests ciblés rejoués, dont 13 précédemment ignorés ; API locale, fournisseurs simulés, sans réseau externe. | [Résultat détaillé](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/api-complements.json), [journal](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/api-complements.log) |
| Installation finale à neuf | **444 migrations** | Vérifié : ordre exact du manifeste, seed et clone API séparé prêts. | [Journal clôture](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/bootstrap-patrimoine-cloture.log) |
| Droits et schéma final de l’évolution | **15 tables, 56 fonctions** | Vérifié en lecture sur la base clôture : RLS, absence de droits anon, chemins de recherche vides des SECURITY DEFINER. Fonctions créées, redéfinies ou réécrites incluses ; aucune manquante. | [Contrôle final du schéma et de l’ordre](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/patrimoine-cloture-advisors.json) |
| Code, types et construction | Sorties réussies | Dernière passe complète vérifiée après gel des sources. | [ESLint](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/eslint-livraison.log), [TypeScript](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/typescript-livraison.log), [build](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/build-final.log) |
| Chromium, dernière passe complète | **258 réussis, 4 échecs, 2 ignorés** | Résultat historique de la passe complète, conservé. Les quatre échecs sont résolus par les reprises ci-dessous ; aucune nouvelle passe complète n’est revendiquée. | [Journal complet](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/chromium-validation.log) |
| Reprise abonnement sur base propre | **11 réussis, 0 échec** | Vérifié sur Chromium en 39 s ; reprise distincte, ne remplace pas la passe complète. | [Journal](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/abonnement-reprise-livraison.log) |
| Reprises Chromium finales | **14 réussis, 0 échec** | Après la reprise abonnement : loyers, supervision, consommations, fiscalité, assistant et consentements ; plusieurs formats, setup inclus. Les 4 échecs de la passe complète sont résolus. | [Journal](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/chromium-reprises.log) |
| Consentement et adresse avant quittance | **75 réussis, 0 échec** | Correction ciblée vérifiée : révocation, changement d’adresse et échec de relecture empêchent l’envoi. | [Journal](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/quittances-consentement.log) |
| Historique contrat, paiement et régularisation | **80 réussis, 0 échec** | Ciblé final après verrou du contrat, dont 19 contrôles financiers. | [Journal](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/contrats-historique-final.log) |
| WebKit, passe de 72 scénarios et reprise | **70 réussis, 2 échecs initiaux ; reprise 2/2** | Vérifié après correction du banc : les deux scénarios AR24 à 390/1440 px passent, aucun retry ni erreur filtrée. Le résultat initial est conservé. | [Passe initiale](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/webkit-livraison.log), [reprise et captures](../../../../output/patrimoine-consommations-20261028/preuves/webkit-ar24-reprise/) |
| Confirmation AR24 Chromium | **2/2 réussis** | Reprise après la même correction du banc, à 390/1440 px ; aucun retry ni erreur filtrée. | [Journal et captures](../../../../output/patrimoine-consommations-20261028/preuves/chromium-ar24-reprise/) |
| Audit final ordinateur | **8/8 tests, 210 visites, 7 profils** | Vérifié à 1440 px, 4,8 min ; 182 routes résolues et 4 exclusions. Affichage, navigation et commandes examinés, sans prétendre tester chaque action métier. | [Journal](../../../../output/patrimoine-consommations-20261028/preuves/cloture-locale/ordinateur-livraison.log), [rapports et captures](../../../../output/patrimoine-consommations-20261028/preuves/ordinateur/) |
| Fournisseurs réels, téléphone réel | Aucun essai réel effectué par cette passe | Non testé : email, signature, recommandé AR24 et IA externes ; simulation mobile ≠ téléphone réel. | Simulations locales seulement. |

**Pourquoi 39 tests ignorés ?** Ils dépendent de services, outils ou configurations absents de la passe principale : paiements Stripe, retours de signature, authentification et comptes de recette spécifiques, exercices de restauration ou traitements planifiés. **13 des 39 ont ensuite été couverts par la reprise API avec fournisseurs simulés** (premier mot de passe 4, révocation de session 1, retours Zoho Sign 8). Les autres restent ignorés ; ces reprises ne sont ni ajoutées aux 11 989 réussites ni déduites rétroactivement des 39 ignorés de la suite. Les détails fichier par fichier sont conservés dans le résumé de cette suite. Les simulations Zoho ne constituent pas une signature réelle.

La suite principale inclut des gardes de quota IA : identité authentifiée, organisation autorisée, compteur quotidien partagé entre les espaces d’un même compte, arrêt d’urgence, plafond global et refus sans consommation indue. Le plafond personnel courant est de 10 réponses de l’assistant privé et 20 lectures assistées par jour, avec un délai minimal de 3 secondes entre deux réservations du même usage. Ces contrôles SQL et les réponses de fournisseurs simulés ne mesurent ni la qualité d’un modèle réel ni les quotas contractuels d’un prestataire.

## Reprises à conserver séparément

La passe Chromium complète ci-dessus échoue sur quatre cas : abonnement propriétaire (attente de deux lots de démonstration), réception du loyer à 390 px, réception du loyer à 1440 px, et consignes de supervision mobile. L’analyse du banc a relevé des données de démonstration enrichies par des tests précédents et des sélections rendues ambiguës. Le nouveau parcours consommations utilise ses propres organisations. Les reprises sur la base propre sont terminées : **11/11 pour l’abonnement, puis 14/14 pour les parcours ciblés**, dont les loyers à 390/1440 px et les consignes. Elles résolvent les quatre échecs constatés. Le résultat initial reste enregistré ; il n’est pas remplacé rétroactivement par une passe complète verte.

Une passe antérieure interrompue a produit `chromium-final/` ; elle est conservée comme historique et ne remplace pas la passe complète `chromium-validation/`. Les reprises ne devront pas être présentées comme une nouvelle passe complète de 264 cas.

Reprise Chromium finale du 28 octobre : consommations à 390, 768 et 1440 px ; réception du loyer à 390 et 1440 px ; recommandé/consentements à 390 et 1440 px ; assistant privé propriétaire/locataire, fiscalité et consignes. Les résultats détaillent les 14 tests, dont le setup des sessions. Ces contrôles sont des simulations de formats, pas des essais sur téléphones réels. Les captures et traces sont conservées sous `output/patrimoine-consommations-20261028/preuves/`.

WebKit a terminé sa passe de 72 scénarios avec 70 réussites et 2 échecs AR24 (390 et 1440 px). Le défaut de synchronisation du banc a été corrigé, sans modification du produit ni filtrage des erreurs. **La reprise AR24 WebKit passe 2/2 en 16,6 s**, puis **la confirmation Chromium passe 2/2 en 17,2 s**. Aucun échec, aucun retry, aucun envoi externe ; six captures par reprise. Les résultats historiques restent conservés, sans transformer ces reprises en nouvelles passes complètes.

L’audit ordinateur utilise la **matrice finale de 182 routes résolues**, avec quatre exclusions faute de données de recette : version de conditions (`VERSION`), facture externe d’artisan (`FACTURE_EXTERNE`), invitation (`INVITATION`) et bail propriétaire (`BAIL_PD`). La précédente matrice à 183 routes appartenait à un banc enrichi différemment ; elle ne doit pas être confondue avec cette passe. Le bail propriétaire est réellement couvert par le parcours consommations à 390/768/1440 px et les parcours AR24/réception à 390/1440 px. Cette couverture ciblée ne valide pas les trois autres routes exclues.

L’audit ordinateur est terminé : **8/8 tests réussis en 4,8 min**, dont le setup, couvrant sept profils et **210 visites avec onglets** : public 23, agent 45, admin 39, locataire 15, propriétaire 27, superadmin 39, artisan 22. Les captures sont à 1440 px. Ces visites vérifient affichage, navigation, erreurs et noms des commandes ; elles ne valent pas exercice de chaque action métier. Aucun total artificiel ne cumule passe complète, setup et reprises ; aucune mention « toutes les routes » n’est revendiquée.

## Derniers correctifs vérifiés

- **Consentement et adresse de quittance : corrigé, 75 tests ciblés réussis.** L’autorisation et l’adresse sont relues juste avant l’envoi ; retrait, modification d’adresse ou lecture indisponible empêchent l’envoi. La suite globale finale a ensuite été rejouée : 11 989 réussites, aucun échec.
- **Historique des contrats : corrigé et installé à neuf.** La catégorie et le rattachement au bâtiment/lot sont figés dès la première facture, pour empêcher une réécriture indirecte des justificatifs et de leur traitement. La migration complémentaire porte le total à 444 ; le ciblé final de 80 tests est réussi, dont les 19 tests paiement/régularisation.
- **Décompte annuel après succès : interface corrigée, reprise Chromium réussie.** Le bloc conserve ses montants et son aperçu, affiche « Régularisation validée » et retire les actions de brouillon. Une autre année retrouve la préparation normale. Les assertions vérifiant l’absence de brouillon/recalcul et le changement d’année ont été rejouées avec succès.
- Suite globale, audit final ordinateur et reprises Chromium/WebKit terminés. Le contrôle final du schéma couvre 15 tables et 56 fonctions ; l’ancien relevé de 38 fonctions avait un périmètre plus étroit et ne constituait pas le total final.

## Garanties fonctionnelles couvertes

- Relevés transmis uniquement pour les compteurs et demandes autorisés ; absence de relevé signalée, aucune consommation inventée.
- Répartition au centime, validation du calcul réellement présenté et relecture des index ; pas de validation d’un brouillon remplacé entre-temps.
- Consommations à cheval sur deux exercices segmentées à partir d’un index réel au 1er janvier ; borne finale exclusive. Pas de récupération dans deux exercices.
- Paiement fournisseur et écriture financière atomiques, rejouables sans doublon ; facture et justificatif liés. Une répartition ultérieure reclassifie la somme, sans fausse ventilation préalable.
- Décompte annuel fondé sur les parts validées, provisions déjà appelées et occupations connues ; forfaits exclus. L’opérateur confirme la complétude et les documents restent visibles aux destinataires autorisés.
- Profil fiscal au niveau du détenteur et de l’année, avec blocage effectif de la 2044 incompatible. L’export préparatoire reste distinct d’une déclaration officielle.
- Assistant privé séparé par compte et espace, contexte minimal, sans document ajouté automatiquement ni action autonome ; `store:false` côté fournisseur. Pas de succès annoncé sans configuration valide.
- Retours arrière vérifiés sur données vides ; refus atomique lorsqu’une preuve financière doit être conservée. Les contrôles d’abonnement et de portefeuille restent appliqués.

## Limites concrètes et suites utiles

1. **SCI à l’IS : aucune comptabilité complète livrée.** Le profil fiscal et l’export orientent la préparation pour le comptable ; ils ne produisent ni comptabilité d’engagement complète, bilan, amortissements, liasse SCI/BIC, FEC, ni télédéclaration. Les qualités et régimes restent à confirmer par le détenteur.
2. **Paiement fournisseur confirmé : pas encore de rectification guidée.** La nouvelle carte ne propose pas de correction de date ou de montant par contre-écriture. Vérifier les valeurs avant confirmation.
3. **Syndic : éviter la double récupération.** Le raccourci annuel se bloque en présence d’appels de charges du syndic sur le même exercice ; un rapprochement reste nécessaire.
4. **Régularisation annuelle : confirmation requise.** Une régularisation par bail/exercice ; aucune facturation tacite au locataire ni automatisation de forfait.
5. **Recommandé réel : non expédié.** La configuration, le consentement requis et la confirmation explicite restent nécessaires. Les simulations ne constituent pas une preuve d’expédition ou d’accusé de réception réel.
6. **Courriels ordinaires : risque résiduel de reprise connu.** Si l’email est parti mais que sa consignation échoue, l’idempotence du fournisseur ne protège la reprise que dans sa fenêtre de 24 heures. Au-delà, un doublon reste possible (D47, couvert comme limite dans les tests). La réservation durable AR24 suit un mécanisme distinct.
7. **IA réelle : non évaluée.** Quotas et erreurs sont contrôlés localement ; les extractions et réponses restent des propositions à relire. Aucun document réel n’a été envoyé pour les essais.

Les contrôles locaux prévus sont clos. Les preuves permettent la revue et la conservation des changements dans un commit local. Les limites ci-dessus et les quatre exclusions de la matrice restent explicites. **Ce dossier n’autorise ni n’atteste une publication : aucune mise en ligne n’a été effectuée.**

## Index des preuves

- [Synthèse structurée et empreintes SHA-256](preuves-patrimoine-consommations-20261028/synthese.json).
- [Bilan utilisateur HTML local](../../../../output/patrimoine-consommations-20261028/bilan.html).
- [Captures et traces de la passe Chromium complète](../../../../output/patrimoine-consommations-20261028/preuves/chromium-validation/).
- [Toutes les preuves locales](../../../../output/patrimoine-consommations-20261028/preuves/).

Le dépôt conserve ce compte-rendu et une synthèse structurée avec les empreintes des preuves. Les journaux, le résultat exhaustif Vitest, les images et les traces restent dans le dossier local `output/patrimoine-consommations-20261028/preuves/` ; ces liens hors dépôt dépendent de l’arborescence locale.
