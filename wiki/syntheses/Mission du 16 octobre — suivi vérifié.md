---
type: synthesis
tags: [mission, exploitation, recette, octobre-2026]
status: draft
created: 2026-10-16
updated: 2026-10-17
---

# Mission du 16 octobre — suivi vérifié

Ce relevé distingue la publication et la validation effective des parcours. Il complète [[Prêt à démarcher]], [[Dossier de validation — version candidate du 13 octobre 2026]] et [[Décisions groupées — version candidate du 13 octobre 2026]]. Les relevés du 16 octobre ci-dessous sont historiques ; le point du 17 octobre fait foi pour l'état courant.

## Publication du 17 octobre

- [PR #198](https://github.com/GERIMMO/GERIMMO_V4/pull/198) fusionnée : `d31a9525908bbb0999c876c0a6733d499941264d`, arbre `fb5dac8ed891ce6f810b573b37cf4a5e6fc4f97a`, identique au candidat final `fe8e534`. CI candidate [38956122277](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/38956122277) réussie : 8 130 tests de logique/PDF et 199 tests navigateur, respectivement 16 et un ignorés, aucun échec ni test instable.
- Les huit migrations ont réussi la [simulation 38956595433](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/38956595433). Nouvelle comparaison avant application : 26 fonctions sans dérive. [Sauvegarde 39016260525](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39016260525) réussie, archive distante relue, puis [application 39016744717](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39016744717) réussie. Huit versions enregistrées ; quatre nouvelles tables avec RLS, douze nouvelles fonctions sans droit anonyme ; dix tâches périodiques actives conservées.
- [Déploiement Vercel DcZufoNqkHq9io4ZEuDSrgF9rZQ9](https://vercel.com/gerimmo/gerimmo-v4/DcZufoNqkHq9io4ZEuDSrgF9rZQ9) Ready, Production, domaine `www.gerimmo.app`. Accueil relu. Premier relevé : aucune erreur Vercel, deux tâches terminées sans échec après publication ; cela ne couvre pas encore une heure complète.
- `GERIMMO_CODEX_ENABLED` était `true` en Production : corrigé en `false`, pris en compte par ce déploiement. L'atelier automatique reste désactivé. La présence du secret dédié de nettoyage GitHub a été confirmée après saisie par le dirigeant ; aucune valeur lue.
- Après sauvegarde et accord ponctuel explicite : 31 anciens fichiers fictifs retirés par l'interface Storage, zéro restant dans les deux dossiers ciblés. Les fichiers des utilisateurs actuels sont exclus.
- Accord ponctuel explicite pour cinq comptes fictifs, dont un superadmin avec MFA et retrait automatique sous 61 minutes. [Recette n°21, 39017066396](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39017066396) arrêtée à l'ouverture de la session artisan, avant les parcours. Purge réussie et vérifiée par SELECT : zéro compte, organisation, artisan et tâche d'expiration du passage. La [PR #199](https://github.com/GERIMMO/GERIMMO_V4/pull/199) précise le diagnostic du banc ; aucune correction du produit n'est présumée.
- CI de main [39016823364](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39016823364) réussie : mêmes 8 130 tests logique/PDF et 199 tests navigateur, aucun échec.
- PR199 intégrée (`6614ea7`) après CI [39017381737](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39017381737) réussie. [Recette n°22, 39018291225](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39018291225) : connexion artisan HTTP 200, destination `/artisan` atteinte ; échec exclusivement à l'attente `networkidle` après 45 secondes. Purge réussie. La PR200 remplace cette attente par la destination du rôle et un titre visible, sans changement du produit ni des droits. Recette complète toujours à rejouer.

- PR200 intégrée (`3e07b49`) après CI [39018490210](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39018490210) réussie. CI de main [39019545685](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39019545685) réussie. Déploiement `GpcpZNDP3p5dxFXCPLAaeQCeP5oa` Ready et Current sur `www.gerimmo.app`.
- [Recette n°23, 39019618173](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39019618173) : 48 scénarios réussis, un ignoré, un échec. Les accès artisan et supervision avec MFA sont acquis, ainsi que D18/D22/D23. Le scénario d’inscription cherchait le mot de passe sur le premier écran alors que le parcours le demande après confirmation ; capture inspectée et correction dans PR201. Purge réussie et vérification SQL : zéro compte, organisation, artisan et tâche d’expiration de ce passage. Les 42 fichiers antérieurs sont conservés.
- [Sauvegarde après publication 39018999783](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39018999783) réussie : archive de base relue (3 552 625 octets), 42 fichiers et dix tâches vérifiés. À 09 h 20 UTC, 35 exécutions périodiques réussies depuis 08 h 17, aucun échec.
- **Décision explicite du dirigeant : conserver les cinq comptes de recette.** [PR201](https://github.com/GERIMMO/GERIMMO_V4/pull/201) publiée (`406ad8a`) après [CI 39022164590](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39022164590) : 8 136 tests logique/PDF et 199 tests navigateur réussis, 16 et un ignorés, aucun échec. Déploiement `9jseXz655P2Q4Q41yYCHdy3H2rBc` Ready en Production. Deux cycles locaux conservent les mêmes UUID ; 17 contrôles de conservation et de périmètre réussis, quatre contrôles de configuration réussis.
- [Recette n°24, 39022945703](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39022945703) réussie : **49 scénarios validés, un ignoré (/cgu facultatif), aucun échec ni test instable**. Inscription, confirmation et récupération maintenant validées en ligne. Vérification SQL après clôture : **les cinq mêmes identités sont conservées**, zéro privilège/session superadmin temporaire, accès de supervision fermé, zéro tâche d’expiration et zéro compte ponctuel d’inscription. Les dossiers fictifs restent présents jusqu’au prochain passage. Les cinq comptes de la recette n°23 avaient été supprimés avant la correction de la consigne.
- Durcissement de /auth/confirm (consigne hors dépôt).

## Compléments candidats du 16 octobre, 21 h 32 Paris

- La CI initiale [38952044004](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/38952044004) est terminée : 8 118 tests de logique et PDF réussis, 16 ignorés ; navigateur 196 réussis, un ignoré, trois échecs. Les traces montrent une même cause : le cookie Secure de confirmation refusé sur l'adresse HTTP numérique du banc. L'alignement sur localhost conserve la protection du produit ; les trois parcours passent localement après correction, sans nouvelle tentative. La CI finale reste à exécuter.
- Le modèle **Change email address reste strictement identique au modèle de main**. Un complément du retour applicatif conserve le changement d'adresse d'un compte déjà confirmé ; les quinze essais sur le service Auth et le rendu SMTP locaux réels sont réussis. L'expiration et le contrôle du navigateur demandeur restent assurés par Auth. Le nouveau complément SQL `20261016210000_retour_adresse_confirmee.sql` est en huitième position, avec retour dédié.
- Relevé SELECT avant simulation : structure Auth requise présente, fonction candidate absente et aucune version `20261016210000` enregistrée en production. La simulation précédente ne couvrait que les sept premiers fichiers ; le lot de huit doit être simulé sur sa nouvelle tête avant application.
- Batterie complète finale : 8 029 tests réussis, 117 ignorés, aucun échec ; 554 fichiers réussis. Compilation, typage, lint et relecture indépendante du complément réussis. Les quinze scénarios Auth/SMTP et le retour/rejeu brut ont été répétés indépendamment, sans constat bloquant. La PR #198 reste en brouillon et la production reste à `4a5ddf58f7cefe1cf882777063cb272cb4420ec6`.

## Point de livraison du 16 octobre, 21 h 10 Paris

- Candidat applicatif `6934a85f4f069faf65f0b8aaadfd5053753635a1`, arborescence `8ca438fd4f33d8cb20ecef87c66ca981de834033`. La PR reste en brouillon ; aucune des sept migrations n'est appliquée définitivement.
- Simulation GitHub [38952270067](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/38952270067) réussie sur cette tête : les sept fichiers sont exécutés dans l'ordre puis annulés. Le relevé SELECT après simulation confirme zéro version candidate enregistrée, absence du schéma candidat `support_interne` et zéro compte actif non confirmé.
- Batterie locale finale : 8 012 tests réussis, 122 ignorés, aucun échec, 552 fichiers réussis. Les cinq vérifications nécessitant les exécutables PostgreSQL sont reprises séparément avec leur chemin explicite : les deux fichiers de sauvegarde/restauration passent leurs 14 tests. Les autres tests ignorés ne sont pas déclarés exécutés.
- Compilation, lint et typage réussis. Liens entre espaces : 17 tests réussis. Parcours finaux T5/T6 : 10 tests réussis, un worker, aucun rejeu, nettoyage complet vérifié. Parcours mot de passe et MFA : 2 tests réussis sur GoTrue réel. Contrelectures indépendantes closes sans constat bloquant.
- Captures après confirmation, devis révisé et rendez-vous annulé inspectées à 768 et 1 440 pixels : aucun débordement horizontal constaté. L'inscription a également été relue dans l'aperçu à 1 280 pixels. Les captures restent hors dépôt.
- CI GitHub [38952044004](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/38952044004) encore en cours à ce relevé. Son résultat n'est pas présumé.
- Vercel, noms seulement : aucun paramètre personnalisé nommé `GERIMMO_SESSION_SECRET`, `OPENAI_API_KEY`, `VERCEL_PROJECT_ID`, `VERCEL_AUTOMATION_BYPASS_SECRET` ou `RESEND_DOMAIN_READ_KEY` trouvé dans la liste. `OPEN_AI_KEY` existe déjà. Aucune valeur lue ou recopiée ; les variables système éventuellement injectées ne sont pas assimilées aux paramètres personnalisés de cette liste.

## Relevés de production du 16 octobre (historique)

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

## Corrections livrées par la PR #198 (recette étendue à terminer)

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
- Contrôles de style, types et reconstruction du candidat réussis. Parcours des liens propriétaire/agence : 17 cas réussis sans nouvelle tentative. La vérification visuelle finale est décrite au point de livraison ci-dessus.

## Diagnostic D04

La trace conservée de la recette n°18 montre un champ de montant non disponible au moment de la saisie et un montant vide dans la requête. Le scénario attend maintenant un champ visible et sélectionné et vérifie sa valeur avant de soumettre. La preuve ne démontre pas un défaut du parseur monétaire et ne justifie pas de modifier les montants enregistrés.

## Éléments à terminer

1. PR201 et recette n°24 terminées : 49 scénarios réussis, cinq comptes conservés. Les prochains contrôles réutilisent ces identités ; leur suppression en fin de passage est exclue.
2. Stripe : API en bac à sable validée ; essai du paiement par l’interface et livraison HTTP du webhook restent distincts et non vérifiés.
3. Accès artisan et second facteur de supervision vérifiés en ligne au passage n°23. Les accords et le secret de nettoyage sont acquis ; la consigne actuelle impose de conserver les cinq comptes fixes.
4. Nettoyage ancien terminé : 31 fichiers fictifs supprimés, zéro restant. Conserver cette preuve sans supprimer d'autres objets.
5. CI de main réussie ; contrôle des traitements sur plus d’une heure sans échec. Journaux Vercel du dernier déploiement sans erreur au relevé ; surveillance future distincte.
6. Identité de l'éditeur et informations juridiques non fournies : aucune identité inventée. Avis comptable et juridique restent distincts des tests techniques. Modules artisans différés toujours désactivés en production.
7. Comparaison du logo préparée en local : WebP sans perte visuelle 196 074 octets, PNG 335 549 octets ; pixels visibles identiques, gain d'environ 42 %. AVIF sans perte 473 068 octets, sans avantage. Aucun remplacement publié.
8. Surveillance future planifiée : contrôles du relais, sauvegarde, changement d'heure et cycle mensuel ; CI à 00 h 30 Paris le 17 octobre (16 octobre 22 h 30 UTC) et le 1er novembre (31 octobre 23 h 30 UTC). Ces constats futurs ne sont pas déjà acquis.
9. Contrôle du vrai service Storage et d'un dépôt de 6 Mo sur environnement jetable : non réalisé. Les essais locaux simulés ne prouvent ni les politiques du service hébergé ni la limite du transport Vercel.
10. Réglages Vercel : atelier désactivé et redéployé. `OPEN_AI_KEY` reste utilisé par le repli prévu ; normalisation du nom et secret de session dédié non réalisés, sans les décrire comme une panne. Le modèle de changement d'adresse reste conservé.
