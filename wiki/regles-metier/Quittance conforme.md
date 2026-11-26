---
type: business-rule
tags: [quittance, legal, loyer]
status: in-progress
created: 2026-07-21
updated: 2026-11-26
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-08-05-bailpdf-contrat-de-bail]]", "[[Mission palier 1 — audit du 22 novembre 2026]]", "log.md — entrée « deploy » du 25/11/2026 (publication de 062296e2)"]
---

# Quittance conforme et courriers officiels

**Énoncé :** une [[Document|quittance]] doit **détailler loyer et charges séparément**, et
tout courrier officiel doit porter l'**identité légale du bailleur**.

## Fondement
- **Loi du 6 juillet 1989, art. 21** : la quittance distingue le loyer et les charges.
- La quittance est **gratuite** : une clause facturant au locataire les frais d'envoi
  est réputée non écrite ([[Clauses abusives et clauses résolutoires]],
  [[2026-08-05-bailpdf-contrat-de-bail|BailPDF]]).
- Migration `20260720180000_fondations_documents_officiels.sql`.
> « Un courrier officiel sans l'identité et l'adresse de son auteur n'a aucune valeur. »

## Portée
- S'applique à : [[Période de loyer]], [[Quittancement des loyers]], [[Relances et mise en demeure]], [[Organisation]].

## Paramètres / valeurs
- Sur `rent_periods` : **`rent_cents` + `charges_cents`** distincts, **figés à l'échéance** (une
  quittance rééditée reflète le montant dû à l'époque).
- Sur `organizations` : `legal_name`, `siren`, adresse, contact. À défaut de `legal_name`, `name` est utilisé.

## Conséquences si non respectée
- Quittance non conforme ; courrier de relance/mise en demeure sans valeur juridique.

## Implications pour l'application
- Contrôles de complétude de l'identité légale avant émission d'un courrier officiel.
- Historisation des montants (pas de recalcul rétroactif).

## État dans l'application au 24/11/2026 (préproduction le 24/11 ; en production depuis le 25/11/2026, version `062296e2`) — émetteur et adresse (mission palier 1, phase 3)

Relu dans le code après les lots 36, 37 et 46 à 49 ([[Mission palier 1 — audit du 22 novembre 2026]] ;
`QUESTIONS.md`, Q42 et Q52 ; `JURISTE.md`, partie 5, points 2 et 19).
- **L'émetteur est le bailleur hors agence.** Chez un [[Propriétaire bailleur]] qui gère lui-même (personne ou SCI), les
  documents d'un [[Bail]] — quittance, bordereau des clés, courriers de charges, relances, demande d'attestation
  d'assurance… — sont émis et signés au nom des **détenteurs du lot**, avec leur adresse, et non plus au nom technique
  de l'espace. « Gestionnaire » et « le bailleur ou son mandataire » n'apparaissent qu'en agence, où l'agence émet.
- **Adresse du bailleur exigée.** Chez un propriétaire direct, ces documents sont refusés tant que le domicile ou le
  siège du bailleur n'est pas renseigné ; « À renseigner » mène à sa fiche. Est-ce une mention requise sur chacun, ou
  une adresse de contact (celle de l'espace) suffit-elle ? (juriste, point 2).
- **La quittance consultée en ligne et son PDF n'ont pas la même adresse de bailleur** chez un propriétaire direct : en
  ligne, le nom des bailleurs avec l'adresse du **profil de l'espace** ; en PDF, le nom **et** l'adresse des détenteurs
  (Q52). Le lot 48 avait aligné les deux par une modification de la base ; elle a été **retirée** au lot 49 : le
  locataire, même ancien colocataire, aurait lu l'adresse, l'e-mail et le téléphone des propriétaires actuels, même
  après une vente, et des quittances déjà émises lui seraient devenues inaccessibles tant que la fiche du propriétaire
  n'avait pas d'adresse. Son adresse reste celle du profil de l'espace, comme dans `81740dec` : le lot 49, compris dans `062296e2` (en
  production depuis le 25/11/2026), retire l'alignement. La version
  alignée est gardée dans l'historique de la branche.
- **Mode de règlement en clair** (« par chèque » au lieu du code de la base) et période d'un terme au prorata lisible
  (lot 36 ; Q41).

> [!warning] Points à trancher / contradictions (24/11/2026)
> - **Deux quittances, deux adresses** pour un même paiement (en ligne et PDF) : quel bailleur, quelle adresse, quelles
>   coordonnées ; le bailleur de la date de la quittance ou le propriétaire actuel ? (Q52, options A et B ; juriste,
>   point 19). Rien n'est tranché ici.
> - La section « Paramètres / valeurs » ci-dessus (identité légale lue sur `organizations`, `name` à défaut de
>   `legal_name`) décrit l'état d'origine : chez un propriétaire direct, le PDF lit désormais les détenteurs du lot ;
>   seule la quittance en ligne reste à l'adresse de l'espace.
