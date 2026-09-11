---
type: process
tags: [loyer, quittance, facturation-locative]
status: in-progress
created: 2026-07-21
updated: 2026-09-11
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

## État dans l'application au 11/09/2026

Le modèle appel / encaissement / quittance de la cible V3 **est en place** :
appels proratisés à l'entrée et à la sortie, encaissement saisi à la main et
imputé du plus ancien au plus récent (RM-3.3.2), quittance après encaissement
intégral et reçu sur paiement partiel (RM-3.4.1, RM-3.4.2).

Depuis le 11/09, la **génération est automatique** : une tâche planifiée
(`cycle_mensuel_interne`, pg_cron, le 1er du mois à 5 h UTC) parcourt les baux
actifs et en préavis, crée les appels manquants et resynchronise quittances et
reçus. Elle ne sert **pas** les organisations dont l'abonnement est fermé
(lecture seule). Le bouton « Générer l'échéancier » reste, comme rattrapage.

Une seconde tâche, quotidienne, **constate les impayés** sous forme d'alerte par
bail (`generer_alertes_impayes`, 5 h 30 UTC) : montant restant dû sur les termes
échus, depuis quand, et combien de termes. Elle se ferme d'elle-même au
paiement. Voir [[Relances et mise en demeure]] pour ce qu'elle ne fait pas.

> [!warning] Ce qui manque encore
> - **L'appel n'est pas envoyé au locataire.** Il est créé et visible dans son
>   espace ; aucun e-mail ne part à la création. Seules les quittances
>   s'envoient, et sur clic du gérant.
> - **Le jour d'échéance** est celui du bail (`jour_echeance`, 1 par défaut) ;
>   la cible v0 parlait d'un 4ᵉ jour du mois, jamais tranché.

> [!warning] Intention produit v0 (précisions)
> D'après [[2026-07-21-fonctionnalites-par-persona-v0]] : quittance **générique par défaut**, disponible sur la plateforme + e-mail, **validée par l'agence ou le propriétaire** ; l'agence peut générer une quittance **sur-mesure** selon son template (`document_templates`, voir [[Document]]). Voir aussi la divergence « loyer validé par défaut » dans [[Relances et mise en demeure]].
