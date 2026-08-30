---
type: synthesis
tags: [documents, generation, pdf, bail, templates, documents-0]
status: in-progress
created: 2026-08-30
updated: 2026-08-30
sources: ["[[Documents a generer et automatisation WhatsApp]]", "[[Structure du modèle-type de bail]]", "[[Mentions obligatoires du bail]]"]
---

# État des lieux — génération de documents (sprint Documents-0)

**Objet :** où en est-on, document par document, entre les **50 épreuves PDF**
(`Projet/Gerimmo/pdf-vierges/`, version 2026.11) et les **données réellement en
base** ? Compilé le 30/08 à partir du dépouillement automatique des 50 épreuves
(champs en italique = à remplir), du **dictionnaire annoté des baux**
(`baux-annotes/champs-baux-et-annexes.md` : 459 champs, statuts Automatique /
À demander / Relevé sur place, 147 blocs conditionnels) et du schéma des
migrations.

**Décisions de cadrage déjà prises (Tahir, 30/08) :** les épreuves font foi
pour le design et les sections ; il faut un **vrai fichier PDF** fidèle à cette
mise en forme, rangé dans l'onglet Documents ; pour le bail, un bouton
**« Générer le bail »** sur le bail en brouillon dès que le locataire est
renseigné ; le cycle de vie précis du document généré sera affiné ensuite.

## 1. Les manques transverses (touchent presque tout)

| Manque | Ce qu'il débloque |
|---|---|
| **Adresse postale des personnes** (bailleur, locataire, caution) + commune de naissance + qualité (physique/SCI) | l'en-tête de tous les actes |
| **Identité de l'agence** : adresse, SIRET, forme, carte pro T + CCI, garantie financière, RCP, n° registre des mandats (S9b/S15) | en-tête/pied des 50 documents + mandats 57-64 |
| **Lieu du document** (commune de signature) | pied de tous |
| **IBAN / modalités de règlement** | 17, 22b, 28, 38, 54, 63 |
| **Table `textes` réglementaires** (notice, coordonnées ADIL/CDC) | 05, blocs « Vos droits » |

## 2. Couverture par vagues (du plus au moins couvert)

### Vague A — quasi 100 % automatiques (0 question)
18 quittance · 19 reçu partiel · 20 reçu de dépôt · 23 révision IRL ·
21 prorata · 13 rappel d'assurance · 05 notice (avec la table `textes`) ·
17 avis d'échéance (manque IBAN).

### Vague B — bien couverts (1 à 5 champs à ajouter)
37 accusé de congé (heure d'EDL) · 40 attestation fin de bail (destinataire) ·
28 relance (IBAN) · 29 mise en demeure (caution structurée) · 49 écriture
rectificative · 59 rapport de gestion (n° registre) · 51/52 fiscal (régime) ·
14/15 EDL (DAAF, heure, nouvelle adresse du locataire — compteurs et clés ✓) ·
63 justificatif de versement (IBAN) · 38 solde de tout compte (IBAN,
provision 20 %) · 07 inventaire (version sortie) · 06 DDT (diagnostics à
enrichir : résultat, classe GES, dépenses, diagnostiqueur ×3, type « bruit »
absent de l'enum).

### Vague C — à moitié : fiches à enrichir + questionnaire de génération
- **01 bail nu ≈ 40 % aujourd'hui** : ✅ parties, logement de base, identifiant
  fiscal, zone tendue, loyer/charges + mode/dépôt/dates/jour, IRL trimestre,
  colocataires et garants (boucles), calculs moteur. 🔧 ~16 champs de fiches
  (adresse + qualité bailleur ; lieu de naissance + adresse actuelle locataire ;
  lot : chauffage, eau chaude, TIC, autres parties, locaux privatifs, permis de
  louer ×3, servitude, dernier loyer ×3, loyers de référence ×2 ; bien :
  parties communes). ❓ ~25-30 champs de questionnaire (honoraires ×6,
  modalités de paiement, complément de loyer, durée réduite + motif,
  travaux ×7, contribution économies, assurance pour compte, IBAN, conditions
  particulières, date de signature).
- **02 meublé** : idem + `est_bail_etudiant` (dépôt 2 mois ✓ contrôlé).
- **03 coloc bail unique** : idem + répartition chambres/loyer, préavis
  colocataire (quote-parts et solidarité ✓).
- **04 coloc contrats séparés** : + parties privatives par chambre
  (désignation/surface/volume/équipements), loyer logement entier.
- **10 acte de cautionnement** : bail ✓ ; identité caution à persister sur sa
  fiche personne ; ~12 champs d'engagement (simple/solidaire, plafond, durée).
- **09 avenant de solidarité** : sortant ✓ (congé, solidarité 6 mois) ;
  entrant = questionnaire.
- **34 congé bailleur** : congé ✓ ; motif à structurer (prix de vente,
  bénéficiaire de la reprise).
- **25 régularisation** : totaux ✓ ; détail par poste absent.
- **48 clôture mensuelle** : écritures ✓ ; volet « rapprochement/comptes » à
  adapter à la doctrine journal de gestion.
- **22 attestation de loyer** : loyer ✓ ; organisme, lien, occupants.
- **47 récapitulatif d'incident** : incident ✓ ; chronologie, entreprise (S13).
- **08 avenant au bail** : questionnaire pur (24 champs), 7 automatiques.
- **41 autorisation de travaux** : questionnaire pur, acceptable.

### Vague D — dépendants de modules pas encore développés
22b attestation CAF (allocataire, tiers payant) · 31 protocole d'apurement
(entité plan) · 53 relevé d'honoraires (TVA, prestations) · **57/58/61/64
mandats** (identité réglementaire agence — S9b/S15) · 54 appel de fonds
(objet accord mandant) · 11 bon de visite / 12 pièces justificatives (entité
candidature) · **42/45/46/56** (artisans/devis/interventions — S13) ·
55 facture d'abonnement (Stripe — S11).

## 3. Dette de référentiel consolidée (saisie une fois, servie partout)

- **Personne** : adresse, commune de naissance, qualité, profession.
- **Bien** : parties communes (type d'habitat et période de construction
  dérivables ✓).
- **Lot** : chauffage, eau chaude, TIC, autres parties, locaux privatifs,
  permis de louer (×3), servitude, dernier loyer (×3), loyers de
  référence (×2).
- **Diagnostics** : résultat, classe GES, estimation de dépenses,
  diagnostiqueur (×3), type « nuisances sonores ».
- **Organisation** : lieu du document + identité complète (partagé S9b/S15).
- **Nouvelles structures** : table `textes` ; questionnaire de bail persisté
  (honoraires, paiement, complément, travaux, conditions particulières, IBAN —
  défauts d'agence naturels) ; plus tard : candidature, plan d'apurement,
  avenants.

## 4. Proposition d'ordre de réalisation

1. **Socle** : moteur de rendu PDF fidèle aux épreuves + type GED + pied
   « Réf · Modèle · Empreinte » + lieu/identité minimale de l'organisation.
2. **Vague A** (8 documents, 0 question) — gains immédiats, dont quittance et
   avis d'échéance.
3. **Bail nu + annexes** (01, 05, 06, 07) : fiches enrichies + bouton
   « Générer le bail » + questionnaire — puis 02/03/04 par variantes.
4. **Vague B** au fil de l'eau (IBAN + petits champs).
5. **Vague D** : au rythme des modules S9b, S11, S13.

> [!warning] Points à trancher
> - Où persister le questionnaire de bail (colonnes `baux` vs table dédiée) et
>   lesquels de ses champs ont un défaut d'agence.
> - Moteur de rendu : Chromium serverless sur Vercel (à valider en conditions
>   réelles) — sinon service de rendu séparé.
> - Le dictionnaire annoté (`champs-baux-et-annexes.md`) reste à ingérer comme
>   source wiki à part entière.
