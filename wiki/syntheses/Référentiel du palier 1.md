---
type: synthesis
tags: [referentiel, palier-1, regles, contradictions, decisions]
status: in-progress
created: 2026-11-24
updated: 2026-11-26
sources: ["[[Mission palier 1 — audit du 22 novembre 2026]]", "[[État du projet et décisions ouvertes]]", "[[Divergences code et référentiel V3]]", "[[Propriétaire bailleur]]", "[[Locataire]]", "[[Artisan]]", "[[Super Admin]]", "[[Bail]]", "[[Lot]]", "[[Diagnostic]]", "[[Dossier locataire]]", "[[Garantie]]", "[[Dépôt de garantie]]", "[[État des lieux]]", "[[Signature électronique]]", "[[Document]]", "[[Devis]]", "[[Incident]]", "[[Plan d'apurement]]", "[[Comptabilité]]", "[[Fiscalité]]", "[[Agenda et échéances]]", "[[Abonnement]]", "[[Conditions générales]]", "[[Export complet des données]]", "[[Parrainage]]", "[[Compte, personne et adhésion]]", "[[Cycle de vie d'un incident]]", "[[Demande et sélection de devis]]", "[[Planification d'intervention]]", "[[Intervention et clôture]]", "[[Invitation d'un artisan par un propriétaire]]", "[[Quittancement des loyers]]", "[[Révision annuelle IRL]]", "[[Relances et mise en demeure]]", "[[Régularisation des charges]]", "[[Restitution du dépôt de garantie]]", "[[Solde de tout compte]]", "[[Onboarding et abonnement]]", "[[Souscription de l'abonnement]]", "[[Rétractation en ligne]]", "[[Résiliation de l'abonnement]]", "[[Impayé de l'abonnement]]", "[[Fermeture de compte]]", "[[Demandes sur les données et fermeture de compte]]", "[[Relais du dirigeant]]", "[[Retours utilisateurs]]", "[[Grille tarifaire]]", "[[Cycle de vie de l'abonnement]]", "[[Quittance conforme]]", "[[Mentions obligatoires du bail]]", "[[Notification et valeur probante]]", "[[Ouverture du réseau d'artisans]]", "[[Durées de conservation]]", "[[RGPD]]", "[[Registre des traitements]]", "[[Archivage plutôt que suppression]]", "[[Vétusté et décote]]", "[[Machines à états et événements]]", "[[Le jour de référence est le jour de Paris]]", "[[Plan de reprise d'activité]]", "[[Socle de sécurité]]", "[[Prospection commerciale]]", "[[Procédure de notification de violation]]", "[[Canaux de communication]]", "[[Isolation multi-organisation]]", "[[Cohérence des loyers de référence]]", "[[2026-07-24-gerimmo-v3-module-0-biens-et-lots]]", "[[2026-07-24-gerimmo-v3-module-0b-dossier-locataire]]", "[[2026-07-24-gerimmo-v3-module-0c-copropriete]]", "[[2026-07-24-gerimmo-v3-module-1-bail]]", "[[2026-07-24-gerimmo-v3-module-2-garanties]]", "[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]", "[[2026-07-24-gerimmo-v3-module-4-comptabilite]]", "[[2026-07-24-gerimmo-v3-module-5-mandat-de-gestion]]", "[[2026-07-24-gerimmo-v3-module-6-rapport-et-fiscalite]]", "[[2026-07-24-gerimmo-v3-module-7-incidents]]", "[[2026-07-24-gerimmo-v3-module-8-artisans]]", "[[2026-07-24-gerimmo-v3-module-9-devis-et-facturation]]", "[[2026-07-24-gerimmo-v3-module-10-rdv-et-planning]]", "[[2026-07-24-gerimmo-v3-module-11-notation]]", "[[2026-07-24-gerimmo-v3-module-12-documents-et-ged]]", "[[2026-07-24-gerimmo-v3-module-13-signature-electronique]]", "[[2026-07-24-gerimmo-v3-module-14-agenda-et-alertes]]", "[[2026-07-24-gerimmo-v3-module-15-messagerie]]", "[[2026-07-24-gerimmo-v3-module-16-onboarding-et-invitations]]", "[[2026-07-24-gerimmo-v3-module-17-marque-blanche]]", "[[2026-07-24-gerimmo-v3-module-18-administration]]", "[[2026-07-24-gerimmo-v3-module-19-mobile]]", "[[2026-07-24-gerimmo-v3-module-20-retours-utilisateurs]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-a2-conservation-rgpd]]", "[[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve]]", "[[2026-07-24-gerimmo-v3-a4-socle-securite]]", "[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[2026-07-24-gerimmo-v3-a6-doctrine-financiere]]", "[[2026-09-28-decision-tarification]]", "log.md — entrée « deploy » du 25/11/2026 (publication de 062296e2)", "JOURNAL.md — entrées du 25/11/2026 (soir et nuit) et du 26/11/2026 (matin, réglages R1 à R4)", "livrables/PLAN-DE-PUBLICATION.md (résultat de la publication ; § 4, réglages R1 à R8)"]
---

# Référentiel du palier 1

**En une phrase :** ce que Gerimmo doit faire au palier 1, en une seule page, obtenue en fusionnant le cahier
« Gerimmo V3 » et le wiki. Quand deux sources se contredisent, la décision la plus récente l'emporte, et la
contradiction est notée dans le registre de la partie 5.

Page demandée par le dirigeant le 24/11/2026 : « on remet à plat. Produis UN seul référentiel en fusionnant le cahier
V3 et le wiki (sans autre document). La décision la plus récente l'emporte ; note chaque contradiction. »

## 1. Objet, périmètre, sources, priorité, mode d'emploi

### Objet

Dire, règle par règle, ce que Gerimmo doit permettre à chacun au palier 1. Cette page remplace, pour le palier 1, la
lecture croisée du cahier V3 et des pages du wiki. Elle ne remplace pas ces pages : chaque règle y renvoie.

### Périmètre

- **Dans le palier 1** : le [[Propriétaire bailleur]] qui gère lui-même, le [[Locataire]], l'[[Artisan]], les
  incidents, la gestion administrative, le [[Super Admin]].
- **Palier 2, hors de cette page** : les agences ([[Agent immobilier]], [[Administrateur d'agence]]), le mandat de
  gestion, le propriétaire qui confie ses biens à une agence, le rapport de gestion, les honoraires, la marque blanche,
  l'import en masse d'un parc. Quand une règle du cahier les concerne, elle est notée « palier 2 » et n'est pas
  détaillée.

### Sources

Deux sources de fond, et elles seules.

1. **Le cahier « Gerimmo V3 »** : modules 0 à 20 et annexes A1 à A6. Toutes ses règles sont datées du **24/07/2026**
   (date portée par les pages sources du wiki). Dans les tableaux, « Cahier M3 (3.4.1) » veut dire : cahier V3,
   module 3, règle 3.4.1, du 24/07/2026.
2. **Le wiki** : les pages des personas, des processus, des concepts et des règles métier, avec leur date.

Deux documents servent **seulement à dater et à départager** : les décisions du dirigeant du 24/11/2026
(`DECISIONS-2026-11-24.md`) et le tableau des questions (`QUESTIONS.md`, colonne « Décision du 24/11 »). Dans les
tableaux, « Q23 » renvoie à la question 23 de ce tableau.

**Ce qui a été lu, et comment.** Du cahier : toutes les règles numérotées des 23 modules (0, 0b, 0c, 1 à 20) et des
6 annexes, soit environ 780 règles ; le texte courant des modules (schémas, variantes, récits d'usage) n'a pas été relu
ligne à ligne. Du wiki : les quatre pages des publics du palier 1 en entier ; pour les processus, les concepts et les
règles métier, tous les encadrés « points à trancher » et les sections datées des pages du périmètre ; le catalogue
`index.md` en entier. Les synthèses d'audit et les registres d'anomalies n'ont été lus que par leur résumé au
catalogue : ce sont des constats, pas des règles. Une règle qui ne figurerait que dans le texte courant d'une page
peut donc manquer ici.

### Règle de priorité

1. Une décision du dirigeant du 24/11/2026 l'emporte sur tout ce qui la précède. Un complément du soir ou de la nuit
   l'emporte sur la décision du matin.
2. Sinon, la source la plus récente l'emporte : une page du wiki datée après le 24/07/2026 l'emporte sur le cahier.
3. Une règle du cahier que le wiki n'a ni reprise ni contredite est gardée, avec la mention **« cahier V3 seul »**.
4. Quand aucune décision ne départage deux sources, la règle est notée **« à trancher »** et figure au registre.

### Mode d'emploi

- Chaque règle a un numéro (par exemple R-LOC-04), un énoncé, une source datée et un statut.
- **Statuts** : « en vigueur » (c'est la règle à suivre) ; « remplacée par… » (gardée pour mémoire) ; « palier 2 » ;
  « à trancher » (le numéro C-… renvoie au registre des contradictions).
- **« En vigueur » ne veut pas dire « publié » ni « ouvert »** : au 24/11, plusieurs règles récentes étaient appliquées
  sur la version d'essai et attendaient la publication ; cette version (`062296e2`) est en production depuis le
  25/11/2026, mais certaines règles restent reportées (R-ART-20) ou fermées par un réglage de la console (partie 3.15).
  La page [[Mission palier 1 — audit du 22 novembre 2026]] dit ce qui est publié.
- **« En vigueur » ne veut pas dire « conforme à la loi »**. Cette page ne dit d'aucune règle qu'elle est conforme.
  Les points de droit restent dans `JURISTE.md`.
- **Lecture du cahier** : le cahier écrit ses parcours pour « l'agent » d'une agence, et pose que le propriétaire qui
  gère lui-même « reprend tels quels les parcours de l'agent » (module 0, variante du propriétaire en gestion directe).
  Ici, « le bailleur » désigne donc ce propriétaire, là où le cahier écrit « l'agent ».

## 2. Les publics du palier 1

### 2.1 Le propriétaire bailleur (il gère lui-même)

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-PROP-01 | Le propriétaire s'inscrit seul en ligne, crée son compte et son espace, profite de l'essai, puis s'abonne. Le super admin peut aussi créer un profil à la main, en secours. | [[Propriétaire bailleur]], [[État du projet et décisions ouvertes]] (décision du 19/08/2026) | en vigueur (C-37) |
| R-PROP-02 | Il a un accès complet à son espace : biens, lots, locataires, baux, états des lieux, loyers, impayés, révision, charges, incidents, livre de recettes et de dépenses. | Cahier M0 (variante du propriétaire en gestion directe) ; [[Propriétaire bailleur]] (30/08/2026) | en vigueur |
| R-PROP-03 | Un bien est géré soit par un propriétaire, soit par une agence, jamais par les deux. Une même personne ne peut pas gérer une partie de son parc et confier l'autre. | [[Propriétaire bailleur]] (décision du 19/08/2026) | en vigueur ; le propriétaire qui confie ses biens : palier 2 |
| R-PROP-04 | Son espace n'a ni mandat, ni honoraires, ni rapport de gestion. | Cahier M4 (4.5.1) ; [[Propriétaire bailleur]] (30/08/2026) | en vigueur |
| R-PROP-05 | Tout bien créé a au moins un lot. Le mot « lot » reste caché tant que le bien n'a qu'un seul lot. | Cahier M0 (0.1.2, 0.3.1, 0.3.4) ; [[Lot]] | en vigueur |
| R-PROP-06 | La propriété se rattache au lot, avec des quotes-parts datées qui ne dépassent pas 100 %. Un propriétaire retiré n'est pas effacé : sa date de fin est notée. | Cahier M0 (0.2.1 à 0.2.5) | en vigueur |
| R-PROP-07 | Un lot loué a ses champs principaux verrouillés (surface, pièces, adresse). Un lot loué, ou qui a un historique de comptes, ne se supprime pas : il s'archive. | Cahier M0 (0.5.1, 0.3.2) | en vigueur (cahier V3 seul) |
| R-PROP-08 | Les diagnostics attendus dépendent du type de bien et de son année de construction. Le diagnostic de performance énergétique est demandé pour tout logement. Alertes 90 jours avant, 30 jours avant et le jour de l'expiration. | Cahier M0 (0.6.1, 0.7.4, 0.8.1) ; [[Diagnostic]] | en vigueur |
| R-PROP-09 | Un diagnostic obligatoire expiré empêche de créer un bail sur le lot. | Cahier M0 (0.6.3) ; [[Diagnostic]] | en vigueur, sauf pour un bail déjà en cours à l'arrivée sur Gerimmo (R-BAIL-12, C-11) |
| R-PROP-10 | Il invite ses locataires par e-mail. Une personne sans compte reste gérable. Un invité qui n'a pas répondu reçoit au plus deux rappels, à 3 jours et à 10 jours. Un refus arrête les rappels. | Cahier M16 (16.4.1, 16.4.2, 16.6.1, 16.7.2) ; [[Locataire]] (décision du 15/10/2026) | en vigueur ; le rappel est l'un des envois de R-ADM-12 |
| R-PROP-11 | Il invite ses artisans par e-mail ; c'est l'artisan qui s'inscrit et qui accepte. L'ajout d'un artisan par son numéro SIRET est réservé aux agences. | [[Invitation d'un artisan par un propriétaire]] (décision du 15/10/2026) | en vigueur (C-27) |
| R-PROP-12 | Sur ses incidents, c'est lui qui décide qui paie, qui choisit le devis, qui peut refuser un devis avec un motif ou demander qu'il soit revu, et qui déclare le règlement d'une facture. Gerimmo ne paie rien. | [[Propriétaire bailleur]] (décisions du 14/10/2026, relevé du 16/10/2026) | en vigueur |
| R-PROP-13 | Son menu reste court. Le tableau de bord porte un lien vers Statistiques et un lien vers Journal. | Q18 (décision du 24/11/2026) | en vigueur |
| R-PROP-14 | Son agenda montre ses échéances : loyers appelés et leur état, états des lieux, départ annoncé par un congé, date de fin inscrite au bail, date limite de révision du loyer. L'agenda lit ; il ne crée rien et n'envoie rien. | [[Agenda et échéances]] (22/11/2026) ; Q34 (décision du 24/11/2026) | en vigueur (C-45) |
| R-PROP-15 | Il peut pointer ses loyers à partir d'un relevé exporté par sa banque. Le relevé est lu sur son appareil, jamais envoyé ni gardé. Rien n'est enregistré sans sa confirmation. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) ; Q33 (confirmée le 24/11/2026) | en vigueur (C-17) |
| R-PROP-16 | Avant de solliciter un artisan, il lit un repère de prix pour le métier, avec sa source et sa date. Trois métiers seulement : plomberie, électricité, peinture. Le repère n'est ni un tarif, ni un maximum, ni un engagement. | [[Devis]] (22/11/2026) ; Q35 (confirmée le 24/11/2026) | en vigueur |
| R-PROP-17 | Chez un propriétaire, les documents d'un bail sont émis par le bailleur. Le mot « gestionnaire » ne s'écrit qu'en agence. | Q42 (confirmée le 24/11/2026) | en vigueur |
| R-PROP-18 | Un espace n'a qu'un seul IBAN, même s'il réunit plusieurs sociétés. | Q45 (confirmée le 24/11/2026) | en vigueur |
| R-PROP-19 | Sa signature enregistrée sert aux quittances, reçus, attestations et courriers. L'ordre d'intervention garde un cadre vide, à signer à la main. | Q61 (24/11/2026, sans réponse) | à trancher (voir fin de page) |
| R-PROP-20 | Il télécharge à tout moment une archive complète de ses données et de ses documents. Elle est réservée au titulaire de l'espace, après une vérification renforcée. | [[Export complet des données]] (24/10/2026) | en vigueur |
| R-PROP-21 | Le propriétaire qui a confié ses biens à une agence n'a aucun accès : il reçoit. | Cahier M0, M5, M6 ; [[Propriétaire bailleur]] | palier 2 |

### 2.2 Le locataire

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-LOC-01 | Il est invité par son bailleur. Il a un seul compte, même s'il loue dans plusieurs espaces. Il accepte les conditions d'utilisation à son arrivée. | Cahier A1 (A1.1, A1.3), M16 (16.8.1) ; [[Locataire]] | en vigueur |
| R-LOC-02 | Son espace est le plus restreint : son logement, ses demandes, ses documents. Il ne gère rien. | [[Locataire]] (16/10/2026) | en vigueur |
| R-LOC-03 | Il déclare et suit ses incidents (règles R-INC). | Cahier M7 (7.1.1) ; [[Locataire]] | en vigueur |
| R-LOC-04 | Il indique ses disponibilités dès qu'il signale un incident. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) | en vigueur (C-34) |
| R-LOC-05 | Il dépose lui-même son attestation d'assurance chaque année. Rappels : 30 jours avant pour lui, 15 jours avant, le jour même et 15 jours après pour le bailleur. Le défaut d'assurance alerte ; il ne bloque rien. | Cahier M0b (0b.5.1, 0b.6.1, 0b.6.4) ; [[Locataire]] | en vigueur |
| R-LOC-06 | Il dépose tout autre document que son bailleur lui demande. Ce dépôt prévient le bailleur. | Cahier M0b (0b.2.5, 0b.5.3) | en vigueur |
| R-LOC-07 | Il consulte son bail signé et ses annexes, jamais le projet non signé. En colocation, il voit le bail commun, pas le dossier des autres. | Cahier M1 (1.14.1, 1.14.2) ; [[Locataire]] | en vigueur |
| R-LOC-08 | Il voit où en est la signature électronique qui le concerne. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) | en vigueur |
| R-LOC-09 | Côté loyers, il voit son échéancier, ses quittances et reçus, son solde, ses régularisations avec leurs justificatifs, les relances reçues. Il ne voit jamais les commentaires internes du bailleur. | Cahier M3 (3.12.1, 3.12.2) ; [[Locataire]] | en vigueur |
| R-LOC-10 | Il accède à ses quittances « sans limite de durée ». | Cahier M3 (3.12.1) | remplacée par R-RGPD-03 (C-21) |
| R-LOC-11 | Il voit le montant et la date de son dépôt de garantie. Il ne voit aucune retenue tant que le décompte n'est pas arrêté. Il reçoit ensuite le décompte et ses justificatifs. | Cahier M2 (2.6.1, 2.6.2, 2.7.1, 2.7.2) ; [[Locataire]] | en vigueur |
| R-LOC-12 | Il choisit un créneau de rendez-vous. Il peut demander un report (trois disponibilités et un motif, 24 heures au moins avant, deux demandes au plus) ou annuler. | [[Planification d'intervention]] (décision du 14/10/2026) | en vigueur (C-33) |
| R-LOC-13 | Il ne lit aucun devis : ni le montant, ni l'artisan à valider, ni la garantie annoncée par l'artisan. | Q29 (confirmée le 24/11/2026) | en vigueur |
| R-LOC-14 | Après une intervention, il donne une note globale à l'artisan. | [[Intervention et clôture]] (22/11/2026) | en vigueur (C-31) |
| R-LOC-15 | Sa note lui est demandée à chaque clôture, rappelée à 3 jours puis à 7 jours, sans jamais bloquer son espace. Sans réponse, l'intervention reste sans note. | Cahier M11 (11.1.1 à 11.1.4) | en vigueur (cahier V3 seul) |
| R-LOC-16 | Si sa note est retirée, il en lit le motif. | Q20 (décision du 24/11/2026) | en vigueur (C-32) |
| R-LOC-17 | Il ne consigne pas lui-même un rendez-vous manqué : il écrit à son bailleur, qui consigne. | Q32 (confirmée le 24/11/2026) | en vigueur |
| R-LOC-18 | Chez un propriétaire, ses écrans et ses e-mails disent « votre bailleur » ; les écrans d'une intervention disent « Votre propriétaire ». | Q42 (confirmée le 24/11/2026) | en vigueur |
| R-LOC-19 | Il donne congé par courrier, hors de Gerimmo. Un préavis réduit demande un justificatif. | Cahier M1 (1.10.4, 1.10.5) ; [[Locataire]] | en vigueur |
| R-LOC-20 | Il voit son plan d'apurement, sa progression et sa prochaine échéance. | [[Relances et mise en demeure]] (02/11/2026) | en vigueur |
| R-LOC-21 | Quand un incident est à sa charge, il choisit : faire venir son propre artisan et le prouver, ou passer par le bailleur et être refacturé. | Cahier M9 (9.8.3, 9.8.5 à 9.8.7) | à trancher (C-30) |
| R-LOC-22 | Il peut ouvrir une conversation, rattachée à son bail ou à un incident. Il n'accède plus aux conversations d'un bail terminé. | Cahier M15 (15.1.2, 15.1.3, 15.4.6) | en vigueur (cahier V3 seul) |

### 2.3 L'artisan

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-ART-01 | L'artisan s'inscrit lui-même : numéro SIRET, métiers, zone, mobile. Il dépose ses pièces lui-même. | [[Artisan]] (décision du 04/09/2026) ; cahier M8 (8.2.1) | en vigueur (C-27) |
| R-ART-02 | C'est l'agence qui crée la fiche de l'artisan. | Cahier M8 ; [[Artisan]] (24/07/2026) | remplacée par R-ART-01 ; palier 2 pour l'ajout par SIRET |
| R-ART-03 | Son inscription n'est validée par le super admin qu'avec une assurance décennale et une responsabilité civile professionnelle en cours. Aucune affectation avant cette validation. | [[Artisan]] (décisions du 04/09/2026 et du 27/09/2026) | en vigueur (C-26) |
| R-ART-04 | Il choisit seul sa zone (codes postaux ou départements) et ses métiers. Personne d'autre ne les modifie. Chaque changement est inscrit au journal. | [[Ouverture du réseau d'artisans]] (décision du 23/10/2026) | en vigueur (C-28) |
| R-ART-05 | Son profil est privé par défaut. Lui seul le rend public. | Cahier M8 (8.1.4, 8.4.2) ; [[Artisan]] (23/10/2026) | en vigueur |
| R-ART-06 | Le réseau le propose à un propriétaire quand il est validé, public, que sa zone couvre le code postal du bien, que le métier est le sien et qu'il n'est sur aucune liste noire. | [[Ouverture du réseau d'artisans]] (décision du 23/10/2026) | en vigueur (C-28) |
| R-ART-07 | L'assurance décennale est exigée selon la nature des travaux, pas selon le métier. Si elle expire, l'artisan n'est plus proposé pour ces travaux ; une intervention en cours n'est pas interrompue. | Cahier M8 (8.2.2, 8.2.7, 8.2.9) ; [[Artisan]] | en vigueur |
| R-ART-08 | Alertes d'expiration de ses pièces : 60 jours, 30 jours, 7 jours avant, puis le jour même. Depuis le 04/09/2026, cette surveillance revient au super admin. | Cahier M8 (8.2.5) ; [[Artisan]] (décision du 04/09/2026) | en vigueur |
| R-ART-09 | Invité par un propriétaire, il accepte ou refuse lui-même. Il reste privé, mais ce propriétaire peut le solliciter pour les biens de sa zone, une fois l'inscription validée. | [[Invitation d'un artisan par un propriétaire]] (décision du 15/10/2026) | en vigueur |
| R-ART-10 | Son téléphone et son e-mail ne sont transmis à un propriétaire qu'avec une demande, ou s'il est déjà dans son carnet. | [[Ouverture du réseau d'artisans]] (23/10/2026, choix de prudence) | à trancher (C-29) |
| R-ART-11 | Il accepte ou refuse une mission. Un refus prévient le bailleur. | Cahier M7 (7.4.1) ; [[Artisan]] | en vigueur |
| R-ART-12 | Il déclare ses absences et sa semaine type. Pendant une absence déclarée, aucune nouvelle demande ne peut lui être envoyée ; ce qui est en cours continue. | Q30 (confirmée le 24/11/2026) | en vigueur |
| R-ART-13 | Son devis vaut 30 jours par défaut ; il peut changer cette durée. Si son devis est refusé, il en lit le motif. Si on lui demande de le revoir, il a sept jours, et trois versions au plus. | Cahier M9 (9.2.1) ; [[Devis]] (décision du 14/10/2026) | en vigueur |
| R-ART-14 | Il peut écrire sur son devis la garantie qu'il annonce. Elle est imprimée avec la mention « Engagement de l'artisan, pas de Gerimmo ». Il garde ses lignes de devis pour les reprendre. | [[Devis]] (22/11/2026) ; Q29 (confirmée le 24/11/2026) | en vigueur |
| R-ART-15 | Il propose au moins trois créneaux. Il répond en 48 heures à une demande de report. | Cahier M10 (10.1.1, 10.1.2) ; [[Planification d'intervention]] (14/10/2026) | en vigueur |
| R-ART-16 | Pour terminer une intervention, il doit rendre un compte rendu et joindre une photo du travail réalisé. | Cahier M7 (7.5.1, 7.5.2) ; [[Artisan]] | en vigueur |
| R-ART-17 | Il peut signaler une cause différente de celle supposée, pour que le bailleur revoie qui paie. | Cahier M7 (7.5.3) | à trancher (C-24) |
| R-ART-18 | Il dépose sa facture une fois l'intervention terminée et la photo jointe. Elle est préremplie au montant du devis retenu ; il justifie tout écart. | Cahier M9 (9.7.1 à 9.7.3, 9.8.1) | en vigueur |
| R-ART-19 | Une intervention ne porte qu'une facture en vigueur. Une facture erronée se refuse avec un motif ; elle reste au dossier, et l'artisan en dépose une autre. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) ; cahier M9 | en vigueur |
| R-ART-20 | Gerimmo fabrique la facture de l'artisan, avec acompte possible ; le dépôt de sa propre facture reste en option. Conditions : mandat de facturation accepté par l'artisan, validation de chaque facture par lui, mention « au nom et pour le compte de », sa propre numérotation, facture d'acompte. | Q14 (décision du 24/11/2026, puis report du 24/11 dans la nuit) | en vigueur comme cible, **reportée après la publication** ; rien n'est fait ; à reprendre avec l'accord d'un expert-comptable (C-36) |
| R-ART-21 | Pour ses factures, il voit l'état, la date et le moyen de chaque règlement déclaré. Il peut relancer une facture 30 jours après son dépôt, puis tous les 15 jours ; aucun e-mail ne part. | [[Intervention et clôture]] (14/10/2026) ; Q31 (confirmée le 24/11/2026) | en vigueur |
| R-ART-22 | Il voit sa moyenne, jamais le détail par évaluateur. Il ne peut ni modifier sa note, ni y répondre en public. Il voit le nombre de rendez-vous où ses clients l'ont dit absent, sur douze mois. | Cahier M8 (8.4.4), M11 (11.4.3) ; Q32 (confirmée le 24/11/2026) | en vigueur |
| R-ART-23 | Il conteste une note auprès du super admin. Il ne lit pas le motif d'un retrait. | Cahier M11 (11.4.4) ; Q20 (décision du 24/11/2026) | en vigueur |
| R-ART-24 | S'il est refusé ou suspendu, il reçoit les motifs par e-mail, mot pour mot. | Q25 (confirmée le 24/11/2026) | en vigueur |
| R-ART-25 | L'outil privé de l'artisan pour ses clients hors Gerimmo, et l'avoir qui annule une facture, restent éteints jusqu'à la validation d'un expert-comptable. | [[Artisan]] (décision du 15/10/2026) | en vigueur (éteint) |
| R-ART-26 | Les conditions de l'espace artisan sont rédigées. Il exporte les données de son activité. | [[Artisan]], [[Conditions générales]] (24/10/2026) | en vigueur |
| R-ART-27 | Un artisan qui travaille pour plusieurs agences voit le logo de chacune. | Cahier M17, M19 | palier 2 |

### 2.4 Les incidents

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-INC-01 | Un incident est déclaré par un locataire dont le bail est actif. Le bailleur peut en créer un pour lui. | Cahier M7 (7.1.1, 7.1.6) ; [[Incident]] | en vigueur |
| R-INC-02 | Côté bailleur, il y a deux portes : l'écran « Incidents » et la fiche du bien. Elles posent les mêmes questions (catégorie, urgence) et les traitent de la même façon. La fiche du bien est la seule à accepter « tout le bien / parties communes ». | Q26 (confirmée le 24/11/2026) | en vigueur |
| R-INC-03 | La description est obligatoire. Les photos sont recommandées. | Cahier M7 (7.1.2) ; [[État du projet et décisions ouvertes]] (décision du 21/08/2026) | en vigueur (C-25) |
| R-INC-04 | Sur mobile, la photo est le premier champ et suffit, sans description. | Cahier M19 (19.2.2) | remplacée par R-INC-03 (C-25) |
| R-INC-05 | La catégorie se choisit dans une liste fermée. Le bailleur peut corriger l'urgence après la déclaration. Une urgence déclenche une alerte critique ; un doublon possible est signalé. | Cahier M7 (7.1.3) ; [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) ; Q26 | en vigueur |
| R-INC-06 | Un incident sur les parties communes est enregistré, puis transmis au syndic. | Cahier M7 (7.1.4) ; décision du 21/08/2026 | en vigueur |
| R-INC-07 | En colocation, tous les colocataires sont informés de l'incident. | Cahier M7 (7.1.5) | en vigueur (cahier V3 seul) |
| R-INC-08 | C'est le bailleur qui décide qui paie, sans proposition automatique. Trois réponses possibles : le locataire, le propriétaire, une dégradation fautive. Il doit écrire sa justification. | Cahier M7 (7.2.1 à 7.2.3) ; décision du 21/08/2026 | en vigueur |
| R-INC-09 | Le locataire est informé de cette décision dès qu'elle est prise. S'il conteste, sa contestation est notée, sans bloquer l'intervention. | Cahier M7 (7.2.4, 7.2.5) ; décision du 21/08/2026 | en vigueur |
| R-INC-10 | Aucun artisan n'est affecté tant que la question « qui paie » n'a pas de réponse. | Cahier M7 (7.2.7) | en vigueur |
| R-INC-11 | La décision « qui paie » peut être revue, avec sa justification, tant que l'incident n'est pas parti en intervention. | [[Incident]] (règle du 23/08/2026, écrite le 10/09/2026) | en vigueur ; la révision après le diagnostic de l'artisan reste à trancher (C-24) |
| R-INC-12 | Un incident peut être scindé en deux, pour deux payeurs différents. | Cahier M7 (7.2.8) | en vigueur (cahier V3 seul) |
| R-INC-13 | Un incident peut être clos sans artisan. Un incident clos peut être rouvert, avec son historique. Il peut porter plusieurs interventions. | Cahier M7 (7.6.1, 7.6.3, 7.6.4) ; [[Incident]] | en vigueur |
| R-INC-14 | Un incident passe par sept états, de « déclaré » à « rouvert ». Un passage non prévu est refusé. | [[Machines à états et événements]] (21/08/2026) ; cahier A5 (A5.1) | en vigueur |
| R-INC-15 | Seuls les artisans du métier concerné sont proposés. | Cahier M7 (7.3.1) | en vigueur |
| R-INC-16 | La clôture d'une intervention déclenche la demande de note. | Cahier M7 (7.6.2) | en vigueur |
| R-INC-17 | Chacun est prévenu d'un nouveau message dans la discussion d'une intervention. L'artisan y est ajouté à son affectation ; il ne voit du locataire que son prénom et son téléphone. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) ; cahier M15 (15.2.1, 15.2.6) | en vigueur |
| R-INC-18 | En dehors des horaires, un numéro d'astreinte est affiché dans l'espace du locataire. | Cahier M7 (7.7.2) | en vigueur (cahier V3 seul ; voir partie 6) |
| R-INC-19 | Au-delà d'un seuil fixé au mandat, un devis et l'accord du propriétaire sont obligatoires. Le propriétaire n'est informé des incidents que par son rapport mensuel. | Cahier M7 (7.3.3, 7.8.1 à 7.8.3), M9 (9.5) | palier 2 |

### 2.5 La gestion administrative

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-ADM-01 | Le dossier d'un locataire range ses pièces par catégories fixes. Chaque pièce est datée et porte le nom de qui l'a déposée. Toutes les versions sont gardées. | Cahier M0b (0b.2.1, 0b.2.4, 0b.4.1) ; [[Dossier locataire]] | en vigueur |
| R-ADM-02 | Un dossier incomplet n'empêche pas de préparer le bail : il alerte. | Cahier M0b (0b.2.3), M1 (1.1.4) | en vigueur |
| R-ADM-03 | Pour les pièces demandées à un candidat, Gerimmo ne propose plus le « RIB » d'un clic, et rappelle que la liste des pièces est encadrée. | [[Dossier locataire]] (23/11/2026) | en vigueur ; point de droit dans `JURISTE.md` |
| R-ADM-04 | Le garant est une personne à part entière, avec sa fiche et ses pièces. Le lien de garantie est porté par le bail. | Cahier M0b (0b.3.1, 0b.3.3) | en vigueur |
| R-ADM-05 | La date de naissance du locataire est facultative sur sa fiche. | [[Compte, personne et adhésion]] (décision du 20/11/2026) | en vigueur (C-41) |
| R-ADM-06 | Toute consultation d'une pièce du dossier est tracée. | Cahier M0b (0b.7.5), M12 (12.5.8) | en vigueur |
| R-ADM-07 | Les alertes ont trois niveaux : critique, normale, informative. Les seuils qui viennent de la loi sont figés ; seul le super admin les met à jour. | Cahier M14 (14.1.4, 14.2.1, 14.2.5) ; [[Agenda et échéances]] | en vigueur |
| R-ADM-08 | Une alerte se ferme par l'action qu'elle demande, pas par une simple coche. | Cahier M14 (14.3.2) | à trancher (C-44) |
| R-ADM-09 | Les documents se retrouvent par filtres et par recherche, sans dossiers à ouvrir. Un document apparaît sur toutes les fiches qu'il concerne. Son type décide de qui le voit. | Cahier M12 (12.5.1 à 12.5.3) ; [[Document]] | en vigueur |
| R-ADM-10 | Les fichiers déposés sont limités en taille et en format : PDF, JPEG, PNG, 10 Mo. | Q8 (décision du 24/11/2026) | en vigueur |
| R-ADM-11 | Les canaux de Gerimmo sont l'e-mail et l'espace personnel. Pas d'application à installer, donc pas de notification sur le téléphone. Le robot Telegram est abandonné. | Cahier M19 ; [[Canaux de communication]] (décision du 25/07/2026) | en vigueur ; WhatsApp : à trancher (C-38) |
| R-ADM-12 | Aucun e-mail automatique ne part tant que le super admin n'a pas ouvert l'envoi. Cinq envois ont chacun leur interrupteur : avis d'échéance, relance amiable de loyer, rappel de rendez-vous, relance d'une invitation, relance de l'artisan avant la fin de son délai de réponse à un report. Les cinq sont ouverts à la publication. | Q6 et Q37 (décisions du 24/11/2026) | en vigueur ; au 26/11, les cinq restent fermés en production (réglage R5 pas encore fait, partie 3.15) |
| R-ADM-13 | Pour l'avis d'échéance et la relance de loyer, chaque espace donne en plus son accord dans son profil. Cet accord est conservé si l'envoi est refermé puis rouvert. La relance envoyée à la main est ouverte elle aussi. | Q24 (décision du 24/11/2026) | en vigueur ; au 26/11, la relance à la main reste fermée en production (R5, partie 3.15) |
| R-ADM-14 | Un écran ou un e-mail ne promet un envoi automatique que si cet envoi est ouvert. | [[Planification d'intervention]] (23/11/2026) | en vigueur |
| R-ADM-15 | « Aujourd'hui » est le jour du calendrier à Paris, pour les loyers, les encaissements, les quittances, le dépôt de garantie, le journal et la révision. | [[Le jour de référence est le jour de Paris]] (décision du 15/10/2026) | en vigueur ; extension à d'autres dates : à trancher (voir fin de page) |
| R-ADM-16 | Tout utilisateur connecté peut signaler un défaut, proposer une idée ou faire une réclamation. Il reçoit toujours une réponse. | Cahier M20 (20.1.1, 20.2.4, 20.4.1) ; [[Retours utilisateurs]] (24/10/2026) | en vigueur |
| R-ADM-17 | Toute conversation est rattachée à un bail, un incident ou un lot. | Cahier M15 (15.1.1) | en vigueur (cahier V3 seul) |
| R-ADM-18 | Gerimmo est un site adapté au téléphone. L'état des lieux se saisit sur mobile, même sans réseau, et se met à jour au retour du réseau. | Cahier M19 (19.1.1, 19.1.2), M1 (1.12.4) ; [[État des lieux]] | en vigueur (le « sans réseau » : cahier V3 seul) |
| R-ADM-19 | Les annonces d'information, les seuils de confort réglables et la remontée d'une alerte non traitée vers un responsable sont décrits pour les agences. | Cahier M14 (14.2.2, 14.4, 14.5) | palier 2 |

### 2.6 Le super admin

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-SA-01 | Il n'y a qu'un super admin : le dirigeant. Il entre dans chaque espace avec tous les droits du lieu. Chaque entrée et chaque action hors de son propre espace est inscrite au journal. | [[Super Admin]] (décision du 09/09/2026) ; cahier A1 (A1.11) | en vigueur (C-42) |
| R-SA-02 | Il ne se fait jamais passer pour un utilisateur : il reste le super admin, et tout ce qu'il fait est enregistré. | `log.md` (décision du 25/09/2026) | en vigueur (C-42) |
| R-SA-03 | Il peut se mettre à la place de n'importe quel utilisateur. | [[Super Admin]] (précision du 22/07/2026) | remplacée par R-SA-02 |
| R-SA-04 | La double authentification lui est obligatoire. Sa session est la plus courte. | Cahier A4 (A4.1, A4.5) ; [[Socle de sécurité]] | en vigueur |
| R-SA-05 | Lui seul valide, refuse ou suspend l'inscription d'un artisan. | [[Super Admin]], [[Artisan]] (04/09/2026, 23/10/2026) | en vigueur |
| R-SA-06 | Il ouvre et ferme le réseau d'artisans, commune par commune et métier par métier. | [[Ouverture du réseau d'artisans]] (règle du 28/09/2026) | remplacée par R-ART-04 et R-ART-06 (C-28) |
| R-SA-07 | Lui seul peut exclure un artisan de tout le réseau, avec un motif ; lui seul peut lever cette exclusion. | Cahier M8 (8.5.3, 8.5.4) | à trancher : aucun écran ne le permet aujourd'hui (C-29) |
| R-SA-08 | Il examine une note contestée et peut la retirer, en écrivant un motif. Cet accès est tracé. Le retrait fait recalculer la note. | Cahier M11 (11.4.4 à 11.4.7) ; [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) | en vigueur |
| R-SA-09 | Il règle les interrupteurs de la plateforme : l'intelligence artificielle, les cinq envois automatiques, la signature électronique, l'ouverture des ventes. Voir la partie 3.15. | Q6, Q11, Q12, Q16, Q37 (24/11/2026) | en vigueur |
| R-SA-10 | Il fixe le nombre d'appels payants à l'intelligence artificielle par jour : 50 par défaut, de 0 à 1 000 ; 0 coupe tout. | [[Super Admin]] (décision du 15/10/2026) | en vigueur |
| R-SA-11 | Il dispose d'un arrêt d'urgence, qui coupe les tâches automatiques. | [[Super Admin]] (15/10/2026) | en vigueur |
| R-SA-12 | Il reçoit un e-mail chaque matin à 5 h s'il y a quelque chose à signaler, et un e-mail immédiat pour les urgences pendant ses absences. Les nouvelles inscriptions figurent dans l'e-mail du matin. | [[Relais du dirigeant]] (décisions du 15/10/2026 et du 22/11/2026) | en vigueur |
| R-SA-13 | Il retrouve un bien, un lot ou un incident par sa référence exacte. Le résultat mène à la fiche de l'espace, jamais directement à la donnée. | [[Super Admin]] (15/10/2026) | en vigueur |
| R-SA-14 | Il règle et date les repères fiscaux affichés au propriétaire (plafond et abattement du micro-foncier). | [[Fiscalité]] (23/11/2026) ; Q38 (décision du 24/11/2026) | en vigueur |
| R-SA-15 | Il règle les durées de conservation sur un écran dédié. Aucune règle de conservation n'est activée pendant la mission. | [[Durées de conservation]] (24/10/2026) ; Q39 (décision du 24/11/2026) | en vigueur |
| R-SA-16 | Il trie les retours des utilisateurs. Il transmet un défaut confirmé ; il ne corrige jamais le produit depuis la console. | Cahier M20 (20.2.1, 20.3.1, 20.3.2) ; [[Super Admin]] | en vigueur |
| R-SA-17 | Les articles et les posts préparés avec l'intelligence artificielle paraissent seuls, sauf veto. Chacun porte la mention « Rédigé avec l'aide de l'IA ». | Q13 (décision du 24/11/2026) | en vigueur (C-43) |
| R-SA-18 | Il répond aux demandes sur les données personnelles dans le mois, et programme la fermeture d'un compte. | [[Demandes sur les données et fermeture de compte]], [[Fermeture de compte]] (24/10/2026) | en vigueur |
| R-SA-19 | Il peut offrir des mois d'abonnement à un espace. | [[Cycle de vie de l'abonnement]] (décision du 25/10/2026, notée « en validation ») | en vigueur |
| R-SA-20 | En cas de fuite de données, il suit la procédure prévue : qualifier, confiner, informer. | [[Procédure de notification de violation]] (20/09/2026, brouillon) ; cahier A2 (A2.10), A4 (A4.14) | en vigueur |
| R-SA-21 | Une sauvegarde est faite chaque jour et gardée 90 jours. Une sauvegarde neuve et relisible doit exister avant la publication. | `log.md` (décision du 27/09/2026) ; décisions du 24/11/2026 (Q9) | en vigueur ; clé des sauvegardes remplacée par le dirigeant (étape P1, annoncée le 25/11 ; restauration contrôlée avec la nouvelle clé le 25/11 ; date de mise à jour du secret non vérifiée : `JOURNAL.md`, 25/11 soir) ; sauvegarde `20261125-2201` déposée et relue avant l'application des migrations (25/11, étape É7) |
| R-SA-22 | Les défauts majeurs de sa console sont corrigés avant la publication ; les défauts mineurs sont reportés après. | Décisions du 24/11/2026 (nuit) | en vigueur |
| R-SA-23 | Créer une agence, importer un parc en masse, valider un modèle de document propre à une agence, activer la marque blanche. | Cahier M0 (0.12), M12 (12.1.3), M16 (16.1.1), M17 | palier 2 |

## 3. Les domaines transverses

### 3.1 Bail et dossier du bail

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-BAIL-01 | Un bail porte toujours sur un lot. | Cahier M1 (1.1.1) ; [[Bail]] | en vigueur |
| R-BAIL-02 | Deux baux actifs ne peuvent pas se chevaucher sur un même lot. | Cahier M1 (1.1.3) | en vigueur, sauf la colocation à contrats individuels (R-BAIL-04, C-39) |
| R-BAIL-03 | Gerimmo prépare le bail nu, le bail meublé et la colocation à bail unique. | Cahier M1 ; [[État du projet et décisions ouvertes]] (décision du 04/09/2026) | en vigueur |
| R-BAIL-04 | Gerimmo prépare aussi les contrats individuels de colocation, chambre par chambre. | [[Bail]] (réalisation du 14/09/2026) | en vigueur (C-39) |
| R-BAIL-05 | Les contrats séparés de colocation sont hors de la première version. | Cahier M1 (1.4.1) | remplacée par R-BAIL-04 |
| R-BAIL-06 | Le premier loyer est calculé au prorata des jours si l'entrée a lieu en cours de mois. | Cahier M1 (1.1.6) | en vigueur |
| R-BAIL-07 | La « zone tendue » est déduite du code postal, peut être corrigée, puis reste figée sur le bail signé. | Cahier M0 (0.1.6, 0.1.7), M1 (1.1.7) | en vigueur |
| R-BAIL-08 | Durée proposée par défaut : trois ans si le bailleur est un particulier, six ans sinon ; un an en meublé, neuf mois pour un étudiant. | Cahier M1 (1.1.8, 1.2.2) | en vigueur (cahier V3 seul) |
| R-BAIL-09 | Un bail meublé demande un inventaire du mobilier, saisi élément par élément. | Cahier M1 (1.2.1) ; [[Bail]] | en vigueur |
| R-BAIL-10 | Un contrôle indicatif compare le loyer saisi aux loyers de référence. Il ne modifie aucun montant. | [[Cohérence des loyers de référence]] (16/10/2026) | en vigueur |
| R-BAIL-11 | Un bail s'active après des contrôles (diagnostics, état des lieux d'entrée, mentions). Une fois le contrat signé reçu, c'est le propriétaire qui confirme l'activation. | [[Signature électronique]] (19/10/2026) ; [[Onboarding et abonnement]] | en vigueur (C-04) |
| R-BAIL-12 | Un bail déjà en cours à l'arrivée sur Gerimmo s'active par son contrat signé. Un diagnostic manquant ou expiré ne le bloque pas. Un diagnostic de performance énergétique classé G donne une simple alerte. Il n'y a pas d'alerte d'état des lieux d'entrée. | [[Bail]], [[Diagnostic]] (décisions des 20/11/2026 et 22/11/2026) | en vigueur (C-11, C-13) ; effet en droit non établi |
| R-BAIL-13 | Quand plusieurs diagnostics de performance énergétique existent, c'est celui dont la date d'établissement est la plus récente qui décide. D'ici la lecture du texte, un avertissement est affiché. | Q28 (décision du 24/11/2026) | en vigueur comme cible ; aujourd'hui c'est le dernier enregistré qui décide (C-12) |
| R-BAIL-14 | Un avenant s'ajoute au bail, il ne le remplace pas. Signé, il s'enregistre et change le loyer et la provision à sa date d'effet : le 1er d'un mois dont le loyer n'est pas encore appelé. Une hausse est refusée si le dernier diagnostic classe le logement F ou G. Le dépôt de garantie ne change pas. | Cahier M1 (1.9.1) ; Q22 (confirmée le 24/11/2026) | en vigueur |
| R-BAIL-15 | Le remplacement d'un colocataire passe par un avenant. Un colocataire parti n'est plus traité comme locataire dans les documents. | Cahier M1 (1.5.1) ; [[Bail]] (24/11/2026) | en vigueur |
| R-BAIL-16 | En colocation à bail unique, chaque colocataire répond de tout le loyer. Après son départ, cet engagement dure six mois, ou jusqu'à l'arrivée d'un remplaçant. La date de fin est calculée et donne une alerte. | Cahier M1 (1.3.1 à 1.3.5) | en vigueur (cahier V3 seul) |
| R-BAIL-17 | Un bail garde la version du modèle en vigueur à sa signature. Les mentions obligatoires ne peuvent pas être retirées d'un modèle. | Cahier M1 (1.16.3, 1.16.4), M12 (12.1.6) | en vigueur |
| R-BAIL-18 | La notice d'information officielle est jointe au bail, entière, dans la version en vigueur à la signature. En attendant, le bailleur la dépose lui-même, et l'envoi en signature électronique est bloqué sans elle. | Q46 (décision du 24/11/2026) | en vigueur ; reste à appliquer (C-40) |
| R-BAIL-19 | Un projet de bail payé par virement est refusé tant que l'IBAN de l'espace manque. | Q45 (complément du 24/11/2026) | en vigueur |
| R-BAIL-20 | Congé du locataire : le délai part de la date où le courrier lui est présenté pour la première fois ; le bailleur saisit cette date. Préavis de trois mois en bail nu, d'un mois en meublé ou en zone tendue, ou d'un mois sur justificatif. | Cahier M1 (1.10.1 à 1.10.5), A3 (A3.5, A3.6) ; [[Notification et valeur probante]] | en vigueur ; point de droit dans `JURISTE.md` |
| R-BAIL-21 | Congé du bailleur : seulement au terme du bail, trois motifs possibles. Gerimmo affiche « à faire relire », refuse une lettre de reprise incomplète, et demande le prix de vente au moment de produire le document d'un logement nu. | Cahier M1 (1.11.1 à 1.11.5) ; [[Mentions obligatoires du bail]] (23/11/2026) ; Q49 (24/11/2026) | en vigueur ; point de droit dans `JURISTE.md` |
| R-BAIL-22 | Chaque document du dossier de bail n'est proposé que pour les baux qu'il accepte (pas d'avenant sur un bail terminé, par exemple). | [[Bail]], [[Document]] (24/11/2026) | en vigueur |
| R-BAIL-23 | Une alerte prévient six mois avant le terme du bail. | Cahier M1 (1.8.1, 1.8.2) | en vigueur (cahier V3 seul ; voir partie 6) |

### 3.2 Loyers et charges

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-LOY-01 | L'échéancier des loyers est créé quand le bail signé est enregistré. | Cahier M3 (3.1.1) | en vigueur |
| R-LOY-02 | Pour un bail déjà en cours à l'arrivée sur Gerimmo, les loyers ne sont suivis qu'à partir du mois de l'activation. | [[Bail]] (décision du 21/11/2026) | en vigueur (C-14) |
| R-LOY-03 | L'appel de loyer réunit le loyer et la provision de charges. Le solde d'avant est reporté sur chaque nouvel appel. | Cahier M3 (3.2.1, 3.2.3) | en vigueur |
| R-LOY-04 | Le jour d'échéance est celui inscrit au bail. | [[Quittancement des loyers]] | en vigueur |
| R-LOY-05 | Les paiements reçus sont saisis à la main. Il n'y a pas de liaison directe avec la banque. | Cahier M3 (3.3.1), A6 (A6.8) ; [[Comptabilité]] (décision du 22/07/2026) | en vigueur ; le pointage par relevé (R-PROP-15) reste une saisie confirmée (C-17) |
| R-LOY-06 | Un paiement solde d'abord le loyer le plus ancien. | Cahier M3 (3.3.2), A6 (A6.7) | en vigueur |
| R-LOY-07 | La quittance n'est émise qu'après le paiement complet. Un paiement partiel donne un reçu, jamais une quittance. | Cahier M3 (3.4.1, 3.4.2) ; [[Quittancement des loyers]] | en vigueur |
| R-LOY-08 | La quittance sépare le loyer et les charges, et porte l'identité du bailleur. | [[Quittance conforme]] | en vigueur |
| R-LOY-09 | Chez un propriétaire, la quittance lue en ligne porte l'adresse de l'espace. Le PDF de la même quittance porte l'adresse personnelle des propriétaires. | Q52 (décision du 24/11/2026) ; Q74 (sans réponse) | en vigueur pour la quittance en ligne ; alignement du PDF à trancher (C-15) |
| R-LOY-10 | L'avis d'échéance n'est proposé que pour un loyer encore dû. Établi après l'échéance, il se présente comme un rappel et annonce le total réellement dû à sa date. | [[Quittancement des loyers]] (24/11/2026) | en vigueur (C-20) ; point de droit dans `JURISTE.md` |
| R-LOY-11 | Un avis ou un courrier qui demande un virement imprime l'IBAN de l'espace ; sans lui, il est refusé. | Q45 (confirmée le 24/11/2026) | en vigueur |
| R-LOY-12 | Un trop-perçu est reporté sur l'appel suivant ; il n'est pas remboursé de lui-même. | Cahier M3 (3.5.1) | en vigueur (cahier V3 seul) |
| R-LOY-13 | Les charges de copropriété se saisissent poste par poste ; le total des postes doit égaler le total de l'appel. | Cahier M0c (0c.2.1, 0c.2.2) | en vigueur |
| R-LOY-14 | Aucun poste de charges n'est « récupérable » sans la confirmation du bailleur. Gerimmo propose, le bailleur choisit, poste par poste. Un poste non confirmé bloque la validation. | [[Régularisation des charges]] (22/11/2026) ; cahier M0c (0c.3.2, 0c.3.3) | en vigueur |
| R-LOY-15 | Le fonds de travaux de la copropriété n'est jamais récupérable sur le locataire. | Cahier M0c (0c.3.4, 0c.5.1) | en vigueur |
| R-LOY-16 | La régularisation des charges porte sur l'année civile, au prorata des jours d'occupation. Les justificatifs sont obligatoires. Les charges au forfait ne se régularisent pas. | Cahier M3 (3.9.1, 3.9.3, 3.9.5, 3.9.8) ; [[Régularisation des charges]] | en vigueur |
| R-LOY-17 | Une régularisation émise ne se modifie pas : elle se corrige par une régularisation rectificative. | Cahier M3 (3.9.7) | en vigueur |
| R-LOY-18 | Pour un lot en copropriété, la régularisation est bloquée tant que l'appel de charges du syndic n'est pas saisi. | Cahier M0c (0c.6.4), M3 (3.9.2) | en vigueur |
| R-LOY-19 | Quand une régularisation est étalée, la première mensualité tombe au moins un mois après l'émission. | [[Régularisation des charges]] (23/11/2026) ; Q50 | en vigueur ; délai posé au juriste |
| R-LOY-20 | Un complément de charges réglé par échéancier n'est pas compté comme impayé au décompte de sortie. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) | en vigueur |
| R-LOY-21 | Un changement de provision est proposé, jamais appliqué sans validation. Les pièces des charges restent consultables par le locataire pendant six mois. | Cahier M3 (3.10.1, 3.9.6) | en vigueur (cahier V3 seul) |

### 3.3 Révision du loyer

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-REV-01 | La révision suppose une clause écrite au bail. Elle ne demande pas d'avenant. | Cahier M3 (3.8.1), M1 (1.9.3) | en vigueur |
| R-REV-02 | L'indice de départ est celui inscrit au bail. Le nouvel indice est celui du même trimestre, l'année suivante. | Cahier M3 (3.8.2) ; [[Révision annuelle IRL]] (29/09/2026) | en vigueur |
| R-REV-03 | L'indice se saisit à la main, quatre fois par an, sans récupération automatique. | Cahier M3 (3.8.3) ; [[Révision annuelle IRL]] | remplacée par R-REV-04 (C-07) |
| R-REV-04 | L'indice se cherche chez l'Insee ; à défaut, il se saisit. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) | en vigueur |
| R-REV-05 | La révision est proposée au bailleur ; elle n'est jamais appliquée sans sa validation. | Cahier M3 (3.8.4) | en vigueur |
| R-REV-06 | Un rappel paraît à la date anniversaire du bail et reste 60 jours. La date limite (un an après la date de révision) est affichée. Un second rappel paraît 30 jours avant elle. Au-delà, la révision de l'année passée est refusée. | Q23 (décision du 24/11/2026) ; cahier M3 (3.8.5) | en vigueur ; à confirmer sur le texte de loi |
| R-REV-07 | Pas de rappel pour un bail en préavis, ni quand le dernier diagnostic classe le logement F ou G. | Q23 (24/11/2026) | en vigueur |
| R-REV-08 | Aucune révision n'est possible pour un logement classé F ou G. | Cahier M3 (3.8.6) ; [[Révision annuelle IRL]] | en vigueur |
| R-REV-09 | La révision prend effet à la date anniversaire. | Cahier M3 (parcours 3.8) | remplacée par R-REV-11 (C-06) |
| R-REV-10 | Demandée après la date anniversaire, la révision prend effet à la date de la demande. | [[Révision annuelle IRL]] (correction du 29/09/2026) | remplacée par R-REV-11 (C-06) |
| R-REV-11 | La révision ne s'applique jamais à des jours antérieurs à la demande du bailleur. Elle s'applique au premier terme qui suit la demande, et la lettre le dit. Une demande antidatée ne fait pas gagner un mois. | Q43 (décision du 24/11/2026) | en vigueur (C-06) |
| R-REV-12 | Après une année perdue, le calcul se fait sur un an, avec l'indice de l'année précédente. La révision est refusée pour un bail terminé. Une seule révision par année de bail. | Q23 (choix pris sur délégation, 24/11/2026) ; [[Révision annuelle IRL]] (29/09/2026) | en vigueur |
| R-REV-13 | La révision ne change ni le dépôt de garantie, ni la provision de charges. Chaque révision garde l'indice utilisé. | Cahier M3 (3.8.7, 3.8.8), M2 (2.1.5) | en vigueur |
| R-REV-14 | Le calendrier du propriétaire montre la date limite de révision de chaque bail. | Q34 (décision du 24/11/2026) | en vigueur |
| R-REV-15 | Une révision est refusée quand le rapport entre les deux indices sort de la plage 0,8 à 1,25 : c'est un contrôle de saisie. | Q71 (24/11/2026, sans réponse) | à trancher (voir fin de page) |

### 3.4 Impayés

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-IMP-01 | Chaque jour, Gerimmo constate les impayés : une seule alerte par bail, avec le montant dû et le nombre de loyers en retard. Elle se ferme seule quand la dette est soldée. | [[Relances et mise en demeure]] (11/09/2026) | en vigueur |
| R-IMP-02 | Sous un montant minimal, aucune relance. Ce montant se règle par espace : 5 € par défaut. | [[Relances et mise en demeure]] (29/09/2026) ; cahier M3 (3.6.1, 3.6.2) | en vigueur (C-18) |
| R-IMP-03 | Le circuit comprend une première relance, une seconde relance, puis une mise en demeure. Les délais entre ces étapes se règlent. | Cahier M3 (3.6.1) ; [[Relances et mise en demeure]] | à trancher : les délais n'ont jamais été fixés (C-18) |
| R-IMP-04 | Chaque relance est datée et conservée. | Cahier M3 (3.6.3) | en vigueur |
| R-IMP-05 | Gerimmo prépare et suit les courriers ; il ne notifie jamais à la place du bailleur. La mise en demeure est à notifier avec preuve de réception ; le bailleur saisit la date de première présentation. | Cahier A3 (A3.1, A3.4, A3.5) ; [[Notification et valeur probante]] | en vigueur |
| R-IMP-06 | Le recommandé électronique est masqué tant qu'aucun service n'est relié à l'espace. Le courrier en PDF reste disponible. | Q10 (confirmée le 24/11/2026) | en vigueur |
| R-IMP-07 | La caution est informée à la seconde relance. | [[Relances et mise en demeure]] (29/09/2026) ; cahier M3 (3.6.4) | à trancher (C-19) |
| R-IMP-08 | Un paiement complet annule les relances prévues. La dette survit à la fin du bail. | Cahier M3 (3.6.5, 3.6.8) | en vigueur |
| R-IMP-09 | Un plan d'apurement étale une dette échue : de 1 à 60 échéances mensuelles, un acompte possible, un seul plan vivant par bail. Il devient caduc après deux échéances manquées (réglage par défaut). | [[Plan d'apurement]] (02/11/2026) | en vigueur |
| R-IMP-10 | Les relances sont suspendues tant que le plan est respecté ; elles reprennent au premier manquement. | Cahier M3 (3.6.6) | remplacée par R-IMP-11 (C-16) |
| R-IMP-11 | Les relances sont suspendues tant que le plan est actif, et aussi quand il est en défaut. Aucun écran ne propose de relance pendant un plan. Pour relancer, on annule le plan. | Q44 (confirmée le 24/11/2026) | en vigueur |
| R-IMP-12 | Une relance envoyée avant l'activation du plan peut encore être consignée. Une relance datée du jour de l'activation ou après ne s'enregistre pas. | Q44 (rectifiée et confirmée le 24/11/2026) | en vigueur |
| R-IMP-13 | Le protocole d'apurement se produit seulement à partir d'un plan enregistré. | Q44 (confirmée le 24/11/2026) | en vigueur |
| R-IMP-14 | Chez un propriétaire, une relance automatique ne part qu'après sa réponse « Pas encore reçu ». | Q24 (24/11/2026, règle existante) | en vigueur |
| R-IMP-15 | Les courriers portent l'adresse du locataire : le logement tant qu'il l'occupe ; ensuite l'adresse qu'il a laissée à l'état des lieux de sortie ; sinon son nom seul. Aucune adresse n'est inventée. | Q42 (confirmée le 24/11/2026) | en vigueur |
| R-IMP-16 | En colocation à bail unique, la relance vise tous les colocataires. | Cahier M3 (parcours 3.6, variante 6) | en vigueur (cahier V3 seul) |

### 3.5 Dépôt de garantie et sortie

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-DG-01 | Le dépôt ne dépasse pas un mois de loyer hors charges en bail nu, deux mois en meublé. | Cahier M2 (2.1.1, 2.1.2) ; [[Dépôt de garantie]] (14/09/2026) | en vigueur |
| R-DG-02 | Le dépôt est suivi comme une somme encaissée. Il n'est jamais révisé en cours de bail. | Cahier M2 (2.1.3, 2.1.5) | en vigueur |
| R-DG-03 | Le délai de restitution part de la remise des clés : un mois sans écart entre les deux états des lieux, deux mois avec écarts. Alertes 7 jours avant la date limite, puis au dépassement. | Cahier M2 (2.4.1, 2.4.2) ; [[Restitution du dépôt de garantie]] (30/08/2026) | en vigueur |
| R-DG-04 | Les impayés sont déduits du dépôt avant les dégradations. | Cahier M2 (2.4.7) | en vigueur |
| R-DG-05 | Chaque retenue subit une décote d'usure selon l'âge de l'élément. Un élément arrivé au bout de sa durée de vie ne donne lieu à aucune retenue. Les durées de vie proposées sont indicatives. | Cahier M2 (2.4.4, 2.4.5) ; [[Vétusté et décote]] ; [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) | en vigueur |
| R-DG-06 | Sans état des lieux d'entrée, aucune retenue n'est possible. | Cahier M1 (1.13.4), M2 (2.4.3) | remplacée par R-DG-07 (C-08) |
| R-DG-07 | Sans état des lieux d'entrée, une retenue reste possible si elle est justifiée ; le décompte le mentionne. | [[Restitution du dépôt de garantie]], [[Vétusté et décote]] (correction du 29/09/2026) | en vigueur ; point de droit dans `JURISTE.md` |
| R-DG-08 | Une retenue sans justificatif est acceptée, avec une alerte. | Cahier M2 (2.4.6) | remplacée par R-DG-09 (C-09) |
| R-DG-09 | Chaque retenue a son justificatif ; un devis suffit. Les deux décomptes (restitution et retenues) suivent la même règle. | Q49 (décision du 24/11/2026) | en vigueur ; reste à appliquer |
| R-DG-10 | Le chiffrage des retenues figure dans les décomptes, pas dans l'état des lieux de sortie signé. | [[Restitution du dépôt de garantie]] (24/11/2026) ; Q49 | en vigueur (C-10) |
| R-DG-11 | Une part du dépôt, 20 % au plus, peut être gardée jusqu'à l'arrêté des charges. | Cahier M2 (2.4.8) | en vigueur |
| R-DG-12 | La pénalité de retard n'est pas calculée par Gerimmo : il alerte seulement. | Cahier M2 (2.4.10) ; [[Restitution du dépôt de garantie]] | en vigueur |
| R-DG-13 | Le décompte détaille chaque retenue : coût, âge, décote, montant. | Cahier M2 (2.7.1) | en vigueur |
| R-DG-14 | Le décompte est figé après son envoi ; une correction produit un décompte rectificatif. | Cahier M2 (2.7.3) | à trancher : l'application dit « figé, sans rectificatif » (C-23) |
| R-DG-15 | Restitution sans retenue : le décompte part par e-mail et dans l'espace. Avec retenues : Gerimmo alerte le bailleur qu'un courrier recommandé est à envoyer, et garde le justificatif avec sa date de première présentation. | [[Restitution du dépôt de garantie]] (décision du 25/07/2026) | en vigueur |
| R-DG-16 | Le décompte et sa date d'envoi sont datés au jour de Paris. | [[Le jour de référence est le jour de Paris]] (16/10/2026) | en vigueur ; interprétation à faire confirmer (voir fin de page) |
| R-DG-17 | Le solde de tout compte réunit toutes les sommes dues de part et d'autre. Il est émis dans les deux sens, et jamais avant l'état des lieux de sortie. | Cahier M3 (3.11.1, 3.11.2, 3.11.4) ; [[Solde de tout compte]] | en vigueur |
| R-DG-18 | Une contestation du locataire passe par la messagerie. | Cahier M2 (parcours 2.5) ; [[Restitution du dépôt de garantie]] | en vigueur |
| R-DG-19 | La caution est rattachée à un bail. Son acte signé conditionne la garantie. Avant de préparer l'acte, le bailleur coche qu'il n'a ni assurance, ni autre garantie (ou qu'il loue à un étudiant ou à un apprenti). | Cahier M2 (2.2.1, 2.2.3) ; [[Garantie]] (24/10/2026) | en vigueur (C-22) ; point de droit dans `JURISTE.md` |
| R-DG-20 | Les garanties d'organismes extérieurs sont seulement enregistrées, sans liaison avec eux. | Cahier M2 (2.3.1) | en vigueur |

### 3.6 États des lieux

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-EDL-01 | La grille de l'état des lieux est tirée des pièces et des équipements du lot. Aucune ligne ne reste sans état. | Cahier M1 (1.12.1, 1.12.2) ; [[État des lieux]] | en vigueur |
| R-EDL-02 | L'état des lieux est figé dès sa signature. | Cahier M1 (1.12.3) | en vigueur |
| R-EDL-03 | L'état des lieux de sortie reprend la grille d'entrée, ligne pour ligne. Chaque écart est mis en évidence. Il constate ; il ne dit pas qui paie. | Cahier M1 (1.13.1 à 1.13.3) | en vigueur |
| R-EDL-04 | Les états des lieux sont signés sur place, hors de la signature électronique. | Cahier M13 (13.1.6), A3 (A3.7) | remplacée par R-EDL-05 (C-03) |
| R-EDL-05 | L'état des lieux se signe dans Gerimmo, avec la confirmation « établi contradictoirement, sur place » à la date de la visite. | [[Signature électronique]], [[État des lieux]] (décision du 23/10/2026) | en vigueur ; valeur de cette signature dans `JURISTE.md` |
| R-EDL-06 | À l'entrée, le locataire est informé de son droit de faire compléter l'état des lieux dans les dix jours. | [[État des lieux]] (24/10/2026) | en vigueur ; délai à confirmer (`JURISTE.md`) |
| R-EDL-07 | Une photo par élément ; elle est imprimée et numérotée dans le document, et figée à la signature. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) | en vigueur |
| R-EDL-08 | Les compteurs sont relevés aux deux états des lieux. Avant la signature, l'index et le nombre de clés sont demandés. Un état des lieux déjà signé sans eux s'imprime « non relevé » ou « non compté ». | Cahier M1 (1.13.5) ; Q49 (24/11/2026) | en vigueur ; faut-il les exiger avant d'enregistrer une signature : à trancher (C-10) |
| R-EDL-09 | L'état des lieux de sortie imprime la date de celui d'entrée, donne la pièce de chaque écart, et porte la date du constat. | [[État des lieux]] (22/11/2026 et 24/11/2026) | en vigueur |
| R-EDL-10 | Pour l'inventaire d'un meublé, seules les dates impossibles sont refusées. | Q47 (confirmée le 24/11/2026) | en vigueur |

### 3.7 Documents générés

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-DOC-01 | Le catalogue du palier 1 compte 46 modèles de documents. Aucun n'est présenté comme conforme. | [[Document]], [[Mission palier 1 — audit du 22 novembre 2026]] (24/11/2026) | en vigueur |
| R-DOC-02 | Les modèles sont fournis par Gerimmo et ne se modifient pas. Un document garde la version du modèle utilisée. | Cahier M12 (12.1.1, 12.1.2, 12.1.6) | en vigueur |
| R-DOC-03 | Un document ne dit que ce que fait l'application : il n'annonce un délai ou un montant que si le dossier le rend vrai. | [[Mission palier 1 — audit du 22 novembre 2026]] (24/11/2026) | en vigueur |
| R-DOC-04 | Chaque « À renseigner » mène à l'écran qui permet de corriger. Aucun document n'est proposé puis refusé pour l'état du dossier. | [[Document]] (24/11/2026) | en vigueur |
| R-DOC-05 | Formats d'impression : index de compteur à la française, étage écrit une seule fois, état du bail « Actif », terme au prorata écrit avec ses dates. | Q41 (confirmée le 24/11/2026) | en vigueur |
| R-DOC-06 | Chaque envoi garde sa date, son canal et son destinataire. Cette trace sert au suivi ; elle ne vaut pas preuve. | Cahier M12 (12.4.1, 12.4.4), A3 (A3.2) ; [[Notification et valeur probante]] | en vigueur |
| R-DOC-07 | L'ordre d'intervention part du donneur d'ordre, avec les heures du créneau et les travaux du devis. Il est refusé sans devis. Il désigne le devis par son auteur, sa version, ses dates et son montant, sans référence. | Q51 (confirmée le 24/11/2026) ; [[Intervention et clôture]] | en vigueur |
| R-DOC-08 | Le comparatif de devis et le récapitulatif d'incident, documents internes, gardent l'en-tête de l'espace. | Q42 (confirmée le 24/11/2026) | en vigueur |
| R-DOC-09 | Quand une seule entreprise a répondu, le comparatif imprime « Un seul devis a été déposé. » | Q58 (24/11/2026, sans réponse) | à trancher (C-35) |
| R-DOC-10 | Un contrat signé de première location renvoie au texte du contrat pour la mention des travaux. | Q53 (confirmée le 24/11/2026) | en vigueur |
| R-DOC-11 | La référence d'un avenant se tire du bail et de son contenu. | Q47 (confirmée le 24/11/2026) | en vigueur |

### 3.8 Signature

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-SIG-01 | La signature se fait hors de Gerimmo, puis le document signé est déposé. | [[Signature électronique]] (décisions du 22/07/2026, du 25/07/2026 et du 27/09/2026) | remplacée par R-SIG-02 (C-01) |
| R-SIG-02 | La signature électronique est proposée en premier, là où elle peut vraiment servir ; la signature sur papier reste toujours possible. | Q11 (décision du 24/11/2026) | en vigueur |
| R-SIG-03 | Le prestataire de signature est Yousign. | Cahier M13 | remplacée par R-SIG-04 (C-02) |
| R-SIG-04 | Le prestataire de signature est Zoho Sign (Europe). | [[Signature électronique]] (décision du 18/10/2026) | en vigueur |
| R-SIG-05 | La signature se fait par un code reçu par SMS. Gerimmo la décrit comme « non qualifiée, sans présomption de fiabilité ». La preuve est le PDF signé et son certificat. | [[Signature électronique]], [[Notification et valeur probante]] (24/10/2026) | en vigueur (C-02) ; valeur dans `JURISTE.md` |
| R-SIG-06 | Peuvent être signés ainsi : le bail, l'avenant, l'acte de cautionnement, l'état des lieux, le protocole d'apurement, l'autorisation de travaux, l'acceptation d'un devis. | [[Signature électronique]] (18/10/2026 et 23/10/2026) | en vigueur |
| R-SIG-07 | La caution et le garant confirment eux-mêmes leur numéro de mobile, par un lien reçu à leur adresse. Ce lien est un e-mail admis. | [[Signature électronique]] (24/10/2026) ; Q19 (confirmée le 24/11/2026) | en vigueur |
| R-SIG-08 | Les signataires signent l'un après l'autre ; le bailleur signe en dernier. | Cahier M13 (13.1.2) | en vigueur (cahier V3 seul) |
| R-SIG-09 | Un signataire n'a pas besoin de compte ; il lui faut une adresse e-mail valide. | Cahier M13 (13.1.3, 13.2.1) | en vigueur |
| R-SIG-10 | Un document ne se modifie pas pendant sa signature. Un circuit préparé mais pas encore envoyé est refusé si le dossier a changé, et se prépare de nouveau. | Cahier M13 (13.2.7) ; Q40 (confirmée le 24/11/2026) | en vigueur |
| R-SIG-11 | Une demande de signature expire au bout de 30 jours. | Cahier M13 (13.4.3) ; [[Signature électronique]] (19/10/2026) | en vigueur |
| R-SIG-12 | Deux relances automatiques partent à 7 jours et à 21 jours ; une alerte prévient à 28 jours. | Cahier M13 (13.4.1, 13.4.2) | à trancher : elles n'existent pas (C-05) |
| R-SIG-13 | L'ancien parcours « télécharger, signer, redéposer » est retiré, après vérification qu'aucune ancienne demande n'est en cours. | Q21 (décision du 24/11/2026) | en vigueur |
| R-SIG-14 | Le service de signature électronique est sous interrupteur ; son ouverture est un réglage du jour de la publication. | Q11 (24/11/2026) | en vigueur |

### 3.9 Incidents et interventions

Les règles des incidents sont en partie 2.4 (R-INC). Voici celles des rendez-vous et de l'intervention.

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-RDV-01 | L'artisan propose au moins trois créneaux. Si le locataire les refuse tous, il en propose trois à son tour. Après six créneaux refusés, le bailleur arbitre et saisit le rendez-vous convenu. | Cahier M10 (10.1.2, 10.2.2, 10.4.1, 10.4.2) ; [[Planification d'intervention]] | en vigueur |
| R-RDV-02 | Aucun créneau ne peut être proposé dans le passé. Tous les créneaux proposés et refusés sont gardés. | Cahier M10 (10.3.2, 10.4.3) | en vigueur |
| R-RDV-03 | Un report relance un cycle complet de propositions. | Cahier M10 (10.5.1) | remplacée par R-LOC-12 et R-ART-15 (C-33) |
| R-RDV-04 | Un rappel part la veille de chaque rendez-vous. | Cahier M10 (10.7.1) ; Q6 (décision du 24/11/2026) | en vigueur, sous l'interrupteur de R-ADM-12 |
| R-RDV-05 | Un rappel part aussi sept jours avant, si le rendez-vous a été pris plus de sept jours à l'avance. | Cahier M10 (10.7.2) | en vigueur (cahier V3 seul) |
| R-RDV-06 | Un rendez-vous manqué se consigne une fois l'heure passée : qui était absent, et qui le dit. L'artisan ne peut consigner que l'absence du locataire ; le bailleur, celle de l'un ou de l'autre. | Q32 (confirmée le 24/11/2026) | en vigueur |
| R-RDV-07 | Une annulation par le bailleur demande un motif. | Cahier M10 (10.5.4) | en vigueur (cahier V3 seul) |
| R-RDV-08 | L'intervention suit sept états. Elle se clôt selon trois motifs. | [[Intervention et clôture]] (22/11/2026) | en vigueur |
| R-RDV-09 | Le compte rendu d'intervention est celui que saisit l'artisan ; un PDF le reprend sans le valider. | [[Intervention et clôture]] (22/11/2026 et 24/11/2026) | en vigueur ; un rapport officiel avec validation n'est pas décidé (voir partie 6) |

### 3.10 Artisans : devis, factures, évaluations

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-DEV-01 | Deux artisans au plus sont sollicités en même temps. | Cahier M9 (9.1.1) ; [[Devis]] | en vigueur |
| R-DEV-02 | Un seul devis peut suffire, avec un signal visible qu'il n'y a pas eu de mise en concurrence. | [[Devis]] (décision du 25/07/2026) | en vigueur ; ce que le document imprime : à trancher (C-35) |
| R-DEV-03 | Le bailleur est alerté sept jours avant l'expiration d'un devis. Un devis expiré ne peut plus être retenu. Un seul devis signé reste valable par dossier. | Cahier M9 (9.2.2, 9.2.3) ; [[Devis]] (19/10/2026) | en vigueur |
| R-DEV-04 | La comparaison montre la note de l'artisan à côté du montant. | Cahier M9 (9.3.1) | en vigueur |
| R-DEV-05 | Les artisans non retenus sont prévenus automatiquement. | Cahier M9 (9.4.1) | en vigueur (cahier V3 seul) |
| R-DEV-06 | Le bailleur déclare le règlement d'une facture validée (date, moyen). Gerimmo ne paie rien. | [[Intervention et clôture]] (décision du 14/10/2026) | en vigueur |
| R-DEV-07 | Une facture mise à la charge du locataire devient une somme due sur son bail. | Cahier M9 (9.8.3) | à trancher : la règle du 14/10/2026 n'en crée aucune (C-30) |
| R-DEV-08 | Le bailleur note l'artisan sur trois critères : qualité, délai, prix. Une seule évaluation par personne et par intervention. Son commentaire reste privé. | Cahier M11 (11.2.1 à 11.2.3) ; [[Intervention et clôture]] (22/11/2026) | en vigueur |
| R-DEV-09 | La note d'un artisan compte à partir de trois évaluations ; avant, il paraît sans note. À égalité, l'ordre est alphabétique. Aucun artisan ne paie pour être mieux classé. | [[Artisan]] (24/10/2026) ; cahier M11 (11.4.1, 11.4.2) | en vigueur (C-31) |
| R-DEV-10 | La note finale mêle trois sources : le bailleur pour moitié, le locataire pour un quart, une fiabilité calculée pour un quart. Les absences de l'artisan pèsent sur cette fiabilité. | Cahier M10 (10.5.3), M11 (11.3) ; [[Artisan]] (24/07/2026) | remplacée par R-DEV-11 (C-31) |
| R-DEV-11 | Aucun indicateur de fiabilité n'entre dans la note. Les rendez-vous manqués sont comptés et montrés à l'artisan, sans peser sur sa note. | Q32 (confirmée le 24/11/2026) | en vigueur |
| R-DEV-12 | Quand une note est retirée, seul son auteur en lit le motif. L'artisan ne lit rien. | Q20 (décision du 24/11/2026 et choix pris sur délégation) | en vigueur (C-32) |

### 3.11 Comptabilité et fiscalité

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-CPT-01 | Gerimmo tient un journal de ce que le bailleur déclare. Ce n'est pas une comptabilité réglementée, et Gerimmo le dit. | Cahier M4 (4.0.1, 4.0.2), A6 (A6.1) ; [[Comptabilité]] (confirmé le 10/09/2026) | en vigueur |
| R-CPT-02 | Une écriture ne se modifie jamais. Une erreur se corrige par une écriture contraire, avec un motif. | Cahier A6 (A6.3, A6.4, A6.6), M4 (4.4.3) | en vigueur |
| R-CPT-03 | Chaque écriture porte deux dates : celle de la pièce et celle de son inscription. | Cahier M4 (4.1.2) | en vigueur |
| R-CPT-04 | Une recette naît d'un paiement reçu. Un loyer appelé mais non reçu n'est pas une recette. | Cahier M4 (4.2.1, 4.3.2) | en vigueur |
| R-CPT-05 | Clore une période la verrouille. Pour un propriétaire, la clôture est conseillée, pas imposée. | Cahier M4 (4.4.1, 4.5.2) ; [[Propriétaire bailleur]] (30/08/2026) | en vigueur |
| R-CPT-06 | L'export du journal est disponible à tout moment. En cas d'écart, c'est le relevé de banque qui fait foi. | Cahier A6 (A6.2, A6.10), M4 (4.6.1) | en vigueur |
| R-CPT-07 | Le récapitulatif fiscal réunit l'année civile, rubrique par rubrique de la déclaration 2044, pour la location nue. Il est à recopier : Gerimmo ne déclare rien à la place du bailleur. | Cahier M6 (6.4.1, 6.4.2, 6.4.7) ; [[Fiscalité]] (décision du 25/07/2026) | en vigueur (C-46) ; règles fiscales non confrontées à une source officielle |
| R-CPT-08 | Le fonds de travaux de la copropriété est signalé à part. Les intérêts d'emprunt sont à compléter par le bailleur. | Cahier M6 (6.4.4, 6.4.5) ; [[Propriétaire bailleur]] (30/08/2026) | en vigueur |
| R-CPT-09 | Les provisions de charges ne sont pas comptées en recette, ni la taxe d'ordures ménagères en charge déductible. | [[Fiscalité]] (correction du 29/09/2026) | en vigueur |
| R-CPT-10 | Les autres régimes (meublé, société) ne sont pas couverts par le récapitulatif. | [[Fiscalité]] (décisions du 25/07/2026 et du 04/09/2026) | en vigueur |
| R-CPT-11 | Le plafond et l'abattement du micro-foncier cités à l'écran (15 000 € et 30 %) portent leur date de vérification et leur source. | Q38 (décision du 24/11/2026) | en vigueur ; date et source enregistrées le 26/11/2026 à 06:00Z (réglage R4 : 15 000 €, 30 %, « BOFiP BOI-RFPI-DECLA-10, version en vigueur du 06/03/2025 (bofip.impots.gouv.fr), relue le 26/11/2026 ») |
| R-CPT-12 | Une reprise de comptes se retrouve après un rechargement et peut être abandonnée. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) | en vigueur |
| R-CPT-13 | Honoraires, comptes par mandat, rapport de gestion, versement au propriétaire. | Cahier M4 (4.2.2, 4.3.1), M5, M6 (6.1 à 6.3) | palier 2 |

### 3.12 Données personnelles et sécurité

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-RGPD-01 | Les données d'un espace ne sont jamais visibles d'un autre espace. | Cahier A1 (A1.6, A1.7, A1.10) ; [[Isolation multi-organisation]] | en vigueur |
| R-RGPD-02 | Toute durée de conservation répond à un but écrit. Rien n'est gardé « pour toujours » sans raison écrite. Au bout de sa durée, une donnée est supprimée, rendue anonyme, ou gardée pour un motif écrit. | Cahier A2 (A2.1 à A2.4) ; [[Archivage plutôt que suppression]] | en vigueur (C-21) |
| R-RGPD-03 | Durées du catalogue : pièces et actes du bail, 36 mois après la fin du bail ; quittances, 36 mois (10 ans si aucun bail n'y est rattaché) ; diagnostics, 5 ans après la fin de gestion du bien ; dossier d'incident, 24 mois après sa clôture ; journal des actions, 12 mois ; preuve du contrat d'abonnement, 10 ans ; factures, 6 ans. | [[Durées de conservation]] (24/10/2026) | en vigueur (C-21) ; durées non confirmées par un texte lu |
| R-RGPD-04 | Aucune règle de conservation n'est activée pendant la mission. | Q39 (décision du 24/11/2026) | en vigueur |
| R-RGPD-05 | Un litige gèle la suppression des données concernées. | Cahier A2 (A2.7), M0b (0b.8.3) ; [[Durées de conservation]] (24/10/2026) | en vigueur |
| R-RGPD-06 | Une demande sur les données personnelles reçoit une réponse dans le mois. | [[Demandes sur les données et fermeture de compte]] (24/10/2026) | en vigueur ; délai dans `JURISTE.md` |
| R-RGPD-07 | Un compte peut être fermé sur demande ; ses données sont alors effacées, sauf ce qui doit être gardé comme preuve. | [[Fermeture de compte]] (24/10/2026) | en vigueur (C-21) |
| R-RGPD-08 | Un compte sans connexion ni abonnement pendant 24 mois est supprimé, après deux avertissements. | [[Fermeture de compte]], [[Cycle de vie de l'abonnement]] (24/10/2026) | en vigueur, règle encore inactive |
| R-RGPD-09 | Jamais d'e-mail commercial à un particulier sans son accord. Un artisan peut être contacté si son adresse vient de lui, avec un moyen de s'y opposer dans chaque message. | [[Prospection commerciale]] (décision du 23/10/2026) | en vigueur |
| R-RGPD-10 | Les prestataires qui reçoivent des données sont déclarés. Ce qui part vers le fournisseur d'intelligence artificielle est dit dans la page de confidentialité et dans la liste des prestataires. | Cahier A4 (A4.13) ; [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) | en vigueur |
| R-RGPD-11 | Tout fichier déposé passe par un antivirus. | Cahier A4 (A4.8) | remplacée pour l'instant par R-RGPD-12 (C-47) |
| R-RGPD-12 | Pas d'antivirus maintenant. « Antivirus à installer » reste noté comme point à ne pas oublier. | Q8 (décision du 24/11/2026) | en vigueur |
| R-RGPD-13 | Le mot de passe a au moins 12 caractères. Le type réel d'un fichier est vérifié. Aucun fichier n'est lisible par son adresse directe. | Cahier A4 (A4.3, A4.9, A4.10) ; [[Socle de sécurité]] | en vigueur |
| R-RGPD-14 | Aucun délégué à la protection des données n'est désigné ; le référent est le dirigeant. | [[Registre des traitements]] (24/10/2026) | en vigueur ; à réévaluer au palier 2 |
| R-RGPD-15 | Un test de restauration des sauvegardes est fait et documenté. | Cahier A4 (A4.12) ; [[Plan de reprise d'activité]] | à trancher : une fois par an ou une fois par trimestre (C-48) |

### 3.13 Abonnement et vente du service

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-ABO-01 | Formules pour les particuliers et les sociétés qui gèrent leurs propres biens : Solo (1 bien) 5,99 € par mois ; Bailleur (jusqu'à 3) 9,99 € ; Investisseur (jusqu'à 10) 19,99 € ; Patrimoine (jusqu'à 20) 29,99 € ; 1 € de plus par bien au-delà. Paiement annuel : dix mois pour douze. | [[Grille tarifaire]] (décision du 28/09/2026) | en vigueur (C-49) |
| R-ABO-02 | Chaque lot loué séparément compte pour un bien. | [[Grille tarifaire]] (décision du 28/09/2026) | en vigueur |
| R-ABO-03 | Aucun bien n'est offert à vie. L'essai est sans carte : deux mois pour toute inscription jusqu'au 31/12/2026, un mois ensuite. | [[Grille tarifaire]] (décisions du 28/09/2026 et du 30/09/2026) | en vigueur (C-49) |
| R-ABO-04 | À la fin de l'essai, sans paiement, l'espace est gelé en lecture seule : il reste consultable et exportable. | [[Cycle de vie de l'abonnement]] (décision du 28/09/2026) ; cahier M18 (18.4.2) | en vigueur |
| R-ABO-05 | Une hausse de formule n'est appliquée qu'après présentation du nouveau montant et confirmation. Une baisse s'applique à l'échéance. | [[Grille tarifaire]] (28/09/2026) | en vigueur |
| R-ABO-06 | Gerimmo compte ; le prestataire de paiement encaisse et émet les factures. | Cahier M18 (18.6.9) ; [[Abonnement]] | en vigueur |
| R-ABO-07 | Le vendeur est un entrepreneur individuel, sous le nom commercial SAUVEXPERT ; son adresse est publiée. Les mentions légales, les conditions de vente et les factures d'abonnement s'alignent sur ces informations. | Décisions du 24/11/2026 (matin, puis complément du soir) | en vigueur (C-50) ; identité saisie le 26/11 (réglage R1) : `/mentions-legales` l'affiche (forme « Entrepreneur individuel (EI) », sans le nom commercial) ; `/conditions` et `/confidentialite` portent le nom et l'adresse ; alignement partiel : nom commercial absent, en-tête des factures chez Stripe (R7) pas encore fait |
| R-ABO-08 | Les factures portent « TVA non applicable », pour l'instant. | [[Grille tarifaire]] (décision du 28/09/2026) ; décision du 24/11/2026 (soir) | en vigueur |
| R-ABO-09 | Les ventes peuvent s'ouvrir sans médiateur de la consommation désigné. Ses coordonnées seront saisies quand il le sera. | Décision du 24/11/2026 (soir) | en vigueur, avec un risque signalé ; à trancher (C-51) |
| R-ABO-10 | À la souscription : un récapitulatif avec le droit de rétractation, une case de demande expresse, une confirmation envoyée une fois. | [[Souscription de l'abonnement]] (24/10/2026) | en vigueur ; points de droit dans `JURISTE.md` |
| R-ABO-11 | La rétractation se fait en ligne, pour toutes les formules, pendant 14 jours, avec remboursement intégral. | [[Rétractation en ligne]] (24/10/2026) | en vigueur (C-52) |
| R-ABO-12 | La résiliation se fait par un seul chemin, la page « Résilier votre contrat ». Elle prend effet à la fin de la période payée. | [[Résiliation de l'abonnement]] (24/10/2026) | en vigueur (C-53) |
| R-ABO-13 | Un abonnement impayé reçoit un courrier le jour même, des rappels, puis passe en lecture seule au bout de 15 jours. La résiliation n'intervient pas avant 30 jours. Rien n'est supprimé. | [[Impayé de l'abonnement]] (24/10/2026) ; cahier M18 (18.6.10) | en vigueur |
| R-ABO-14 | Un changement des conditions qui ajoute ce qui part chez le fournisseur d'intelligence artificielle crée une nouvelle version, que chaque client accepte expressément. | Q15 (décision du 24/11/2026) | en vigueur ; conditions du 24/11/2026 (annexe 1, accord exprès) en production depuis le 25/11/2026 et archivées le 26/11 à 05:56Z (réglage R2) ; voir [[Conditions générales]] |
| R-ABO-15 | Le parrain reçoit un mois offert quand son filleul paie sa première facture. Rien de plus pour le filleul. | [[Parrainage]] (décision du 30/09/2026) | en vigueur |
| R-ABO-16 | Les abonnements payants s'ouvrent par un réglage, sans nouvelle publication. Gerimmo passe en « mode commercial » à la publication. | Q7, Q16 (décisions du 24/11/2026) | en vigueur |
| R-ABO-17 | Essai de 14 jours ; abonnement seulement mensuel ; frais de mise en route ; redevance annuelle. | Cahier M18 (18.6.1, 18.6.6 à 18.6.8) | remplacée par R-ABO-01 et R-ABO-03 (C-49) |
| R-ABO-18 | Tarifs des agences ; liste d'attente des agences. | [[Grille tarifaire]], [[Liste d'attente des agences]] | palier 2 |

### 3.14 Intelligence artificielle

| N° | Règle | Source (date) | Statut |
|---|---|---|---|
| R-IA-01 | Le super admin coupe toute l'intelligence artificielle d'un seul réglage. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) | en vigueur |
| R-IA-02 | Gerimmo est entièrement utilisable intelligence artificielle coupée : chaque fonction qui s'en sert garde son équivalent à la main. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) | en vigueur |
| R-IA-03 | Le cœur du métier n'appelle jamais l'intelligence artificielle. La déclaration d'incident est un formulaire ; le créneau se choisit à la main. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) | en vigueur |
| R-IA-04 | À la publication, l'interrupteur est sur « activée ». | Q12 (confirmée le 24/11/2026) | en vigueur |
| R-IA-05 | Quand aucun appel ne peut partir, les écrans proposent directement la saisie à la main, au lieu d'un bouton qui échoue. | Q16 (24/11/2026) | en vigueur |
| R-IA-06 | Intelligence artificielle coupée, la préparation automatique des posts est suspendue, sans erreur. Un article se crée et se publie à la main. | Q17 (confirmée le 24/11/2026) | en vigueur |
| R-IA-07 | La mention « Rédigé avec l'aide de l'IA » figure sur la page de l'article et à la fin du post, pas sur les listes d'articles. Un article écrit entièrement à la main ne la porte pas. | Q13 (décision du 24/11/2026 et choix pris sur délégation) | en vigueur |
| R-IA-08 | Les appels payants sont plafonnés par jour (R-SA-10). Sous arrêt ou plafond atteint, l'appel n'a pas lieu et l'écran le dit. | [[Super Admin]] (15/10/2026) | en vigueur |
| R-IA-09 | Ce qui part vers le fournisseur est déclaré (R-RGPD-10, R-ABO-14). | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) ; Q15 | en vigueur |

### 3.15 Super admin

Les règles du super admin sont en partie 2.6 (R-SA-01 à R-SA-23). Voici ses réglages du jour de la publication : les
décisions du 24/11/2026 disent leur position.

| Réglage | Position à la publication | Source |
|---|---|---|
| Intelligence artificielle | Activée | Q12 |
| Mode de fonctionnement | Commercial | Q16 |
| Cinq envois automatiques d'e-mails | Ouverts | Q6, Q37 |
| Relance de loyer envoyée à la main | Ouverte | Q24 |
| Signature électronique | À ouvrir ce jour-là | Q11 |
| Ventes d'abonnements | Ouvrables par réglage, même sans médiateur | Q7, complément du soir |
| Fabrication de la facture de l'artisan | Fermée, reportée | Q14, complément de la nuit |
| Règles de conservation | Aucune nouvelle activation | Q39 |
| Publication elle-même | Seulement après le message « je valide la publication », directement en production | Règles générales ; complément de la nuit (Q1) |

> [!note] 26/11/2026 — positions réelles après la publication
> La publication est faite le 25/11/2026, après le message du dirigeant « Je valide la publication » : version
> `062296e2` en production depuis 23:17Z (PR #358, `main` = `8f9dd9ce` ; `log.md`, entrée « deploy » du 25/11/2026).
> Les positions du tableau ci-dessus sont des **décisions** du 24/11, pas l'état de la production. Au 26/11 (06:10Z) :
> - les **cinq envois automatiques** et la **relance de loyer envoyée à la main** restent **fermés** tant que le
>   dirigeant ne les ouvre pas dans la console (réglage R5 du plan de publication, pas encore fait) ;
> - l'**intelligence artificielle** est **activée** (vérifié en base, réglage R3 ; libellé de la console non relu) ;
> - les **ventes d'abonnements** restent **fermées** : l'ouverture des souscriptions (R8) n'est pas décidée, et la vente
>   aux particuliers sans médiateur (R6) n'est pas ouverte ;
> - le **mode commercial** est déduit de la construction réussie, pas lu directement (plan de publication, R3 :
>   « SUPPOSÉ ») ;
> - la **signature électronique** : sa position en production n'est pas relue au 26/11 ([[Signature électronique]]).
>
> Sources : `JOURNAL.md`, entrée du 26/11/2026 (matin) ; `livrables/PLAN-DE-PUBLICATION.md`, § 4.

## 4. Les décisions du 24/11/2026 intégrées

**Options confirmées sans changement** (« rien ne change ») : Q3, Q4, Q10, Q12, Q17, Q19, Q22, Q25, Q26, Q29, Q30,
Q31, Q32, Q33, Q35, Q40, Q41, Q42, Q44, Q45, Q47, Q48, Q51, Q53. Celles qui portent une règle métier sont reprises
dans les tableaux : Q10 (R-IMP-06), Q12 (R-IA-04), Q17 (R-IA-06), Q19 (R-SIG-07), Q22 (R-BAIL-14), Q25 (R-ART-24),
Q26 (R-INC-02), Q29 (R-LOC-13), Q30 (R-ART-12), Q31 (R-ART-21), Q32 (R-DEV-11), Q33 (R-PROP-15), Q35 (R-PROP-16),
Q40 (R-SIG-10), Q41 (R-DOC-05), Q42 (R-PROP-17), Q44 (R-IMP-11), Q45 (R-PROP-18), Q47 (R-EDL-10), Q51 (R-DOC-07),
Q53 (R-DOC-10). Q3, Q4 et Q48 sont des points d'organisation, sans règle métier.

| Décision | Ce qu'elle change dans le référentiel |
|---|---|
| Règles générales | Rien n'est noté « conforme » sans texte officiel lu. Une question nouvelle reçoit l'option la plus prudente et réversible. Rien n'est publié avant « je valide la publication ». |
| Q1 (annulée dans la nuit) | Pas de copie de base : publication directe en production. Aucune règle métier. |
| Q2 | Cette page existe. Elle devient le référentiel unique du palier 1. |
| Q5 | Les textes officiels sont relus quand ils sont accessibles ; les écarts confirmés sont corrigés. Aucun article de loi n'a encore pu être lu mot à mot : aucune règle de cette page n'est donc présentée comme conforme. |
| Q6 | Les quatre envois automatiques sont ouverts à la publication (R-ADM-12). |
| Q7 et compléments du soir | Vendeur, adresse, mention de TVA, ouverture des ventes sans médiateur (R-ABO-07 à R-ABO-09, R-ABO-16). |
| Q8 | Pas d'antivirus maintenant (R-RGPD-12, qui suspend la règle A4.8 du cahier). |
| Q9 (« pas encore ») | Clé des sauvegardes à créer avec le dirigeant ; une sauvegarde neuve avant la publication (R-SA-21). |
| Q11 | Signature électronique proposée en premier, papier toujours possible (R-SIG-02). |
| Q13 et complément | Parution automatique gardée ; mention « Rédigé avec l'aide de l'IA » (R-SA-17, R-IA-07). |
| Q14 et report de la nuit | Gerimmo fabriquera la facture de l'artisan, sous conditions ; reporté après la publication (R-ART-20). |
| Q15 | Nouvelle version des conditions, avec accord exprès du client (R-ABO-14). |
| Q16 | Mode commercial à la publication (R-ABO-16, R-IA-05). |
| Q18 | Menu court ; liens Statistiques et Journal sur le tableau de bord (R-PROP-13). |
| Q20 et complément | Motif du retrait d'une note : lu par son auteur seulement, jamais par l'artisan (R-LOC-16, R-DEV-12). |
| Q21 | Ancien parcours de signature retiré (R-SIG-13). |
| Q23 | Rappels et date limite de la révision du loyer, refus au-delà (R-REV-06, R-REV-07, R-REV-12). |
| Q24 | Accord des espaces conservé ; relance à la main ouverte (R-ADM-13). |
| Q27 et Q50 | Vérification en lecture seule : aucun appel de charges ni régularisation n'existe ; aucune liste à faire. Aucune règle métier. |
| Q28 | Le diagnostic à la date d'établissement la plus récente décide, après lecture du texte ; d'ici là, un avertissement (R-BAIL-13). |
| Q34 | Date limite de révision au calendrier (R-PROP-14, R-REV-14). |
| Q36 | Rien n'est supprimé pendant la mission ; le ménage et le mode de règlement « CAF / APL » partent dans un lot à part après la publication. La liste d'attente des agences n'est jamais touchée. |
| Q37 | Cinquième envoi automatique, avec son interrupteur, ouvert à la publication (R-ADM-12). |
| Q38 | Repères fiscaux contrôlés ; date et source à enregistrer (R-CPT-11, R-SA-14). |
| Q39 | Textes à relire et à corriger ; aucune règle de conservation activée (R-RGPD-04, R-SA-15). |
| Q43 | La révision s'applique au premier terme qui suit la demande (R-REV-11). |
| Q46 | Notice officielle entière ; en attendant, dépôt par le bailleur et envoi bloqué sans elle (R-BAIL-18). |
| Q49 | Chaque retenue a son justificatif, un devis suffit ; les deux décomptes alignés (R-DG-09). |
| Q52 | L'adresse de l'espace reste sur la quittance lue en ligne (R-LOY-09). |
| Q64 (nuit) | Les deux comptes du 19/11 sont des comptes de test. Aucune règle métier. |
| Q62 (nuit) | Un texte n'est tenu pour « lu » que s'il vient de la source officielle, avec son adresse et sa date de version. |

## 5. Registre des contradictions

« Reste à trancher ? » : **oui** quand une décision du dirigeant manque ; **juriste** quand seul un point de droit
reste ouvert (il est dans `JURISTE.md`) ; **non** quand la décision la plus récente règle la question.

| N° | Sujet | Ce que dit le cahier V3 (module, date) | Ce que dit le wiki (page, date) | Décision retenue (la plus récente) et pourquoi | Reste à trancher ? |
|---|---|---|---|---|---|
| C-01 | Signature : électronique ou papier | M0 (24/07/2026) : hors plateforme. M1 et M13 (24/07/2026) : électronique dès la première version. | [[Signature électronique]] : hors plateforme d'abord (22/07 et 25/07/2026) ; lancement sans signature électronique (27/09/2026) ; « il faut faire la signature » (18/10/2026). | Q11 du 24/11/2026 : électronique proposée en premier, papier toujours possible. C'est la décision la plus récente. | Non |
| C-02 | Prestataire et nature de la signature | M13 (13.1.1) : Yousign, « signature simple ». | [[Signature électronique]], [[Notification et valeur probante]] (18/10 et 24/10/2026) : Zoho Sign ; « non qualifiée, sans présomption de fiabilité ». | Le wiki, plus récent. | Juriste (valeur de la signature par code SMS) |
| C-03 | Signature de l'état des lieux | M13 (13.1.6), A3 (A3.7) : signé sur place, hors signature électronique. | [[État des lieux]] (décision du 23/10/2026) : signé dans Gerimmo, avec la confirmation « sur place ». | Décision du dirigeant du 23/10/2026, plus récente. | Juriste |
| C-04 | Activation du bail après signature | M1 (1.7.1), M13 (13.2.4) : la réception du bail signé fait passer le lot en « loué » et lance la suite, seule. | [[Signature électronique]] (19/10/2026) : la réception est automatique, mais l'activation reste une confirmation du propriétaire. | Le wiki, plus récent. Aucune décision écrite du dirigeant ne le dit. | Oui |
| C-05 | Relances d'une signature en attente | M13 (13.4.1, 13.4.2) : relances à 7 et 21 jours, alerte à 28 jours. | [[Signature électronique]] (19/10/2026) : aucune relance automatique n'existe. | Aucune : le cahier n'est ni repris ni écarté. | Oui |
| C-06 | Date d'effet de la révision du loyer | M3 (parcours 3.8) : à la date anniversaire. | [[Révision annuelle IRL]] (29/09/2026) : à la date de la demande si elle est tardive. | Q43 du 24/11/2026 : premier terme qui suit la demande. Elle remplace les deux. La fiche officielle lue le 24/11 dit « à partir de la date de la demande » : la règle retenue est différente, et plus favorable au locataire. | Juriste |
| C-07 | Origine de l'indice de révision | M3 (3.8.3) : saisi à la main, pas de récupération automatique. | [[Révision annuelle IRL]] reprend le cahier ; [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) : l'indice se cherche chez l'Insee, ou se saisit. | Le wiki du 22/11/2026, plus récent. La page [[Révision annuelle IRL]] garde l'ancienne phrase. | Non |
| C-08 | Retenue sans état des lieux d'entrée | M1 (1.13.4), M2 (2.4.3) : aucune retenue possible. | [[Restitution du dépôt de garantie]], [[Vétusté et décote]] (29/09/2026) : retenue justifiée admise. | Le wiki du 29/09/2026, plus récent. | Juriste |
| C-09 | Retenue sans justificatif | M2 (2.4.6) : acceptée, avec une alerte. | [[Restitution du dépôt de garantie]] (24/11/2026) : « Non fourni » sur un décompte, blocage sur l'autre. | Q49 du 24/11/2026 : chaque retenue a son justificatif, un devis suffit. | Non (reste à appliquer) |
| C-10 | Contenu de l'état des lieux de sortie | Rien de net. | [[État des lieux]] (01/08/2026) : le chiffrage des dégradations fait partie de l'état des lieux de sortie. Même page (24/11/2026) : il n'y figure plus ; état signé sans index ni clés imprimé « non relevé ». | Le wiki du 24/11/2026. La décision Q49 ne répond qu'à l'alignement des décomptes. | Oui (chiffrage visible à côté de l'état des lieux ? index et clés exigés avant signature ?) |
| C-11 | Diagnostic expiré et bail déjà en cours | M0 (0.6.3), M1 (1.1.2) : un diagnostic expiré bloque le bail. | [[Diagnostic]], [[Bail]] (décisions des 20/11 et 22/11/2026) : pas de blocage pour un bail déjà en cours ; classe G en simple alerte. | Décisions de novembre, plus récentes. | Juriste (effet sur un bail en cours non établi) |
| C-12 | Lequel de plusieurs diagnostics décide | Rien. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) : le dernier enregistré. | Q28 du 24/11/2026 : la date d'établissement la plus récente, après lecture du texte ; d'ici là, un avertissement. | Juriste (aucune page officielle lue ne le dit) |
| C-13 | Alerte d'état des lieux d'entrée | M1 (1.7.3) : la signature déclenche l'alerte. | [[Bail]] (décision du 22/11/2026) : pas d'alerte pour un bail repris en cours. | Décision du 22/11/2026, pour ce seul cas. | Non |
| C-14 | Début du suivi des loyers | M3 (3.1.1) : échéancier créé au bail signé, depuis l'entrée. | [[Bail]] (décision du 21/11/2026) : pour un bail repris, depuis le mois de l'activation. | Décision du 21/11/2026, pour ce seul cas. Dette d'avant, dépôt déjà versé et indice déjà révisé restent sans réponse. | Oui (voir partie 6) |
| C-15 | Adresse du bailleur sur la quittance | Rien de net. | [[Quittance conforme]] (24/11/2026) : hors agence, quittance émise par les bailleurs avec leur adresse ; mais la quittance lue en ligne garde l'adresse de l'espace. | Q52 du 24/11/2026 : l'adresse de l'espace reste en ligne. Le PDF reste différent. | Oui (Q74) |
| C-16 | Relances pendant un plan d'apurement | M3 (3.6.6) : suspendues tant que le plan est respecté. | [[Plan d'apurement]] (24/11/2026) : suspendues aussi quand le plan est en défaut. | Q44, confirmée le 24/11/2026. | Non |
| C-17 | Banque et loyers | M3 (3.3.1), A6 (A6.8) : saisie à la main, aucune liaison bancaire. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) : pointage à partir d'un relevé exporté. | Les deux tiennent : le relevé est lu sur l'appareil et chaque ligne est confirmée à la main. Q33 confirmée le 24/11/2026. | Non |
| C-18 | Seuil et délais des relances | M3 (3.6.1, 3.6.2) : montant plancher et délais réglés par agence. | [[Relances et mise en demeure]] : plancher d'environ 50 € lu dans le référentiel ; seuil de 5 € par défaut (29/09/2026) ; trois délais « à fixer ». | Seuil de 5 € par défaut, plus récent. Les délais ne sont fixés nulle part. | Oui |
| C-19 | Information de la caution d'un impayé | M3 (3.6.4) : selon le réglage de l'agence. | [[Relances et mise en demeure]] (29/09/2026) : à la seconde relance. [[Plan d'apurement]] : un texte cité parle du premier incident non régularisé. | Seconde relance, faute de mieux. | Juriste |
| C-20 | Avis d'échéance après l'échéance | Rien de net. | [[Quittancement des loyers]] (18/09/2026) : l'avis annonce, il ne relance pas. Même page (24/11/2026) : après l'échéance, il rappelle le total dû. | Le wiki du 24/11/2026. | Juriste |
| C-21 | Durées de conservation | M0 (0.6.5), M0b (0b.8.1), M3 (3.12.1), M8 (8.5.6), M18 (18.5.2) : diagnostics et journal gardés « indéfiniment », dossier du locataire 5 ans, quittances « sans limite ». M0 (0.9.1) : on archive, on ne supprime jamais. A2 (même date) corrige déjà : pas d'indéfini. | [[RGPD]] (25/07/2026) : quittances 10 ans, journal 3 ans. [[Durées de conservation]] (24/10/2026) : 36 mois après la fin du bail, journal 12 mois ; fermeture de compte et effacement. | Le catalogue du 24/10/2026, le plus récent. Q39 du 24/11/2026 : aucune règle n'est activée pendant la mission. | Juriste (durées non confirmées) |
| C-22 | Plusieurs garanties sur un même bail | M2 (2.3.2, 2.3.3) : plusieurs garanties peuvent coexister ; une garantie d'organisme peut remplacer le dépôt. | [[Garantie]] (14/10 et 24/10/2026) : l'acte de caution ne se prépare plus sans la case « aucune autre garantie » ; enregistrer plusieurs garanties reste possible. | Le wiki du 24/10/2026, traitement partiel. | Juriste |
| C-23 | Correction d'un décompte envoyé | M2 (2.7.3) : une correction produit un décompte rectificatif. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) : l'écran dit que le décompte est figé, sans rectificatif. | Aucune décision. | Oui |
| C-24 | Revoir « qui paie » après le diagnostic | M7 (7.2.6, 7.5.3) : révisable après le diagnostic de l'artisan. | [[Incident]] (23/08 et 10/09/2026) : révisable seulement avant le départ en intervention. | Le wiki, plus récent ; la contradiction y est notée « à trancher » depuis le 10/09/2026. | Oui |
| C-25 | Description à la déclaration d'un incident | M7 (7.1.2) : description obligatoire. M19 (19.2.2) : la photo d'abord, sans autre saisie obligatoire. | [[État du projet et décisions ouvertes]] (décision du 21/08/2026) : description obligatoire. | Décision du 21/08/2026. | Non |
| C-26 | Pièces exigées de l'artisan | M8 (8.2.2, 8.2.3) : seule la décennale bloque, selon les travaux ; les autres pièces alertent. | [[Artisan]] (décisions du 04/09 et du 27/09/2026) : inscription validée seulement avec décennale et responsabilité civile professionnelle. | Les deux tiennent : le wiki pour valider l'inscription, le cahier pour proposer un artisan selon les travaux. | Non |
| C-27 | Qui inscrit l'artisan | M8 : l'agence crée la fiche par le SIRET. A1 : pas de validation par le super admin. | [[Artisan]] (04/09/2026) : il s'inscrit seul et le super admin valide. [[Invitation d'un artisan par un propriétaire]] (15/10/2026) : le propriétaire invite par e-mail. | Décisions du 04/09 et du 15/10/2026. | Non |
| C-28 | Ouverture du réseau d'artisans | M8 (8.1.3, 8.4.3) : zone par codes postaux ; un changement de métier est validé par l'agence. | [[Ouverture du réseau d'artisans]] : ouverture commune par commune par le super admin (28/09/2026) ; puis zone et métiers choisis par l'artisan seul (décision du 23/10/2026). | Décision du 23/10/2026. La décision disait « communes » ; la zone se choisit par code postal ou département (écart accepté le 23/10/2026). | Non |
| C-29 | Coordonnées de l'artisan et exclusion du réseau | M8 (8.5.3) : le super admin exclut un artisan de tout le réseau. | [[Ouverture du réseau d'artisans]] (23/10/2026) : téléphone masqué avant la demande, « à confirmer » ; l'exclusion globale n'a pas d'écran, seule la suspension existe. | Choix de prudence du 23/10/2026. | Oui (téléphone masqué ; écran d'exclusion ; plafond de zone) |
| C-30 | Incident à la charge du locataire | M9 (9.8.3, 9.8.5 à 9.8.7) : la facture devient une somme due sur le bail ; le locataire peut aussi faire venir son propre artisan. | [[Intervention et clôture]] (décision du 14/10/2026) : le règlement est seulement déclaré ; aucune somme n'est créée sur le bail. | Le wiki, plus récent. La refacturation au locataire n'est pas couverte. | Oui |
| C-31 | Note de l'artisan | M11 (11.3, 11.4.1), M10 (10.5.3) : trois sources pondérées, fiabilité calculée, absences comptées ; note publiée « au-delà de trois » évaluations. | [[Artisan]] (24/10/2026) : note prise en compte « à partir de trois ». [[Intervention et clôture]] (22/11/2026) : trois critères pour le bailleur, une note globale pour le locataire, aucune fiabilité calculée. | Q32, confirmée le 24/11/2026 : les absences sont comptées, pas notées. « À partir de trois » : wiki, plus récent. | Non |
| C-32 | Qui lit le motif du retrait d'une note | Rien. | Décision Q20 du 24/11/2026 : « le client qui a noté lit le motif ». Choix appliqué le soir : seul l'auteur de la note ; l'espace ne lit plus le motif de la note de son locataire. | Le choix du soir, pris sur délégation du dirigeant. | Oui (à confirmer ; Q68, Q69) |
| C-33 | Report d'un rendez-vous | M10 (10.5.1) : un report relance un cycle complet de propositions. | [[Planification d'intervention]] (décision du 14/10/2026) : le locataire propose trois dates, l'artisan répond en 48 heures, deux demandes au plus. | Décision du 14/10/2026. | Non |
| C-34 | Qui propose les créneaux | M10 (10.1.1) : l'artisan, après avoir accepté la mission. | [[Mission palier 1 — audit du 22 novembre 2026]] (22/11/2026) : le locataire donne ses disponibilités dès le signalement. | Les deux tiennent : les disponibilités aident, l'artisan propose toujours. | Non |
| C-35 | Devis unique | M9 (9.1.1) : deux artisans au plus. | [[Devis]] (décision du 25/07/2026) : devis unique permis, signalé à l'écran et au rapport. Q58 (24/11/2026) : le document ne l'imprime pas. | Décision du 25/07/2026 pour le principe. | Oui (Q58) |
| C-36 | Facture de l'artisan | M9 (9.7.1) : l'artisan dépose sa facture, préremplie. | Option d'attente du 22/11/2026 : le dépôt reste la voie principale, pas d'acompte. | Q14 du 24/11/2026 : Gerimmo fabrique la facture, sous conditions ; puis report dans la nuit. Aujourd'hui, le dépôt reste la seule voie. | Non (accord d'un expert-comptable attendu) |
| C-37 | Arrivée dans Gerimmo | M16 (16.1.1) : seul le super admin crée un espace ; pas d'inscription libre. | [[Propriétaire bailleur]] (décision du 19/08/2026) : le propriétaire s'inscrit seul. | Décision du 19/08/2026. | Non |
| C-38 | Canaux de messages | M15, M16 : WhatsApp, avec accord de la personne ; e-mail en repli. | [[Canaux de communication]] (25/07/2026) : Telegram abandonné, WhatsApp seul robot visé ; lancement sans WhatsApp (20/09/2026) ; canal non construit. | E-mail et espace personnel. Aucune décision ne dit si WhatsApp est attendu au palier 1. | Oui |
| C-39 | Colocation à contrats séparés | M1 (1.1.3, 1.4.1) : hors de la première version ; un seul bail actif par lot. | [[Bail]] (14/09/2026) : contrats individuels réalisés et testés. | Le wiki, plus récent. | Non |
| C-40 | Notice d'information | Rien de net. | [[Mentions obligatoires du bail]] (23/11 et 24/11/2026) : le bail dit la notice « annexée », alors que seul un résumé est joint, présenté comme « pas une annexe ». | Q46 du 24/11/2026 : notice officielle entière ; en attendant, dépôt par le bailleur et blocage sans elle. | Non (reste à appliquer) |
| C-41 | Identité des personnes | M0b (0b.1.2, 0b.1.3), A1 (A1.1) : nom et date de naissance servent à reconnaître une personne ; un e-mail est unique sur toute la plateforme. | [[Compte, personne et adhésion]] : une société et son gérant peuvent partager une adresse (19/11/2026, « à confirmer ») ; date de naissance facultative (décision du 20/11/2026). | Le wiki, plus récent. | Oui (adresse partagée, à confirmer) |
| C-42 | Pouvoirs du super admin | A4 : le régime le plus strict. | [[Super Admin]] : peut se mettre à la place de tout utilisateur (22/07/2026) ; pleins pouvoirs dans chaque espace, journalisés (09/09/2026). `log.md` (25/09/2026) : pas d'emprunt d'identité. | Décision du 25/09/2026 : il reste lui-même, tout est enregistré. La page [[Super Admin]] garde l'ancienne phrase. | Non |
| C-43 | Parution des articles | Rien. | `index.md` (20/10/2026) : les prochaines diffusions attendent la validation du dirigeant. | Q13 du 24/11/2026 : parution automatique gardée, avec la mention. | Non |
| C-44 | Fermeture d'une alerte | M14 (14.3.2) : par l'action, jamais par une coche. | [[Agenda et échéances]] (19/09/2026) : une coche « déjà réglé en dehors de Gerimmo » est gardée. | Aucune : « à arbitrer » depuis le 19/09/2026. | Oui |
| C-45 | Agenda | M14 (14.1.1, 14.1.2) : un agenda pour chaque public, nourri par les alertes. | [[Agenda et échéances]] (22/11/2026) : agenda du seul propriétaire, quatre sortes de dates. | Le wiki, plus la date limite de révision (Q34 du 24/11/2026). | Oui (voir partie 6) |
| C-46 | Récapitulatif fiscal | M6 (6.4.6) : ne couvre que la période sous mandat, pour le propriétaire qui a confié ses biens. | [[Propriétaire bailleur]] (30/08/2026), [[Fiscalité]] : réservé au propriétaire qui gère lui-même. | Le wiki, plus récent. | Non |
| C-47 | Antivirus | A4 (A4.8) : tout fichier déposé est analysé. | [[État du projet et décisions ouvertes]] (25/07/2026) : sujet laissé ouvert. | Q8 du 24/11/2026 : pas d'antivirus maintenant. | Non |
| C-48 | Test de restauration | A4 (A4.12) : une fois par an. | [[Plan de reprise d'activité]] : une fois par trimestre. | Aucune : « à harmoniser ». | Oui |
| C-49 | Tarifs et essai | M18 (18.6.1, 18.6.3, 18.6.6 à 18.6.8) : essai de 14 jours, prix par bien, mise en route, mensuel seulement, redevance annuelle. | [[Grille tarifaire]] : premier bien gratuit à vie, 2,50 € par bien (25/07/2026) ; 5,99 € par bien (05/09/2026) ; formules, annuel ouvert, plus de bien gratuit (28/09/2026) ; essai de 2 mois puis 1 mois (30/09/2026). | Décisions des 28/09 et 30/09/2026. | Non |
| C-50 | Nature du vendeur | Rien. | `log.md` (décision du 23/10/2026) et [[Durées de conservation]] (24/10/2026) : éditeur « non commerçant ». | Décision du 24/11/2026 au matin : « la société Sauve Expert ». Complément du soir, sur l'avis officiel : entrepreneur individuel, nom commercial SAUVEXPERT. Le complément du soir l'emporte. | Oui (activité déclarée : Q66) |
| C-51 | Vente sans médiateur | Rien. | [[Abonnement]] (23/10/2026) : vente possible sans médiateur désigné, choix du dirigeant. Audits de novembre : abonnements payants refusés tant que le médiateur manque. | Décision du 24/11/2026 au matin : ouverture « dès que le vendeur et le médiateur sont saisis ». Complément du soir : ouverture possible sans médiateur. Le soir l'emporte. | Oui (Q65, risque signalé) |
| C-52 | Rétractation | Rien. | [[État du projet et décisions ouvertes]] (29/09/2026) : non ouverte aux professionnels. [[Rétractation en ligne]] (24/10/2026) : toutes les formules, tout client. | Le wiki du 24/10/2026. | Juriste |
| C-53 | Chemin de résiliation | Rien. | [[État du projet et décisions ouvertes]] (28/09/2026) : par le portail du prestataire de paiement. [[Résiliation de l'abonnement]] (24/10/2026) : un seul chemin, dans Gerimmo. | Le wiki du 24/10/2026. | Non |

**Total : 53 contradictions relevées, dont 19 restent à trancher par le dirigeant** (C-04, C-05, C-10, C-14, C-15,
C-18, C-23, C-24, C-29, C-30, C-32, C-35, C-38, C-41, C-44, C-45, C-48, C-50, C-51 ; une ligne chacune en fin de
page). Onze autres ne dépendent plus que d'un point de droit (`JURISTE.md`). Les vingt-trois dernières sont réglées par
la décision la plus récente.

## 6. Ce que le référentiel ne dit pas

Sujets du périmètre sur lesquels ni le cahier ni le wiki ne disent rien de net.

- **Fin et suite d'un bail** : le cahier prévoit une alerte six mois avant le terme (R-BAIL-23) ; le wiki note que le
  renouvellement est absent. Rien ne dit ce que Gerimmo fait à l'échéance d'un bail.
- **Reprise d'un bail déjà en cours** : rien sur une dette de loyer d'avant l'arrivée, sur le dépôt de garantie déjà
  versé, ni sur l'indice d'un loyer déjà révisé ailleurs (Q70).
- **Délais des relances d'impayé** : le circuit existe, les délais entre ses étapes ne sont écrits nulle part (C-18).
- **Refacturation au locataire** d'une réparation à sa charge : le cahier la décrit, l'application ne la fait pas,
  aucune décision ne dit laquelle des deux voies est voulue (C-30).
- **Urgence en dehors des horaires** : le cahier parle d'un numéro d'astreinte affiché au locataire. Le wiki n'en dit
  rien : qui tient ce numéro chez un propriétaire particulier ?
- **Rapport d'intervention** : aucune décision ne dit si un rapport officiel, validé, est attendu au palier 1.
- **Mentions du bail** : les trois mentions signalées comme manquantes dans le cahier (identifiant fiscal du logement,
  dépenses d'énergie, calendrier des logements très énergivores) sont dites « revues le 14/09/2026 » dans le wiki, sans
  liste nette de ce qui est fait. Deux textes de 2026 sur le contrat type et la notice ne sont dans aucune source.
- **Autres types de baux** (bail mobilité, bail étudiant, autres régimes) : hors de ce que Gerimmo prépare, sans date.
- **Récapitulatif fiscal du meublé et des sociétés** : renvoyé à plus tard, sans contenu.
- **WhatsApp** : attendu ou non au palier 1 (C-38).
- **Messagerie** : le cahier la décrit ; le wiki ne dit pas nettement ce qui existe hors de la discussion d'une
  intervention.
- **Alertes et agenda du locataire et de l'artisan** : le cahier prévoit un agenda par public ; seul celui du
  propriétaire est décrit (C-45).
- **Points de douleur des locataires** : jamais recueillis (aucun entretien).
- **Conservation** : aucune durée pour les réclamations, le parrainage, les devis et factures d'artisans, les
  invitations d'artisans.
- **Jour d'échéance** : rien ne dit si un jour unique peut être imposé à tous les baux d'un espace.
- **Soutenabilité d'un plan d'apurement** et rappel du locataire avant chaque échéance : non décidés.
- **Zone de l'artisan** : aucun plafond ; aucun message ne le prévient qu'il doit rendre son profil public.
- **Repères de prix** : trois métiers seulement, aucune règle de mise à jour.
- **Console du super admin** : la liste de ses défauts mineurs reportés n'est pas dans le wiki.

> [!warning] Points à trancher / contradictions
> **Contradictions du registre qui attendent une décision du dirigeant (19) :**
> - C-04 — Activation du bail après signature : automatique (cahier) ou confirmée par le propriétaire (application) ?
> - C-05 — Relances d'une signature en attente : les créer (cahier) ou y renoncer ?
> - C-10 — État des lieux de sortie : chiffrage visible à côté ? index et clés exigés avant d'enregistrer une signature ?
> - C-14 — Bail repris en cours : que faire de la dette d'avant, du dépôt déjà versé, de l'indice déjà révisé (Q70) ?
> - C-15 — Quittance : aligner le PDF sur l'adresse de l'espace, ou garder deux adresses (Q74) ?
> - C-18 — Relances d'impayé : fixer les délais entre la première relance, la seconde et la mise en demeure.
> - C-23 — Décompte de restitution envoyé : faut-il un décompte rectificatif ?
> - C-24 — Revoir « qui paie » après le diagnostic de l'artisan : le permettre, ou créer une demande de l'artisan ?
> - C-29 — Artisans : téléphone masqué avant la demande ; écran pour exclure un artisan du réseau ; plafond de zone.
> - C-30 — Réparation à la charge du locataire : faut-il créer la somme due sur son bail ?
> - C-32 — Motif du retrait d'une note : l'espace doit-il lire celui de la note de son locataire (Q68, Q69) ?
> - C-35 — Devis unique : l'imprimer comme accepté en connaissance de cause, ou corriger la promesse de l'écran (Q58) ?
> - C-38 — WhatsApp : attendu au palier 1, ou non ?
> - C-41 — Adresse e-mail partagée entre une société et son gérant : à confirmer.
> - C-44 — Alerte fermée par une coche « déjà réglé en dehors de Gerimmo » : la garder ou la retirer ?
> - C-45 — Agenda : le limiter au propriétaire, ou l'ouvrir au locataire et à l'artisan ?
> - C-48 — Test de restauration des sauvegardes : une fois par an ou une fois par trimestre ?
> - C-50 — Vendeur : l'activité déclarée (« formation continue d'adultes ») couvre-t-elle la vente d'abonnements (Q66) ?
> - C-51 — Ventes sans médiateur : ouvrir en acceptant le risque, ou attendre son adhésion (Q65) ?
>
> **Questions ouvertes de `QUESTIONS.md` qui ne sont pas des contradictions, mais attendent une réponse :** Q54
> (typographie), Q55 (contrat désigné par sa date), Q56 (cadre de signature du récapitulatif pour la CAF), Q57 (titre
> des courriers d'impayés), Q59 (numéroter les écritures), Q60 (garder la période d'occupation), Q61 (signature de
> l'ordre d'intervention), Q62 (lecture des textes de loi), Q67 (articles marqués « IA » d'office), Q71 (plage de
> contrôle des indices), Q72 (outil public de calcul de l'indice), Q73 (répartition fiscale des paiements).
>
> **Points plus anciens notés « à confirmer » dans le wiki :** la restitution du dépôt datée au jour de Paris
> (16/10/2026) ; l'extension du jour de Paris à d'autres dates ; les réglages de l'invitation d'un artisan (validité de
> 30 jours, aucune relance) ; la zone héritée d'une agence quand un artisan reprend sa fiche.
>
> **Ce que cette page n'affirme pas :** qu'une règle est conforme à la loi. Onze contradictions ne dépendent plus que
> d'un point de droit (C-02, C-03, C-06, C-08, C-11, C-12, C-19, C-20, C-21, C-22, C-52) : elles sont dans
> `JURISTE.md`.
>
> **Pages du wiki en retard sur ce référentiel**, à mettre à jour : [[Révision annuelle IRL]] (date d'effet, origine de
> l'indice), [[Super Admin]] (« se mettre à la place »), [[Incident]] (page en retard depuis le 09/09/2026),
> [[Artisan]] (note à trois sources), [[Signature électronique]] (historique Yousign).
