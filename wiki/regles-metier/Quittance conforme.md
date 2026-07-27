---
type: business-rule
tags: [quittance, legal, loyer]
status: in-progress
created: 2026-07-21
updated: 2026-07-21
sources: ["[[Dépôt Gerimmo-V3]]"]
---

# Quittance conforme et courriers officiels

**Énoncé :** une [[Document|quittance]] doit **détailler loyer et charges séparément**, et
tout courrier officiel doit porter l'**identité légale du bailleur**.

## Fondement
- **Loi du 6 juillet 1989, art. 21** : la quittance distingue le loyer et les charges.
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
