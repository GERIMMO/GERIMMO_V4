---
type: source
tags: [agenda, alertes, escalade, annonces, module-14]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-Module-14-Agenda-et-alertes.md
source-type: module du référentiel des parcours clients (V3)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 14 : Agenda et alertes

**En une phrase :** 6 parcours, 2 objets (**Alerte**, **Annonce**) — module de
**consolidation** (« il n'invente aucune alerte ») : un écran commun pour les
**27 types d'alertes** définis par les 13 modules précédents, une logique de
criticité et une règle d'escalade. **Module clos.**

## Affirmations clés

1. **Agenda et alertes sur un même écran, trois vues** (calendrier / alertes /
   retards — RM-14.1.1, décision actée : « trois visites et cinq relances forment
   une seule charge de travail »). Vue par persona : agent = ses RDV + ses alertes ;
   admin = consolidé + **vue retards** (réservée) ; locataire = ses RDV + assurance/
   notation ; artisan = interventions + pièces ; **mandant = aucun accès**.
2. **Trois niveaux de criticité** : critique (escalade à **7 jours**), normale
   (**15 jours**), informative (jamais). Exemples critiques : diagnostic expiré sur
   lot disponible, prescription IRL, délai de restitution, impayé au-delà du seuil.
3. **Seuils légaux figés vs seuils de confort paramétrables** (RM-14.2.1/2, décision
   actée) : figés (loi de 1989, codes) — préavis, restitution 1/2 mois, prescription
   IRL 12 mois, validités de diagnostics, justificatifs 6 mois, préemption 2 mois ;
   champ en lecture seule **avec mention du fondement** ; seule une évolution
   réglementaire (super admin) les met à jour. Paramétrables (agence) — plancher et
   délais d'impayé, alertes diagnostic, clôture comptable J-5, relances de notation,
   rappels de RDV, délais d'escalade. **Une alerte légale ne se désactive pas.**
4. **Une alerte se ferme par l'action, jamais par un clic** (RM-14.3.2 — pas de
   bouton « marquer comme traitée ») ; **report explicite** avec date + motif ;
   sans objet = fermeture automatique.
5. **L'escalade déplace, elle ne duplique pas** (RM-14.4.4) : l'alerte non traitée
   bascule dans la **vue retards** de l'admin **avec le nom de l'agent**
   (RM-14.4.5) ; l'admin traite, réaffecte ou renvoie (tracé).
6. **Annonces ≠ alertes** (information sans action, dates de début/fin) : l'agence
   diffuse à agents/locataires/artisans (jamais au mandant) ; le super admin à
   toutes les agences (réglementaire, maintenance, modèles, rappel IRL) — **non
   masquable** (RM-14.6.2).

## L'inventaire consolidé

27 types d'alertes : 4 du socle (diagnostics, assurance, purge RGPD, appel de
charges), 13 du cœur métier (reconduction J-180, préemption, solidarité, EDL,
restitution, impayés, IRL + prescription J-60, régularisation, clôture, mandat
J-120, rapport, versement J+15), 6 de l'intervention (décennale, devis J-7, accord
propriétaire 5 j, preuve locataire, RDV, créneaux, notation), 4 des transverses
(signature J+7/21/28, revue des idées — module 20).

## Décisions actées / reports

Actées : seuils légaux figés, confort paramétrable, escalade par criticité, tableau
nominatif, écran unique. **V2** : export agenda externe. **Hors périmètre** :
notifications push mobiles (RM-19.3.4). 6 US, 8 critères.

## Pages mises à jour par cet ingest

[[Agenda et échéances]] (consolidée) · [[Administrateur d'agence]] ·
[[État du projet et décisions ouvertes]]
