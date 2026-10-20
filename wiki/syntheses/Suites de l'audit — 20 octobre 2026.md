---
type: synthesis
tags: [audit, lancement, securite, recette]
status: in-progress
created: 2026-10-20
updated: 2026-10-20
sources: ["[[Audit final avant publication — 19 octobre 2026]]", "[[Prompt de passation à Codex — état du 16 octobre 2026]]", "[[Registre des traitements]]"]
---

# Suites de l'audit — 20 octobre 2026

Le point de départ reste `e25c0f7`, PR212 publiée le 19 octobre. Cette page décrit un lot **préparé et testé localement**, pas des corrections déjà publiées. Les huit bloquants et vingt-neuf majeurs de l'audit initial ne sont pas réputés tous levés.

## Préparé

- Durcissement de /auth/confirm (consigne hors dépôt) : résultat local vérifié sur GoTrue réel, avec relecture indépendante.
- Association Stripe contrôlée côté serveur ; cinq migrations rejouables et leurs retours livrés avec une précondition de souscription fermée pendant le déploiement.
- Sauvegarde et restauration de l'historique des migrations, y compris vérification du contenu après restauration ; anciennes sauvegardes acceptées en signalant l'historique absent.
- Réceptions Stripe conservées et reprises après interruption ; rapprochement limité à 20 dossiers par passage et anomalies visibles dans Santé.
- Connecteur Youtrust retiré ; anciennes preuves conservées, variables externes encore à retirer.
- Dépôts de documents vérifiés sur les parcours locataire et artisan ; retours atomiques et annulables.
- Les 17 rubriques du superadmin sont désormais incluses dans la recette en lecture seule ; test local réussi. En-tête vérifié sur 320, 390 et 1 440 pixels.
- Distinction entre étude de veille non retenue par le contrôle des sources et panne technique.
- Dependabot hebdomadaire préparé ; exemples de contacts retirés du guide public de recette. Aucun secret renouvelé par cette opération.
- Quatre modèles français de notification de sécurité préparés et contrôlés localement, sans envoi ni activation.
- [[Registre des traitements]] et modèle de sous-traitance actualisés pour Zoho ; garanties contractuelles, durées et validation DPO toujours attendues.

## Preuves locales

Compilation, types et lint réussis. Dernière suite complète : 8 948 tests réussis et 38 non exécutés, dont des intégrations conditionnées aux accès externes. Parcours navigateur ciblés : 62 réussis et un non exécuté. Les corrections issues de contre-relecture ont leur vérification rouge puis verte ; la restauration et le parcours de récupération ont également été éprouvés avec les services réels locaux.

Audit d’affichage : 165 écrans à chacune des largeurs 390, 768 et 1 440 pixels, soit 495 vérifications réussies (pas d’erreur de page ni de débordement détecté). Ce contrôle ne vaut pas preuve de toutes les actions métier de chaque écran.

La contre-relecture a relevé deux P2, corrigés puis relus ; aucun constat bloquant résiduel identifié. Sa portée est le lot de code et ses migrations, sans nouvelle intervention de production.

Les trois premières versions de la PR213 ont passé la CI complète : exécutions 39342825448, 39345875261 et 39348431366. Le complément des dépôts et retours a passé la suite globale ; 75 tests de dépôt et 121 tests ciblés des parcours/retours réussis. Les quatre retours intacts ont également été exécutés en autocommit sur une copie locale, puis les migrations rejouées ; comptes et objets conservés.

Un défaut de composition des transactions a été corrigé sur les cinq nouveaux retours. Les 71 retours historiques ont reçu la même enveloppe atomique, sans modification de leur corps métier vérifié par contre-relecture. Le banc distingue 70 retours exécutés jusqu’à l’erreur finale volontaire et six refus de dépendances attendus, tous sans validation des écritures témoins. La reproduction sur une copie séparée conserve une écriture avec l’ancien script, aucune avec le corrigé. Aucun retour n’a été appliqué en production.

## Transferts de fichiers

Dépôts limités à 4 Mio avec message avant envoi et saisie conservée. Cinq routes de lecture utilisent Storage directement après autorisation et trace. Miniatures et ouverture native des PDF mobiles conservées. Un PNG de 6 Mio, une reprise après erreur, une redirection de téléchargement et un PDF de deux pages passent sur navigateur local. Les dépôts directs signés, les routes spécifiques à empreinte, le CORS réel et Safari iPhone restent à vérifier pour terminer G5.

## Préparation des signatures

Le début de création Zoho est distingué de la validation locale et de la connexion OAuth. Un échec certain avant création libère circuit et quota dans une transaction journalisée ; une réponse incertaine conserve le blocage. Une annulation ne peut plus écraser une réservation concurrente. Les deux défauts signalés en contre-relecture sont corrigés, avec essais de pannes sur chaque écriture, droits, rejeu et entrelacements. Le rapprochement des circuits sans référence, les alertes et les relances restent ouverts (E5 partiel).

## Contrôles externes et limites

Le tableau de bord Supabase a été consulté en lecture seule : offre Pro, région Paris, sept sauvegardes natives visibles et PITR non actif. Les objets Storage ne sont pas inclus dans les copies natives. La sauvegarde applicative reste donc nécessaire pour ces objets.

Le relevé des fichiers ne retrouve pas le nombre ancien annoncé dans le prompt : 36 objets dans le bucket de documents ; huit sans fiche `documents`, dont quatre référencés par d'autres tables métier. **Quatre candidats sans référence dans les quatre tables de dépôt examinées** restent à qualifier ; aucune suppression effectuée.

Les réglages d'authentification, la protection GitHub, la validation marketing obligatoire et les interrupteurs de signature n'ont pas été modifiés. Les achats, envois réels, choix de conservation et validations juridiques restent distincts de la préparation technique.

## Mise en service

Le protocole, l'ordre des migrations, la précondition de souscription fermée et le retour figurent dans `app/docs/livraison-audit-20-octobre.md`. La relecture du code ne remplace ni la simulation du chantier, ni une CI sur le SHA exact, ni la recette de production.

> [!warning] Décision d'ouverture non acquise
> Les faits d'entreprise, la relecture juridique, les choix contractuels et les travaux encore ouverts de l'audit restent nécessaires. Ne pas présenter ce lot comme la clôture de l'audit ou comme une autorisation de démarcher.
