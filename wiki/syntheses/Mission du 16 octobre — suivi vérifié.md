---
type: synthesis
tags: [mission, exploitation, recette, octobre-2026]
status: draft
created: 2026-10-16
updated: 2026-10-16
---

# Mission du 16 octobre — suivi vérifié

Ce relevé distingue les constats en production des changements encore locaux. Il complète [[Prêt à démarcher]], [[Dossier de validation — version candidate du 13 octobre 2026]] et [[Décisions groupées — version candidate du 13 octobre 2026]]. Une préparation locale n'est pas une livraison.

## Vérifié en production

- PR #197 fusionnée : `4a5ddf58f7cefe1cf882777063cb272cb4420ec6`. PR #196 déjà fusionnée. PR anciennes #94, #133 et #167 fermées, branches conservées.
- Recette autonome n°19, exécution [38894330211](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/38894330211) : 39 tests réussis, 1 ignoré, aucun test instable et nettoyage réussi. Cela ne constitue pas encore trois recettes consécutives de la nouvelle mission.
- Huit fonctions réécrites par les migrations d'invitation : définitions strictement identiques au main publié (comparaison complète et empreintes).
- Supabase : inscription publique désactivée, confirmation d'adresse activée, connexions anonymes désactivées ; durée des liens ramenée à 3 600 secondes. Les trois modèles de courrier (confirmation, récupération et connexion) sont enregistrés et leur lien vers `/auth/confirm?token_hash=…` relu dans l’aperçu Supabase ; modèle de changement d’adresse conservé. La recette n°20 est réussie après ces réglages : 39 tests réussis, 1 ignoré, aucun test instable, nettoyage réussi ; la remise effective de courriers à une boîte humaine n’est pas vérifiée.
- URL de site : `https://www.gerimmo.app`. La destination `https://www.gerimmo.app/**` est autorisée. Les notifications de sécurité « mot de passe modifié » sont désactivées ; constat, pas de modification automatique.
- Restauration isolée [38943437206](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/38943437206), réussie le 16/10 à 17 h 56 UTC : sauvegarde du 16/10 à 08 h 48 UTC, 194 tables, 37 108 lignes et 73 fichiers restaurés, aucun fichier manquant. La production n'a pas été restaurée ni modifiée par cet exercice.
- Veille : trois analyses refusées les 15–16/10 car leur citation-preuve ne figurait pas dans la source. Ce constat n'est pas un refus de quota ni une panne de connexion de l'IA.
- Avis de sécurité : 347 fonctions avec privilèges élevés exécutables par les comptes connectés, à contrôler individuellement ; dix tables avec RLS sans politique, toutes sans droit direct SELECT/INSERT pour les comptes anonymes ou connectés ; `pg_net` 0.20.4 dans public, extension non déplaçable par ALTER EXTENSION SET SCHEMA. Aucun déplacement improvisé ni ouverture des tables.
- Stockage : 31 objets orphelins dans deux anciens dossiers de recette (14 et 17), organisations absentes. Aucune suppression effectuée.
- Stripe : l'écran Santé confirme une clé réelle déjà en place. Le point de terminaison existant vers Gerimmo a été complété le 16/10 : sept événements abonnés, dont `customer.subscription.trial_will_end` et `invoice.paid`. Le mode n'a pas été changé et aucun paiement n'a été déclenché. Capture de preuve conservée hors dépôt ; la bonne réception d'un événement réel n'est pas démontrée par ce seul réglage.

- Stripe en mode test : [38948229092](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/38948229092) sur `4a5ddf58f7cefe1cf882777063cb272cb4420ec6`, 14 tests réussis, aucun ignoré ni échoué. Portée : API Stripe de test et règles SQL locales, événement signé simulé ; interface de paiement et livraison HTTP réelle du webhook non parcourues.

## Corrections locales en validation

- Confirmation des comptes et revalidation explicite du profil : vérifications sur le vrai service d'authentification local. Les preuves de sécurité détaillées restent hors dépôt public.
- PDF des anciennes versions de devis ; alerte unique lorsqu'une révision ne peut plus être déposée.
- Relance d'une demande de report, accusé d'annulation et indication dans l'agenda ; arrêt et budget de temps vérifiés avant l'envoi.
- Traversée superadmin en lecture seule, geste d'encaissement distinct avec motif, confirmation, durée limitée, auteur et historique ; maintenance plateforme conservée avec un périmètre privé limité.
- Avertissements indicatifs des loyers de référence : [[Cohérence des loyers de référence]]. Aucun changement automatique du loyer ni blocage de sauvegarde.
- Rétention des journaux selon le catalogue, prise en compte des tâches volontairement désactivées.
- Sauvegarde du registre privé de support, commentaires et droits inclus ; restauration contrôlée des fonctions et déclencheurs, refus d’un schéma requis manquant.
- Conseils de sélection du locataire masqués dans les parcours en attendant leur relecture : [[Choisir son locataire selon les conditions des assurances loyers impayés]].
- Erreurs temporaires de lecture d'un espace : réponse temporairement indisponible au lieu d'une fausse page introuvable.
- Quota ou arrêt avant création d'un visuel : aucun essai de génération consommé à tort.
- Compléments des dates au jour de Paris : honoraires, copropriété, clés, alertes d'assurance et de restitution, ouverture en écriture et priorité des dossiers. Les données historiques ne sont pas réécrites.
- CI et workflows figés sur Ubuntu 24.04, dépendances d'Actions actualisées ; contrôle des transactions avant une migration simulée.

La suite intégrée du 16/10 à 20 h 41 Paris est verte : 549 fichiers réussis, 7 998 tests réussis, 117 ignorés, aucun échec. Elle inclut la restauration locale réelle avec le client PostgreSQL disponible. Les derniers contrôles de retour arrière et les ajustements de confirmation, postérieurs à cette exécution, font l’objet de reprises ciblées ; CI du commit final et parcours complets restent à confirmer.

## Parcours et préparation de la livraison

- Authentification locale réelle : inscription, confirmation, invitation d’artisan et récupération vérifiées ; contrelecture indépendante et reprise des essais sur GoTrue.
- Recette étendue sur données fictives : quatre écrans artisan, trois écrans de supervision avec second facteur, révision de devis et PDF des deux versions, report/annulation de rendez-vous et prise d’acte, règlement vu par l’artisan. Chaque passage est nettoyé ; une dépendance circulaire des créneaux a été corrigée après un premier refus de purge, puis le bilan a été vérifié à zéro.
- Dix-huit définitions de fonctions de production relues, sauvegardées hors dépôt et reproduites sur une base fictive. Les sept migrations candidates s’y exécutent en simulation ; annulation vérifiée par empreintes inchangées. Trois dates par défaut en production confirmées à `CURRENT_DATE`. Ce contrôle ne remplace pas la simulation du chantier GitHub.
- Contrôles de style, types et reconstruction du candidat réussis. Parcours des liens propriétaire/agence : 17 cas réussis sans nouvelle tentative. Vérification visuelle encore en cours.

## Diagnostic D04

La trace conservée de la recette n°18 montre un champ de montant non disponible au moment de la saisie et un montant vide dans la requête. Le scénario attend maintenant un champ visible et sélectionné et vérifie sa valeur avant de soumettre. La preuve ne démontre pas un défaut du parseur monétaire et ne justifie pas de modifier les montants enregistrés.

## Éléments à terminer

1. Validation globale et navigateur des changements regroupés, relecture indépendante, puis sauvegarde, simulation, application nommée, publication et nouvelle recette.
2. Stripe : API en bac à sable validée ; essai du paiement par l’interface et livraison HTTP du webhook restent distincts et non vérifiés.
3. Secret dédié de nettoyage Storage pour la recette autonome étendue : absent des secrets GitHub lors du relevé. Ne pas réutiliser implicitement la clé de sauvegarde.
4. Accord au moment du lancement pour le compte de supervision éphémère en production et sa purge ; contrôle du second facteur et extinction automatique.
5. Suppression confirmée des 31 objets de test, via l'API Storage ou son interface, jamais par SQL.
6. Identité de l'éditeur et informations juridiques non fournies : aucune identité inventée. Avis comptable et juridique restent distincts des tests techniques. Modules artisans différés toujours désactivés en production.
7. Comparaison du logo préparée en local : WebP sans perte visuelle 196 074 octets, PNG 335 549 octets ; pixels visibles identiques, gain d'environ 42 %. AVIF sans perte 473 068 octets, sans avantage. Aucun remplacement publié.
8. Surveillance future planifiée : contrôles du relais, sauvegarde, changement d'heure et cycle mensuel ; CI à 00 h 30 Paris le 17 octobre (16 octobre 22 h 30 UTC) et le 1er novembre (31 octobre 23 h 30 UTC). Ces constats futurs ne sont pas déjà acquis.
