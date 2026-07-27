---
type: concept
tags: [incident, sinistre]
status: in-progress
created: 2026-07-21
updated: 2026-07-24
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

## Implications pour l'application
- Statuts + événements tracés ; peut être déclaré via **bot** ([[Canaux de communication]]).
