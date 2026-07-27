---
type: process
tags: [loyer, quittance, facturation-locative]
status: in-progress
created: 2026-07-21
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve]]", "[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]", "[[2026-07-24-gerimmo-v3-a6-doctrine-financiere]]"]
---

# Quittancement des loyers

**En une phrase :** générer les échéances mensuelles, confirmer la réception du loyer et
produire la [[Document|quittance]].

## 1. Génération des échéances
- **Déclencheur** : le 1er du mois (Vercel Cron), RPC `generate_rent_periods_for_month`, ou
  `ensureRentPeriodsForMonth` depuis le dashboard.
- Pour chaque **location active** ([[Occupation d'un bien]], `occupant_type = 'locataire'`) :
  upsert **idempotent** sur (bien, locataire, mois), échéance au **4ᵉ jour du mois**,
  montant = `biens.monthly_rent_cents`.
- **Sortie** : lignes [[Période de loyer]] au statut `attendu`.

## 2. Confirmation & quittance
- **Déclencheur** : `confirmRent({periodId, received})` par le gestionnaire.
- Reçu → période `attendu → recu` ; génération d'une **quittance en brouillon** (document `quittance`,
  visibilité `locataire`) + **PDF** (`genererQuittancePdf`), `quittance_status = a_valider`.
- `validateQuittance` → document `actif` (visible locataire). Si le locataire a un e-mail :
  mise en file `document_email_outbox` (`pret`) → `quittance_status = envoyee` ; sinon `validee` (remise papier).

## Acteurs
- Gestionnaire (voir `can_manage_rent` dans [[Période de loyer]]), [[Locataire]].

## Résultat / sorties
- Quittance PDF dans l'espace locataire + e-mail éventuel (via **Resend**, voir [[Canaux de communication]]).

## Règles et contraintes
- Loyer et charges **séparés** sur la quittance (voir [[Quittance conforme]]).
- Non reçu → statut `impaye` → [[Relances et mise en demeure]].
- La quittance est un **document courant** (Livrable A3) : email ou espace personnel,
  date d'émission, **aucune exigence de preuve** — voir [[Notification et valeur probante]].

## Cible V3 (module 3, 2026-07-24) — le cycle mensuel complet
Le référentiel enrichit le flux actuel :
- **Appel de loyer** émis par tâche planifiée au jour paramétré (loyer + provisions,
  prorata d'entrée/sortie, report du solde antérieur), envoyé au locataire.
- **Encaissement saisi manuellement** (pas de sync bancaire, décision actée) et
  **imputé du plus ancien au plus récent** (RM-3.3.2, règle légale — suivi de
  l'ancienneté de la dette), modifiable par l'agent. Le
  [[2026-07-24-gerimmo-v3-a6-doctrine-financiere|livrable A6]] complète (RM-A6.7) :
  **la précision du débiteur prime** sur l'ordre d'ancienneté (règle légale) ; la
  correction de l'agent est tracée ; et **la banque fait foi sur montants et dates
  reçus** — en cas d'écart au rapprochement (manuel), Gerimmo se corrige par
  écriture au réel, saisie rétroactive ou contre-écriture (voir [[Comptabilité]]).
- **La quittance n'est émise qu'après encaissement intégral** (RM-3.4.1) ; **un
  paiement partiel produit un reçu, jamais une quittance** (RM-3.4.2 — la quittance
  libère, le reçu constate ; quittancer un partiel = renoncer au solde). Excédent →
  imputé sur l'appel suivant.
- Fin de bail : trop-perçu et dettes intégrés au [[Solde de tout compte]].
Voir [[Révision annuelle IRL]] pour l'évolution du loyer.

> [!warning] Divergences code ↔ cible V3
> Le code actuel confirme « loyer reçu ? » en bloc (`confirmRent`) et génère la
> quittance à la confirmation : il n'a **ni appel de loyer envoyé au locataire, ni
> encaissement partiel, ni reçu, ni imputation multi-mois**. Le modèle
> appel/encaissement/quittance du module 3 est une refonte du flux `rent_periods`.

> [!warning] Intention produit v0 (précisions)
> D'après [[2026-07-21-fonctionnalites-par-persona-v0]] : quittance **générique par défaut**, disponible sur la plateforme + e-mail, **validée par l'agence ou le propriétaire** ; l'agence peut générer une quittance **sur-mesure** selon son template (`document_templates`, voir [[Document]]). Voir aussi la divergence « loyer validé par défaut » dans [[Relances et mise en demeure]].
