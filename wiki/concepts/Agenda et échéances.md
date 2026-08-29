---
type: concept
tags: [agenda, echeances, rdv, alertes, produit-v0]
status: draft
created: 2026-07-21
updated: 2026-07-24
sources: ["[[2026-07-21-fonctionnalites-par-persona-v0]]", "[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[2026-07-24-gerimmo-v3-module-0b-dossier-locataire]]", "[[2026-07-24-gerimmo-v3-module-0c-copropriete]]", "[[2026-07-24-gerimmo-v3-module-1-bail]]", "[[2026-07-24-gerimmo-v3-module-2-garanties]]", "[[2026-07-24-gerimmo-v3-module-10-rdv-et-planning]]", "[[2026-07-24-gerimmo-v3-module-14-agenda-et-alertes]]"]
---

# Agenda et échéances

**Définition :** un **agenda partagé par tous les personas** regroupant les échéances et rendez-vous
liés au [[Bien]] et à ses acteurs. L'intention v0 est désormais **entièrement spécifiée
par le module 14** (V3, 2026-07-24) — objets **Alerte** et **Annonce**, 27 types
d'alertes consolidés.

## Spécification complète (module 14 — module clos)
- **Un même écran, trois vues** (RM-14.1.1) : calendrier, alertes, **retards**
  (réservée à l'admin agence). Chaque persona ne voit que ce qui le concerne ; le
  mandant, rien.
- **Trois criticités** : critique (escalade **7 j**), normale (**15 j**),
  informative (jamais).
- **Seuils légaux figés** (préavis, restitution, prescription IRL, diagnostics,
  préemption — lecture seule avec fondement, mis à jour par le super admin seul) vs
  **seuils de confort paramétrables** par l'agence (impayés, rappels, escalades).
  Une alerte légale ne se désactive pas (RM-14.2.3).
- **Fermeture par l'action, jamais par marquage** (RM-14.3.2) ; report = date +
  motif ; sans objet = fermeture auto.
- **Une alerte automatique est liée à l'événement qui l'a créée** (décision
  2026-08-29) : elle porte la référence de l'objet d'origine et se **ferme
  d'elle-même** quand cet objet est traité dans son module (paiement enregistré,
  attestation remplacée, incident clos…). L'utilisateur ne voit que ce qui lui est
  utile ; la mécanique est côté serveur. Inventaire du 29/08 : 11 types
  automatiques, 6 sans fermeture auto — chantier S9b. Cas tranché le même jour :
  l'alerte `edl_entree` est **supprimée**, l'EDL d'entrée signé devient un prérequis
  de la validation du [[Bail]].
- **Escalade = déplacement** vers la vue retards de l'admin, **avec le nom de
  l'agent** (RM-14.4.4/5) — l'admin traite, réaffecte ou renvoie.
- **Annonces** (information datée, sans action) : agence → agents/locataires/
  artisans ; super admin → toutes agences, **non masquable**.

## Contenu de l'agenda
- **Échéances** : loyer, assurance, sinistre/accident.
- **Documents arrivant à terme** : alerte + relance **2 mois / 1 mois / 2 semaines** avant l'échéance.
- **RDV créés automatiquement** à partir des échéances.
- **RDV manuels** : en cas de désaccord, le [[Propriétaire bailleur|propriétaire]] ou l'[[Administrateur d'agence|agence]]
  peut poser un RDV avec le [[Locataire]] et/ou l'[[Artisan]].
- Deux natures d'entrée : **RDV** | **Alerte**.

## Rôle dans le métier
- Donner à chaque acteur une vue temporelle unifiée (ce qui arrive, quand) et déclencher relances et rendez-vous.

## Relations
- Porte sur le [[Bien]] ; s'appuie sur les [[Document|documents]] (échéances) et les [[Incident|incidents]].
- Recoupe [[Relances et mise en demeure]] (loyer) et les rappels d'échéance de documents.

## Seuils alimentant le module 14 (référentiel V3)
Trois jeux de seuils déjà spécifiés par le socle :
- **Assurance du locataire** (module 0b) : J-30 / J-15 / J+0 / J+15 — ci-dessous.
- **[[Diagnostic]]s** (module 0) : J-90 info / J-30 warning / J+0 critique (bloque le bail).
- **Relance de l'[[Appel de charges|appel de charges]]** (module 0c) : clôture
  d'exercice → toutes les 3 semaines → escalade admin agence après 3 relances →
  blocage de la régularisation. Relances horodatées (preuve de diligence).
- **[[Bail]]** (module 1) : reconduction tacite à **6 mois avant terme** (RM-1.8.1 —
  sinon le congé bailleur devient impossible) ; **préemption à 2 mois** après congé
  pour vente (RM-1.11.6) ; **extinction de solidarité** d'un colocataire parti
  (RM-1.3.5) ; alertes d'[[État des lieux]] d'entrée (à la signature) et de sortie
  (au congé).
- **Garanties** (module 2) : **délai de [[Restitution du dépôt de garantie|restitution
  du dépôt]]** — compteur lancé à la remise des clés (1 ou 2 mois, US-2.4.4 : alerte à
  l'approche du terme légal) ; **échéance de garantie** ([[Garantie]] — fin d'engagement
  d'un garant, extinction liée à celle du colocataire couvert).
- **Loyers** (module 3) : **impayés** (circuit à seuils paramétrés, relances
  programmées — [[Relances et mise en demeure]]) ; **[[Révision annuelle IRL]]** —
  date anniversaire, et **alerte forte avant la prescription à un an** (révision
  perdue au-delà) ; clôture d'exercice → [[Régularisation des charges]].
- **[[Mandat de gestion]]** (module 5) : renouvellement alerté à **4 mois** du terme
  (3 mois de préavis + 1 de discussion, RM-5.4.1) ; échéance de préavis de
  résiliation. **Comptabilité** (module 4) : alerte de clôture avant la date de
  rapport du mandat.
- **Rendez-vous** (module 10) : les RDV confirmés ([[Planification d'intervention]])
  se posent sur l'agenda — **cloisonné par persona** (RM-10.7.3 : locataire = ses RDV,
  agent = ses mandats, artisan = toutes agences, admin = vue consolidée, mandant =
  rien) ; **rappels la veille** (systématique) et **J-7** (si posé assez tôt).
  Le « modèle de RDV » attendu par la note v0 est donc défini. Export iCal : V2.

## Premier jeu de seuils spécifié : l'assurance du locataire (module 0b)
Le [[2026-07-24-gerimmo-v3-module-0b-dossier-locataire|module 0b]] fournit au module 14
ses premiers seuils concrets (RM-0b.6.1) : **J-30** locataire, **J-15** agence, **J+0**
défaut constaté, **J+15** relance hebdomadaire — chaque alerte **horodatée et conservée
comme preuve** (RM-0b.6.2) ; aucune alerte si le bail se termine avant l'échéance ;
mêmes seuils pour les pièces d'identité à durée limitée (RM-0b.6.5).
Voir [[Dossier locataire]].

## Machine à états de l'alerte (référentiel V3, Livrable A5 — module 14)
**ouverte** → fermée, reportée ou escaladée · **reportée** → ouverte (date de report
atteinte) · **escaladée** → fermée ou retour à l'agent · **fermée** = terminal.
**Une alerte se ferme par l'action, jamais manuellement** (RM-14.3.2) : « ouverte →
fermée » résulte du traitement de l'échéance dans le module d'origine — aucun marquage
manuel. Le référentiel V3 (module 14, Agenda et alertes) couvre donc cette intention v0 ;
à consolider à l'ingest du module 14. Voir [[Machines à états et événements]].

## Correspondance avec le code (partielle)
- `bien_echeances` (échéances datées par bien) + rappels d'expiration de documents (`expiration_alert_days`,
  anti-doublon 30 j). Mais **pas** d'agenda transverse, ni de fenêtres 2 mois/1 mois/2 sem, ni de RDV auto.

> [!warning] Points à trancher / contradictions
> - ~~Modèle de RDV à définir / fenêtres d'alerte v0~~ → **entièrement spécifié par les
>   modules 10 et 14** (objets Rendez-vous, Alerte, Annonce ; seuils par type d'alerte).
>   Reste l'**implémentation** : le code n'a que `bien_echeances` +
>   `expiration_alert_days` — l'écran unique, l'escalade et les 27 types sont à
>   construire. → [[État du projet et décisions ouvertes]]
