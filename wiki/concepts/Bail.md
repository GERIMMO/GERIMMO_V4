---
type: concept
tags: [bail, contrat, alur, signature, colocation, preavis]
status: in-progress
created: 2026-07-22
updated: 2026-08-30
sources: ["[[Analyse concurrentielle]]", "[[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve]]", "[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[2026-07-24-gerimmo-v3-module-0b-dossier-locataire]]", "[[2026-07-24-gerimmo-v3-module-0-biens-et-lots]]", "[[2026-07-24-gerimmo-v3-module-1-bail]]", "[[2026-07-24-gerimmo-v3-module-2-garanties]]", "[[2026-08-05-bailpdf-contrat-de-bail]]", "[[2026-08-05-bailpdf-modele-bail-non-meuble]]", "[[2026-08-05-bailpdf-modele-bail-meuble]]"]
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
| Durée minimale | 3 ans (personne physique, RM-1.1.8) | **1 an — 9 mois étudiant** (sans reconduction) ; reconduction tacite **d'1 an** hors étudiant ([[2026-08-05-bailpdf-modele-bail-meuble]], section III) |
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
(bénéficiaire familial identifié), **vente** (prix obligatoire — le congé vaut offre,
**alerte de préemption à 2 mois**, le droit de préemption lui-même hors périmètre),
motif légitime et sérieux. Locataire protégé (> 65 ans, ressources modestes) : alerte
forte, génération sous responsabilité de l'agence. Notification **hors plateforme en
LRAR/acte** ([[Notification et valeur probante]]) ; l'agent enregistre la date.

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
