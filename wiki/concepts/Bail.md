---
type: concept
tags: [bail, contrat, alur, signature, colocation, preavis]
status: in-progress
created: 2026-07-22
updated: 2026-11-24
sources: ["[[Analyse concurrentielle]]", "[[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve]]", "[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[2026-07-24-gerimmo-v3-module-0b-dossier-locataire]]", "[[2026-07-24-gerimmo-v3-module-0-biens-et-lots]]", "[[2026-07-24-gerimmo-v3-module-1-bail]]", "[[2026-07-24-gerimmo-v3-module-2-garanties]]", "[[2026-08-05-bailpdf-contrat-de-bail]]", "[[2026-08-05-bailpdf-modele-bail-non-meuble]]", "[[2026-08-05-bailpdf-modele-bail-meuble]]", "[[Mission palier 1 — audit du 22 novembre 2026]]"]
---

# Bail

**Définition :** le contrat de location, **porté par un [[Lot]]** (jamais par un bien),
entre le bailleur — [[Propriétaire bailleur|propriétaire]] (mandant représenté par
l'agence, ou gestion directe) — et le [[Locataire]]. Spécifié en détail par le
[[2026-07-24-gerimmo-v3-module-1-bail|module 1]] (15 parcours, module clos, « densité
réglementaire la plus forte »). Cible : **baux conclus à partir du 1er octobre 2026**.

**Périmètre** : bail nu, bail meublé, colocation en bail unique (contrats séparés :
V2). Hors périmètre : commercial, mobilité, rural, saisonnier — panorama complet des
régimes dans [[Types de baux]].
Objets liés : **Occupant** (locataire ↔ bail, quote-part de solidarité), **Lien de
garantie** (garant ↔ bail, date d'extinction — [[Dossier locataire]]),
**[[État des lieux]]**.

## Création (1.1 / 1.2)

Prérequis : lot *disponible*, **[[Diagnostic]]s valides (blocage sinon, RM-1.1.2)**,
[[Dossier locataire]] constitué (incomplet = alerte, pas de blocage). Pas de
chevauchement de baux actifs sur un lot (RM-1.1.3). Premier loyer **au prorata des
jours réels** si entrée en cours de mois (proposé, corrigeable, correction tracée).
**Zone tendue figée au bail à sa signature** (RM-1.1.7) — un décret de rezonage ne
change rien aux baux en cours.

| Aspect | Bail nu | Bail meublé |
|---|---|---|
| Durée minimale | 3 ans (personne physique, RM-1.1.8 ; aussi **SCI familiale** et **indivision de personnes physiques**) — **6 ans** si un bailleur est une personne morale autre qu'une SCI familiale (art. 10 et 13 de la loi du 6 juillet 1989, audit des parcours métier du 29/09) | **1 an — 9 mois étudiant** (sans reconduction) ; reconduction tacite **d'1 an** hors étudiant ([[2026-08-05-bailpdf-modele-bail-meuble]], section III) |
| Préavis locataire | 3 mois (1 mois en zone tendue) | **1 mois toujours** |
| Préavis bailleur | 6 mois | 3 mois |
| [[Dépôt de garantie]] max | **1 mois** hors charges | **2 mois** — jamais révisé en cours de bail (RM-2.1.5) |
| Inventaire mobilier | — | **Obligatoire, structuré** (pas un PDF joint) ; mobilier minimum décret 2015 sinon alerte de requalification. Exigence légale : « inventaire et état détaillé du mobilier » **annexés**, établis à la remise des clés ([[2026-08-05-bailpdf-modele-bail-meuble]], section XI) — l'inventaire structuré Gerimmo rend cette annexe générable |

Mentions obligatoires alimentées par le socle : parties (0b), désignation du logement
(lot), loyer + IRL de référence, charges (provision ou forfait), dépôt de garantie,
diagnostics annexés, notice d'information, zone tendue, dernier loyer si relocation
< 18 mois. Cadre légal complet (modèle-type 2015-587, ajouts 2024) :
[[Mentions obligatoires du bail]] ; clauses admises et interdites du modèle :
[[Clauses abusives et clauses résolutoires]].

## [[Signature électronique]] (1.6/1.7 fusionnés) — décision révisée

**La signature électronique est en V1** : génération du PDF (modèle 1.16 + annexes),
dépôt en GED, **envoi Yousign en signature séquentielle** — locataire → colocataires →
garants → **bailleur en dernier**. Le lot **reste disponible** tant que la signature
n'est pas complète ; expiration à 30 jours, relançable. **La réception du bail signé
active tout** (chaîne critique RM-1.7.1–1.7.3, [[Machines à états et événements]]) :
bail *actif*, **lot *loué*** (même si l'entrée est ultérieure), échéancier de loyer
créé (calé sur la date d'entrée). Le document signé **fait
foi**, rapatrié avec horodatage (dossier de preuve Yousign —
[[Notification et valeur probante]]). Aucune modification pendant la signature.
Bail préexistant à l'arrivée sur Gerimmo : dépôt du PDF signé (décision 2026-07-22,
inchangée).

### Bail déjà en cours à l'arrivée sur Gerimmo (décision du dirigeant, 20/11/2026)

Un bail dont **la date d'entrée est passée** (strictement, au jour de Paris) **s'active par le dépôt de son contrat
signé**, sans « mise en location » préalable du [[Lot]] : le logement passe directement de *brouillon* à *loué*. Les
diagnostics absents ou expirés ne bloquent pas ce bail ; ils restent des actions à mener ([[Diagnostic]]).

- **Pourquoi.** Relevé de production du 20/11 : 11 baux saisis, tous restés en brouillon — locataires renseignés,
  aucun état des risques, aucun contrat déposé
  ([[Premiers clients — acquisition sans budget — 20 novembre 2026]]). Le dirigeant a précisé le 22/11 que ces
  espaces sont des comptes de test : le blocage reste établi par le rejeu sur le banc, pas par de vrais inscrits. La règle RM-0.8.3 disait déjà « bloquer un bail
  en cours n'aiderait personne », mais ne valait que pour un bail déjà actif dans Gerimmo.
- **Ce qui ne change pas.** Le contrat signé (PDF) reste ce qui active le bail (décision du 22/07). Mentions
  obligatoires, plafond du dépôt de garantie, mandat en cours pour une agence, un seul bail en cours par lot, détention
  à 100 % : tout cela bloque encore. Le DPE classé G bloquait aussi ; la décision 2B du 22/11/2026 en fait une alerte
  pour un bail déjà en cours (ci-dessous). Un bail qui commence aujourd'hui ou plus tard garde la mise en location et
  les diagnostics, DPE classé G compris.
- **Options écartées** : A, ne rien changer ; C, exiger le DPE mais pas un état des risques récent.
- **En base** : migration `20261120190000_bail_deja_en_cours.sql` (PR #355), retour arrière fourni. **En production
  depuis le 21/11/2026.**

#### Loyers d'un bail repris en cours — date de bascule (décision A du dirigeant, 21/11/2026)

- **Constat (banc local, 20/11).** L'échéancier d'un bail part de sa date d'entrée, que les termes soient générés à la
  main ou par le cycle du 1ᵉʳ du mois. Pour un bail entré le 01/11/2024 et activé le 20/11/2026 : 25 termes, 18 750 €
  affichés « impayés » ([[Premiers clients — acquisition sans budget — 20 novembre 2026]]).
- **Règle (décision A du 21/11/2026, « Choix A, oui publie »).** À l'activation d'un bail dont le mois d'entrée est antérieur au mois en cours (jour de Paris),
  le mois en cours devient le **premier mois suivi** ; l'échéancier commence là, par un mois plein. Un bail activé le
  mois de son entrée, ou avant, n'est pas concerné : il garde son prorata d'entrée
  ([[Quittancement des loyers]]).
- **D'où vient la notion.** Les maquettes de reprise de portefeuille prévoient une « date de bascule », avec soldes
  d'ouverture et dettes ou crédits du locataire ([[2026-09-04-maquette-v3-prototype|Maquette v3]],
  [[2026-09-08-maquette-espace-agence-v6|Maquette agence v6]]). Seule la date est reprise ici, bail par bail.
- **Limite.** Aucune dette d'avant le premier mois suivi n'est reprise.
- **Contrepartie : la régularisation des charges.** Elle compare les charges réelles de l'exercice, au prorata des
  jours d'occupation, aux provisions *appelées dans Gerimmo*. Pour un exercice commencé avant le premier mois suivi,
  les provisions versées avant n'y figurent pas : sur le banc, l'exercice 2026 d'un bail suivi depuis novembre donnait
  100 € de provisions contre 600 € de charges, soit 500 € réclamés à tort au locataire. La régularisation d'un tel
  exercice est donc refusée ; le premier exercice régularisable est celui de la bascule si elle tombe en
  janvier, le suivant sinon ([[Régularisation des charges]]).
- **Options écartées** : B, le propriétaire choisit le mois (elle aurait permis de faire entrer toute l'année en
  cours) ; C, depuis l'entrée du locataire (comportement d'avant).
- **En base** : migration `20261120200000_loyers_suivis_depuis.sql` (PR #356, fusionnée dans la branche de la PR #355),
  retour arrière fourni ; il se refuse tant qu'un bail porte une date de bascule. **En production depuis le
  21/11/2026.**

#### DPE classé G et état des lieux d'entrée d'un bail déjà en cours (décisions 2B et 3A du dirigeant, 22/11/2026)

Réponse du dirigeant du 22/11/2026 : « 1A - 2B - 3A - 4 ok »
([[Premiers clients — acquisition sans budget — 20 novembre 2026]]).

- **Décision 2B — DPE classé G.** Pour un bail dont la date d'entrée est passée, un DPE classé G **ne bloque plus
  l'activation** : il devient une action à mener « DPE classé G » sur le logement, non critique, qui rappelle qu'aucun
  nouveau bail ne pourra y être activé tant que le DPE reste classé G. Pour un **nouveau** bail, le blocage est
  inchangé ([[Diagnostic]]). Option écartée : A, garder le blocage — c'était la recommandation de l'agent, faute de
  source ; le dirigeant a tranché pour B.
- **Décision 3A — état des lieux d'entrée.** Un bail **repris en cours** (mois d'entrée antérieur au mois de son
  activation, donc porteur d'une date de bascule) ne reçoit plus l'alerte « État des lieux d'entrée à signer », ni les
  étapes « déclarer les pièces » et « réaliser l'état des lieux d'entrée » sur sa fiche : l'entrée a eu lieu avant
  Gerimmo. Un bail activé le mois de son entrée garde l'alerte ([[État des lieux]]). Option écartée : B, la laisser.
- **Frontière des deux règles.** 2B vaut dès que la date d'entrée est passée (même critère que la décision B du
  20/11) ; 3A vaut quand le *mois* d'entrée est passé (même critère que la date de bascule). Un bail entré le 3 du
  mois et activé le 20 active donc malgré un DPE classé G, mais garde son alerte d'état des lieux d'entrée.
- **En base** : migration `20261122090000_bail_repris_dpe_g_et_edl_entree.sql`
  (PR [#357](https://github.com/GERIMMO/GERIMMO_V4/pull/357)), retour arrière fourni. **Au 22/11/2026 : prête, ni
  fusionnée ni publiée** — la publication attend l'accord du dirigeant.

> [!warning] Points à trancher / contradictions
> - **DPE classé G (décision 2B)** : aucune source du wiki n'établit ce que l'interdiction de louer un logement classé
>   G implique pour un bail déjà en cours. La règle retenue est une décision de produit du dirigeant, pas une lecture
>   de la loi ; un avis de professionnel la confirmerait ou la corrigerait.
> - Les maquettes décrivent une reprise avec soldes d'ouverture ; la règle n'en reprend que la date. Une dette de loyer
>   d'avant l'arrivée, le dépôt de garantie déjà versé et l'indice de référence d'un loyer déjà révisé restent sans
>   réponse dans l'outil.

> [!note] Signature électronique non activée au lancement (30/09/2026, décision du 27/09) → [[Signature électronique]]

### Validation du bail en V0 (décision 2026-08-29)
Le bail se **valide** (bouton « Valider » en bas de la fiche), il ne s'« active »
plus. Prérequis contrôlés en base, dans l'ordre : locataire principal · **bail signé
déposé (PDF)** · **[[État des lieux]] d'entrée signé** — l'EDL n'est plus une alerte
créée après coup, c'est une condition (sans lui, aucune retenue possible à la sortie,
RM-2.4.3) · dépôt de garantie sous le plafond · **un seul bail actif ou en préavis par
lot** (un brouillon peut coexister pour préparer le bail suivant, il attend la fin du
précédent) · lot disponible · aucun blocage de mise en location (détention 100 %,
diagnostics). Effet : bail *actif*, lot *loué*, aucune alerte. Pièce facultative
rattachée au bail : **règlement de copropriété** (type GED `reglement_copropriete`,
conservation calée sur le bail — hypothèse à confirmer). Voir
[[Agenda et échéances]] pour la règle « alerte liée à son événement d'origine ».

> [!note] Activation du bail — tranché et livré le 2026-08-30 (sprint « Alertes & documents »)
> - **Plus de bouton « Valider »** : le **dépôt du PDF signé active le bail et loue
>   le lot**. Les contrôles de mise en location (locataire principal, plafond du
>   dépôt, un seul bail vivant par lot, lot disponible, détention 100 %,
>   diagnostics) passent **avant** le dépôt (`controler_mise_en_location`) : un
>   PDF refusé ne laisse rien derrière lui.
> - **EDL d'entrée** : plus un prérequis — s'il n'est pas signé au dépôt, une
>   **alerte automatique** liée au bail (origine = bail) le rappelle, fermée
>   d'elle-même à la signature. La règle de la restitution reste : sans EDL
>   d'entrée signé, aucune retenue (RM-2.4.3).
> - **Prévisualisation** du bail signé dans la modale, avec **Envoyer** (email au
>   locataire renseigné ; la pièce est déjà dans « Mes documents ») et
>   **Corriger** (`devalider_bail` : retour en brouillon, lot disponible, PDF
>   détaché — refusé dès qu'un loyer a été appelé ou encaissé, ou qu'une
>   restitution a démarré). Envoi mémorisé (`baux.signe_envoye_le`).
> - Le locataire voit, en plus du bail signé, le **règlement de copropriété** du
>   bail dans « Mes documents » (fonction partagée `pieces_bail_locataire`).
> Détail de recette : [[Recette - test par sprint et persona]] § 2.00 (30.4, 30.5, 30.7).

## Colocation en bail unique (1.3) — « le parcours le plus délicat »

- **Un seul appel de loyer, jamais fractionné** (RM-1.3.1) — fractionner nierait la
  solidarité (en cas d'impayé, l'agence réclame la totalité à n'importe lequel).
- **Calendrier de la solidarité** : congé → solidarité maintenue ; départ effectif →
  compteur de **6 mois** ; remplaçant (avenant) → **extinction anticipée** ; échéance →
  extinction automatique. **Date calculée, tracée, alertée** (RM-1.3.5) ; l'extinction
  ne libère pas des dettes antérieures (RM-1.3.7).
- **Chaque garant couvre un colocataire identifié** (RM-1.3.8), jamais le bail en
  bloc ; sa solidarité suit celle de son colocataire.
- **Départ d'un colocataire sur un bail signé** (audit des parcours métier du 29/09, art. 8-1) : la
  personne **ne se retire plus** du bail (seul un brouillon se corrige) ; on
  **enregistre son départ** à la date d'effet de son congé. Sa solidarité s'éteint
  **six mois** après cette date, ou à cette date si un **nouveau colocataire figurant
  au bail** le remplace. Le garant qui le couvre reste rattaché au bail et son
  engagement s'éteint à la même date.
- Couple marié/pacsé : solidarité légale automatique. Contrats séparés (1.4) et
  remplacement (1.5) : **V2** (imposeront sous-lots ou assouplissement de RM-1.1.3).

## Machine à états (module 1 ≈ registre A5)

**brouillon** → à signer → **actif** → préavis → **terminé** (EDL de sortie fait) →
archivé ; annulé (abandon avant signature) ; actif → reconduit. Interdits : brouillon →
actif (signature obligatoire) ; actif → annulé (un bail signé se **résilie**) ;
terminé → actif (nouveau bail requis).

## Fin du bail

**Résiliation par le locataire (1.10)** : préavis calculé automatiquement (type de
bail + zone **figée au bail**, RM-1.10.7), en jours calendaires, depuis la **réception**
du congé. 8 motifs dérogatoires → 1 mois, **justificatif obligatoire sinon blocage**
(RM-1.10.5). Le locataire reste redevable jusqu'au terme du préavis ; relocation
pendant le préavis l'interrompt. → alerte d'[[État des lieux]] de sortie.

**Congé du bailleur (1.11)** : au terme uniquement, préavis 6 mois (nu) / 3 mois
(meublé) — **insuffisant = blocage (le congé serait nul)**. Trois motifs : reprise
(bénéficiaire familial identifié), **vente** (en location **nue**, prix obligatoire —
le congé vaut offre, art. 15 II, **alerte de préemption à 2 mois**, le droit de
préemption lui-même hors périmètre ; en **meublé**, art. 25-8, pas d'offre de vente ni
de prix obligatoire),
motif légitime et sérieux. Locataire protégé (> 65 ans, ressources modestes) : alerte
forte, génération sous responsabilité de l'agence. Notification **hors plateforme en
LRAR/acte** ([[Notification et valeur probante]]) ; l'agent enregistre la date.
Le PDF du congé (audit des parcours métier du 29/09) prend pour date d'effet le **terme du bail calculé
par la base** — la même règle que l'enregistrement du congé, durée selon la qualité
des bailleurs — pour la date de présentation prévue (le terme suivant si le préavis
n'y tient plus) ; il imprime le prix et refuse un congé pour vente d'un logement nu
sans prix.

**Reconduction tacite (1.8)** : alerte à l'agent **6 mois avant le terme** (sinon le
congé bailleur devient impossible) — jamais de reconduction silencieuse. **Avenant
(1.9)** : ne modifie jamais le bail d'origine, suit le même circuit
génération/signature ; la **révision IRL n'exige pas d'avenant** (module 3, RM-1.9.3).

## Modèles et consultation

**Modèles par type** (1.16, admin agence) : fournis par défaut, **datés** — un bail
conserve la version du modèle en vigueur à sa signature (RM-1.16.3) ; mentions
légales non retirables. **Gabarit de référence : [[Structure du modèle-type de bail]]**
(les 11 sections du formulaire officiel, champ par champ, avec les 7 champs qui
manquent aujourd'hui au modèle de données). **Le locataire consulte** (1.14) : bail signé (jamais le PDF
non signé), avenants, diagnostics, EDL, inventaire — jamais le dossier des autres
colocataires.

## Relations

- Porté par un [[Lot]] ; en amont, le [[Dossier locataire]] (module 0b) ; le **lien de
  garantie est porté par le bail** (RM-0b.3.3 = RM-2.2.1) — voir [[Garantie]] (caution
  solidaire par défaut, acte Yousign ; Visale/GLI enregistrées sans intégration).
- Alimente : module 2 — [[Dépôt de garantie]] (encaissé en 2.1, plafond bloquant) et
  [[Restitution du dépôt de garantie]] (via les écarts d'[[État des lieux]]),
  [[Période de loyer]] / [[Quittancement des loyers]] (échéancier né de la signature),
  [[Comptabilité]], rapport de gestion (module 6).
- Remplace [[Occupation d'un bien]] (approximation actuelle du code).
- Le **propriétaire en gestion directe** suit les mêmes parcours en variante — sans
  mandat, honoraires ni rapport.

> [!warning] Bail déjà en cours — points laissés ouverts (20/11/2026, mis à jour le 22/11)
> - **État des lieux d'entrée** : tranché le 22/11/2026 (décision 3A) — plus d'alerte pour un bail repris en cours.
>   En attente de publication (PR #357) ; d'ici là, l'activation pose encore l'alerte, datée de l'entrée.
> - **DPE classé G** : tranché le 22/11/2026 (décision 2B) — simple alerte pour un bail déjà en cours. En attente de
>   publication (PR #357) ; d'ici là, il bloque encore. Aucune source du wiki n'établit l'effet de l'interdiction de
>   louer sur un bail en cours : la décision reste à faire confirmer par un professionnel.
> - **Date d'entrée déclarée** : un bail daté de la veille échappe au blocage des diagnostics. Conséquence directe de la
>   décision ; les actions à mener restent affichées.

> [!warning] Contradiction signature — résolue par le référentiel, à entériner
> - **2026-07-22 (humain)** : V1 hors plateforme + dépôt PDF ; Yousign en V2.
> - **Module 1 (référentiel V3)** : « **Décision révisée — la signature électronique
>   est en V1** » (Yousign, module 13) — le module 1 est la source même de la révision ;
>   la mention contraire du module 0 (« hors plateforme V1 acté ») est antérieure.
> - Le référentiel est désormais **cohérent en interne** autour de Yousign V1. Reste
>   **votre confirmation formelle** pour clore le point 13 de
>   [[État du projet et décisions ouvertes]].

> [!warning] Mentions 2024 absentes du module 1 (confirmé par le formulaire officiel)
> Le décret n° 2023-796 impose depuis le 1/1/2024 trois mentions que le module 1 ne
> liste pas : **identifiant fiscal du logement** (13 chiffres — aucun champ prévu au
> [[Lot]]), **classe DPE + dépenses théoriques d'énergie**, et **bloc calendrier
> passoires thermiques**. Le champ identifiant fiscal **figure bien dans le formulaire
> officiel** ([[2026-08-05-bailpdf-modele-bail-non-meuble]], section II). Détail :
> [[Mentions obligatoires du bail]] ; autres champs manquants (complément de loyer,
> durée réduite, travaux…) : [[Structure du modèle-type de bail]].

> [!warning] Points résiduels
> - **Migration depuis le code** : articulation entre l'objet Bail V3 et
>   `bien_occupants`/[[Occupation d'un bien]] existants — à traiter au moment du
>   développement ([[Modèle de données]]).
> - Le module 1 saisit la « date de réception » du congé ; la matrice demande le champ
>   « **date de première présentation** » (RM-A3.5, rattachement prioritaire n° 1) —
>   formulation à aligner en développement.

> [!info] Champs manquants pour générer un bail conforme (ingest bailpdf, 2026-08-01)
> Voir [[Documents a generer et automatisation WhatsApp]]. À stocker et non prévus
> aujourd'hui : **identifiant fiscal du logement** (obligatoire 2024), **flag zone
> tendue / encadrement**, loyer + date du **précédent locataire** (vacance < 18 mois),
> **trimestre IRL** de référence, **plafond de dépôt dynamique** (1 mois nu / 2 meublé /
> 0 mobilité), et pour la **colocation** : le modèle `baux.locataire_principal`
> (singulier) est insuffisant → il faut **plusieurs locataires + quotes-parts + surface
> privative + solidarité résiduelle 6 mois**. Blocage à ajouter : **DPE = G** interdit
> la mise en location.


## Contrat commun de colocation — réalisation du 14 septembre 2026

Le brouillon propose la génération d'un contrat commun nu ou meublé selon le lot enregistré. Le principal et au moins un colocataire distinct sont requis. Tous apparaissent parmi les parties, avec un cadre de signature individuel ; le loyer reste celui du logement entier. Le contrat initial n'est pas régénérable depuis un bail actif : son évolution passe par l'avenant existant. Les documents signés et les données financières ne sont pas réécrits.

Le mobilier d'une colocation meublée est accessible sur le dossier et repris dans l'annexe PDF. Une lecture en panne interrompt la génération ; un inventaire vide reste signalé comme information manquante. Le retrait du mobilier vérifie le bail, l'organisation et la ligne réellement supprimée ; les refus sont visibles.

Sources consultées le 14 septembre : [Service Public — colocation](https://www.service-public.gouv.fr/particuliers/vosdroits/F34661) (bail commun signé par tous, modèles selon le régime) et [annexe 1 du décret 2015-587](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000043842254/) (champ du contrat commun, exclusion des contrats individuels). Le modèle reprend les générateurs existants ; cette réalisation ne vaut pas audit exhaustif de toutes leurs clauses ni validation des changements réglementaires du 1er octobre 2026 (exigence 09.7 distincte).

Preuves : tests des deux régimes, montants globaux, signataires distincts, refus hors brouillon, erreurs de lecture, données manquantes, rattachements GED et retrait du mobilier. 946 tests locaux réussis ; neuf pages de PDF contrôlées visuellement, puis séparation des signatures et espacement du tableau corrigés. Publication suivie dans la recette extérieure au dépôt.

> [!warning] Source plus récente — contrats séparés
> Le référentiel fourni classe désormais les contrats séparés en P1 (09.4), contrairement à la mention V2 historique ci-dessus. Ils restent à développer ; le contrat commun ne les remplace pas.


## Compléments et génération — recette du 14 septembre 2026

Les contrats nu, meublé et commun de colocation exposent désormais la classe DPE, la fourchette annuelle d'énergie et les années de prix, la date prévue de conclusion, la servitude de résidence principale et les clauses optionnelles. La date réelle de signature reste à compléter par les parties : générer un PDF ne signe pas le contrat.

La zone tendue et les loyers de référence fixés localement sont deux informations distinctes. Les montants de référence apparaissent au formulaire après confirmation de leur application. Une réponse inconnue reste à vérifier. Les honoraires de visite/dossier/bail et ceux d'état des lieux sont distincts ; la part locataire ne peut dépasser celle du bailleur ni le plafond calculable. Barème 2026 : 12,10 / 10,09 / 8,07 € TTC par m² selon la zone, 3,03 € TTC pour l'état des lieux. Un barème futur inconnu n'est pas projeté.

Les clauses distinguent le commandement de payer (six semaines), le défaut d'assurance (un mois) et, si convenu et applicable, la servitude (délai de mise en demeure du maire). Les nouveaux champs sont protégés en base après le brouillon. Les modèles initiaux refusent un bail déjà engagé : il faut un avenant. Les erreurs de lecture du diagnostic ou de l'inventaire ne sont plus assimilées à des données absentes.

Sources primaires vérifiées : [décret 2026-596, article 1 applicable aux contrats conclus ou renouvelés dès le 1er octobre 2026](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054393114), [contrat type, annexe 1](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000043842254/), [honoraires de location 2026](https://www.service-public.gouv.fr/particuliers/vosdroits/F375).

Cette recette ciblée ne clôt pas la revue de tous les régimes : durées dérogatoires, SCI familiales, contrats individuels de colocation et ensemble des annexes restent à examiner ou compléter. Les PDF déjà déposés demeurent inchangés.


## Contrats individuels de colocation — réalisation du 14 septembre 2026
La demande explicite de terminer les contrats individuels remplace leur ancien classement différé. Le logement reste un seul lot : chaque chambre désignée porte un bail distinct, avec son locataire, son loyer, son dépôt, sa régularisation, son état des lieux et son congé. Aucun contrat commun existant n’est converti.

Les chambres décrivent la surface et le volume privatifs, l’accès, les équipements et les pièces partagées. Une chambre déjà décrite dans un contrat signé conserve ses caractéristiques. Deux contrats en cours ne peuvent occuper la même chambre ; un bail portant sur tout le logement ne peut coexister avec un bail individuel. Les cotitulaires sont refusés sur un contrat individuel ; ses garants restent possibles. Le logement demeure loué tant qu’un contrat est actif, puis en préavis si tous les contrats restants le sont. Le départ d’un locataire laisse les autres contrats en cours.

Le gestionnaire renseigne le loyer applicable au logement entier. La base contrôle le total des contrats actifs/en préavis à l’activation et à chaque modification du loyer. La fenêtre du lot présente tous les contrats au gestionnaire et uniquement son contrat au locataire. La grille d’état des lieux individuel porte sur la chambre et les espaces partagés ; la sortie reprend l’entrée de ce même contrat.

Deux PDF, nu et meublé, utilisent la charte existante, décrivent le périmètre privatif, précisent l’absence de solidarité entre contrats et reprennent les données réelles. Ils sont des contrats indépendants : aucune mention d’obligation d’utiliser le contrat type du logement entier. Inventaire du contrat annexé en meublé. Une donnée manquante reste signalée, sans invention.

Sources primaires : [Service Public — bail individuel](https://www.service-public.gouv.fr/particuliers/vosdroits/F34661) et [article 8-1 de la loi du 6 juillet 1989](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000041587279/2026-04-29). La partie privative doit atteindre 9 m² **et** 20 m³ ; l’appréciation de la décence inclut le logement partagé. La valeur du plafond local doit être vérifiée par le gestionnaire.

Recette : 8 essais SQL ciblés (double activation, plafond, chevauchement, départ, annulation, surfaces, état des lieux, confidentialité), 2 essais de contenu PDF et rendu réel des deux contrats (4 et 5 pages). Suite complète locale : 1 056 tests réussis. Parcours navigateur : plafond, création de chambre, création du bail, génération et rangement GED. La migration 20260914180000 précède la publication de l’interface.

## Zone tendue inconnue et honoraires (audit de gestion du 29/09/2026)

- **Zone tendue « non vérifiée »** : la zone d'un bien peut désormais être **oui, non
  ou non vérifiée** (elle valait « non » par défaut). Aucun référentiel communal de zone
  tendue n'est en base. Choix **protecteur du locataire** : tant que la zone du bail est
  inconnue, un **congé du locataire à 1 mois est accepté** (sans justificatif), marqué
  « zone tendue à vérifier » avec une alerte ; un avertissement s'affiche sur le bail en
  brouillon, et une alerte naît à l'activation. Une zone déclarée « non » exige toujours
  le justificatif du préavis réduit. La zone reste figée au bail une fois connue
  (RM-1.1.7).
- **Honoraires à la charge du locataire** : la **surface habitable** est exigée dès
  qu'une part locataire est demandée (le plafond est en €/m²) ; la part locataire est
  contrôlée **même sans part bailleur saisie** (comptée 0 €) ; les barèmes sont une
  table datée par zone, et **au-delà du dernier barème connu, c'est lui qui
  s'applique** (plus de « pas de plafond » pour une année non publiée).

> [!warning] Mise à jour du 29/09/2026
> Remplace, pour les honoraires, la phrase « Un barème futur inconnu n'est pas
> projeté » (réalisation du 14/09) : le dernier barème connu s'applique désormais aux
> années suivantes, à réviser à chaque arrêté. Source : [[Audit complet du 29 septembre 2026]].

## État dans l'application au 24/11/2026 (préproduction, non publié) — documents du bail (mission palier 1, phase 3)

Relu dans le code après les lots 35, 38, 40, 45 et 46 ([[Mission palier 1 — audit du 22 novembre 2026]] ;
`QUESTIONS.md`, Q40, Q46 et Q47 ; `JURISTE.md`, partie 5, points 3, 4, 8, 10 et 12).
- **Chaque document ne propose que les baux qu'il accepte** : l'avenant seulement pour un bail actif ou en préavis (un
  brouillon se modifie directement ; un bail terminé « ne se modifie plus par avenant ») ; pas de congé du bailleur sur
  un bail terminé, ni quand un congé du locataire est enregistré (juriste, point 4) ; l'accusé de réception d'un congé
  seulement pendant le préavis ; l'acte de cautionnement en préparation du bail ou pendant la location, pas pendant le
  préavis (juriste, point 3).
- **Avenant** : daté par les parties à la signature ; sa référence est tirée du bail et de son contenu, et reste la
  même dans le PDF préparé pour la signature (deux avenants identiques sur un même bail ont donc la même référence :
  Q47, point 3). L'avenant de remplacement d'un colocataire ne vaut que pour un contrat commun, choisit le sortant parmi
  les titulaires et prévoit les signatures du bailleur, du sortant, de l'entrant et des colocataires restants ; faut-il
  aussi celles des cautions ? (juriste, point 12).
- **Colocation** : un colocataire parti n'est plus traité comme locataire dans les documents. Le contrat individuel
  parle du « loyer maximal applicable au logement entier » (voir [[Mentions obligatoires du bail]]).
- **Attestations d'un bail en préavis** : elles donnent la date de fin (« Un congé est enregistré : le contrat prend fin
  le … ») ; faut-il dire qui a donné le congé ? (juriste, point 8).
- **Notice** : un résumé joint à part, pas la notice officielle (Q46 ; [[Mentions obligatoires du bail]]).
- **Baux préparés avant la publication** : l'ancienne mise en page est gardée pour contrôler l'empreinte d'un bail signé
  à son activation (même empreinte vérifiée sur 70 dossiers) ; un circuit de signature préparé mais pas encore envoyé
  sera refusé à l'envoi et à préparer de nouveau (Q40 ; [[Signature électronique]]).

> [!warning] Points à trancher / contradictions (24/11/2026)
> - La section « Contrats individuels de colocation » (14/09) parle du « loyer applicable au logement entier » : c'est un
>   **plafond** du total des contrats individuels, désormais nommé « loyer maximal applicable au logement entier ».
>   Vaut-il en toute zone, ou seulement par renvoi aux zones d'encadrement ? (`JURISTE.md`, partie 5, point 10).
