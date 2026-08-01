---
type: source
tags: [source, bail, edl, documents, generation, web]
status: stable
created: 2026-08-01
updated: 2026-08-01
source-file: https://bailpdf.com
source-type: site web de modèles de documents locatifs (FR) — explications + PDF
source-date: 2026-08-01
sources: []
---

# Source — bailpdf.com

**En une phrase :** site français de **modèles de documents locatifs** (contrats de
bail, états des lieux, congés, quittances, cautionnement…) avec explications juridiques
et références légales — ingéré le 2026-08-01 à la demande de l'humain pour **reverse-
engineerer les documents que Gerimmo doit produire**, avec la contrainte que tout soit
à terme **remplissable via le bot WhatsApp** (max d'automatisation).

## Ce que la source apporte

- **Catalogue exhaustif** des documents locatifs français et de leur structure : bail
  nu, meublé, colocation, mobilité (+ garage/saisonnier/commercial/pro hors périmètre) ;
  EDL entrée/sortie, inventaire mobilier, grille de vétusté ; quittance, avis
  d'échéance, lettre d'augmentation IRL ; acte de cautionnement, congés
  locataire/bailleur, avenant, notice d'information.
- Pour chaque document : **champs obligatoires, logique conditionnelle** (nu/meublé,
  zone tendue, durée, préavis, plafonds) et **références légales** (loi 89-462, ALUR,
  décrets 2015-587 / 2015-981 / 2016-382, loi ELAN, ordonnance cautionnement 2021-1192,
  loi Climat).

## Affirmations clés (retenues pour Gerimmo)

1. **Plafonds de dépôt** liés au type : 1 mois (nu), 2 mois (meublé), **0** (mobilité).
2. **Meublé** = inventaire mobilier obligatoire + conformité liste **décret 2015-981**
   (11 catégories) ; durée 1 an / 9 mois étudiant.
3. **Colocation bail unique** : solidarité + garant ; extinction de solidarité du
   partant **6 mois après départ ou remplaçant** (aligné RM-1.3.5).
4. **EDL** : constat par pièce + **relevés de compteurs** + **clés/badges** + photos ;
   comparatif entrée/sortie qui fonde le chiffrage des retenues.
5. **Champs obligatoires 2024** : identifiant fiscal du logement (13 chiffres), surface
   Boutin, notice d'information à jour (2023).
6. **DPE** : location classe **G interdite** (2025), **F** à venir.
7. **Documents quasi 100 % automatisables** : quittance, avis d'échéance, notice, IRL.

## Limites de la source

- Site **marketing/commercial** (vend de la génération de documents et compare des
  concurrents) — le **wording juridique n'est pas une référence formelle** : pour les
  mentions légales (ex. cautionnement post-2022), Gerimmo doit s'appuyer sur le texte
  officiel (Légifrance), pas sur la formulation du site.
- Sections déménagement / GLI / comparatifs concurrents = **hors périmètre gérance**.

## Pages créées / mises à jour par cet ingest

[[Documents a generer et automatisation WhatsApp]] (synthèse créée) · [[Bail]] ·
[[État des lieux]] · [[Garantie]] · [[Diagnostic]]

> [!warning] Contradictions signalées
> Détaillées dans [[Documents a generer et automatisation WhatsApp]] : plafond de dépôt
> dynamique, blocage DPE G, non-rétroactivité IRL, texte légal exact du cautionnement
> (2022), insuffisance du modèle `baux.locataire_principal` pour la colocation.
