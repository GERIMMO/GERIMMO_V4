---
type: synthesis
tags: [documents, bail, edl, whatsapp, automatisation, generation]
status: in-progress
created: 2026-08-01
updated: 2026-08-01
sources: ["[[2026-08-01-bailpdf-com]]", "[[Bail]]", "[[État des lieux]]", "[[Diagnostic]]", "[[Garantie]]", "[[Quittancement des loyers]]"]
---

# Documents à générer et automatisation WhatsApp

Blueprint des documents que Gerimmo doit produire, issu de l'ingestion de
[[2026-08-01-bailpdf-com|bailpdf.com]] (16 documents types analysés), **relu au
prisme d'une contrainte de conception majeure posée par l'humain (2026-08-01) :**

> **Tout devra à terme être rempli depuis un téléphone via le bot WhatsApp** — donc
> pour chaque document, le **maximum de champs auto-remplis** depuis les données déjà
> dans Gerimmo, et le **minimum de questions** posées à l'humain.

Chaque champ est donc classé **AUTO** (dérivable d'une entité existante :
[[Organisation]], [[Compte, personne et adhésion|persons]], [[Bien]], [[Lot]],
[[Diagnostic]], détentions, [[Bail|baux]], [[Document|documents]]) ou **ASK**
(à collecter — devient une question du bot).

## Catalogue des documents

| Document | Génération | Périmètre Gerimmo |
|---|---|---|
| **Bail nu** (vide, résidence principale) | À générer | [[Bail]] |
| **Bail meublé** (+ inventaire) | À générer | [[Bail]] |
| **Bail colocation** (unique solidaire) | À générer | [[Bail]] (gap modèle) |
| **Bail mobilité** (1–10 mois, ELAN) | À générer | Bail — variante |
| **EDL d'entrée** | À générer | [[État des lieux]] |
| **EDL de sortie** (+ comparatif, chiffrage) | À générer | [[État des lieux]] |
| **Inventaire du mobilier** (annexe meublé) | À générer | Nouveau |
| **Quittance de loyer** | **100 % auto** | [[Quittancement des loyers]] |
| **Avis d'échéance** | Quasi auto | [[Quittancement des loyers]] |
| **Lettre d'augmentation IRL** | Auto (si flux INSEE) | [[Révision annuelle IRL]] |
| **Acte de cautionnement solidaire** | À générer | [[Garantie]] |
| **Congé donné AU locataire** (bailleur) | À générer | [[Bail]] |
| **Congé DU locataire** (préavis départ) | À générer | [[Bail]] |
| **Avenant au bail** | À générer | [[Bail]] |
| **Notice d'information** (annexe fixe) | Joindre le modèle officiel | 0 saisie |
| Bail garage/saisonnier/commercial/pro, attestation d'hébergement | Hors périmètre gérance | — |

## Données manquantes à stocker (le modèle actuel ne les a pas)

**Sur [[Bien]] / [[Lot]] :** identifiant fiscal du logement (13 chiffres, obligatoire
depuis 2024) ; **flag zone tendue / encadrement** (dérivable par table INSEE des
communes via code postal) + loyers de référence encadrés ; loyer + date de départ du
précédent locataire (clause vacance < 18 mois) ; travaux depuis le dernier bail ; type
et date d'entretien du chauffage, présence **DAAF** ; grille de vétusté rattachée ;
extrait du règlement de copropriété.

**Nouvelle entité `inventaire_mobilier`** (lignes : pièce / objet / quantité / état /
observations) + checklist de conformité **décret 2015-981** (11 catégories).

**Enrichir [[État des lieux]]** (aujourd'hui un stub — cf.
[[État des lieux#La structure]]) : **relevés de compteurs** (eau froide/chaude, gaz,
élec HP/HC) entrée ET sortie ; **clés/badges** (nombre + références, remise/restitution) ;
grille de notation **par pièce** (pas une liste plate) avec photo par ligne ; nouvelle
adresse du locataire en sortie ; chiffrage des dégradations (lignes + devis/factures).

**Sur [[Bail|baux]] :** trimestre IRL de référence + valeurs IRL N/N-1 + clause de
révision (bool) + date anniversaire ; **structure colocation** (bail unique vs
individuels, **quotes-parts de loyer par colocataire**, surface privative, **période de
solidarité résiduelle** de 6 mois) ; motif de mobilité + justificatif ; nature du
cautionnement (simple/solidaire) + durée.

**Ailleurs :** IBAN/BIC d'encaissement (avis d'échéance) ; attestation d'assurance du
locataire (pièce + validité) ; sur [[Compte, personne et adhésion|persons]] locataire :
statut étudiant (meublé 9 mois), âge ≥ 65 ans + revenus modestes (protection congé),
adresse actuelle avant emménagement.

## Surface de questions minimale (tout auto-rempli au maximum)

Si Gerimmo pré-remplit tout l'AUTO, voici **l'ensemble dédupliqué** des questions que
le bot aurait à poser — c'est la « surface de saisie humaine » cible :

**A · Setup bien/bail (une fois) :** identifiant fiscal · zone d'encadrement (idéalement
auto par code postal) · loyer/date du précédent locataire · travaux depuis le dernier
bail · charges au réel ou forfait · trimestre IRL · IBAN · annexes fournies (cave,
parking, ascenseur, cuisine équipée) · chauffage (type/entretien) + DAAF.

**B · Selon le type :** locataire étudiant (meublé 9 mois) · checklist mobilier
décret 2015-981 · colocation (structure + quotes-parts + surface par colocataire) ·
bail mobilité (motif + justificatif + durée).

**C · Personnes :** adresse actuelle du locataire · cautionnement (simple/solidaire +
durée) · signature du garant · attestation d'assurance.

**D · État des lieux (entrée & sortie) :** date · état par pièce/élément
(neuf/bon/usage/mauvais + remarque) · relevés compteurs · clés/badges · photos par
pièce · (sortie) nouvelle adresse + dégradations chiffrées · inventaire mobilier.

**E · Événements :** congé locataire (date + préavis réduit motivé) · congé bailleur
(motif + bénéficiaire/prix) · avenant (objet + conditions + effet) · avis d'échéance
(frais ponctuels).

**Documents 100 % automatisables (aucune question) :** [[Quittancement des loyers|quittance]],
avis d'échéance standard, notice d'information (annexe fixe), lettre d'augmentation IRL
(si flux INSEE intégré). **Cibles idéales de génération silencieuse par le bot.**

> [!note] Décision actée (humain, 2026-08-01) — garant
> Le garant suit **la loi et la pratique** : rattaché à **un colocataire nommé** (acte
> de cautionnement nominatif) ; si l'acte porte une **clause de solidarité**, le
> bailleur peut le solliciter au-delà de la part de son colocataire (jusqu'au total) ;
> mais la **loi ALUR plafonne** l'engagement du garant d'un colocataire **partant à
> 6 mois après son départ** (ou dès l'acceptation d'un remplaçant). Réconcilie
> RM-1.3.8 (garant nominatif) et la pratique du bail unique. Voir [[Garantie]].

> [!warning] Contradictions / points à trancher (vs droit français)
> - **Plafond de dépôt** : doit être **dynamique** selon le type (1 mois nu, 2 mois
>   meublé, **0** mobilité). Un champ dépôt libre est une source d'erreur légale.
> - **DPE G/F** : location classe **G interdite** (2025), **F** à venir (2028).
>   Gerimmo devrait **bloquer la génération de bail** si DPE = G (alerte si F) — non
>   prévu. Complète RM-0.6.x et la révision IRL déjà bloquée en F/G.
> - **IRL non-rétroactif** : révision perdue si non appliquée sous 12 mois → il faut un
>   champ « date limite d'application » et une alerte (risque de perte de droit).
> - **Réforme cautionnement 2022** (ordonnance 2021-1192) : la mention manuscrite figée
>   (« lu et approuvé ») est assouplie ; l'obligatoire est la **connaissance du montant
>   et de l'étendue**. Gerimmo doit générer le **texte légal exact**, pas le wording du
>   site source.
> - **Colocation** : `baux.locataire_principal` (singulier) est **structurellement
>   insuffisant** pour un bail unique solidaire (multi-locataires + quotes-parts +
>   solidarité résiduelle). C'est le plus gros écart du modèle de données.
> - **Champs obligatoires depuis 2024** (identifiant fiscal, surface Boutin, notice à
>   jour 2023) sans source aujourd'hui : sans eux, le bail est **incomplet au sens légal**.

## Implications de séquencement

- La **génération de documents** (bail, congés, avenant, caution) est cadrée par le
  circuit [[Signature électronique]] (Yousign, **V1 / sprint 10**) ; en V0 le bail
  reste un **dépôt de PDF**.
- L'**EDL réel** (compteurs, clés, grille par pièce, photos) reste un chantier dédié —
  cf. le stub actuel ([[État des lieux]]) — et sa version mobile est au **sprint 13**.
- La **saisie conversationnelle WhatsApp** est le **sprint 12** ([[Canaux de communication]]) :
  ce blueprint définit, par document, la liste des questions du bot.
- Les **quittances / avis d'échéance / IRL** relèvent du **sprint 5**
  ([[Quittancement des loyers]], [[Révision annuelle IRL]]) — documents quasi 100 % auto.

## Relations

Source : [[2026-08-01-bailpdf-com]]. Alimente : [[Bail]] (champs manquants,
colocation), [[État des lieux]] (compteurs/clés/pièces), [[Garantie]] (nature du
cautionnement), [[Diagnostic]] (blocage DPE G), [[Révision annuelle IRL]] (trimestre +
non-rétroactivité), [[Quittancement des loyers]] (documents auto).
