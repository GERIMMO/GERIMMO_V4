---
type: process
tags: [loyer, impaye, relance, mise-en-demeure]
status: in-progress
created: 2026-07-21
updated: 2026-07-24
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve]]", "[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]"]
---

# Relances et mise en demeure

**En une phrase :** escalade automatique des [[Période de loyer|loyers impayés]], des
relances jusqu'à la mise en demeure.

## Déclencheur
- Loyer non reçu → `confirmRent(received: false)` → statut `impaye` ; puis `sendRentReminder`.

## Acteurs
- Gestionnaire, [[Locataire]] ; alerte au gestionnaire pour le recommandé.

## Étapes (escalade)
1. **Relance 1** puis **Relance 2** : courrier PDF (`document_type: courrier`, `kind: relance`) +
   e-mail au locataire, `reminder_count++`.
2. **Après 2 relances** (`reminder_count >= 2`), la suivante devient une **mise en demeure** :
   PDF `mise_en_demeure`, statut de période `mise_en_demeure`, + **e-mail d'alerte au gestionnaire**
   l'invitant à envoyer le courrier en **recommandé avec AR** (valeur de preuve).

## Résultat / sorties
- Courriers PDF, e-mails, statut de période escaladé.

## Règles et contraintes
- Le courrier officiel exige l'**identité légale du bailleur** sur l'[[Organisation]]
  (`legal_name`, `siren`, adresse) — voir [[Quittance conforme]].
- Idempotence : n'agit que sur les périodes `impaye`.
- **Notification et preuve (Livrable A3, 2026-07-24)** : la mise en demeure est un **acte à
  effet juridique** → **LRAR obligatoire**, notifiée par l'agence (jamais par Gerimmo,
  RM-A3.1). Le délai court depuis la **première présentation**, dont la date est **saisie
  par l'agent** (champ imposé au module 3) ; n° de recommandé et avis scanné stockables
  pour prouver les diligences. La **relance simple**, elle, reste un document courant
  (email/WhatsApp, trace GED suffit). Voir [[Notification et valeur probante]].

## Implications pour l'application
- Génération PDF (`relance-loyer`, `mise-en-demeure`) + file d'envoi e-mail. Voir [[Canaux de communication]].

## Cible V3 (module 3, 2026-07-24) — circuit paramétrable par agence
Le référentiel tranche l'ancienne divergence v0 ↔ code par un **circuit à seuils
paramétrés par agence** (module 18) :
- **Montant plancher** (~50 €) : en dessous, aucune relance — « un locataire devant
  douze euros d'arrondi ne doit pas recevoir une mise en demeure » (le solde reste
  visible).
- **Délais paramétrables** : relance 1 (~5 j après échéance) → relance 2 (~+15 j) →
  **mise en demeure** (~+15 j) ; **le garant est informé dès la relance 2**
  (paramétrable).
- **Chaque relance est horodatée, destinataire et contenu figés** (RM-3.6.3) — la
  preuve des diligences qui fonde le recours (garantie, tribunal, clause résolutoire).
- **Plan d'apurement** : relances suspendues tant qu'il est respecté (RM-3.6.6) ;
  reprise au premier manquement. Trêve hivernale : pas d'expulsion, les relances
  continuent. Colocation solidaire : la relance vise **tous** les colocataires.
- **La dette survit au bail** (RM-3.6.8) ; un impayé **suspend la purge RGPD** du
  locataire (RM-3.6.7). Mise en demeure sans relances préalables : alerte (formalisme
  contestable). Escalade contentieux structurée : **V2** ; procédure judiciaire :
  hors périmètre.

> [!warning] Divergence historique v0 ↔ code — tranchée par le référentiel
> ~~« Validé par défaut + mise en demeure à 7 j » (v0) vs « 2 relances fixes » (code)~~
> → **le module 3 impose des seuils et délais paramétrables par agence** (montant
> plancher + 3 délais). Le code actuel (2 relances codées en dur, `reminder_count`)
> devra migrer vers ce paramétrage. → [[État du projet et décisions ouvertes]]
