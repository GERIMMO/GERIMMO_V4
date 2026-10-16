---
type: process
tags: [planification, creneaux, incident]
status: in-progress
created: 2026-07-21
updated: 2026-10-16
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[2026-07-24-gerimmo-v3-module-10-rdv-et-planning]]", "[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Propositions de fonctions majeures — version candidate du 13 octobre 2026]]"]
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

## État dans l'application au 11/09/2026

Le rendez-vous se négocie en deux tours, et la base tient les règles :

- **L'artisan propose en premier**, trois dates au minimum (RM-10.1.1) ; le
  locataire en retient une, ou les refuse toutes et **contre-propose** à son
  tour (RM-10.2.2). Au-delà de **six refus**, l'arbitrage revient au gérant
  (RM-10.4.1) et les écrans le disent des deux côtés. Les créneaux refusés sont
  **conservés** : le refus persistant est opposable (RM-10.4.4).
- **On ne retient pas sa propre proposition.** Corrigé le 11/09 : le locataire
  pouvait retenir l'une de SES dates, ce qui plaçait la mission à une heure que
  l'artisan n'avait pas acceptée — et lui faisait porter le rendez-vous manqué
  (RM-10.5.3).
- **Déplacer un rendez-vous défait le rendez-vous en cours**, et l'écran le
  dit. Auparavant, reproposer laissait l'ancienne date « retenue » et rendait
  tout choix suivant impossible pour toujours.
- Les heures s'affichent en **Europe/Paris** des deux côtés. Avant correction,
  le portail artisan rendait l'heure du serveur (UTC) : deux heures d'écart sur
  le même rendez-vous.

## Le rappel de rendez-vous (depuis le 18/09)

RM-10.5 — « veille systématique, J-7 si posé assez tôt » — est **en place**. Une
tâche quotidienne (6 h UTC, tôt pour que le rappel précède les rendez-vous du matin ;
d'abord `/api/cron/rappels`, aujourd'hui la mission « rappels » de l'entrée unique
`/api/cron/equipes`, `app/vercel.json`) écrit **aux deux parties** : le locataire doit
être là, l'artisan doit venir, et les deux absences ont les mêmes conséquences.

Trois partis pris :
- **Suivi par destinataire** (`intervention_rappels`, une ligne par destinataire
  et par échéance) : l'adresse fausse de l'un ne prive pas l'autre de son
  rappel, et la prochaine passe retente le premier.
- **Des dates exactes, pas des fenêtres.** Si la tâche saute un jour, le rappel
  est perdu — un message disant « demain » envoyé le matin même serait faux, et
  un rappel faux est pire que pas de rappel. « Si posé assez tôt » ne s'écrit
  nulle part : un rendez-vous fixé l'avant-veille n'a simplement pas de J-7.
- **Pas de réglage d'agence**, contrairement aux quittances et aux avis
  d'échéance : ces deux-là engagent la parole de l'agence sur des sujets
  d'argent ; un rappel ne fait que répéter ce que les deux parties ont déjà
  convenu. Le refuser laisserait locataires et artisans se manquer.

Les deux messages sont **différents** : au locataire l'heure, la durée et quoi
faire s'il ne peut pas ; à l'artisan l'adresse, le désordre et la référence du
dossier. L'écran du locataire promet de nouveau le rappel — la phrase, retirée
le 11/09 faute de quoi la tenir, est revenue avec la tâche qui la tient.

## Ce que fait le code aujourd'hui : report ou annulation par le locataire (depuis le 15/10/2026)
Décision D22 du dirigeant (14/10/2026, option B, fiches LOC-21, CHN-01 et REP-04), **en
production depuis le 15/10/2026** (PR #188, fusion `98f3fd7`, migration
`20261014620000_rendez_vous_locataire_report_annulation.sql`). Jusque-là, une fois le
rendez-vous confirmé, le locataire n'avait aucun geste : le report n'existait que côté
artisan, l'annulation que côté gérant.
- **Sous le rendez-vous confirmé**, le locataire a un bouton « Je ne peux plus être là » qui
  ouvre deux chemins : **demander un report** ou **annuler le rendez-vous**, chacun avec un
  motif.
- **Report, avec l'accord de l'artisan** : le locataire propose **trois disponibilités**.
  Le rendez-vous confirmé **reste valable** tant que l'artisan n'a pas répondu. L'artisan
  retient l'une des dates (le rendez-vous change alors, et seulement alors) ou refuse (le
  rendez-vous est maintenu et le gérant arbitre). Sans réponse dans les **48 h**, la demande
  expire, le rendez-vous est maintenu et le gérant reçoit une alerte. Le report se demande
  **24 h au moins** avant le rendez-vous, **deux demandes au plus** par mission ; le
  locataire peut retirer une demande en attente.
- **Annulation, sans accord de l'artisan mais avec alerte** au gérant ou au propriétaire :
  effet immédiat, le créneau confirmé devient caduc, la mission revient à « acceptée —
  rendez-vous à fixer » ; un nouveau créneau suit le circuit existant (l'artisan propose, le
  locataire choisit). Une annulation à moins de 24 h est seulement **tracée** (fil de
  l'incident, alerte « annulation tardive »), sans sanction ni déplacement imputé.
- Les délais se comptent sur des instants (pas de jour de référence) ; ces trois nombres
  (24 h, 2 demandes, 48 h) vivent à un seul endroit en base (`parametres_rdv_locataire()`).
  Un rappel tracé pour l'ancienne date ne prive pas le rendez-vous reporté de son rappel.

> [!warning] Ce qui n'est pas livré ou pas vérifié (D22-B)
> - **Non vérifié** : le parcours complet dans un navigateur (report demandé par le
>   locataire puis accepté par l'artisan) n'a pas été joué ; la recette de production ne le
>   couvre pas (journal `log.md`, entrées du 15/10).
> - **Écarts avec la proposition C** (sections C.4 et C.8 de
>   [[Propositions de fonctions majeures — version candidate du 13 octobre 2026]]), relevés
>   dans le code : pas de relance de l'artisan avant l'échéance des 48 h (la tâche
>   « rappels » ne fait qu'expirer les demandes, `expirer_demandes_rdv` ; seule l'alerte au
>   gérant à l'échéance existe, migration `20261014620000`) ; pas de geste « J'en prends
>   acte » sur une annulation ; la demande n'apparaît pas dans l'agenda de l'artisan
>   (`app/src/app/artisan/agenda/page.tsx`), seulement sur la fiche de la mission. À livrer,
>   ou à faire sortir de D22-B par le dirigeant.
