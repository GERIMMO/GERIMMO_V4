---
type: synthesis
tags: [audit, v1, qualite-commerciale, securite, ergonomie, esthetique, promesse-commerciale, juridique, exploitation]
status: stable
created: 2026-11-16
updated: 2026-11-16
sources: []
---

# Audit de qualité commerciale V1 — a776ed43 — 16 novembre 2026

Audit indépendant demandé par le dirigeant : **Gerimmo est-il réellement prêt à être vendu ?**
Version auditée : **a776ed434d73ec269a0525ae8b216b6ed962a287** (fusion de la PR #341), servie sur
https://www.gerimmo.app. Les conclusions des audits précédents
([[Contre-vérification de la PR 341 — candidat V1 06d8e8fd — 16 novembre 2026]],
[[Audit avant vente — ergonomie, visuel et fonctions — 16 novembre 2026]]) n'ont pas été reprises
sans être revérifiées.

**Règle tenue : audit uniquement.** Aucun code modifié, aucune PR, aucune fusion, aucune migration,
aucun réglage ni secret touché. La production n'a été lue qu'en `SELECT` et en pages publiques
`GET`. Toutes les écritures ont eu lieu sur une base locale fictive. Aucun envoi réel, aucun paiement.

## En une page

| Question | Verdict |
|---|---|
| **Pilote gratuit** | **GO sous trois conditions**, à lever avant d'inviter de nouveaux propriétaires (environ une journée de travail, voir § G) : (1) rétablir les alertes du dirigeant, coupées depuis le 12/11 ; (2) retirer de la vitrine les promesses que le produit ne tient pas ; (3) décider de la fin des 5 essais en cours (24–29/12). |
| **Abonnements payants** | **NO GO.** Pas de médiateur de la consommation, courriers contractuels bloqués (impayé, rétractation, fin d'essai), un impayé ne passerait jamais en lecture seule, gestes Stripe hors console, paiement fermé. |
| **Exploitation quotidienne des quatre espaces** | **GO accompagné** pour propriétaire, locataire et artisan ; **NO GO en autonomie** pour la console : le dirigeant n'est plus alerté et plusieurs gestes d'exploitation se font hors console (Stripe, SQL). |

**Réponse courte à la question du dirigeant :** pas encore. On peut aujourd'hui confier Gerimmo
gratuitement à quelques propriétaires accompagnés : le cœur du métier fonctionne, les montants sont
justes, les espaces sont étanches. On ne peut pas encore leur **vendre** une gestion « simple, fiable
et professionnelle » : la simplicité n'est pas acquise au premier usage, une partie de ce que le site
promet est coupée, et le dirigeant n'est plus prévenu quand quelque chose casse.

## Méthode et niveaux de preuve

Chaque affirmation porte l'un de quatre niveaux. **Aucune affirmation de ce rapport n'atteint le
quatrième niveau.**

| Niveau | Sens | Exemples dans ce rapport |
|---|---|---|
| **Code** | Lu dans le code de a776ed43 | Règles d'envoi du pilote, grille tarifaire, règle d'impayé |
| **Test simulé** | Exécuté sur le banc fictif (base locale, données fictives, téléphone simulé) | 136 + 42 parcours navigateur, isolation, révocation |
| **Confirmé en production** | Observé sur gerimmo.app ou dans la base de production (lecture seule) | Version servie, tâches planifiées, alertes en échec, essais de 61–62 jours |
| **Testé par un utilisateur seul** | Un propriétaire réel, sans aide, observé | **Aucun.** Aucune observation n'a eu lieu ; la production ne compte encore aucun bail actif. |

Chaque défaut est marqué **PROUVÉ** (reproduit ou lu), **PROBABLE** (forte présomption, non
reproduit) ou **NON VÉRIFIÉ**.

**Ce qui a été fait :**
- Version, livraison, migrations, CI et tâches planifiées : production en lecture seule.
- Banc fictif à a776ed43 :
  - recette des quatre portails : 139 tests, à 1440 et 390 px ;
  - 47 parcours complémentaires : états des lieux, meublé, impayés, relocation, charges, signatures, recommandés, invitations ;
  - invitation d'un locataire de bout en bout ;
  - tests ciblés de sécurité.
- Captures : les 183 écrans de la matrice générée, dont 123 écrans propriétaire, locataire, artisan, console et public à 390, 768 et 1440 px (369 captures). Les 23 pages publiques de production ont aussi été capturées aux trois largeurs (69 captures).
- Quatre relectures UX et visuelles indépendantes : premier usage, propriétaire au quotidien, locataire et artisan, console et vitrine.
- Un audit indépendant de la promesse commerciale (site, CGU, base de production), dont j'ai revérifié moi-même les points majeurs.

**Limites :**
- Le téléphone et la tablette sont **simulés** (fenêtre Chromium), aucun vrai appareil.
- Le banc utilise un émulateur de l'API de données qui diffère de la production sur un point (les grands entiers y sont renvoyés en texte ; voir V1-21).
- Paiements Stripe, délivrabilité réelle des e-mails, signature Zoho et SMS : **non testés** en conditions réelles (fermés ou hors banc).

## 1. Vérification de la version

| Point | Constat | Niveau |
|---|---|---|
| Version servie | `/api/sante` renvoie **a776ed43** = tête de `main` (fusion #341) | Production |
| Migrations | Registre de production jusqu'à **20261116141945** ; les 7 migrations du 16/11 sont présentes | Production |
| Écart avec le candidat audité (06d8e8fd) | 25 fichiers : correctifs B6-a (finances par titulaire) et A1-a (colocataire parti), retrait de l'écriture directe des adhésions, courriel et quittance de démonstration | Code |
| Chaîne de livraison du 16/11 | CI 15:59 → sauvegarde 16:20 → contrôle de restauration 16:25 → migrations 16:31 et 17:14 → publication 17:18 → recette de production 17:20 → disponibilité 17:28 : **tout au vert** | Production |
| Disponibilité | 100 derniers contrôles (toutes les 30 min) réussis | Production |
| Tâches planifiées (pg_cron) | 12 tâches actives, **0 échec sur 7 jours** ; cycle mensuel des loyers passé le 01/11 | Production |
| 502 / 503 | Aucun dans les journaux disponibles (rétention de 7 jours). Les 503 prévues par conception (session indisponible, maintenance avec `Retry-After`, base indisponible sur `/api/sante`) sont lisibles. Les incidents plus anciens ne sont **pas vérifiables** (rétention). | Production / Code |
| Erreurs serveur sur 7 jours | Alerte quotidienne de supervision en échec 5 fois (voir V1-01) ; un dépassement de 60 s sur `/api/cron/factures` le 15/11 | Production |
| Usage réel | 5 organisations (toutes propriétaires, en essai), **0 bail actif**, 0 abonnement | Production |

**Ce qui ne peut pas être éprouvé en conditions réelles aujourd'hui :**
- souscription et prélèvement (paiement fermé) ;
- e-mails de relance et avis d'échéance (coupés par le pilote) ;
- signature électronique au-delà du circuit terminé le 24/10 ;
- appel de loyer sur un bail réel (aucun bail actif).

## 2. Sécurité, fiabilité et données

Tous les tests ci-dessous ont été joués sur le banc fictif ; aucune action destructive en production.

| Contrôle | Résultat | Statut |
|---|---|---|
| Isolation entre organisations | L'administrateur d'une autre agence ne voit rien sur 9 tables. Fichiers : 404 en stockage, 403 sur la page du document ; le propriétaire légitime obtient 200. | PROUVÉ |
| Locataire / artisan | Chacun ne voit que sa propre fiche et sa propre adhésion | PROUVÉ |
| Modification directe des rôles | Refusée (403) pour un administrateur comme pour un agent | PROUVÉ |
| Collaborateur retiré, session ouverte | Plus aucune donnée, immédiatement ; refus sur soi, sur un agent et sur une autre organisation | PROUVÉ |
| Colocataire parti (date de départ passée, adhésion encore active) | Aucun créneau, pas de déclaration d'incident, pas de choix de créneau, bail invisible (17 fonctions protégées) | PROUVÉ |
| Bien en nom propre ou en SCI | Finances séparées par titulaire ; une dépense SCI antérieure à la détention est mise « à rattacher » (180 €), visible à 1440 et 390 | PROUVÉ |
| Doublons | Pas de second incident après une réponse perdue, ni de second brouillon de bail ; numéros de facture distincts | PROUVÉ (simulé) |
| Factures et paiements inventés | Facture validée sans date de règlement ; règlement seulement déclaratif ; aucun loyer « reçu » sans saisie | PROUVÉ |
| Concurrence | Conflit de devis détecté, aucune perte ; brouillons protégés entre onglets | PROUVÉ (simulé) |
| Sessions | 2FA (AAL2) exigée pour la console à trois niveaux ; 30 min d'inactivité, 8 h au maximum | PROUVÉ (code) |
| Sauvegarde et restauration | Sauvegarde puis contrôle de restauration verts le 16/11 avant migration ; la migration exige une sauvegarde de moins de 90 min | Production |
| 502 / 503 | Voir § 1 : aucun dans la rétention disponible ; antérieurs non vérifiables | Production / NON VÉRIFIÉ |
| Alertes d'exploitation | **En échec depuis le 12/11** (V1-01) | PROUVÉ (production) |

## 3. Interactions entre les espaces

L'incident à 16 étapes (fuite d'eau) a été rejoué pour un propriétaire en nom propre et pour une SCI,
puis vérifié en base :
- déclaration par le locataire, puis décision du propriétaire ;
- demande de devis, devis de l'artisan, acceptation ;
- créneaux : **un seul créneau retenu**, les 5 autres caducs, et le rendez-vous n'est fixé qu'après le choix du locataire ;
- compte rendu, facture de 100 € **validée mais non réglée** ;
- clôture de l'incident ;
- numéros de facture distincts entre les deux propriétaires.

L'invitation du locataire, celle de l'artisan et la réponse du support apparaissent bien du côté du
destinataire. Seules lacunes : la réponse du support n'est pas notifiée par e-mail, et la discussion
d'intervention côté locataire ne nomme pas la réparation (V1-27).

## A. Verdicts

### Pilote gratuit : GO sous trois conditions

Le cœur métier est solide :
- tous les parcours du propriétaire aboutissent sur le banc (création du bien jusqu'à la quittance, nom propre et SCI, colocation, meublé, encaissement partiel, impayé, état des lieux, relocation, consommations, export fiscal) ;
- les montants sont exacts et cohérents d'un écran à l'autre ;
- aucun paiement n'est supposé sans déclaration ;
- l'isolation entre organisations et la révocation des droits sont prouvées.

Trois conditions avant d'inviter de nouveaux pilotes :
1. **Rétablir les alertes du dirigeant** (V1-01). Aujourd'hui le dirigeant croit être surveillé et ne l'est plus.
2. **Aligner la vitrine** (V1-02) : retirer « relances et échéances qui vous trouvent », « révision IRL proposée », « Gerimmo le fait chaque mois pour vous ».
3. **Décider de la fin des essais** (V1-05) : prolonger les 5 essais qui se terminent du 24 au 29/12, et prévenir les pilotes par écrit du périmètre (relances en PDF, pas de paiement).

### Abonnements payants : NO GO

Points bloquants (P0 avant paiements) :
- **médiateur** absent (V1-03) ;
- **courriers contractuels** bloqués : mise en demeure, accusé de rétractation, fin d'essai (V1-04) ;
- par ricochet, **un abonné en impayé garderait l'écriture indéfiniment** (V1-04) ;
- **gestes Stripe** hors console (V1-09).

S'y ajoutent les obligations déjà connues : Stripe réel, TVA de l'éditeur, délivrabilité.

### Exploitation quotidienne des quatre espaces

| Espace | Verdict | Raison |
|---|---|---|
| Propriétaire | **GO accompagné** | Fonctionne ; premier usage trop complexe pour être fait seul (V1-10, V1-11) |
| Locataire | **GO** | Gestes essentiels présents ; droits coupés au départ ; montant « à régler » à unifier (V1-25) |
| Artisan | **GO** | Devis, créneaux, compte rendu, facture ; reprise et conflits gérés ; module « clients externes » à finir (V1-26) |
| Super-admin | **NO GO en autonomie** | Alertes coupées (V1-01), gestes Stripe et rôles hors console (V1-09, V1-24) |

## B. Notes par espace (sur 10)

Les notes sont sévères à dessein, sans complaisance. Elles sont plus basses que celles de la
contre-vérification de la PR 341 : cet audit regarde chaque écran à trois largeurs avec des relecteurs
indépendants, et non plus seulement les parcours modifiés.

| Espace | Fonctionnement | Simplicité | Esthétique | Fiabilité |
|---|---|---|---|---|
| **Propriétaire** | **7** | **4** | **6** | **6** |
| **Locataire** | **8** | **6** | **7** | **7** |
| **Artisan** | **7** | **6** | **6** | **6** |
| **Super-admin** | **5** | **4** | **6** | **4** |

### Propriétaire

**Fonctionnement 7.**
- Tout le cycle tourne sur le banc :
  - bien, lot, bail, locataire, encaissement (complet, partiel, rien reçu), quittance conforme (article 21) ;
  - nom propre et SCI séparés, finances filtrées par titulaire ;
  - colocation, inventaire meublé (les 11 éléments du décret), état des lieux hors ligne ;
  - impayé de deux mois, relocation, consommations et décompte, export fiscal 2044, incidents et devis, invitation du locataire.
- Ce qui retient la note :
  - relances et avis d'échéance par e-mail coupés ;
  - révision IRL manuelle ;
  - aide fiscale limitée à la 2044 en location nue au réel ;
  - restitution du dépôt de garantie couverte par des tests unitaires seulement, pas par un parcours navigateur.

**Simplicité 4.**
- Le premier usage enchaîne trois assistants (lot en 6 étapes, personne en 5, bail en 7), plus le profil.
- L'inscription est redemandée à la création du mot de passe.
- Deux gestes indispensables sont cachés : « Mettre en location » dans un repli, et « Générer l'échéancier ».
- Un même objet porte cinq noms : bien, lot, logement, bâtiment, parc.
- Le vocabulaire comptable n'est pas expliqué.
- Un propriétaire seul y arriverait difficilement : non observé, c'est une estimation.

**Esthétique 6.**
- Identité premium réelle : bleu nuit et or, titres serif, photo d'accueil, quittance soignée.
- Menu bien adapté aux trois largeurs, aucun débordement mesuré hors artefact.
- Abîmée par :
  - un bandeau ambre permanent « … suspendus » ;
  - des titres de cartes en deux polices ;
  - un bouton principal tantôt or, tantôt marine ;
  - des vides à 1440 et des triangles de dépliage bruts.

**Fiabilité 6.**
- Les règles d'argent sont justes : aucune facture considérée comme payée, encaissement déclaratif, opérations hors période « à rattacher ». La reprise après panne (brouillons, doublons, conflits) est éprouvée.
- Mais :
  - un bail activé affiche « 0 terme appelé — à jour » tant que l'échéancier n'est pas généré (V1-10) ;
  - rien n'a encore tourné sur un bail réel.

### Locataire

**Fonctionnement 8.**
- Gestes présents :
  - accueil avec prochaines actions ;
  - paiements et quittances, attestation de bon paiement (refusée tant qu'un loyer reste dû) ;
  - dépôt de l'assurance ;
  - documents et bail ;
  - déclaration d'incident (photo en premier), choix d'un créneau, historique ;
  - relevés de consommation, contact, FAQ, données personnelles.
- Aucun paiement en ligne n'est suggéré.
- L'invitation fonctionne de bout en bout.

**Simplicité 6.**
- « Ce qui vous attend » est clair, une action en un clic.
- Mais :
  - le bloc « En cas d'urgence » est répété sur 4 écrans ;
  - « Mes demandes » fait 2 700 px au téléphone ;
  - l'assistant IA est placé avant le contact humain ;
  - une étape de trop à l'invitation : il faut se reconnecter après avoir choisi son mot de passe (V1-15).

**Esthétique 7.**
- Propre aux trois largeurs, aucun débordement.
- Cinq écrans sortent de l'habillage de l'espace (attestation, reçu, règles, sécurité, données personnelles).
- Petits textes nombreux au téléphone (8 à 12 par page sous 12 px).

**Fiabilité 7.**
- Un ancien colocataire, même avec une session encore ouverte, ne voit plus rien et ne peut plus agir. Prouvé sur 17 fonctions.
- Les documents d'un autre logement sont refusés (403).
- Mais le même titre « Loyer restant à régler » affiche deux montants différents selon l'écran (V1-25).
- Le reçu est refusé si l'identité du bailleur est incomplète, et le locataire voit cette lacune.

### Artisan

**Fonctionnement 7.**
- Demandes de devis, réponse, proposition de créneaux, fiche mission, compte rendu et bilan, dépôt de facture.
- Attestations, clients et chantiers externes, registre privé, note, aide en cas de panne.
- Invitation par un propriétaire puis validation par Gerimmo.
- Le devis se reprend après une panne et gère un conflit d'enregistrement sans erreur tardive. Prouvé à 390 et 1440.

**Simplicité 6.**
- L'accueil permet d'agir en un toucher.
- Mais :
  - un devis d'une ligne demande 4 étapes ;
  - « Ma facturation » fait 5 150 px au téléphone et liste deux fois les mêmes factures ;
  - la barre basse n'a ni Facturation ni Clients externes ;
  - les textes sont petits (4 à 12 éléments sous 12 px par page).

**Esthétique 6.**
- Écrans principaux de bon niveau : accueil, attestations, évaluations, fiche mission.
- Mais le module « clients externes », d'aspect brut (formulaires natifs, boutons de 1 100 px), est le premier bloc de l'agenda et de la facturation (V1-26).

**Fiabilité 6.**
- Fin de mission, facture et devis éprouvés, avec reprise et conflit.
- Mais :
  - le récapitulatif du devis affiche « Total TTC 0,00 € » tant que la TVA n'est pas choisie ;
  - deux éditeurs de devis se comportent différemment ;
  - une même référence de dossier (INC-2026-0001) désigne deux clients ;
  - des missions « Terminée » sont datées dans le futur. Ce dernier point vient probablement des données du banc.

### Super-admin

**Fonctionnement 5.**
- C'est une vraie console :
  - abonnements, annuaire, assistance, santé, sécurité, durées de conservation, demandes RGPD ;
  - journal d'audit ;
  - double authentification exigée à trois niveaux ;
  - sessions de 30 min d'inactivité et 8 h au maximum.
- Mais plusieurs gestes se font hors console :
  - annulation, remboursement, avoir et résiliation pour impayé dans Stripe ;
  - rôles et second super-admin en SQL.
- Les envois suspendus n'ont pas de remède dans la console.
- Les invitations de collaborateurs sont bloquées par le pilote.

**Simplicité 4.**
- 17 entrées de menu à plat.
- Écran Santé en liste technique brute (identifiants, codes internes).
- Jargon d'automatisation : équipes, passage de nuit, relais, consignes versionnées.

**Esthétique 6.**
- Système graphique soigné.
- Mais des pages sortent du gabarit (/relais, /securite), des compteurs sont orphelins, l'en-tête passe sur deux lignes en tablette.

**Fiabilité 4.**
- L'alerte quotidienne et les urgences destinées au dirigeant ne partent plus depuis le 12/11 sans que rien ne le signale clairement (V1-01).
- Les consultations de données personnelles par le super-admin (annuaire, fiche personne) ne sont pas tracées.

### Premier usage et vitrine (pour mémoire)

| | Visuel | Simplicité | Cohérence |
|---|---|---|---|
| Premier usage propriétaire (inscription → quittance) | 6 | 4 | 5 |
| Vitrine publique (production) | 7 | 7 | 6 |
| Console super-admin | 6 | 4 | 5 |

## C. Points forts

1. **Les montants sont justes partout.**
   - 600 € + 40 € = 640 € du bail à la quittance.
   - Dépôt de garantie plafonné avec un message chiffré.
   - Prorata, partiel et solde exacts.
   - Prix de l'abonnement identiques dans le code, la base, les CGU et le site.
   - Calculs des outils gratuits justes (IRL, quittance, rentabilité, LMNP, GLI), recalculés à la main.
2. **Aucun paiement n'est inventé.**
   - Une facture validée n'est pas réglée : `reglee_le` reste vide.
   - Le règlement de l'artisan est **déclaré** par le propriétaire.
   - Une opération hors période de détention est mise « à rattacher », sans être fondue dans les comptes.
3. **Les espaces sont étanches.**
   - Une autre agence ne voit rien : 9 tables, stockage 404, fichiers 403.
   - Un locataire ne voit que lui.
   - Un collaborateur retiré perd tout immédiatement, même avec sa session ouverte.
   - Un ancien colocataire perd ses droits sur 17 fonctions.
   - Personne ne peut modifier directement une adhésion (403).
4. **Livraison industrialisée.** Sauvegarde, contrôle de restauration, migration en une transaction avec simulation, publication contrôlée, recette de production et disponibilité, enchaînés et verts le 16/11 ; 12 tâches planifiées sans échec.
5. **Honnêteté contractuelle.**
   - Essai de 2 mois sans carte, appliqué en production (61–62 jours).
   - Aucune conversion automatique : lecture seule à l'échéance, sans suppression.
   - Rétractation, reconduction et TVA décrites ; versions des CGU archivées.
   - L'aide fiscale dit dans l'application ce qu'elle ne fait pas.
6. **Robustesse face aux pannes.**
   - Brouillons protégés entre onglets.
   - État des lieux hors ligne qui se resynchronise.
   - Incident sans doublon après une réponse perdue.
   - Devis repris après conflit.
   - Bail commencé jamais dupliqué.
7. **Identité visuelle premium** sur la vitrine (7/10) et les écrans clés (quittance, accueil, assistants).

## D. Tableau des anomalies

Le tableau suit l'ordre P0, P1, P2.
- **P0** : critique, à corriger avant la date indiquée.
- **P1** : bloquant commercial, y compris un défaut visuel qui détruit la confiance.
- **P2** : peut suivre le lancement.

L'échéance est précisée dans la colonne Priorité.

| ID | Priorité | Espace | Défaut | Preuve | Impact client | Correction minimale |
|---|---|---|---|---|---|---|
| V1-01 | **P0 — tout de suite** | Super-admin | Les alertes du dirigeant sont bloquées par le « périmètre pilote » : l'alerte quotidienne de supervision échoue chaque jour depuis le 12/11 (5 jours consécutifs, 1 destinataire, 0 envoyé), l'alerte de veto marketing aussi ; 6 courriels « intervention requise » en attente. Les urgences relais immédiates passent par le même filtre sans contexte. | **PROUVÉ** — production : `relais_alertes_envois` (statut `echec` du 12 au 16/11), `courriels_evenements` (6 `pilote_intervention_requise`) ; code : `perimetre-pilote.ts:8-19` n'admet que des envois typés, `relais-alerte-envoi.ts:281` et `relais-urgences-envoi.ts:138` envoient sans type | Le dirigeant ne sait plus qu'une sauvegarde échoue, qu'une urgence locataire attend ou qu'un arrêt est resté actif : il croit être surveillé. | Admettre dans le périmètre les envois internes adressés au seul dirigeant (relais, urgences, veto), avec un type explicite ; test de non-régression. |
| V1-02 | **P0 — avant tout nouveau pilote** | Vitrine | Promesses non tenues sur le site public : « Relances et échéances qui vous trouvent », « relances d'impayés », « Révision IRL proposée à la date anniversaire », « Ce calcul, Gerimmo le fait chaque mois pour vous » (sous LMNP, GLI, rentabilité, que l'application ne calcule pas). L'article 15.3 et l'annexe 1 des CGU décrivent des envois coupés. | **PROUVÉ** — production : page `/outils/simulateur-lmnp` lue ; code : `coquille-outil.tsx:167-186`, `perimetre-pilote.ts:6` (pilote toujours actif), révision IRL manuelle (`formulaire-loyers.tsx:597`) | Risque de pratique commerciale trompeuse (à faire évaluer) ; déception dès la première semaine. | Réécrire : « relances préparées en PDF », « échéances signalées dans votre tableau de bord », « révision IRL calculée depuis la fiche du bail » ; un texte d'appel propre à chaque outil ; aligner les CGU. |
| V1-03 | **P0 — avant paiements** | Vitrine / légal | Aucun médiateur de la consommation désigné (« Adhésion à venir : aucun organisme n'est désigné ») ; le code bloque la souscription avec un motif erroné (« mentions légales en cours de publication »). | **PROUVÉ** — production : `/mentions-legales`, champs du médiateur vides en base ; code : `garde-souscription.ts:35-36, 70-71` | Obligation légale pour la vente aux consommateurs (Code de la consommation, L.612-1 ; à confirmer par un juriste, y compris pour l'essai gratuit). | Adhérer à un médiateur, publier ses coordonnées, corriger le motif affiché. |
| V1-04 | **P0 — avant paiements** | Propriétaire / Super-admin | Courriers contractuels d'abonnement bloqués par le pilote : mise en demeure d'impayé, accusé de réception de rétractation, avis de fin d'essai et avertissements avant suppression. Conséquence : la base ne passe un abonné en impayé en lecture seule **qu'après une relance partie** — il garderait l'écriture indéfiniment. | **PROUVÉ** (code) — `relances-paiement.ts:115` et `courriers-contrat-envoi.ts:483, 507` envoient sans type admis ; règle « `relances_paiement >= 1` » (migration `20261024110000`, l. 28-29) | Impayés non recouvrés ; accusé de rétractation sur support durable (L.221-21, à confirmer) non envoyé. | Ajouter ces envois typés au périmètre ; parcours de bout en bout en bac à sable Stripe avant ouverture. |
| V1-05 | **P1 — décision avant le 20/12** | Propriétaire / Super-admin | Paiement fermé en production alors que le site vend l'abonnement ; les 5 essais finissent du 24 au 29/12 sans moyen de payer ; le parrainage promet un mois « dès votre premier paiement ». | **PROUVÉ** — production : `souscriptions_payantes_ouvertes = false`, 5 essais de 61–62 jours | Les pilotes passent en lecture seule à Noël. | Prolonger les essais depuis la console et prévenir par écrit ; ou ouvrir la vente après les P0. |
| V1-06 | **P1** | Propriétaire | Bandeau ambre permanent sur toutes les pages : « Les relances de loyer par e-mail, les avis d'échéance et les courriers d'abonnement sont suspendus », sans raison, non masquable, 3 lignes au téléphone. | **PROUVÉ** — `layout.tsx:312` ; captures `proprietaire/006-390.jpg`, premier usage dès la 1re connexion | Un client lit « service en panne » avant toute action. | Formuler positivement (« Vos relances se préparent en PDF »), une fois, masquable, le détail dans Paramètres. |
| V1-07 | **P1** | Vitrine | Périmètre fiscal surestimé sur le site (« aide à la déclaration », « récapitulatif fiscal prêt à recopier ») : seule la 2044 en location nue au réel est préparée ; SCI à l'IR ou à l'IS, meublé et micro sont seulement orientés. L'application, elle, le dit. | **PROUVÉ** — `profil-fiscal.ts:21-34` ; pages `/outils`, `/inscription` | Client SCI ou meublé déçu. | « Aide 2044 (location nue, régime réel). SCI, meublé et micro : orientation. » |
| V1-08 | **P1** | Vitrine | Deux vignettes cassées sur `/journal` : l'image `/marketing/facebook-premier-post.jpg` est refusée par l'optimiseur d'images (HTTP 400), alors que le fichier existe (200). | **PROUVÉ** — production : requêtes relancées le 16/11 ; capture `production/015-1440.jpg` | Négligence visible sur le site public. | Adresse relative ou domaine autorisé ; image de secours dans le gabarit. |
| V1-09 | **P1 — avant paiements** | Super-admin | Gestes Stripe hors console : pas d'annulation, de remboursement ni d'avoir ; suspendre ou archiver un client n'arrête pas Stripe ; la résiliation pour impayé se fait à la main dans Stripe (le texte prévient qu'une mauvaise option envoie au client un accusé non demandé). | **PROUVÉ** — code (revue de la console) ; capture `superadmin/000-1440.jpg` | Client prélevé après suspension, courrier erroné. | Boutons de console avec confirmation, ou procédure écrite et testée en bac à sable. |
| V1-10 | **P1** | Propriétaire | Un bail activé n'appelle pas ses loyers tant que le propriétaire n'a pas cliqué « Générer l'échéancier » ; d'ici là l'écran affiche « 0 terme appelé — Reste dû 0,00 € — à jour » en vert. La tâche du 1er du mois rattrape les mois manquants, donc jusqu'à un mois de retard. | **PROUVÉ** — premier usage `1440/093-goto-goto.jpeg` ; script `premiere-location-continue.spec.ts:134` ; code : `generer_appels_loyer_interne` | Le propriétaire croit tout à jour et oublie son premier loyer et sa première quittance. | Générer l'échéancier à l'activation ; ne jamais afficher « à jour » sans échéancier. |
| V1-11 | **P1** | Propriétaire | Premier usage trop long pour un propriétaire seul : trois assistants (6 + 5 + 7 étapes), inscription redemandée à la création du mot de passe, lot saisi en deux passes, « Mettre en location » caché dans un repli en bas de fiche, champs obligatoires dans un panneau replié. | **PROUVÉ** (captures `premier-usage/1440/012`, `031`, `034`, `057`, `066`) ; difficulté réelle **NON VÉRIFIÉE** (aucun utilisateur observé) | Abandon au moment le plus fragile. | Résumé d'inscription modifiable ; changement de statut automatique ; panneaux ouverts tant qu'il reste des champs. |
| V1-12 | **P1** | Propriétaire | Coordonnées du bailleur différentes selon l'écran : le profil dit « pour les baux et quittances » ; la fiche personne et l'étape « Personnes » du bail montrent l'e-mail de connexion et « téléphone non renseigné » ; la quittance reprend le profil. | **PROUVÉ** à l'écran (premier usage `1440/019`, `042`, `061`, `098`) ; PDF du bail **NON VÉRIFIÉ** | Le bailleur ne sait pas quelle adresse figurera sur le bail. | Une seule source d'identité du bailleur, la même partout. |
| V1-25 | **P1** | Locataire | Le même titre « Loyer restant à régler » affiche 1 100 € sur l'accueil (tous les retards) et 400 € dans « Mes paiements » (seulement la plus ancienne échéance) ; la tâche « Loyer d'octobre » ne mentionne pas novembre, qui est aussi impayé. | **PROUVÉ** — captures `locataire/002-390.jpg`, `010-390.jpg` ; code : `locataire/[orgId]/page.tsx:467-474` (total des retards) contre `loyers/page.tsx:176` (échéance suivante) | Le locataire ne sait pas combien virer : virement partiel, litige. | Afficher partout « Total à régler » et le détail par mois. |
| V1-26 | **P1** | Artisan | Le module « clients externes », d'aspect inachevé (liens encadrés, formulaires natifs, boutons pleine largeur, recherche sans libellé), est le premier bloc de « Mon agenda » et de « Ma facturation ». | **PROUVÉ** — `artisan/001-1440.jpg`, `017-1440.jpg` | Impression de prototype sur deux écrans quotidiens. | Reprendre les composants de l'espace ; placer ce bloc sous la semaine et les compteurs. |
| V1-13 | P2 | Propriétaire | Vocabulaire et finition : un objet à cinq noms (bien, lot, logement, bâtiment, parc) ; « À vérifier » à quatre sens ; jargon (écriture, clôture, terme appelé, IRL, quittancement) ; alertes « DPE absent » sans nom de lot ; accordéons imbriqués ; titres en deux polices ; bouton principal or ou marine ; « Contrat n° BAIL-6F002A01 » sur la quittance ; « Morel Élise , bailleur ». | **PROUVÉ** — `proprietaire/014`, `025`, `027` ; premier usage `098` | Effort de compréhension, aspect inégal. | Lexique unique, libellés avec lot et locataire, un composant de titre et un de bouton, référence lisible. |
| V1-14 | P2 | Propriétaire | Finances : 0 € de dépenses alors que 4 factures d'artisan sont validées et non réglées (c'est voulu : le règlement est déclaratif depuis l'incident), sans aucun signal « factures à régler ». Opération SCI hors période : « à rattacher » visible mais sans geste direct. | **PROUVÉ** — `proprietaire/010-1440.jpg`, `019-1440.jpg` ; captures `securite/finances-*.png` | Doute sur les chiffres. | Ligne « N factures validées non réglées » avec lien ; bouton « Rattacher ». |
| V1-15 | P2 | Locataire | Après avoir choisi son mot de passe depuis l'invitation, le locataire revient sur la connexion et doit se reconnecter avant d'accepter. | **PROUVÉ** — test du 16/11, captures `invitation/04` à `06` | Une étape de trop au premier contact. | Ouvrir la session après le changement de mot de passe. |
| V1-16 | P2 | Locataire / Artisan | Accessibilité : lien téléphone de l'artisan dans la carte d'incident à 2,05:1 (3:1 requis) ; 4 à 11 textes sous 12 px par écran au téléphone ; quelques cibles tactiles sous 32 px ; « dûs » au lieu de « dus ». | **PROUVÉ** — recette (`contre-audit-proprietaire.spec.ts:135`), mesures automatiques | Lecture pénible, accessibilité. | Couleur du lien, taille minimale 12–13 px, cibles de 44 px. |
| V1-17 | P2 | Super-admin | Console difficile pour un non-développeur : 17 entrées à plat, écran Santé en liste technique brute (identifiants, codes, chemins de code), fiche client sans bloc abonnement, termes multiples (client, organisation, espace), pages hors gabarit, en-tête sur deux lignes en tablette. | **PROUVÉ** — `superadmin/017-1440.jpg`, `010-1440.jpg`, `002-768.jpg` | Le dirigeant hésite, rate l'essentiel. | Cinq groupes de menu ; résumé par type sur Santé ; bloc abonnement sur la fiche. |
| V1-18 | P2 | Super-admin | Consultations de données personnelles par le super-admin (annuaire, fiche personne, compte, support, artisan) non tracées ; seule l'entrée dans l'espace d'un client l'est. | **PROUVÉ** (code, revue de la console) | Responsabilité RGPD plus difficile à démontrer. | Journaliser ces lectures. |
| V1-19 | P2 | Super-admin | Invitations d'agent, de responsable et de supervision bloquées par le pilote (celle du locataire passe) ; rôles et second super-admin seulement en SQL ; envois suspendus sans remède dans la console ; réponses du support non notifiées au client. | **PROUVÉ** (code) — `lien-mot-de-passe.ts` | Une SCI à plusieurs gérants ne peut pas inviter son associé ; exploitation dépendante du développeur. | Ouvrir l'invitation de coresponsable ; écran rôles ; bouton « renvoyer ». |
| V1-20 | P2 | Vitrine | Fin d'essai peu explicite près du prix (« rien n'est prélevé » à la 4e puce) ; curseur de prix au style natif ; cinq libellés pour le bouton principal ; inscription à 9 champs dont l'adresse, liste tronquée « Personne physiqu » ; page introuvable renvoyée avec un statut 200 ; lien de caution invalide sans issue ; « La V1 de Gerimmo » sur /agences. | **PROUVÉ** — `production/005`, `014`, `016`, `021`, `006` | Conversion freinée, référencement. | Une phrase claire sous le prix ; un libellé ; adresse demandée plus tard ; vrai 404. |
| V1-21 | P2 | Banc d'essai | L'émulateur du banc renvoie les grands entiers en texte ; l'écran Statistiques y additionne donc des chaînes (« Coût constaté 100 000 100 000 099 990 000,00 € »). En production, l'API renvoie des nombres : **non reproductible attendu**, mais le banc ne peut pas détecter ce type d'erreur. | **PROBABLE** — `proprietaire/016-390.jpg` ; `serveur-supabase-local.mjs:475` (lignes brutes, pas de conversion du type int8) | Aucun en production attendu ; angle mort des tests. | Conversion explicite dans le code ; aligner l'émulateur. |
| V1-22 | P2 | Démonstration | Démonstration commerciale uniquement locale (poste préparé du dirigeant), réinitialisable et isolée (prouvé sur 06d8e8fd), non rejouée sur a776ed43 (écart relu : courriel et quittance de présentation). Pas de démonstration en ligne isolée. | **PROUVÉ** (scripts `instantane-demonstration.mjs`) | La démo dépend d'un poste et d'une préparation technique. | Garder la procédure ; envisager une démo en ligne isolée plus tard. |
| V1-23 | P2 | Légal | Confidentialité : 16 catégories affichées avec « nettoyage automatique désactivé » ; contact sur une messagerie grand public non listée parmi les destinataires ; téléphone de l'hébergeur non publié ; transferts hors UE à préciser ; taux de prélèvements sociaux du simulateur LMNP (17,2 %) et plafonds Visale 2026 à vérifier. | **PROUVÉ** / **NON VÉRIFIÉ** (taux) | Conformité à faire confirmer. | Revue par un juriste et un fiscaliste. |
| V1-24 | P2 | Exploitation | Un dépassement de 60 s sur `/api/cron/factures` (15/11). | **PROUVÉ** (journaux Vercel) | Aucun constaté ; à surveiller. | Surveiller la durée ; découper si récurrent. |
| V1-27 | P2 | Locataire | Plusieurs défauts de vocabulaire et de finition :<br>• « Mon gestionnaire » partout, même chez un propriétaire particulier (libellé fixe du menu) ;<br>• reçu refusé tant que l'identité du bailleur est incomplète, avec un message qui expose cette lacune au locataire ;<br>• aucune coordonnée de virement si le bailleur n'a pas saisi d'IBAN ;<br>• 5 écrans hors de l'habillage de l'espace ;<br>• assistant IA placé avant le contact humain, sans mention « IA » ;<br>• discussion d'intervention qui ne nomme pas la réparation ;<br>• page « Règles » vide ;<br>• préavis « 1 ou 3 mois (zone en cours de vérification) » pour Paris ;<br>• « sera soldés ». | **PROUVÉ** — `nav-locataire.tsx:68` ; captures `locataire/003`, `005`, `009`, `011`, `012` | Le locataire d'un particulier cherche « son propriétaire » ; doutes ponctuels. | « Mon propriétaire » selon le type de bailleur ; identité et IBAN exigés avant activation du bail ; habillage unique. |
| V1-28 | P2 | Artisan | Plusieurs défauts d'usage et de cohérence :<br>• devis : « Total TTC 0,00 € » avec une ligne à 65 € HT tant que la TVA n'est pas choisie, et 4 étapes pour une ligne ;<br>• deux éditeurs de devis différents (TVA par défaut, séparateur décimal) ;<br>• même référence INC-2026-0001 pour deux clients ;<br>• facturation listée deux fois (5 150 px au téléphone) ;<br>• barre basse sans Facturation ;<br>• formulaire de créneaux accessible sur une mission terminée ;<br>• « Pièces conformes » affiché sans attestation déposée. | **PROUVÉ** — `artisan/004-1440.jpg`, `006-1440.jpg`, `001-1440.jpg`, `005-1440.jpg` ; `nav-artisan.tsx` | Doute sur le calcul, temps perdu sur chantier. | Calculer le HT dès la saisie ; un seul éditeur ; référence préfixée par le client ; onglet Factures ; garde de statut. |

**P0 : 4. P1 : 10. P2 : 14.**

## E. Parcours complets

| Parcours | Rôle | Résultat | Niveau de preuve |
|---|---|---|---|
| Inscription → bien → lot → bail → locataire → loyer reçu → quittance | Propriétaire en nom propre | Aboutit à 390, 768 et 1440 ; montants justes ; échéancier à générer à la main (V1-10) | Test simulé (production : recette autonome verte le 16/11) |
| Loyer confirmé et facture conservée, en SCI | Propriétaire SCI | Aboutit ; opération hors période « à rattacher » | Test simulé |
| Échéance, rien reçu, partiel puis solde | Propriétaire | Aboutit à 390 et 1440 | Test simulé |
| Impayé de deux mois, puis alerte fermée à la réception complète | Propriétaire | Aboutit ; relance par e-mail coupée, PDF seulement | Test simulé + code |
| Bail meublé : inventaire des 11 éléments, sans doublon | Propriétaire | Aboutit | Test simulé |
| Colocation : incident de chambre, cuisine proposée | Propriétaire / locataire | Aboutit | Test simulé |
| État des lieux : brouillon local, rechargement, hors ligne puis resynchronisation | Propriétaire | Aboutit | Test simulé |
| Relocation : nouveau bail reprenant les conditions | Propriétaire | Aboutit | Test simulé |
| Consommations : relevé du locataire, facture, décompte | Propriétaire / locataire | Aboutit à 390, 768 et 1440 | Test simulé |
| Export fiscal qualifié (copropriété, terrain, 230) | Propriétaire | Aboutit ; périmètre limité à la 2044 | Test simulé + code |
| Restitution du dépôt de garantie | Propriétaire | Non jouée en navigateur | Code + tests unitaires |
| Bail signé sur papier, puis activation | Propriétaire | Aboutit | Test simulé |
| Signature électronique du bail | Propriétaire / locataire | Un circuit terminé le 24/10 | Production (une fois) ; non rejoué |
| Invitation du locataire : e-mail, lien à usage unique, mot de passe, acceptation, espace | Propriétaire → locataire | Aboutit ; reconnexion de trop (V1-15) | Test simulé (16/11) |
| Incident en 16 étapes (déclaration, devis, créneaux, rendez-vous, facture, clôture) | Propriétaire, locataire, artisan | Aboutit en nom propre et en SCI ; 1 créneau retenu et 5 caducs ; facture validée **non réglée** | Test simulé + base vérifiée |
| Devis : reprise, sauvegarde lente, conflit | Artisan | Aboutit à 390 et 1440, sans erreur tardive | Test simulé |
| Invitation d'un artisan, inscription, validation, sollicitation par le carnet | Propriétaire → artisan | Aboutit | Test simulé |
| Départ d'un colocataire, session encore ouverte | Ancien locataire | Plus aucun droit (17 fonctions) | Test simulé |
| Retrait d'un collaborateur, session ouverte | Collaborateur | Tout disparaît immédiatement | Test simulé |
| Support : le bailleur retrouve la réponse de la supervision | Propriétaire / super-admin | Aboutit ; pas de notification au client | Test simulé |
| Souscription payante | Propriétaire | **Impossible** (fermée) | Production |
| Relance d'impayé par e-mail, avis d'échéance | Propriétaire | **Coupés** | Code + production |
| Usage par un propriétaire seul, sans aide | Propriétaire | **Non observé** | — |

## F. Risques commerciaux

1. **Promesse trompeuse** (V1-02, V1-07) : le site vend des relances automatiques, une révision IRL proposée et des calculs que l'application ne fait pas. C'est un risque juridique et un risque de réputation dès les premiers avis.
2. **Exploitation à l'aveugle** (V1-01) : depuis le 12/11, le dirigeant ne reçoit plus l'alerte quotidienne. Avec de vrais clients, un incident passerait inaperçu.
3. **Noël des pilotes** (V1-05) : les 5 essais finissent du 24 au 29/12 sans moyen de payer.
4. **Premier usage** (V1-10, V1-11, V1-12, V1-25) : sans accompagnement, risque d'abandon, de premier loyer non appelé, ou d'un locataire qui ne sait pas combien virer.
5. **Confiance visuelle** (V1-06, V1-08) : bandeau « suspendus » permanent, images cassées sur le site public.
6. **Vente payante** (V1-03, V1-04, V1-09) : médiateur, courriers contractuels, impayés et gestes Stripe. Ouvrir les paiements aujourd'hui exposerait à des impayés non recouvrables et à des manquements au Code de la consommation.
7. **Aucune preuve d'usage réel** : 0 bail actif en production, aucun utilisateur observé. Toutes les conclusions de fonctionnement reposent sur le code et le banc.

Classement des risques :
- **anomalies techniques** : V1-01, V1-04, V1-08, V1-10, V1-21 ;
- **obligations légales à confirmer** : médiateur, accusé de rétractation, confidentialité, franchise de TVA ;
- **décisions du dirigeant** : textes de la vitrine, fin des essais, ouverture des paiements, bandeau.

## G. Décision de livraison

**Avant le premier nouveau pilote** (environ une journée) :
- V1-01 : alertes du dirigeant ;
- V1-02 : textes de la vitrine et des CGU ;
- V1-06 : formulation du bandeau ;
- V1-08 : images du journal ;
- V1-10 : échéancier généré à l'activation ;
- V1-25 : un seul montant « à régler » côté locataire ;
- prévenir les pilotes par écrit du périmètre, et assurer un **accompagnement de la première séance** (V1-11, V1-12).
- V1-26 (module « clients externes » de l'artisan) : peut suivre de peu si les premiers artisans sont accompagnés.

**Avant les paiements :**
- V1-03 : médiateur ;
- V1-04 : courriers contractuels et règle d'impayé ;
- V1-09 : gestes Stripe ;
- V1-07 : périmètre fiscal ;
- V1-05 : essais.

S'y ajoutent les obligations externes : Stripe réel, TVA de l'éditeur, délivrabilité. Puis un parcours complet de souscription, d'impayé, de rétractation et de résiliation en bac à sable Stripe.

**Ce qui peut attendre** : les P2 (V1-13 à V1-24, V1-27, V1-28).

**Actions propres au dirigeant** (aucun développement nécessaire) :
- choisir et adhérer à un médiateur ;
- valider les nouveaux textes de la vitrine ;
- décider de la prolongation des essais et prévenir les 5 comptes ;
- faire confirmer par un juriste les points de V1-03, V1-04 et V1-23, et par l'expert-comptable la franchise de TVA ;
- organiser **l'observation d'un propriétaire seul**, pour obtenir le quatrième niveau de preuve.

## H. Conclusion

> **Puis-je aujourd'hui donner Gerimmo à un propriétaire et lui promettre une gestion simple,
> fiable et professionnelle de ses locations ?**

**Pas encore. Je peux le lui donner, gratuitement et en l'accompagnant, mais je ne peux pas encore lui
promettre les trois mots.**

- **Professionnelle : oui sur le fond.** Baux, quittances, encaissements, incidents et comptabilité par titulaire sont justes et conformes là où ils ont été éprouvés. Les montants ne mentent pas, aucun paiement n'est inventé, les espaces sont étanches.
- **Fiable : presque.** Le produit est robuste face aux pannes et sa livraison est exemplaire. Mais le dirigeant n'est plus alerté depuis le 12/11, un bail activé peut afficher « à jour » sans aucun loyer appelé, et rien n'a encore tourné sur un bail réel.
- **Simple : non, pas encore.** Le premier usage demande trois assistants, un vocabulaire de gestionnaire et deux gestes cachés. Un accompagnement est indispensable tant qu'aucun propriétaire n'a été observé réussir seul.

Et la promesse publique dépasse aujourd'hui le produit : relances automatiques, révision IRL proposée,
calculs « faits pour vous ». Les trois conditions du § G (une journée de travail) permettent un pilote
gratuit honnête ; les quatre P0 et les P1 associés doivent être levés avant le premier euro.

> [!warning] Points à trancher / contradictions
> - **Notes plus basses que lors de la contre-vérification de la PR 341** (propriétaire 8/7/7 alors, 7/4/6/6 ici). Cause : cet audit relit chaque écran à trois largeurs avec des relecteurs indépendants et intègre le premier usage complet ; il ne contredit pas les constats techniques de la PR 341, qui restent valables.
> - **Pilote gratuit « GO » le 16/11 (PR 341) contre « GO sous trois conditions » ici.** Les alertes du dirigeant en échec (V1-01) et l'écart entre vitrine et produit (V1-02) n'avaient pas été examinés.
> - **Médiateur et essai gratuit** : un juriste doit dire si l'obligation de médiation joue dès le contrat d'essai gratuit ou seulement à la vente.
> - **« Deux mois d'essai gratuits permanents »** : le mot « permanent » ne figure nulle part ; les CGU retiennent « la durée en vigueur au jour de l'ouverture du compte » et peuvent évoluer. Ne pas le promettre en commercial sans l'écrire.
> - **Statistiques aberrantes** (V1-21) : attribuées à l'émulateur, non reproduites en production faute de données réelles ; à confirmer par un test sur la vraie API.

## Annexe — preuves conservées hors dépôt

Les captures et journaux sont dans l'espace de travail de la session (non publiés, car ils contiennent
des données fictives et, pour la vitrine, les mentions légales du dirigeant) :
- recette : 136 réussis, 1 ignoré, 2 échecs d'accessibilité (V1-16) ;
- compléments : 42 réussis ; 5 échecs, dont 2 dépendants des données (prix calculé pour 6 logements au lieu des 2 attendus) et 3 dans l'espace agence, hors périmètre V1 ;
- captures des écrans, premier usage tracé, invitation du locataire, finances SCI.
