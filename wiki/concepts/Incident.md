---
type: concept
tags: [incident, sinistre]
status: in-progress
created: 2026-07-21
updated: 2026-09-10
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-module-7-incidents]]"]
---

# Incident

**Définition :** un problème, sinistre ou demande d'intervention concernant un [[Bien]].
Table `incidents`. Cœur du module métier le plus riche de l'application.

## Attributs métier notables
- `number` (unique par organisation), `bien_id` (**obligatoire**), `responsible_profile_id`.
- `category` / `subcategory` (typologie via `incident_categories`, officielle ou propre à l'org).
- `priority` : `basse` / `normale` / `haute` / `urgente`.
- `status` : `nouveau` / `en_cours` / `cloture` / `archive`.
- `photos` (jsonb) ; historique append-only dans `incident_events`.

## Rôle dans le métier
- Point de départ d'un cycle complet : déclaration → devis → planification → intervention →
  rapport → clôture → évaluation. Voir [[Cycle de vie d'un incident]].

## Relations
- Cible un [[Bien]] ; déclaré par un [[Locataire]] (ou saisi par un gestionnaire).
- Responsable = [[Agent immobilier]]/[[Administrateur d'agence]] ou [[Propriétaire bailleur]].
- Génère : [[Devis]], [[Intervention]], et des [[Document|documents]] (rapport, bon d'intervention).
- Voir [[Modèle de données]].

## L'imputation (module 7, 2026-07-24) — « qui paie »
Le parcours 7.2 est le plus critique du module : **trois imputations** — locataire
(réparations locatives du décret 87-712), propriétaire (vétusté, malfaçon, force
majeure, gros œuvre, remplacement), dégradation fautive.
- **Décidée par l'agent, sans proposition automatique** (RM-7.2.1 — « la cause ne se
  déduit pas de la catégorie » : une canalisation bouchée par négligence est locative,
  par vétusté non).
- **Justification obligatoire** (opposable) ; **le locataire est informé
  immédiatement** — avant l'intervention, pas à la facture — et sa **contestation est
  tracée sans bloquer** (RM-7.2.4/5).
- **Aucune affectation d'artisan sans imputation** (RM-7.2.7) ; révisable après
  diagnostic (l'[[Artisan]] peut signaler une cause différente, RM-7.5.3) ; incident
  scindable en deux imputations.
Autres règles V3 : déclaration réservée au [[Locataire]] à bail actif (l'agent peut
saisir pour lui) ; **parties communes → transmises au syndic** (RM-7.1.4) ; **photo du
travail réalisé obligatoire** pour terminer une intervention (RM-7.5.2) ; clôture
possible **sans artisan** (RM-7.6.1) ; réouverture avec historique ; le
[[Propriétaire bailleur|mandant]] n'est informé que par le [[Rapport de gestion]]
(RM-7.8.1). Urgence hors horaires : V2 (numéro d'astreinte en V1).

## La REqualification — règle livrée le 2026-08-23, jamais écrite jusqu'ici
Constat de l'audit du 10/09 : le produit a changé de règle sans que le wiki
l'enregistre. La revue n°2 du 23/08 (migration `20260823113000`, section 3)
autorise désormais la **requalification d'un incident déjà qualifié** —
maintien ou changement d'imputation, justification toujours opposable.

**Le motif de ce changement est métier, pas technique** : l'alerte
« imputation contestée » (RM-7.2.5, la contestation du locataire est tracée
sans bloquer) n'était soldable **qu'en clôturant l'incident**. Autrement dit,
répondre à une contestation obligeait à fermer le dossier. La requalification
est la réponse : elle solde à la fois l'alerte « à qualifier » et l'alerte
« contestée », sans clôturer.

Ce qui ferme la qualification, ce n'est donc plus le fait d'avoir qualifié une
fois — c'est le **départ en intervention**. Sur les 7 états (`declare`,
`qualifie`, `affecte`, `en_cours`, `termine`, `clos`, `rouvert`), la
qualification reste ouverte sur `declare`, `rouvert` et `qualifie`, et est
refusée au-delà (« Cet incident ne se qualifie plus (état actuel : …) »).
Vérifié en base le 10/09 et couvert par `tests/sprint7-incidents.test.ts`
(« machine A5 »), dont l'assertion était restée sur la règle d'avant le 23/08.

> [!warning] À confirmer par l'humain — et une contradiction avec RM-7.5.3
> **1. Règle non sourcée.** Elle est **constatée dans le code**, pas tirée
> d'une source métier : livrée le 23/08, documentée ici le 10/09 après coup.
> Reste à confirmer qu'elle est bien voulue et à lui donner un identifiant RM
> (elle amende de fait RM-A5.1).
>
> **2. Contradiction ouverte.** RM-7.5.3 pose que l'imputation est
> **révisable après diagnostic**, l'[[Artisan]] pouvant signaler une cause
> différente. Or un diagnostic a lieu **après** l'affectation de l'artisan —
> donc aux états `affecte` ou `en_cours`, précisément ceux où le code refuse
> désormais toute (re)qualification. **En l'état, RM-7.5.3 n'est pas
> applicable dans le produit.** Soit la borne doit reculer jusqu'à
> `en_cours`, soit RM-7.5.3 doit décrire un autre geste (une demande de
> requalification par l'artisan, tracée, que l'agent arbitre). À trancher
> avec le module [[Devis]]/[[Intervention]], non câblé à ce jour.

## Implications pour l'application
- Statuts + événements tracés ; peut être déclaré via **bot** ([[Canaux de communication]]).

> [!warning] Page en retard sur l'implémentation (constat d'audit 2026-09-09)
> Cette page décrit encore le modèle V3 : `bien_id` obligatoire (le code
> cible un **lot**), priorités basse/normale/haute/urgente (le code n'a que
> normale/urgente), statuts nouveau/en_cours/cloture/archive (le code a 7
> états, de `declare` à `rouvert`), colonnes anglaises. La source de vérité
> actuelle est `app/src/lib/incidents.ts` (machine à états
> TRANSITIONS_INCIDENT) et les migrations S7. Page à réécrire lors du
> prochain passage sur le module incidents.
