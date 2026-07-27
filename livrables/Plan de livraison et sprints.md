# Plan de livraison et calendrier de sprints — Gerimmo V3

> **Proposé par l'agent le 2026-07-25**, sur la base du référentiel complet (22
> modules + A1–A6) et des décisions d'arbitrage. Révisable à chaque fin de sprint
> (méthode agile) — le contenu des sprints est ferme pour le sprint en cours,
> indicatif au-delà.

## Méthode

- **Sprints de 2 semaines**, du lundi au vendredi de la semaine suivante.
- **Rituels** : planification en début de sprint (périmètre fixé ensemble) ;
  **démo + recette fonctionnelle en fin de sprint** (validation des fonctionnalités
  une par une) ; mise à jour du wiki au fil de l'eau.
- **Répartition des tests** :
  - **Agent** : tests **unitaires** et **d'intégration** — dont, à chaque livraison,
    les deux tests non négociables du socle : **isolation par table** (RM-A1.7) et
    « **RLS actif partout** ».
  - **Humain** : tests **fonctionnels** de recette — les **user stories du
    référentiel avec leurs critères d'acceptation** servent de scénarios.
- **Git** : une branche par fonctionnalité, PR, CI verte (tests + lint) avant merge.
- **Définition de « terminé »** : code mergé · tests passants · règles RM couvertes ·
  démo validée par l'humain · wiki à jour.

## Les personas

| Sigle | Persona | Qui c'est | Espace |
|---|---|---|---|
| **SA** | [[Super Admin]] | L'éditeur de la plateforme (vous) : supervise toutes les agences, valide, facture, arbitre | Console d'administration |
| **AA** | [[Administrateur d'agence]] | Le dirigeant/responsable d'agence : « agent ++ » + gestion des utilisateurs, paramétrage, facturation | Espace agence |
| **AG** | [[Agent immobilier]] | Le gestionnaire au quotidien : parc, baux, loyers, incidents — **limité à ses mandats** | Espace agence |
| **PD** | [[Propriétaire bailleur]] (gestion directe) | Le bailleur indépendant qui gère seul : mêmes parcours que l'agent, sans honoraires ni mandats | Espace propriétaire |
| **PM** | Propriétaire mandant | Le propriétaire qui a confié ses lots à une agence : **aucun accès, réception pure** (rapports, décomptes, signatures par email) | **Aucun** |
| **LO** | [[Locataire]] | L'occupant : incidents, quittances, assurance, messagerie | Espace locataire (le plus restreint) |
| **AR** | [[Artisan]] | L'intervenant technique : missions, devis, comptes rendus — souvent multi-agences | Espace artisan |
| **GA** | Garant | La caution d'un locataire : une personne avec ses pièces, signe l'acte — pas d'espace propre | Via invitation/email |

## Les espaces : quand et comment ils se construisent

| Espace | Structure cible | Construit aux sprints |
|---|---|---|
| **Espace agence** (AA + AG) | Tableau de bord · Parc (biens/lots, vue scindée) · Personnes & dossiers · Baux & EDL · Loyers & impayés · Comptabilité & rapports · Incidents & artisans · Agenda & alertes · Messagerie · Paramétrage (AA seul) | **Fil rouge S0 → S9** : chaque sprint ajoute son module ; navigation et tableau de bord posés au S2, complétés en continu ; paramétrage et restriction « ses mandats » au S9 |
| **Espace locataire** (LO) | Accueil (statut incidents, prochaine échéance) · Mes loyers (échéancier, quittances) · Mon dossier (pièces, assurance) · Mes incidents · Mon bail & documents · Messagerie | **S3** (naissance : invitation + dépôt d'assurance) → S4 (bail) → S5 (loyers) → S7 (incidents) → S8 (dépôt de garantie, décompte) → S9 (messagerie) ; **mobile au S13** |
| **Espace artisan** (AR) | Accueil/agenda (toutes agences, logo par intervention) · Mes missions (accepter, créneaux, compte rendu) · Devis & factures · Mes pièces (décennale…) · Ma note | **S7** (naissance complète : missions/devis/compte rendu) → S12 (WhatsApp) → S13 (mobile chantier) → S14 (note visible) |
| **Espace propriétaire direct** (PD) | Reprend l'espace agence **sans** honoraires/mandats/multi-agents + Livre recettes-dépenses + Récapitulatif fiscal | Parcours partagés dès **S2** (parc) et S4–S5 (bail, loyers) ; **spécifiques au S9** (livre, écrans propres) ; abonnement par bien au S11 |
| **Console SA** | Supervision (indicateurs, agences) · Files d'attente (modèles, contestations, bugs, idées) · Facturation · Import de parc · Sécurité/journaux | **S9** (essentiel : création d'agence, files) → S11 (facturation Stripe) → S14 (import en masse, contestations, retours) → S15 (MFA, journaux, sécurité) |
| **PM** | — pas d'espace (décision P1.2 : réception pure) | Destinataire : rapport (S6), décompte (S8), signature Yousign (S10) |

## Vue d'ensemble

| Phase | Contenu | Jalon |
|---|---|---|
| **V0** — sprints 0 à 9 | App web **fonctionnelle en interne**, sans intégration externe | **Recette V0 : mi-décembre 2026** |
| **V1** — sprints 10 à 15 | Intégrations (Yousign, Stripe, WhatsApp), mobile, durcissement production | **Commercialisable : fin mars 2027** |

---

## V0 — l'application web fonctionnelle

### Sprint 0 (27/07 → 07/08) — Socle : identité, isolation, authentification
**Personas : AA, AG, SA** (fondation pour tous).
**Sources : [[Compte, personne et adhésion]] · [[Isolation multi-organisation]] · [[Socle de sécurité]] · [[Architecture du socle V3]]**
- Repo git, CI (tests + lint), environnements dev/staging.
- Tables `accounts` / `organizations` / `persons` / `memberships` — unicité email,
  une adhésion par couple compte×agence, rôle sur l'adhésion (contraintes en base).
- **RLS sur toute table** + politique super admin à traversée journalisée.
- Les **2 tests automatisés du socle** : isolation par table, « RLS actif partout ».
- Authentification email/mot de passe : 12 caractères min, vérification contre les
  fuites connues, blocage après 10 échecs.
- **Sessions par rôle** (SA 30 min/8 h · AA 2 h/12 h · AG 4 h/12 h · LO/AR 7 j/30 j).
- Sélecteur d'espace si plusieurs adhésions actives.
- ⚑ Décision de sprint : **socle neuf vs migration du code existant**.
**Démo : deux agences créées, données étanches, connexion par rôle.**

### Sprint 1 (10/08 → 21/08) — Socle : GED et exploitation
**Personas : AG, AA** (usage GED) · **SA** (journaux).
**Sources : [[Document]] · [[RGPD]] · [[Agenda et échéances]] · [[Architecture du socle V3]]**
- `documents` + `document_liens` : rattachement multiple (lot, bail, personne,
  mandat, incident), **sans arborescence** — le type pilote droits et conservation.
- **Dépôt / consultation / téléchargement** ; formats PDF/JPG/PNG, type réel
  vérifié, 10 Mo max ; empreinte anti-doublon.
- **Jamais d'URL directe** : liens signés à expiration courte.
- Journal d'accès aux pièces sensibles (1 an) · `audit_log` (3 ans) · `tech_log`
  (6 mois).
- `alerts` : création, niveaux, escalade nominative.
- `retention_rules` (les 32 durées de la matrice A2) + tâches pg_cron (purges,
  sorts RGPD).
- Navigation documentaire par filtres (type, période, entité) + recherche.
**Démo : un fichier déposé, relu, tracé ; une alerte créée, escaladée, purgée.**

### Sprint 2 (24/08 → 04/09) — Le parc : biens et lots
**Personas : AG, AA, PD** (création et gestion du parc).
**Sources : [[Bien]] · [[Lot]] · [[Diagnostic]] · [[Clé de répartition]]**
- Création de bien → **lot unique automatique** (multi-lots invisible dans ~90 %
  des cas).
- Découpage en lots ; nouveaux lots héritant du propriétaire ; lot loué
  non redécoupable.
- **Détention datée** par quote-parts (somme ≤ 100 %, disponible à 100 % seulement,
  jamais supprimée — les rapports passés restent justes).
- **Machine à états du lot** : brouillon → disponible → loué ⇄ préavis → archivé
  (réactivation AA seul).
- **Diagnostics** : répartition bien/lot (DPE, ERP, plomb…), validités, alertes
  J-90/J-30/J+0, **expiré = bail bloqué** (sauf lot déjà loué : alerte).
- **Clé de répartition** (100 % exact, datée, revalidée si le nombre de lots change).
- Équipements en **liste fermée** (prépare la grille d'EDL) ; critères de décence
  en alertes ; champs verrouillés quand le lot est loué.
- Début de l'espace agence : navigation, tableau de bord, fiches bien/lot.
**Démo : bien créé → lot disponible → bail bloqué par un DPE expiré.**

### Sprint 3 (07/09 → 18/09) — Personnes, dossier locataire, mandat
**Personas : AG, AA** (constituent) · **LO, GA** (déposent) · **PM** (objet du mandat).
**Sources : [[Dossier locataire]] · [[Compte, personne et adhésion]] · [[Mandat de gestion]]**
- Fiches **personnes** sans rôle ; doublon nom+naissance alerté (non bloquant) ;
  **email modifiable par l'agent** (rattachement au compte).
- **Dossier locataire versionné** : toutes versions conservées, la courante
  affichée ; le dossier suit la personne dans l'agence, jamais entre agences.
- Trois portes d'accès (personne / lot / bail) ; toute consultation tracée ;
  **le mandant ne voit aucune pièce**.
- **Garant = personne à part entière**, pièces réutilisables, lien porté par le bail.
- **Attestation d'assurance** : dépôt par le locataire depuis son espace
  (naissance de l'espace LO), alertes J-30/J-15/J+0/J+15, chaque alerte conservée
  comme preuve.
- Pièces sur demande du gérant ; invitation par email (compte LO, relances, expiration).
- **Mandat de gestion** : multi-lots à taux par ligne, seuil de délégation, date de
  rapport, avenants — signature = **dépôt du PDF** en V0.
**Démo : un dossier complet, un garant partagé, un mandat actif sur 3 lots.**

### Sprint 4 (21/09 → 02/10) — Bail et état des lieux
**Personas : AG** (opère) · **LO, GA** (signent, consultent) · **PD** (mêmes parcours).
**Sources : [[Bail]] · [[État des lieux]]**
- Création de **bail** : nu / meublé (inventaire mobilier structuré) / colocation
  (solidarité) ; annexes automatiques ; contrôles amont (diagnostics, détention).
- **Dépôt du PDF signé** (signature hors plateforme en V0) → chaîne : bail actif →
  lot loué → échéancier généré → alerte EDL d'entrée.
- Congés locataire/bailleur : LRAR hors plateforme, **date de première présentation
  saisie**, préavis réduit sur justificatif obligatoire.
- Espace LO : consultation du bail signé et des annexes (jamais le non-signé).
- **État des lieux** web : grille générée depuis le lot, saisie pièce par pièce,
  photos par élément, relevés de compteurs, **aucune ligne sans état**.
- Signature **tactile** ; **figé dès signature** ; variantes (huissier, refus).
- **Comparatif entrée/sortie** : mêmes lignes garanties, écarts en évidence.
**Démo : bail déposé, EDL d'entrée signé, échéancier créé.**

### Sprint 5 (05/10 → 16/10) — Loyers et charges
**Personas : AG, AA** (quittancent, relancent) · **LO** (espace loyers) · **PD**.
**Sources : [[Quittancement des loyers]] · [[Relances et mise en demeure]] · [[Révision annuelle IRL]] · [[Régularisation des charges]]**
- **Appel de loyer** au jour paramétré : loyer + provisions, prorata entrée/sortie,
  report du solde antérieur.
- **Encaissement manuel** (pas de sync bancaire — décision actée) : imputation du
  plus ancien au plus récent, **la précision du débiteur prime**, correction tracée.
- **Quittance après encaissement intégral uniquement ; reçu si partiel** ;
  excédent imputé sur l'appel suivant.
- Espace LO — Mes loyers : échéancier, quittances/reçus (10 ans), solde,
  régularisations avec justificatifs ; jamais les commentaires internes.
- **Impayés** : bascule automatique, **relances à seuils paramétrables par
  l'agence**, mise en demeure (LRAR hors plateforme), chaque relance = preuve.
- **Révision IRL** : proposée à date anniversaire, validée par le gérant,
  prescription 1 an, **DPE F/G bloqué**.
- **Régularisation des charges** : provisions vs réel sur l'année civile,
  justificatifs bloquants, restitution ou complément.
**Démo : un mois de quittancement, un partiel → reçu, un impayé relancé, une IRL.**

### Sprint 6 (19/10 → 30/10) — Comptabilité et rapport de gestion
**Personas : AG, AA** (tiennent, clôturent) · **PM** (reçoit) · **PD** (récap fiscal).
**Sources : [[Comptabilité]] · [[Rapport de gestion]] · [[Fiscalité]]**
- **Écritures immuables dès création** : 2 dates (pièce/imputation), catégorie +
  lot + mandat obligatoires, pièce recommandée.
- **Contre-écriture** : sens inversé, imputée au jour, motif obligatoire, liée à
  l'origine, les deux visibles — jamais de modification ni suppression.
- **Honoraires automatiques** à chaque encaissement (taux du mandat) ; catégorie
  système non supprimable.
- **Ventilation multi-propriétaires** : une dépense au bien → une écriture par lot
  via la clé de répartition.
- **Clôture mensuelle verrouillante** (non-catégorisées bloquantes) ; réouverture
  AA avec motif, impossible si rapport envoyé, sans effet sur les écritures.
- **Rapport de gestion** : feuillet par bien + consolidé + annexe ; relu et envoyé
  par l'agent (jamais automatique) ; **figé à l'envoi** ; rectificatif motivé ;
  versement enregistré, écart alerté, alerte J+15.
- **Les 3 exports à tout moment** : journal (toutes colonnes + liens entre
  écritures), documents (archive indexée), référentiel — **mention « journal de
  gestion » en en-tête**.
- **Récapitulatif fiscal 2044** (agrégé date de pièce, fonds travaux ALUR à part,
  intérêts d'emprunt en rubrique vide).
**Démo : clôture → rapport → correction par contre-écriture → rectificatif.**

### Sprint 7 (02/11 → 13/11) — Incidents, artisans, devis, interventions
**Personas : LO** (déclare) · **AG, AA** (qualifient, arbitrent) · **AR** (naissance de son espace) · **PM** (accord au-delà du seuil).
**Sources : [[Cycle de vie d'un incident]] · [[Artisan]] · [[Devis]] · [[Planification d'intervention]] · [[Intervention et clôture]]**
- **Déclaration** (web, photos) depuis l'espace LO ou par l'agent.
- **Qualification + imputation obligatoire avant affectation** (propriétaire /
  locataire / copro) ; clôture sans artisan possible ; réouverture (désordre
  réapparu).
- **Fiches artisans** : SIRET (3 états), métiers en liste fermée, zone par codes
  postaux, **pièces auto-gérées par l'artisan**, visibilité choisie par lui.
- **Décennale bloquante selon la nature des travaux** ; alertes J-60/J-30/J-7/J+0 ;
  désactivation (neutre) ≠ blacklist (locale AA / globale SA, motivée).
- **Recherche d'affectation** : métier + zone + décennale, blacklistés exclus.
- **Devis** : 2 max en parallèle, **devis unique avec drapeau visible**, validité
  30 j + alerte J-7, non-retenus notifiés automatiquement.
- **Seuil de délégation** : au-delà, validation bloquée sans accord du mandant
  **tracé** (hors application ; urgence absolue motivée, visible au rapport).
- **Planning** : l'artisan propose 3 créneaux, le locataire choisit ou
  contre-propose (3), arbitrage du gérant ; RDV manqué tracé.
- Espace AR : accepter/refuser une mission (refus = réaffectation), **compte rendu
  avec photo obligatoire**, **signalement de cause différente** → révision
  d'imputation avant facturation.
- **Facture** : pré-remplie du devis, écart alerté sans blocage, validation →
  **écriture selon l'imputation** (propriétaire → rapport ; locataire → créance).
- Incident imputé au locataire : son artisan en direct (preuve exigée) ou l'agence
  avec refacturation.
**Démo : de la fuite déclarée à la facture comptabilisée, avec arbitrage de créneaux.**

### Sprint 8 (16/11 → 27/11) — Garanties, restitution, fins de bail, copro
**Personas : AG, AA** (opèrent) · **LO, GA** (suivent) · **PM** (fonds, appels de charges).
**Sources : [[Dépôt de garantie]] · [[Restitution du dépôt de garantie]] · [[Vétusté et décote]] · [[Solde de tout compte]] · [[Appel de charges]]**
- **Dépôt de garantie** : plafonds légaux, encaissement (écriture 4.2), jamais
  révisé, suivi côté LO (montant, dates — jamais les retenues en cours de calcul).
- **Caution** : acte déposé (V0), garanties externes Visale/GLI ; extinction avec
  le bail sans effacer la fiche du garant.
- **Restitution** : remise des clés → compteur **1 mois (conforme) / 2 mois
  (écarts)** + alertes avant échéance.
- Reprise des écarts d'EDL → **imputabilité jugée par l'agent** → **décote de
  vétusté** (grille paramétrable ; amorti = zéro retenue) → justificatifs (alerte
  si absents) ; provision 20 % max si régularisation en attente.
- **Décompte** : détail par retenue (coût, âge, décote) ; **intégrale = email +
  espace ; avec retenues = alerte LRAR au gérant + justificatif en GED avec date de
  première présentation** ; figé, rectificatif ; sans EDL d'entrée : restitution
  intégrale imposée.
- **Solde de tout compte** dans les deux sens ; retenues > dépôt → créance.
- **Copropriété** : appel de charges saisi poste à poste, **ventilation
  récupérable / non récupérable**, tantièmes contrôlés, relances du mandant qui
  tarde à transmettre (3 semaines, puis escalade).
**Démo : une sortie de locataire de bout en bout, retenue défendable, solde émis.**

### Sprint 9 (30/11 → 11/12) — Administration, transverses, propriétaire direct
**Personas : AA, SA** (administrent) · **AG** (agenda, messagerie) · **PD** (espace complet) · **LO** (messagerie).
**Sources : [[Modèle de rôles et permissions]] · [[Agenda et échéances]] · [[Super Admin]] · [[Propriétaire bailleur]] · [[Canaux de communication]] (messagerie, module 15) · module 18**
- **Rôles V3 définitifs** : agent **limité à ses mandats**, transfert temporaire
  (sans changer le titulaire), désactivation bloquée tant que les mandats ne sont
  pas réaffectés ; AA = agent ++.
- **Paramétrage en 9 familles** (IRL, seuils de relance, grille de vétusté,
  équipements, catégories comptables, modèles…) — IRL et seuil de délégation
  bloquants.
- **Agenda unique + alertes** : les ~27 types branchés au fil des sprints,
  consolidés ici ; escalade nominative ; seuils légaux maintenus par le SA.
- **Messagerie interne** : toute conversation **rattachée à un objet** (bail,
  incident, lot), le locataire peut ouvrir, fil à trois sur incident, traçage des
  échanges qui engagent (mandat), archivage avec le bail.
- **Vue scindée du bien** : sélection → écran en deux, détail + éléments non
  concernés assombris.
- **Espace PD complet** : parcours agent repris + **livre recettes-dépenses**
  (sans honoraires), clôture recommandée, récap fiscal.
- **Console SA (essentiel)** : création d'agence, indicateurs, files d'attente
  (modèles, contestations), suspension lecture seule / archivage.
**Démo : une journée type d'agence ; un PD autonome de bout en bout.**

### Recette V0 (14/12 → 24/12) — 🎯 Jalon V0
Recette fonctionnelle complète ensemble (scénarios = US du référentiel),
corrections, jeu de données de démo. **Livrable : app web fonctionnelle en
interne.** Pause fin d'année.

---

## V1 — intégrations et commercialisation

### Sprint 10 (04/01 → 15/01) — Yousign
**Personas : LO, GA, PM** (signent sans compte) · **AG** (suit, relance).
**Sources : [[Signature électronique]]**
- Signature simple (email + code SMS), **aucun compte requis** pour signer.
- Circuits **séquentiels** par type : bail (LO → colocataires → GA → bailleur),
  caution (GA seul), mandat (PM → agence) — **bailleur toujours en dernier**.
- Refus = motif obligatoire, circuit interrompu, agent alerté immédiatement.
- Relances J+7/J+21, alerte agent J+28, expiration J+30, **relance en un clic**.
- **Webhooks signés + idempotents** ; dernière signature → document horodaté en
  GED + **déclenchement du parcours métier** (bail actif, garantie effective…).
- Le dépôt de PDF (V0) reste disponible en repli.

### Sprint 11 (18/01 → 29/01) — Stripe et onboarding
**Personas : AA** (souscrit) · **SA** (crée, facture) · **PD** (abonnement par bien).
**Sources : [[Grille tarifaire]] · [[Onboarding et abonnement]] · [[Cycle de vie de l'abonnement]]**
- **Comptage automatique des lots sous mandat** au dernier jour du mois (vacant
  compté, sans mandat non).
- Grilles **validées** : PD = 1ᵉʳ bien gratuit + 2,50 €/bien/mois, sans mise en
  place ; agences = paliers actuels + mise en route + redevance annuelle
  (mensuel exclusif).
- Checkout et webhooks Stripe ; échec → relance → **suspension lecture seule**
  (export toujours possible) ; résiliation → archivage, jamais suppression.
- **Essai 14 jours** sans restriction → alerte J-3 → lecture seule.
- Création d'agence **par le SA** (après contrat) avec paramètres par défaut ;
  invitations complètes tous rôles.
- **Écran d'information « journal de gestion » au paramétrage initial**.
- ⚠️ **Soumission des 8 templates WhatsApp à Meta** (délai d'approbation externe).

### Sprint 12 (01/02 → 12/02) — WhatsApp
**Personas : LO, AR** (canal du quotidien) · **AG** (rattache) · **SA** (modèles).
**Sources : [[Canaux de communication]]**
- **Consentement** préalable daté, conservé, révocable (case espace, STOP, via
  l'agence) ; **repli email systématique** pour toute alerte.
- Fenêtre de 24 h ; hors fenêtre : templates Meta approuvés uniquement.
- Message entrant → **file de rattachement** (un clic vers l'objet, alerte à 48 h) ;
  **la réponse emprunte le canal d'origine**.
- Fil à trois sur incident (l'artisan rejoint à l'affectation, retiré à la
  clôture, ne voit que prénom + téléphone).
- **Décommissionnement du bot Telegram** (décision du 2026-07-25).

### Sprint 13 (15/02 → 26/02) — Mobile
**Personas : AG** (EDL terrain) · **LO** (incident sur le vif) · **AR** (chantier).
**Sources : [[2026-07-24-gerimmo-v3-module-19-mobile|Module 19]] · [[État des lieux]]**
- **EDL hors ligne** : sauvegarde locale automatique de chaque saisie,
  synchronisation seule au retour du réseau.
- **Indicateur permanent** des données non synchronisées + **alerte avant
  fermeture** de l'onglet ; EDL ouvert ailleurs signalé (avertissement, pas verrou).
- **Photos compressées à la prise**, envoi différé ; signature tactile pleine
  largeur ; progression pièce par pièce ; champs compteurs dédiés ; état d'entrée
  affiché en regard à la sortie.
- **Incident locataire mobile** : 3 écrans max, **photo proposée avant la
  description**, statut visible depuis l'accueil.
- **Compte rendu artisan mobile** : 2 écrans, photo centrale ; agenda toutes
  agences avec logo par intervention ; boutons larges, contrastes élevés.

### Sprint 14 (01/03 → 12/03) — Commercial et différenciateurs
**Personas : SA** (import, arbitre) · **AA** (marque blanche) · **AR** (score) · **LO, AG** (notent) · tous (retours).
**Sources : [[Super Admin]] (import 0.12) · [[Artisan]] (notation) · [[Marque blanche]] · [[Retours utilisateurs]]**
- **Import en masse du parc** (SA) : gabarit Excel imposé, 9 feuilles dans l'ordre
  des dépendances, **import à blanc**, prévisualisation, transaction atomique,
  > 20 % d'erreurs = refus, **annulation complète** tant que rien n'est modifié.
- **Notation artisan** : 3 sources (gérant 50 / locataire 25 / plateforme 25),
  score de fiabilité à 5 indicateurs, **publication au-delà de 3 évaluations**,
  relances LO J+3/J+7 sans blocage, **contestation arbitrée par le SA** (droit à
  l'intervention humaine, présenté comme tel).
- **Marque blanche** : logo + couleurs par agence sur l'app, les emails et les
  documents ; mention Gerimmo conservée.
- **Retours utilisateurs** : signalement de bug (contexte capturé **sans donnée
  personnelle**, masquage + prévisualisation), tri SA à 3 issues avec réponse
  systématique, transmission au suivi technique ; idées en lot 2.

### Sprint 15 (15/03 → 26/03) — 🎯 Durcissement production
**Personas : SA** (opère) · tous (bénéficient).
**Sources : [[Socle de sécurité]] · [[Plan de reprise d'activité]] · livrables juridiques (`livrables/`)**
- **Antivirus à l'upload** (service choisi, tableau des sous-traitants mis à jour).
- Hébergement : **région UE** (Supabase + Vercel), plan Pro (sauvegardes),
  network restrictions.
- **MFA obligatoire SA**, activable AA.
- **Premier test de restauration documenté** ; registre des traitements ;
  procédure de notification de violation.
- **Mentions « journal de gestion » sur les 5 supports** ; CGU et politique de
  confidentialité publiées (livrables finalisés).
- Revue de sécurité par l'agent (limites documentées) ; **mise en production**.
**🎯 Jalon : produit commercialisable, fin mars 2027.**

---

## Risques et points d'attention

| Risque | Parade |
|---|---|
| Approbation des templates Meta (délai externe) | Soumettre dès le sprint 11 |
| EDL hors ligne = le plus exigeant techniquement | Sprint dédié (13), maquette de la grille testée dès le sprint 4 |
| Dérive de périmètre V0 | Le référentiel fige les règles ; tout ajout passe par la planification de sprint |
| Migration du code existant vs socle neuf | **À trancher au sprint 0** ([[Divergences code et référentiel V3]]) |
| Calendrier indicatif | Recalé à chaque fin de sprint ; les jalons V0/V1 priment sur le contenu |
