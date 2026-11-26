---
type: process
tags: [planification, creneaux, incident]
status: in-progress
created: 2026-07-21
updated: 2026-11-26
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[2026-07-24-gerimmo-v3-module-10-rdv-et-planning]]", "[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Propositions de fonctions majeures — version candidate du 13 octobre 2026]]", "[[Mission palier 1 — audit du 22 novembre 2026]]", "DECISIONS-2026-11-24.md (Q6, Q30, Q32, Q37)", "JOURNAL.md — lots 15, 25, 26, 34 et D4 (22 au 25/11/2026)", "QUESTIONS.md — Q6, Q30, Q32, Q37", "livrables/notes-banc/notes-D4.md", "livrables/notes-banc/fusion/ (fusion-notes.md, PLAN-PUBLICATION-NOTES.md, relecture-envois.md)", "code de la branche fusionnée claude/palier-1-fusion (89cb87ff, lecture seule) : lib/relances-reports-rdv.ts, lib/envois-suspendus.ts", "log.md — entrée « deploy » du 25/11/2026 (publication de 062296e2)", "livrables/PLAN-DE-PUBLICATION.md (§ 4, réglage R5)"]
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

> [!warning] Le rappel de rendez-vous ne part plus (constat du 22/11/2026)
> Depuis la liste fermée des e-mails (10/11/2026), tout e-mail sans « contexte métier » admis est retenu avant
> l'envoi : le rappel de rendez-vous en faisait partie. La tâche quotidienne tourne toujours, mais **aucun rappel
> n'est envoyé**. La mission palier 1 (lot 15, en préproduction le 22/11, en production depuis le 25/11/2026) en fait l'un des quatre envois automatiques
> « prêts, fermés », que le [[Super Admin]] ouvre un par un ; tant qu'il ne l'a pas ouvert, rien ne part
> ([[Mission palier 1 — audit du 22 novembre 2026]]). La phrase « est **en place** » ci-dessus décrit l'état du
> 18/09, pas celui d'aujourd'hui.
>
> *25/11/2026* : **dans la version alors en production** (`81740dec`, jusqu'au 25/11), le rappel ne partait pas. Décision du
> dirigeant du 24/11 (Q6) : « ouvre les quatre envois automatiques à la publication ». Dans la version préparée,
> l'interrupteur reste **fermé à la livraison** ; le [[Super Admin]] l'ouvre le jour de la publication, après les
> migrations et le code (voir « Version préparée `062296e2`, en production depuis le 25/11/2026 » en fin de page).
>
> *26/11/2026* : la version `062296e2` est en production depuis le 25/11/2026 à 23:17Z, l'interrupteur **fermé**. Au
> 26/11 à 05:30Z, le [[Super Admin]] ne l'a pas encore ouvert (réglage R5, `livrables/PLAN-DE-PUBLICATION.md`, § 4) :
> la fonction est en ligne mais pas encore ouverte, **le rappel ne part toujours pas**.

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

> [!warning] Ce qui n'est pas vérifié ou pas en service (D22-B, relu le 22/11/2026)
> - **Non vérifié** : aucun parcours en navigateur ne joue le report ni l'annulation par le locataire (relecture de
>   `app/e2e/` le 22/11/2026 : aucun fichier ne les couvre ; les règles sont tenues par des tests de base et de
>   code). La recette de production ne les couvre pas non plus. Inscrit à la vérification finale de la mission
>   palier 1.
> - **Relance de l'artisan avant l'échéance des 48 h : écrite, mais son e-mail ne part pas.** Le code existe depuis le
>   16/10/2026 (`reports_rdv_a_relancer`, `app/src/lib/relances-reports-rdv.ts`, migration
>   `20261016110100_rdv_relance_accuse_agenda.sql`), mais cet e-mail n'a pas de « contexte métier » admis par la liste
>   fermée des e-mails (`app/src/lib/perimetre-pilote.ts`) : il est retenu à chaque passe. L'artisan reçoit bien
>   l'avis de la demande (événement `rdv_report_demande`, admis) ; il n'est pas relancé ensuite. À l'échéance, la
>   demande expire, le rendez-vous est maintenu et le gérant est alerté. **Constat du 22/11/2026, que l'audit de la
>   mission palier 1 n'avait pas relevé** (`QUESTIONS.md`, Q37) : ni corrigé, ni ajouté au plan, qui est fermé.
>   - *25/11 — supplanté dans la version préparée `062296e2`, en production depuis le 25/11/2026* : décision Q37 du
>     24/11, « oui, cinquième envoi avec son interrupteur, ouvert à la publication ». Le lot D4 en fait le cinquième
>     envoi automatique (voir fin de page). **Au 26/11** (05:30Z), son interrupteur est encore fermé (réglage R5 non
>     fait) : la relance reste retenue.

## Ce qui a été complété le 16/10/2026 (relu dans le code le 22/11/2026)
Les deux autres écarts que cette page relevait jusqu'ici avec la proposition C sont comblés par la migration
`20261016110100_rdv_relance_accuse_agenda.sql`, présente dans la version publiée le 21/11/2026 :
- **« J'en prends acte »** : sur une annulation par le locataire, l'artisan a ce geste dans sa mission
  (`app/src/app/artisan/missions/[interventionId]/accuse-annulation.tsx`, fonction `accuser_annulation_rdv`). Il ne
  change ni le statut de la mission ni une alerte : le rendez-vous était déjà annulé ; il note seulement que
  l'artisan en a pris connaissance.
- **L'agenda de l'artisan** signale les demandes de report et les annulations sur les rendez-vous concernés
  (`app/src/app/artisan/agenda/page.tsx`, lecture `mes_demandes_rdv_artisan`) ; si cette lecture échoue, l'écran le
  dit et renvoie à la mission avant tout déplacement.

## État dans l'application au 22/11/2026 — mission palier 1 (préproduction ; en production depuis le 25/11/2026)
Quatre lots de la mission touchent la prise de rendez-vous. Ils étaient sur la branche de préproduction, vérifiés sur
une base d'essai ; ils sont **en production depuis le 25/11/2026** (version `062296e2`, publiée après le message du
dirigeant « Je valide la publication » ; `log.md`, entrée « deploy » du 25/11/2026). Détail lot par lot :
`JOURNAL.md` et [[Mission palier 1 — audit du 22 novembre 2026]].
- **Disponibilités dès le signalement (lot 22).** Le [[Locataire]] peut écrire ses disponibilités (champ facultatif,
  300 caractères au plus) en signalant l'incident ; le gestionnaire les lit au dossier avant de proposer un créneau.
  Seul le titulaire du signalement les écrit, tant que le dossier n'est pas clos.
- **Absences et semaine type de l'artisan (lot 25).** L'[[Artisan]] déclare ses absences : pendant une absence,
  aucune **nouvelle** demande ne peut lui être envoyée (l'écran du gestionnaire dit « Absent jusqu'au … ») ; ce qui est
  en cours continue. Sa semaine type préremplit ses créneaux, en sautant ses absences ; rien ne part sans qu'il relise
  et envoie, et le préremplissage ne tient pas compte de ses autres rendez-vous. Ce n'est donc **toujours pas un moteur
  de disponibilités** (parti pris du module 10, plus haut). Le refus de la demande pendant l'absence est un choix de
  prudence de l'agent, à confirmer par le dirigeant (`QUESTIONS.md`, Q30). *Option confirmée par le dirigeant le
  24/11 (« rien ne change »).*
- **Rendez-vous manqué consigné (lot 26).** Une fois l'heure passée, l'artisan peut consigner que le locataire était
  absent ; le gestionnaire peut consigner l'absence du locataire **ou** de l'artisan. Le rendez-vous tombe, un nouveau
  est à convenir, le fait s'écrit à la chronologie. Le locataire lit la date manquée et qui est dit absent. Le nombre
  d'absences imputées à l'artisan sur douze mois s'affiche dans ses évaluations, mais **n'entre pas dans sa note**
  (`QUESTIONS.md`, Q32) : la règle du module 10 (« celles de l'artisan pèsent sur son score de fiabilité ») n'est donc
  appliquée qu'à moitié. *Option confirmée par le dirigeant le 24/11 (« rien ne change ») : l'écart avec le module 10
  demeure, voir l'encadré final.*
- **Rappel de rendez-vous (lot 15).** Voir l'encadré de la section « Le rappel de rendez-vous » : prêt, fermé, ouvert
  par le Super Admin (pas encore ouvert au 26/11).

## État dans l'application au 23/11/2026 — la promesse du rappel et le report vérifié en navigateur (mission palier 1)
En préproduction le 23/11 ; **en production depuis le 25/11/2026** dans la version `062296e2`
([[Mission palier 1 — audit du 22 novembre 2026]], lot 34 et vérification finale).
- **La promesse du rappel suit l'envoi (lot 34).** Sous un rendez-vous confirmé, après un report accepté et dans
  l'e-mail qui l'annonce, le [[Locataire]] lisait « nous vous le rappellerons la veille », alors que ce rappel est
  fermé tant que le [[Super Admin]] ne l'a pas ouvert. Ces trois textes regardent maintenant le réglage : fermé (la
  livraison), « Notez bien cette date : aucun rappel ne vous sera envoyé. » ; ouvert, la promesse d'avant. Si le
  réglage ne peut pas être lu, rien n'est promis. La phrase « l'écran du locataire promet de nouveau le rappel » plus
  haut décrit l'état du 18/09.
- **Report et annulation par le locataire, joués en navigateur.** Un parcours sur téléphone joue désormais : report
  demandé puis accepté par l'[[Artisan]] (le rendez-vous est déplacé) ; second report refusé avec un motif (le
  rendez-vous est maintenu, le locataire lit la réponse, le gestionnaire a une alerte) ; après deux reports, l'écran
  dit pourquoi il n'en propose plus ; annulation confirmée en deux temps ; l'artisan « en prend acte ». Le point
  « Non vérifié » de l'encadré D22-B ci-dessus est donc levé **sur le banc d'essai** ; la relance de l'artisan avant
  l'échéance reste retenue (Q37).

## Version préparée `062296e2`, en production depuis le 25/11/2026 (branche fusionnée du 25/11/2026)

Fait dans la branche `claude/palier-1-fusion` (`89cb87ff`, complétée jusqu'à `062296e2`, poussée le 25/11 sur la branche de préproduction `claude/palier-1-preproduction`), vérifié sur le banc local (service d'envoi simulé, aucun
e-mail réel envoyé), puis **publié en production le 25/11/2026** à 23:17Z (26/11 à 00 h 17, heure de Paris) par la
PR #358 (`main` = `8f9dd9ce`, identique à `062296e2`), après l'application de ses 52 migrations (22:09Z) ; recette de
production n° 58 réussie. **Les cinq envois sont en ligne mais fermés** : au 26/11 à 05:30Z, le [[Super Admin]] ne les
a pas encore ouverts (réglage R5). Sources : `DECISIONS-2026-11-24.md`, `JOURNAL.md` (lot D4 ; entrée du 25/11 (nuit)),
`livrables/notes-banc/notes-D4.md`, relecture des envois de la fusion, `log.md` (entrée « deploy » du 25/11/2026).

- **Cinq envois automatiques, chacun avec son interrupteur, tous fermés à la livraison** : avis d'échéance, relance
  amiable d'un loyer impayé, **rappel de rendez-vous**, relance d'une invitation, et **relance d'une demande de report
  de rendez-vous** (cinquième envoi, décision Q37). La relecture des envois de la fusion a vérifié les cinq
  interrupteurs fermés.
- **Relance de l'artisan avant l'échéance des 48 h** (lot D4) : la migration `20261125110000` ajoute l'interrupteur
  `relance_report_rdv`, **faux par défaut**. Fermé, rien ne change (la relance reste retenue par la liste fermée des
  e-mails). Ouvert, l'e-mail « Un report de rendez-vous attend votre réponse » porte son contexte métier, et la base
  refait la preuve juste avant l'envoi : interrupteur ouvert, aucun arrêt (général ou « rappels »), demande de cet
  espace toujours en attente et non échue, relance réservée et sans sort, mission planifiée, adresse de l'[[Artisan]].
- **Ouverture le jour de la publication** (décisions Q6 et Q37) : après les migrations et le code (plan de
  publication, étape 9), le [[Super Admin]] ouvre les cinq envois **un par un** dans Paramètres généraux, « Envois
  automatiques d'e-mails », avec double vérification et une case de confirmation à chaque fois ; « Fermer cet envoi »
  les referme. Contrôle prévu : cinq lignes « envoi_automatique » au journal de la supervision, puis un essai réel avec
  un compte de test et une vraie boîte (il n'y a pas de préproduction hébergée : Q1 annulée). L'accord préalable de
  chaque espace n'est exigé en plus que pour l'avis d'échéance et la relance de loyer (Q6) ; la preuve de la relance de
  report n'en demande pas (notes D4), et le rappel de rendez-vous n'a pas de réglage d'espace (section du 18/09).
  *26/11 : pas encore fait. Le code et les migrations sont en ligne depuis le 25/11 ; l'ouverture est le réglage R5 du
  plan de publication (`livrables/PLAN-DE-PUBLICATION.md`, § 4), après le parcours de vérification R4 bis. Au 26/11 à
  05:30Z, les cinq envois restent fermés.*
- **La promesse du rappel suit l'interrupteur** (lot 34, section du 23/11) : fermé, le [[Locataire]] lit « Notez bien
  cette date : aucun rappel ne vous sera envoyé. » ; ouvert, « nous vous le rappellerons la veille ».
- **Absences de l'artisan** (Q30) et **rendez-vous manqué hors de la note** (Q32) : options confirmées le 24/11, rien
  ne change.

> [!warning] Points à trancher / contradictions (25/11/2026)
> - **Production et version préparée divergent** (jusqu'au 25/11) : en production (`81740dec`), ni le rappel de
>   rendez-vous ni la relance de report ne partaient ; dans la version préparée, ils partiront dès que le Super Admin
>   les aura ouverts, ce que la décision Q6/Q37 prévoit à la publication.
>   → *26/11 : la version préparée `062296e2` est en production depuis le 25/11/2026 à 23:17Z. Les deux envois y sont
>   en ligne mais fermés : au 26/11 à 05:30Z, le Super Admin ne les a pas encore ouverts (réglage R5). Ni le rappel ni
>   la relance ne partent donc encore. Tant que ce geste n'est pas fait, la phrase « est **en place** » de la section
>   du 18/09 reste fausse.*
> - **Module 10 / code** : les absences de l'artisan sont comptées mais n'entrent pas dans sa note (Q32 confirmée),
>   alors que le référentiel dit qu'elles « pèsent sur son score de fiabilité » ([[Artisan]]).
> - **Rejeu de migration** : rejouer seule la migration du 22/11 (`20261122200000`) après celle du lot D4 fait lire le
>   cinquième envoi « fermé » jusqu'au rejeu de `20261125110000` (notes D4, point 3) : à savoir en cas de retour
>   arrière.
