---
type: source
tags: [bien, lot, diagnostics, cle-repartition, import, module-0]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-Module-0-Biens-et-lots.md
source-type: module du référentiel des parcours clients (V3)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 0 : Biens et lots

**En une phrase :** le **module racine** du référentiel (criticité maximale — socle de
toute la donnée) : 10 parcours autour de 5 objets — Bien, **Lot**, Diagnostic,
Équipement, **Détention** — avec deux principes fondateurs : **le bail porte toujours
sur un lot** et **la propriété est au niveau du lot, pas du bien**.
25 user stories, 48 critères. **Module clos** : les 6 questions en suspens tranchées.

## Affirmations clés

1. **Scission officielle du persona propriétaire** : **PM (mandant, aucun accès à
   l'app — objet de données)** vs **PD (gestion directe, accès complet — reprend les
   parcours de l'agent)**. Correction « à appliquer sur les 150 parcours ». Le parcours
   0.11 (consultation du patrimoine par le mandant) est **supprimé** ; ~15 parcours PD
   restent à créer dans les modules 1–4 (total global ~164). → [[Propriétaire bailleur]]
2. **Bien = unité physique ; [[Lot]] = unité locative.** Tout bien créé génère
   automatiquement un « lot unique » (RM-0.1.2) — le multi-lots reste invisible dans
   90 % des cas. Le lot porte : propriétaires (**détention** avec quote-part datée,
   ≤ 100 %), bail, loyer, diagnostics privatifs, équipements, mandat. Le bien porte :
   adresse, clé de répartition, diagnostics communs, copropriété.
3. **[[Clé de répartition]] = le parcours le plus critique** (0.4) : une clé fausse
   fausse toutes les régularisations du bien. Somme = exactement 100 % (bloquant),
   clé **datée** — les documents émis la figent, aucun recalcul rétroactif (RM-0.4.2/4).
   Trois modes : surface (défaut), tantièmes, parts égales.
4. **[[Diagnostic]]s** : répartis bien/lot, statuts calculés, alertes J-90/J-30/J+0.
   **Un diagnostic obligatoire expiré bloque la création d'un bail** (RM-0.6.3) mais ne
   bloque rien sur un lot déjà loué (relance hebdo — choix assumé, « à confirmer »).
5. **Import en masse (0.12, super admin) — « condition de la vente »** : aucune agence
   ne migre en ressaisissant 300–800 lots. Gabarit Excel (9 feuilles ordonnées par
   dépendances), import à blanc, **transaction atomique**, > 20 % d'erreurs = refus en
   bloc, identifiant d'import par ligne → **annulation complète possible**. Distinct du
   16.3 (admin agence, ajouts ponctuels). → [[Super Admin]]
6. **Décence et verrouillage** : critères de décence en alertes non bloquantes
   (9 m², 2,20 m, chauffage, eau) ; les champs structurants d'un lot loué sont
   **verrouillés** (modification par avenant uniquement, RM-0.5.1).
7. **Zone tendue déduite du code postal**, surchargeable ; un changement de décret ne
   modifie jamais les baux signés (RM-0.1.6/7) — consommée par le préavis (1.10).
8. **Archivage, jamais suppression** (RM-0.9.1) ; un lot s'archive seul (RM-0.9.6) ;
   réactivation réservée à l'admin agence. Vente d'un bien occupé (0.10) : **V2**
   (contournement V1 : archiver + recréer, perte de continuité comptable acceptée).

## Les 6 décisions tranchées (module clos)

| Question | Décision |
|---|---|
| Redécoupage d'un lot loué | **Interdit** — résilier, archiver, recréer |
| Surface Carrez | **Champ simple** (réserve V2 : sans date/mesureur, indéfendable en contestation > 5 %) |
| Zone tendue | **Déduite du code postal**, surchargeable — débloque 1.10 |
| Équipements | **Liste fermée** paramétrée par l'admin agence (module 18) — débloque la grille d'EDL (1.12) |
| Gabarit d'import | **Format imposé** (connecteurs concurrents : V2, argument commercial) |
| Tantième de copropriété | **Stocké sur le lot** — alimente 0c ; en copro le syndic a déjà réparti, la clé 0.4 sert peu |

Également actées : **l'appel de charges de copropriété est transmis par le propriétaire
à l'agence** (l'agence n'est pas destinataire direct → alerte de relance à prévoir au
module 0c) ; ventilation par indivisaire **hors périmètre**.

## Comment le propriétaire mandant est informé (sans accès)

Rapport de gestion mensuel (6.2), récapitulatif fiscal (6.4), **devis au-dessus du
seuil : sollicitation ponctuelle pour accord (9.5 — à revoir : hors application, email
à lien unique ou accord tracé par l'agent, à trancher au module 9)**, documents à la
demande (12.4). Parcours 6.5/6.6 à revoir en « réception », pas « consultation ».

> [!warning] Contradiction interne au référentiel
> La liste des « décisions déjà actées » de ce module inclut **« Signature du bail hors
> plateforme en V1 — Acté »**, alors que le module 1 (en-tête) et le livrable A3 actent
> la **révision Yousign en V1**. Le module 0 semble antérieur à cette révision — à
> confirmer, voir [[Bail]].

## Pages mises à jour par cet ingest

[[Lot]] · [[Clé de répartition]] · [[Diagnostic]] (créées) · [[Bien]] ·
[[Propriétaire bailleur]] · [[Bail]] · [[Machines à états et événements]] ·
[[Régularisation des charges]] · [[Super Admin]] ·
[[État du projet et décisions ouvertes]]
