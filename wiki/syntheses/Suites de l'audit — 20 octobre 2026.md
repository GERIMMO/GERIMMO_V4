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
- Association Stripe contrôlée côté serveur ; sept migrations rejouables et leurs retours livrés avec une précondition de souscription fermée pendant le déploiement.
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

Dépôts documentaires directs privés jusqu’à 10 Mio, dix pièces et 50 Mio par formulaire, avec saisie conservée. Réservation par utilisateur et contrôle serveur des octets avant enregistrement métier. Les autres types de formulaires conservent leurs limites propres. Cinq routes de lecture utilisent Storage directement après autorisation et trace. Miniatures et ouverture native des PDF mobiles conservées. Un PNG de 6 Mio, une reprise après erreur, une redirection de téléchargement et un PDF de deux pages passent sur navigateur local. Les devis archivés, preuves de signature et pièces privées de plus de 4 Mio utilisent également cette lecture après contrôle d’empreinte côté serveur puis dans le navigateur. Le flux est borné avant tout aperçu. 123 tests ciblés et deux essais navigateur réussissent. Les dépôts directs sont testés en local avec interruption et reprise d’un PDF de 6 Mio. Les générations historiques sans archive, le CORS réel et Safari iPhone restent à vérifier pour terminer G5.

La CI744 a identifié une attente obsolète dans le test navigateur de consultation. Le scénario contrôle maintenant l’aperçu HTML à adresse stable, le vrai contenu PDF reçu depuis Storage et le téléchargement autorisé. Les 17 scénarios de navigation et d’isolation passent localement après adaptation ; le banc conserve le type du fichier déposé. Le téléchargement navigateur, son nom et ses octets sont également éprouvés après correction du banc qui ignorait le paramètre de téléchargement. La CI du dernier SHA reste requise.

## Préparation des signatures

Le début de création Zoho est distingué de la validation locale et de la connexion OAuth. Un échec certain avant création libère circuit et quota dans une transaction journalisée ; une réponse incertaine conserve le blocage. Une annulation ne peut plus écraser une réservation concurrente. Les deux défauts signalés en contre-relecture sont corrigés, avec essais de pannes sur chaque écriture, droits, rejeu et entrelacements. Le rapprochement d’un brouillon unique vérifie désormais le marqueur, les signataires, leur ordre, les SMS et toutes les empreintes PDF. Les rappels J+7/J+21 ont un registre durable ; J+28, refus, expiration et incertitude produisent des alertes internes dédupliquées. Aucun second envoi en cas de réponse perdue. Les rappels restent désactivés ; la recette externe Zoho reste ouverte (E5 partiel).

## Contrôles externes et limites

Le tableau de bord Supabase a été consulté en lecture seule : offre Pro, région Paris, sept sauvegardes natives visibles et PITR non actif. Les objets Storage ne sont pas inclus dans les copies natives. La sauvegarde applicative reste donc nécessaire pour ces objets.

Le relevé des fichiers ne retrouve pas le nombre ancien annoncé dans le prompt : 36 objets dans le bucket de documents ; huit sans fiche `documents`, dont quatre référencés par d'autres tables métier. **Quatre candidats sans référence dans les quatre tables de dépôt examinées** restent à qualifier ; aucune suppression effectuée.

Les réglages d'authentification, la protection GitHub et les interrupteurs de signature n'ont pas été modifiés. Après l’accord explicite du dirigeant, la validation marketing obligatoire a été enregistrée le 20 octobre à 10 h 17 Paris : l’interface confirme « Après votre validation » et « Pilotage marketing mis à jour ». L’article programmé à 9 h était déjà diffusé ; le réglage protège les prochaines diffusions. Les achats, envois réels, choix de conservation et validations juridiques restent distincts de la préparation technique.

La console Stripe confirme un seul webhook actif avec les sept événements attendus. Aucune livraison n’est affichée du 14 au 20 octobre : ce constat n’est pas une recette de réception. Les nouvelles tentatives sont actives, jusqu’à huit sur deux semaines, puis annulation ; numérotation séquentielle du compte. Ces règles et les notifications désactivées restent à aligner avec les choix contractuels. Aucun réglage modifié. Le coût réel des essais Zoho reste inaccessible sans reconnexion.

## Mise en service

La CI748 a réussi 8 989 tests de logique et échoué sur un seul contrôle syntaxique, qui classait l’en-tête HTTP `Content-Length` de la visionneuse comme une saisie de formulaire. Une exception précise documente la double limite de 50 Mio, à l’en-tête et pendant la lecture effective du flux. Les 43 tests ciblés passent après correction ; les contrôles de saisie des montants restent inchangés. La CI749 a ensuite réussi sur 66ce9d6875a0b88604af545265cfe8caf5d59804 : 8 990 tests de logique, 17 non exécutés ; 200 tests navigateur, un non exécuté. Elle précède le complément actuel de dépôt et de suivi : une nouvelle CI est nécessaire.

Le protocole, l'ordre des migrations, la précondition de souscription fermée et le retour figurent dans `app/docs/livraison-audit-20-octobre.md`. La relecture du code ne remplace ni la simulation du chantier, ni une CI sur le SHA exact, ni la recette de production.

> [!warning] Décision d'ouverture non acquise
> Les faits d'entreprise, la relecture juridique, les choix contractuels et les travaux encore ouverts de l'audit restent nécessaires. Ne pas présenter ce lot comme la clôture de l'audit ou comme une autorisation de démarcher.

## Complément local : transferts et suivi

La dernière contre-relecture a permis de corriger quatre P2 : exception de suivi sur abonnement suspendu, délai de purge couvrant un jeton émis tardivement, traitement du reliquat et arrêt des rappels après OAuth. Les 128 tests ciblés passent ; aucun défaut concret résiduel relevé par le second lecteur sur ce delta. Le chemin documenté de retour complet passe ses 45 tests. Compilation et lint réussissent ; les résultats globaux sont consignés ci-dessous.

Validation locale finale du complément : 9 079 tests réussis, 45 non exécutés (633 fichiers). Compilation, types et lint réussis. Le dépôt de 6 Mio avec interruption/reprise et consultation passe sur le build à 390 et 1 440 pixels ; les douze autres scénarios ciblés de protection de saisie et de refus d’attestation passent également. Ces contrôles ne sont pas des essais Zoho ou Stripe réels.

## Reprise après CI750

La CI750 (`39405740956`, SHA `9afe86342759bd6c15ba615d7c57e450e5fb852d`) réussit 9 107 tests de logique, 17 non exécutés, mais trois parcours navigateur échouent (198 réussis, un non exécuté et un repris avec succès). Ce SHA n’est pas livré.

Corrections : le message de progression disparaît à la fin du transfert, indépendamment du mode de soumission ; le champ photo du signalement refuse PDF et formats invalides avant réservation, y compris un PDF déjà transféré ; le test de réponse perdue vise la déclaration métier et non la réservation préalable. Le parcours d’invitation attend le succès propre à chaque attestation et cible l’article de l’artisan concerné, même après un essai précédent. Les 25 tests client/serveur ciblés réussissent ; la relecture statique du dernier delta ne relève plus de défaut concret. La compilation, les essais navigateur ciblés et la CI complète du nouveau SHA restent à confirmer avant publication.

Validation du delta CI750 : compilation, types et lint réussis ; 25 tests ciblés et les 10 scénarios navigateur (dont préparation des sessions) réussissent sur le build corrigé. Le parcours artisan va jusqu’à la sollicitation, les deux reprises d’incident conservent l’unicité et les dépôts de 6 Mio passent à 390 et 1 440 pixels. La CI du nouveau SHA reste requise avant livraison.
