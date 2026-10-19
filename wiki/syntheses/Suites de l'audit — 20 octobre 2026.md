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
- Association Stripe contrôlée côté serveur ; deux migrations rejouables et leurs retours livrés avec une précondition de souscription fermée pendant le déploiement.
- Sauvegarde et restauration de l'historique des migrations, y compris vérification du contenu après restauration ; anciennes sauvegardes acceptées en signalant l'historique absent.
- Distinction entre étude de veille non retenue par le contrôle des sources et panne technique.
- Dependabot hebdomadaire préparé ; exemples de contacts retirés du guide public de recette. Aucun secret renouvelé par cette opération.
- Quatre modèles français de notification de sécurité préparés et contrôlés localement, sans envoi ni activation.
- [[Registre des traitements]] et modèle de sous-traitance actualisés pour Zoho ; garanties contractuelles, durées et validation DPO toujours attendues.

## Preuves locales

Compilation, types et lint réussis. Suite complète : 8 791 tests réussis et 38 non exécutés, dont des intégrations conditionnées aux accès externes. Parcours navigateur ciblés : 62 réussis et un non exécuté. Les corrections issues de contre-relecture ont leur vérification rouge puis verte ; la restauration et le parcours de récupération ont également été éprouvés avec les services réels locaux.

Audit d’affichage : 165 écrans à chacune des largeurs 390, 768 et 1 440 pixels, soit 495 vérifications réussies (pas d’erreur de page ni de débordement détecté). Ce contrôle ne vaut pas preuve de toutes les actions métier de chaque écran.

La contre-relecture a relevé deux P2, corrigés puis relus ; aucun constat bloquant résiduel identifié. Sa portée est le lot de code et ses migrations, sans nouvelle intervention de production.

## Contrôles externes et limites

Le tableau de bord Supabase a été consulté en lecture seule : offre Pro, région Paris, sept sauvegardes natives visibles et PITR non actif. Les objets Storage ne sont pas inclus dans les copies natives. La sauvegarde applicative reste donc nécessaire pour ces objets.

Le relevé des fichiers ne retrouve pas le nombre ancien annoncé dans le prompt : 36 objets dans le bucket de documents ; huit sans fiche `documents`, dont quatre référencés par d'autres tables métier. **Quatre candidats sans référence dans les quatre tables de dépôt examinées** restent à qualifier ; aucune suppression effectuée.

Les réglages d'authentification, la protection GitHub, la validation marketing obligatoire et les interrupteurs de signature n'ont pas été modifiés. Les achats, envois réels, choix de conservation et validations juridiques restent distincts de la préparation technique.

## Mise en service

Le protocole, l'ordre des migrations, la précondition de souscription fermée et le retour figurent dans `app/docs/livraison-audit-20-octobre.md`. La relecture du code ne remplace ni la simulation du chantier, ni une CI sur le SHA exact, ni la recette de production.

> [!warning] Décision d'ouverture non acquise
> Les faits d'entreprise, la relecture juridique, les choix contractuels et les travaux encore ouverts de l'audit restent nécessaires. Ne pas présenter ce lot comme la clôture de l'audit ou comme une autorisation de démarcher.
