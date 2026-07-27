---
type: concept
tags: [loyer, quittance, facturation-locative]
status: in-progress
created: 2026-07-21
updated: 2026-07-24
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]"]
---

# Période de loyer

**Définition :** un loyer attendu pour un triplet (**[[Bien]] + [[Locataire]] + mois**).
Table `rent_periods`. Base du flux « loyer reçu ? → quittance / relance ».

## Attributs métier notables
- `period_month`, `due_date` (**4ᵉ jour du mois**), `amount_cents`.
- Depuis le 2026-07-20 : **`rent_cents` + `charges_cents` séparés** et figés à l'échéance
  (obligation légale — voir [[Quittance conforme]]).
- `status` : `attendu` / `recu` / `impaye` / `mise_en_demeure` / `annule`.
- Relances : `reminder_count`, `last_reminder_at`, `mise_en_demeure_at`.
- Quittance : `quittance_document_id`, `quittance_status` (`aucune`/`a_valider`/`validee`/`envoyee`).
- **Unicité** : (bien, locataire, mois).

## Rôle dans le métier
- Piloter l'encaissement mensuel : génération, confirmation de réception, quittance, relances.

## Relations
- Génère une [[Document|quittance]] (type `quittance`). Suit [[Occupation d'un bien]] (location active).
- Voir [[Quittancement des loyers]], [[Relances et mise en demeure]], [[Modèle de données]].

## Cible V3 (module 3) — vers appel / encaissement / quittance
Le référentiel remplace le triplet `rent_periods` par des objets distincts rattachés au
**[[Bail]]** : **échéancier** (paramétré une fois : périodicité, à échoir/terme échu,
jours, provision/forfait), **appel de loyer** (créance envoyée au locataire, prorata,
report de solde), **encaissement** (saisi manuellement, **imputé du plus ancien au plus
récent**), **quittance** (après encaissement intégral seulement) — voir
[[Quittancement des loyers]]. Statut cible de l'objet : voir la machine à états
« période clôturée » d'A5 ([[Machines à états et événements]]).

## Qui peut gérer (`can_manage_rent`)
- [[Super Admin]], gestionnaires d'incidents de l'org (agence : admin+agent), rôle `proprietaire`,
  ou occupant propriétaire du bien. Le [[Locataire]] ne voit que ses propres quittances.
