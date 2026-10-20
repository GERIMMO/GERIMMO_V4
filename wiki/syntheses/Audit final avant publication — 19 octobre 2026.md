---
type: synthesis
tags: [audit, publication, securite, paiement, signature-electronique, juridique, rgpd, exploitation, octobre-2026]
status: in-progress
created: 2026-10-19
updated: 2026-10-20
sources: []
---

# Audit final avant publication — 19 octobre 2026

Synthèse publiable de l'audit complet et final demandé par le dirigeant avant d'ouvrir Gerimmo à de vrais utilisateurs. Elle porte sur la version en ligne `2fffec6` (PR #211, fusionnée le 19/10 à 02 h 33 heure de Paris, déploiement Vercel `dpl_Fktqsq11AQ6tbmddNHCDaL28jxFp`). Le rapport complet, avec les preuves détaillées et les défauts de sécurité non publiables avant correction, a été remis au dirigeant hors dépôt. Pages liées : [[Prêt à démarcher]], [[Recette de production]], [[Signature électronique]], [[Registre des anomalies — audit du 13 octobre 2026]], [[Décisions groupées — version candidate du 13 octobre 2026]], [[Dossier de validation — version candidate du 13 octobre 2026]], [[Prompt de passation à Codex — état du 16 octobre 2026]].

> [!warning] Ce que cette page n'affirme pas
> Tout ce qui relève du droit (rétractation, mentions de facture, franchise de TVA, médiateur de la consommation, mise en demeure, valeur d'une mention de caution collée, loi Hoguet, conservation des données) est signalé **« à faire relire par un juriste »** ou par l'expert-comptable. Cette page ne tranche aucune règle juridique.

## 1. Verdict

**PAS PRÊT** : huit points bloquants doivent être levés avant d'ouvrir Gerimmo à de vrais utilisateurs. Plusieurs se règlent par une saisie ou un réglage ; c'est la relecture par un juriste qui fixera la date d'ouverture.

Le socle est sérieux : les données de chaque client sont cloisonnées, les paiements sont bien construits, la sauvegarde quotidienne réussit, les tâches automatiques tournent sans échec, aucun secret ne figure dans le dépôt. **Aucun client payant n'existe encore (0 abonnement en base)** : tout reste corrigeable.

## 2. Méthode

- Lecture seule : code du dépôt sur `2fffec6`, production Supabase (SELECT uniquement), Vercel (API), GitHub (API). Aucune batterie de tests, aucun paiement, aucun envoi, aucune écriture.
- Deux temps : constats par angle (sécurité des comptes et des accès, base et migrations, paiement Stripe, signature électronique, juridique et RGPD, produit et parcours, contenu et site vitrine, exploitation), puis **vérification contradictoire** de chaque constat sur le dépôt et la production ; la gravité retenue est celle de la vérification.
- Résultat brut : 78 constats retenus (20 constats-sources bloquants regroupés en 8 points, 51 majeurs regroupés en 29, 7 mineurs), 9 compléments issus d'une critique de complétude, 53 observations mineures ou informatives, 90 points **non vérifiables** depuis l'environnement de l'agent (§ 8).

## 3. Les huit points bloquants

| # | Point | Pourquoi c'est bloquant | Action | Qui |
| --- | --- | --- | --- | --- |
| B1 | **L'éditeur n'est identifié nulle part** : identité, médiateur de la consommation et destinataire de la rétractation affichent « (à venir) » | Dénomination, forme, capital, siège, RCS, SIRET, TVA, directeur de la publication, courriel et téléphone sont vides sur le site en ligne ; le formulaire de rétractation (CGV art. 8.10) et l'article litiges (art. 17) renvoient à « (à venir) » ; le registre `supervision_identite` n'a jamais été rempli (révision 0). Pendant ce temps l'inscription est ouverte et la souscription payante possible (clé Stripe réelle d'après le journal du 16/10). | Le dirigeant saisit l'identité complète dans /admin/parametres, adhère à un dispositif de médiation et en saisit les coordonnées ; le juriste relit mentions légales, CGV (art. 8.10 et 17, formulaire) et confidentialité ; l'expert-comptable valide la franchise de TVA et la mention « art. 293 B du CGI ». | Dirigeant ; juriste ; expert-comptable |
| B2 | **Même l'identité saisie, deux pages légales resteront « en cours de finalisation »** | Les coordonnées des prestataires (dont l'hébergeur) et la localisation de la Base Adresse Nationale sont écrites en dur à vide dans le code (`app/src/lib/editeur.ts`) et ne se modifient pas depuis l'administration ; l'encadré « Document en cours de finalisation » resterait. Le message de succès de l'administration dit pourtant « identité reprise sur les trois pages légales ». | Rendre ces deux informations modifiables dans /admin/parametres (ou les renseigner après vérification par le dirigeant) ; corriger le message de succès pour dire ce qui reste à compléter. | Codex ; dirigeant (coordonnées) |
| B3 | **La vente s'ouvre dès que les clés Stripe sont posées**, sans garde sur l'identité de l'éditeur ni sur l'acceptation des CGV en vigueur | Le bouton « Continuer vers le paiement sécurisé » s'affiche pour tout responsable de compte dès que les clés Stripe existent et que la TVA est réglée (`actions/abonnement.ts`, `abonnement-2026.tsx`). Rien ne bloque la vente tant que les pages légales sont incomplètes ; rien ne fait réaccepter les CGV quand leur version change. | Garde côté serveur (`demarrerAbonnement`) et à l'écran (`motifIndisponible`) : paiement refusé tant que l'identité est incomplète ou que la version en vigueur des CGV n'est pas acceptée ; test ; recette. Mesure d'attente possible : clé Stripe de test en production. | Codex ; dirigeant (mesure d'attente) |
| B4 | **Hébergement sur l'offre Hobby de Vercel** alors que le site va encaisser des abonnements | Constaté par l'API : journaux d'exécution gardés environ une heure, aucun export de journaux, retour arrière limité au déploiement précédent, tâches planifiées en retard (l'e-mail de 5 h part à 5 h 25). Selon la documentation Vercel, Hobby serait réservé à un usage personnel non commercial : texte exact à confirmer par le dirigeant. Le projet avait lui-même prévu l'offre Pro avant la vente. | Le dirigeant lit les conditions d'usage et passe l'équipe sur l'offre Pro avant le premier encaissement ; Codex branche ensuite un export des journaux vers un stockage dans l'UE avec durée de conservation fixée. | Dirigeant, puis Codex |
| B5 | **Signature des devis** : une mission ne peut plus être annulée, refusée ni réaffectée, et la tâche de nuit des devis cassera le 29/10 | Depuis le 18/10 (migration 20261018193308), un devis signé ne peut plus changer de statut (déclencheur `devis_signature_verrou`) ; un seul devis peut être signé par incident, pour toujours (index unique). La maintenance nocturne des devis (04 h 30 UTC) échouera en entier dès la nuit du 28 au 29/10 à cause d'un devis de recette signé en mode essai, valable jusqu'au 28/10 ; ensuite plus aucun devis ni sollicitation n'expirera pour aucun client. Aucun test ne couvre ces cas. | Autoriser dans le déclencheur les changements légitimes (annulation, refus, expiration, artisan écarté) en conservant l'archive signée ; limiter l'unicité aux circuits actifs ; tests de bout en bout (signer A, retenir A, refus, signer B, retenir B ; tâche de nuit avec devis signé). Le dirigeant décide du sort du devis de recette. | Codex ; dirigeant |
| B6 | **Aucun texte juridique ni modèle d'acte relu par un juriste**, alors que la signature électronique est ouverte techniquement aux clients | CGU, CGV, confidentialité, mentions légales et modèles d'actes (bail, avenant, cautionnement, EDL, échelonnement, travaux, congé, décompte) ont été rédigés par l'agent IA ; aucune relecture consignée (questions Q7 et Q9 ouvertes). Les mentions légales affirment que Gerimmo ne relève pas de la loi Hoguet. Les trois interrupteurs d'envoi Zoho ont été modifiés le 18/10 à 22 h 11 UTC ; aucun acte réel n'est signé (5 circuits, tous dans l'organisation de recette). | Relecture complète par le juriste ; Codex intègre les corrections, incrémente `CONDITIONS_VERSION` et met à jour la documentation ; le dirigeant décide par écrit de refermer ou de maintenir les envois. | Juriste ; Codex ; dirigeant |
| B7 | **Cautionnement électronique** : mention de la caution copiée-collée, parcours jamais essayé de bout en bout sur téléphone | Depuis la PR #209, le garant copie la mention depuis l'e-mail puis la colle dans Zoho ; l'acte imprimé dit « recopiée intégralement de sa main … ou apposée par elle ». Seul un juriste peut dire si une mention collée suffit. Le seul cautionnement terminé a été envoyé avant la PR #209. Atténuations : contrôle serveur de la mention complète, garant authentifié par SMS, aucun cautionnement réel parti. | Avis du juriste (mode de saisie, copie du bail jointe, niveau de signature, sort d'un acte signé puis écarté) ; en attendant, fermer le modèle « cautionnement » à l'envoi ; puis un cautionnement fictif complet sur téléphone avec la version en ligne, consigné au journal. | Juriste ; dirigeant ; Codex |
| B8 | **La version en ligne n'a jamais été vérifiée par une recette de production** depuis le 17/10, alors que dix livraisons et neuf migrations ont suivi | Dernière « Recette de production avec nettoyage » : n° 24 (39022945703) le 17/10 sur `406ad8a`. Depuis : PR #202 à #211, neuf migrations, ouverture technique de la signature. Piège : la recette recrée l'organisation de recette et effacera les seules preuves en production des essais Zoho ; la liste d'essai Zoho désignerait ensuite une organisation supprimée et un nouveau test enverrait de vrais circuits facturés. | Dans l'ordre : consigner l'inventaire des circuits Zoho (fait le 19/10, voir le journal) ; désactiver les traces Playwright ; lancer la recette sur la version en ligne et consigner l'exécution ; ajouter à la recette la signature, les invitations et le retour de paiement. Ne rien ouvrir avant une recette verte. | Codex |

## 4. Les 29 points majeurs

À traiter vite, et avant de passer à l'échelle. Triés par thème.

| # | Thème | Point | Action | Qui |
| --- | --- | --- | --- | --- |
| 1 | Sécurité | Comptes de recette permanents : sessions jamais fermées, mot de passe partagé exposable dans des artefacts, usage hors chantier le 18/10 | Couper traces et captures de la recette, fermer et bannir les sessions entre deux passages, supprimer les artefacts ; renouveler le mot de passe ; retirer la liste d'essai Zoho de la production | Codex ; dirigeant |
| 2 | Sécurité | Table `liste_attente` créée hors dépôt, écriture anonyme sans limite | Migration par le chantier qui retire l'écriture anonyme et supprime la table (ou l'intègre au dépôt avec des bornes si un site tiers l'utilise) | Codex |
| 3 | Sécurité | L'identifiant du seul super-administrateur est une adresse personnelle publiée dans le dépôt | Passer à une adresse dédiée jamais publiée, garder le second facteur | Dirigeant |
| 4 | Base | Aucun script de retour arrière pour 8 migrations de supervision et de signature | Écrire les retours arrière, ou ratifier par écrit un arrêt sans retour | Codex ; dirigeant |
| 5 | Base | Migrations du 18/10 hors protocole (sans sauvegarde dédiée, CI rouge, hors chantier) | Garde « sauvegarde récente » dans le chantier ; ordre CI → sauvegarde → application ; correspondance fichier/version consignée ; ne plus jamais appliquer à la main | Codex |
| 6 | Base | Restauration non éprouvée depuis 17 migrations, bascule complète jamais jouée | Rejouer la vérification de restauration sur une copie récente ; fixer la date d'un exercice complet (D07, D43) | Codex ; dirigeant |
| 7 | Paiement | Au paiement : pas de lien vers les CGV, pas de rappel de rétractation, pas de procédure de remboursement | Relecture du parcours de souscription, puis lien et rappel à côté de la case, geste d'annulation et remboursement | Juriste ; Codex |
| 8 | Paiement | Défaut de paiement : les CGV disent 30 jours après mise en demeure, le produit coupe à J+15 | Trancher, puis aligner le texte ou le délai | Juriste ; Codex |
| 9 | Paiement | Un événement Stripe peut être perdu, anomalies lues par personne | Événement rejouable, rapprochement de nuit avec Stripe, anomalies visibles dans la supervision et la page Santé | Codex |
| 10 | Paiement | Vérification Stripe en bac à sable non rejouée, aucun paiement réel de bout en bout | Relancer la vérification sur la version en ligne ; puis une souscription réelle remboursée, avec accord écrit | Codex ; dirigeant |
| 11 | Signature | Signature des devis obligatoire, sous un plafond mensuel commun à tous les clients, sans quota ni repli | Fixer les règles (urgence, seuil, indivision) ; quota par compte, alerte avant épuisement, voie de repli ; un devis réel joué jusqu'à « confier la mission » | Dirigeant ; Codex |
| 12 | Signature | Signature Zoho ouverte aux clients le 18/10 sans décision écrite | Décision écrite (garder ou refermer) ; confirmation écrite de Zoho (usage pour des tiers, volumes, sous-traitance) ; adresse de réponse professionnelle | Dirigeant ; juriste |
| 13 | Signature | Données chez Zoho gardées sans limite, confidentialité incomplète, certificat remis à l'artisan | Relecture du contrat Zoho ; compléter la confidentialité ; suppression chez Zoho après archivage | Juriste ; Codex |
| 14 | Signature | Un envoi de signature raté bloque le document ; refus, expiration et oubli ne sont pas signalés | Libérer le circuit sur un refus certain, outil de rapprochement, alertes au propriétaire, relances | Codex |
| 15 | Signature | Informations publiques contradictoires sur la signature et son coût | Décider si la signature est incluse et avec quel quota ; aligner /tarifs, CGV, page artisan, écran client ; clause dédiée | Dirigeant ; Codex ; juriste |
| 16 | Juridique | CGU et pages légales écrites pour une offre agence | Réécrire pour l'offre V1 (propriétaire, locataire) et rédiger des conditions artisans acceptées à l'inscription | Juriste ; Codex |
| 17 | RGPD | Suivi des prospects non déclaré, sans durée de conservation ; cassera la purge en 2028 | Règle de conservation et purge, correction de la clé, page confidentialité ; base légale fixée | Codex ; juriste |
| 18 | RGPD | Aucun moyen de traiter une demande de suppression de compte, pourtant promise | Procédure de supervision qui anonymise un compte, journalisée et testée ; procédure écrite du DPO | Codex ; juriste |
| 19 | RGPD | Registre des traitements resté en brouillon et périmé | Mettre à jour le registre et le modèle de sous-traitance, faire valider | Codex ; juriste |
| 20 | Produit | Invitations du locataire et de l'artisan jamais jouées en production ; réseau d'artisans fermé partout | Jouer les deux invitations en production et les ajouter à la recette ; ouvrir une première commune ou n'annoncer que l'artisan invité | Codex ; dirigeant |
| 21 | Produit | Console de supervision refondue jamais ouverte en production ; un seul superviseur | Recette des 17 rubriques en lecture seule ; nommer un second superviseur | Codex ; dirigeant |
| 22 | Produit | Fichiers de plus de 4,5 Mo probablement refusés alors que l'application annonce 10 Mo | Mesurer sans écrire ; si confirmé, limiter à 4 Mo et passer aux dépôts par lien signé | Codex |
| 23 | Contenu | Articles publiés sur le site et Facebook sans relecture | Activer la validation obligatoire avant mardi 20/10 9 h ; lecture quotidienne de la console ; relecture des articles APL et trêve hivernale, mention IA | Dirigeant ; Codex ; juriste |
| 24 | Contenu | Formulaire de contact sans alerte, alors que l'accueil promet une réponse sous 48 h | Un e-mail au dirigeant à chaque demande (ou dans l'e-mail de 5 h) ; publier une adresse de contact | Codex ; dirigeant |
| 25 | Contenu | Démarchage sans cible, canal ni règles décidés | Décider par écrit cible, canal, message, promesses ; faire relire les règles du canal | Dirigeant ; juriste |
| 26 | Exploitation | Journal et wiki décrochés de la production depuis le 17/10 | Ajouter les entrées manquantes, corriger les titres, mettre à jour les pages de pilotage | Codex |
| 27 | Exploitation | Branche principale sans protection, fusions sans relecture tracée | Règle GitHub : CI obligatoire, pas de poussée forcée, fusion en squash ; relecture indépendante tracée | Dirigeant |
| 28 | Exploitation | Aucune surveillance de disponibilité indépendante | Sonde externe sur l'accueil et /api/sante, alerte e-mail ou SMS hors Vercel et Resend | Dirigeant |
| 29 | Exploitation | Domaine d'envoi des e-mails sans DMARC ni boîte de réception, remise jamais vérifiée | Publier un DMARC, créer la boîte de contact, vérifier la remise vers Gmail, Outlook, Orange, Free | Dirigeant |

## 5. Points mineurs (résumé par thème)

- **Comptes et connexion** : deux défauts de sécurité des comptes, transmis au dirigeant hors dépôt et non détaillés ici avant correction ; notifications de sécurité Supabase (« mot de passe modifié ») désactivées ; durées maximales de session appliquées par le site seulement, pas par Supabase ; aucun CAPTCHA à la connexion ; comptes jamais confirmés non purgés (aucun aujourd'hui). Actions : réglages Supabase par le dirigeant (notifications, limites de session, CAPTCHA, exigence du mot de passe actuel) ; corrections de code par Codex.
- **Signature, compléments** : premier bail de recette enregistré comme réel (`essai = false`) et activable ; contrôle d'intégrité à l'activation du bail côté serveur seulement ; garde-fou de la recette qui ne reconnaît pas le vrai bouton d'envoi ; données des signataires conservées dans les circuits après anonymisation du bail ; variables et route de l'ancien prestataire Yousign à retirer.
- **Base de données** : réglage des devis modifié par une écriture SQL directe sans trace ; correspondance fichiers/versions de migration non documentée ; conventions de migration non suivies (fermeture des droits anonymes, `if not exists`, remplacements sans contrôle) ; une fonction d'abonnement appelable directement par les utilisateurs ; validité d'un devis jugée tantôt au jour UTC, tantôt au jour de Paris ; droits de lecture anonymes inutiles sur les demandes de contact et des colonnes internes des articles ; historique des migrations non sauvegardé ; trois contraintes à valider.
- **Environnements et dépendances** : prévisualisations Vercel des branches non fusionnées qui écrivent dans la base de production (protégées par l'authentification Vercel) ; alertes Dependabot désactivées et audit des dépendances seulement au push ; jetons GitHub et Vercel présents dans l'environnement de production ; secret de session dédié absent.
- **Paiement** : relance d'impayé d'un abonnement annuel qui annonce un montant mensuel ; espace client affichant HT, TTC et « TVA 0,00 € » en régime de franchise (libellés à faire valider par l'expert-comptable).
- **Juridique et contenus à faire relire** : repères « à la charge du locataire / du propriétaire » à la création d'un incident ; taux et seuils fiscaux écrits en dur dans les simulateurs LMNP et GLI, sans source ni date ; page confidentialité inexacte sur les cookies et le stockage navigateur ; e-mails sans identité de l'éditeur ni lien vers la confidentialité ; invitation d'artisan sans origine de l'adresse ni moyen de refuser ; acceptation des CGU consignée par un ancien déclencheur plutôt que par la case cochée ; CGU datées du 30/09 alors que leur annexe a changé le 19/10 ; réforme de la facturation électronique jamais examinée.
- **Site public** : promesse « Quittances envoyées d'elles-mêmes » alors que l'envoi automatique est désactivé par défaut ; article retiré renvoyant 200 au lieu de 404 ; article « décarbonation » hors cible (maintien décidé le 07/10) ; relais de veille vide le 06/10 ; « publicité active » en base sans publicité branchée.
- **Exploitation** : la mission « veille » apparaît en échec presque chaque jour dans l'e-mail de 5 h alors que c'est le contrôle de citation qui rejette l'analyse de l'IA (garde-fou fonctionnel, alerte devenue bruit) ; échéances de jetons à inscrire au calendrier (statistiques Meta vers le 26/11, jetons Vercel et GitHub avant le 24/12, clé de sauvegarde en septembre 2027).
- **Données et dépôt public** : une faiblesse de stockage encore ouverte est décrite dans le wiki public (corriger D11-A avant d'en dire plus) ; quatre fichiers d'un artisan supprimé restent dans le stockage ; les prénoms de deux testeurs réels figurent dans le journal ; `raw/` contient des copies de contenus de tiers (droit de reproduction à faire relire).

## 6. Points forts confirmés

- Données cloisonnées : règles d'accès (RLS) actives sur 100 % des tables ; aucune fonction sensible appelable sans connexion ; second facteur du super-administrateur exigé en base et à l'entrée de l'administration.
- Aucun secret dans le dépôt ni dans l'historique ; le navigateur ne reçoit que des valeurs publiques ; secrets Vercel marqués « sensibles ».
- En-têtes de sécurité complets (CSP, HSTS, interdiction d'affichage dans un cadre) ; inscription et confirmation d'adresse protégées (limites de débit, réponses identiques, aucun mot de passe avant confirmation).
- Paiements bien construits : prix identiques partout (site, CGV, Stripe, base), montant recalculé côté serveur, protections contre le double prélèvement, webhook signé et dédoublonné, page de retour qui attend la confirmation de la base.
- Signature électronique solide techniquement : archivage vérifié en production (PDF signé et certificat classés), contrôle intégral de la mention de caution, réservation de l'envoi et du budget en une seule opération, documents verrouillés pendant la signature, serveurs Zoho européens ; essais bail, devis et cautionnement menés jusqu'au bout sur l'organisation de recette.
- Exploitation fiable : 10 tâches planifiées sans échec ; e-mail de relais de 5 h parti les 17 et 19/10 ; sauvegarde quotidienne chiffrée réussie le 19/10 ; CI verte sur la version exacte avant chaque fusion.
- RGPD : durées de conservation appliquées chaque nuit et conformes au tableau public ; acceptation des CGU versionnée ; données envoyées à l'IA réduites au nécessaire ; aucun traceur ni mesure d'audience.
- Pages légales qui n'inventent rien (chaque information manquante affichée « (à venir) ») ; liste des prestataires complète, transferts hors UE signalés ; CGV prévoyant déjà la rétractation de 14 jours avec formulaire type ; avis de reconduction de l'abonnement annuel envoyé ; mention de TVA sur les factures.
- Conseils non relus masqués ; veille n'affichant que des fiches validées ; articles citant leur source.

## 7. Décisions attendues du dirigeant

1. Date d'ouverture : n'ouvrir qu'après la levée des huit bloquants et une recette verte sur la version en ligne ; consigner la décision d'ouverture dans `log.md` (entrée `decision`).
2. Fournir l'identité légale complète de l'éditeur et choisir un médiateur de la consommation.
3. Passer l'hébergement Vercel sur l'offre Pro, après lecture des conditions d'usage.
4. Mesure d'attente pour la vente : fermer la souscription payante (clé Stripe de test) tant que l'identité et la garde ne sont pas en place, ou assumer le risque par écrit.
5. Signature électronique : garder ouverts ou refermer les trois interrupteurs jusqu'à l'avis du juriste ; au minimum fermer le cautionnement ; consigner la décision.
6. Règles de la signature des devis : urgence, seuil de montant, indivision, quota par client, réservée ou non aux abonnés payants ; signature incluse ou non dans l'abonnement (pour corriger /tarifs).
7. Avant le 29/10 : sort du devis de recette qui cassera la tâche de nuit ; retrait ou non de la liste d'essai Zoho.
8. Mandater un juriste et un DPO (Q7, Q9 : CGU, CGV, confidentialité, modèles d'actes, cautionnement, conditions artisans, prospection, contrat Zoho) et l'expert-comptable (franchise de TVA, libellés HT/TTC, simulateurs fiscaux, facturation électronique).
9. Publication automatique : rendre la validation obligatoire (décision D6) et lire la console chaque jour.
10. Démarchage : cible, canal, message, promesses.
11. Restauration : date d'un exercice complet sur un projet de secours (D07, D43).
12. Sécurité des accès : nouvelle adresse de connexion du super-administrateur ; second superviseur ; protection de la branche principale ; origine des connexions du compte de recette le 18/10.
13. Accord écrit pour une souscription réelle suivie d'un remboursement.
14. Réseau d'artisans : ouvrir une première commune et un métier, ou n'annoncer que l'artisan invité.
15. Retours arrière des migrations de signature : les faire écrire, ou ratifier par écrit un arrêt sans retour.
16. Messagerie et surveillance : adresse de réponse professionnelle pour Zoho, DMARC, boîte de contact, sonde de disponibilité externe.

## 8. Ce que l'audit n'a pas pu vérifier

Quatre-vingt-dix points, dont les principaux : réglages Supabase Auth illisibles par l'API (mot de passe actuel exigé, double confirmation d'adresse, longueur minimale, limites par IP, CAPTCHA, durée de session, MFA) ; tableau de bord Stripe (identité affichée sur Checkout et factures, numérotation, relances, statut après échec, activation du compte réel) ; protection de la branche `main` et liste des collaborateurs GitHub (API refusée, 403) ; valeurs des variables sensibles (non déchiffrées volontairement) ; coût réel des circuits d'essai Zoho et conditions de l'offre API ; sauvegardes natives Supabase et PITR ; restauration de la copie du 19/10 (non rejouée, lecture seule) ; livraison effective d'un webhook Stripe réel (journaux Vercel au-delà d'une heure indisponibles) ; existence d'un accord écrit nommant le SHA pour les applications réelles du 18/10 ; comportement avec un copropriétaire sans mobile pour la signature SMS d'un devis ; points de droit (conservation des comptes non confirmés, usage SaaS de Zoho Sign, sous-traitance des données des signataires).

## 9. Plan proposé

1. **Avant mardi 20/10 à 9 h (dirigeant)** : activer la validation obligatoire des articles ; décider par écrit du sort de la signature Zoho (au minimum fermer le cautionnement) ; décider de la mise en attente de la vente ; mandater le juriste et l'expert-comptable.
2. **Avant le 28/10 au soir** : corriger les deux défauts de la signature des devis avec leurs tests ; décider du devis de recette, selon le protocole et après sauvegarde.
3. **Gestes du dirigeant, sans code** : identité de l'éditeur et médiateur ; Vercel Pro ; DMARC et boîte de contact ; nouvelle adresse du super-administrateur ; protection de la branche principale ; retrait de la liste d'essai Zoho ; adresse de réponse Zoho professionnelle.
4. **Codex / agent** : rendre modifiables les dernières informations légales ; garde de souscription (identité, version des CGV) ; sécuriser la recette (traces, sessions, bannissement) ; traiter la table `liste_attente` ; remettre journal et wiki à jour ; aligner /tarifs une fois la décision sur la signature prise.
5. **Juriste** : relire CGU, CGV, confidentialité, mentions légales (dont loi Hoguet), modèles d'actes, mention de caution, parcours de paiement (art. 8.10 et 15), conditions artisans, contrat Zoho ; intégration des corrections et incrément de la version des CGU ; vérification des pages en ligne par le dirigeant.
6. **Recette** : preuves Zoho consignées ; recette avec nettoyage et vérification Stripe en bac à sable sur la version en ligne ; correction de chaque échec ; ajout à la recette de la signature, des invitations, du retour de paiement et de la console.
7. **Essais réels consignés** : cautionnement fictif sur téléphone (si le juriste valide) ; devis hors essai jusqu'à « confier la mission » ; invitation d'un locataire et d'un artisan ; souscription réelle remboursée avec accord écrit.
8. **Filets de sécurité** : restauration rejouée sur une copie postérieure au 18/10 ; garde « sauvegarde récente » dans le chantier des migrations ; sonde externe ; export des journaux Vercel.
9. **Décision d'ouverture écrite** (`decision` dans `log.md`), mise à jour de [[Prêt à démarcher]], décision sur le démarchage. Ensuite seulement, ouverture.
10. **Avant de passer à l'échelle** : rapprochement Stripe, quota et alertes de signature, déblocage des envois ratés, suppression de compte, prospects et registre des traitements, fichiers de plus de 4,5 Mo, retours arrière ; puis les points mineurs.

## 10. Suites données le 19 octobre

Le dirigeant a demandé le jour même : « Corrige tout ce que tu peux corriger, ce qui t'est impossible doit être sur le prompt Codex ». Les correctifs réalisables sans décision métier ni accès extérieur sont traités par lots dans le dépôt (voir les entrées `deploy` du journal à partir du 19/10 et [[Recette de production]]) ; tout le reste est consigné dans un prompt unique remis au dirigeant pour Codex. Cette section sera complétée avec l'état de chaque lot après déploiement.

- **M2** (table `liste_attente`, § 4) — 20/10 : `liste_attente` conservée pour l'instant ; les agences ont leur propre table `liste_attente_agences` ([[Liste d'attente des agences]], lot préparé, non déployé à cette date).

> [!warning] Points à trancher / contradictions
> - Le journal du 18/10 dit « aucun achat » chez Zoho ; le dossier technique `app/docs/signature-electronique-bail.md` dit « 500 crédits après le paiement effectué par le titulaire ». Montant et conditions d'offre non consignés.
> - La PR #206 fait signer l'état des lieux dans le circuit Zoho alors que la règle RM-13.1.6 prévoit une signature tactile sur place : à trancher.
> - Les pages publiques et l'écran d'abonnement décrivent la signature Zoho, les SMS et l'aide aux devis (PR #210) alors que les envois aux clients étaient fermés : promesse à aligner sur la décision du dirigeant.
> - Les PR #202 à #211 sortent de l'autorisation écrite du 14/10 (vagues 1 à 4) ; leur publication repose sur une demande orale du 18/10 : à faire confirmer par écrit avec les SHA.
