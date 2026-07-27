---
type: process
tags: [planification, creneaux, incident]
status: in-progress
created: 2026-07-21
updated: 2026-07-24
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[2026-07-24-gerimmo-v3-module-10-rdv-et-planning]]"]
---

# Planification d'intervention

**En une phrase :** négocier un créneau entre l'[[Artisan]] et le [[Locataire]] après
sélection du [[Devis]], par un système de « rounds ».

## Déclencheur
- `createScheduleRequest` après sélection du devis (statut `demande_disponibilites`, `current_round = 1`).

## Acteurs
- [[Artisan]] (propose les créneaux), gestionnaire (transmet/valide), [[Locataire]] (choisit).

## Étapes
1. L'artisan propose **au moins 3 créneaux** (`proposeScheduleSlots` / bot `saveScheduleSlots`,
   format `AAAA-MM-JJ HH:MM-HH:MM`) → demande `creneaux_proposes`, lot `proposee`.
2. `decideSchedule` gère les actions :
   - `transmission_locataire` → `transmis_locataire` ;
   - `refus_locataire` → `relance_artisan`, `current_round + 1`, créneaux `refuse` ;
   - `annulation` ; `acceptation_directe` / `choix_locataire` → `valide`, créneau `selectionne`.
3. Le locataire choisit son créneau par **bot** : `showTenantSchedules` → `showTenantSlots` → `validateTenantSlot`.

## Résultat / sorties
- Demande `valide` + créneau retenu (`selected_slot_id`, `validated_at`) → [[Intervention et clôture]].

## Règles et contraintes
- Minimum **3 créneaux** proposés par l'artisan.

## Spécification V3 (module 10, 2026-07-24)
- **Pas de moteur de disponibilités** (parti pris) : l'artisan propose des créneaux à
  la mission — **en premier** (il vient d'accepter), **3 minimum** (bloquant).
- Le locataire choisit **ou refuse tout mais doit alors proposer 3 créneaux**
  (RM-10.2.2 — la contrainte qui fait converger en deux tours). Sans réponse :
  relance J+2, alerte gérant J+4.
- **Arbitrage du gérant après 6 refus** : réglé au **téléphone**, RDV saisi ; tous les
  créneaux refusés conservés ; **refus persistant du locataire tracé et opposable**.
- **Absences attribuées** (RDV « manqué ») — celles de l'artisan pèsent sur son score
  de fiabilité ([[Artisan]]). Rappels : **veille systématique**, J-7 si posé assez tôt.
- Même mécanique à deux acteurs pour les RDV sans artisan (EDL, visites — l'agent
  propose). Agenda **cloisonné par persona** (l'artisan voit toutes agences
  confondues ; le mandant rien).

## Machine à états cible du rendez-vous (référentiel V3, Livrable A5 — module 10)
**proposé** → confirmé ou contre-proposé (refus locataire) · **contre-proposé** →
confirmé ou **arbitrage** (refus artisan) · **arbitrage** → confirmé (le gérant saisit
le RDV) · **confirmé** → honoré, reporté ou manqué · **reporté** / **manqué** → proposé
(nouveau cycle) · **honoré** = terminal. Voir [[Machines à états et événements]].

> [!warning] Points à trancher / contradictions
> - **Vocabulaire du code ≠ registre V3** : le code parle de « rounds » et de statuts
>   `demande_disponibilites`/`creneaux_proposes`/`transmis_locataire`/`valide`, le
>   registre V3 de proposé/contre-proposé/arbitrage/confirmé/honoré/reporté/manqué.
>   L'« arbitrage » du gérant correspond au round d'escalade — correspondance à formaliser.
