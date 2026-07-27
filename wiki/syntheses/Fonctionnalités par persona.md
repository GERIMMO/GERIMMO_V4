---
type: synthesis
tags: [personas, fonctionnalites, matrice]
status: in-progress
created: 2026-07-22
updated: 2026-07-22
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-21-fonctionnalites-par-persona-v0]]", "[[Analyse concurrentielle]]"]
---

# Fonctionnalités par persona

Matrice de synthèse : **qui fait quoi** dans GERIMMO, en distinguant l'**implémenté** (code,
✅) des **cibles décidées** (note produit v0 et décisions humaines du 2026-07-22, 🎯).
Complète [[Modèle de rôles et permissions]] (qui couvre les permissions techniques et portails).
6 personas / 5 portails. « **[[Gérant]]** » = [[Agent immobilier]] OU [[Propriétaire bailleur]]
(terme générique, pas un 7ᵉ persona).

## Matrice

| Persona (portail) | Implémenté ✅ | Cibles décidées 🎯 |
|---|---|---|
| **[[Super Admin]]** (console `/admin/*`) | Gestion agences/propriétaires/artisans ; **validation globale des artisans** (exclusif) ; imports ; stats ; abonnements/offres/promos ; support ; système (bots, audit, centre IA) ; **impersonation de tous les personas** (agence, propriétaire, artisan, locataire…) ; seul DELETE réel | Lecture/écriture de la **table de paramètres fiscaux** ([[Fiscalité]]) ; agent IA de mise à jour en V2 |
| **[[Administrateur d'agence]]** (AGENCE) | = **agent ++** : tout l'agent + inviter/gérer membres, administrer l'org, gérer l'[[Abonnement]] | Ajouter/supprimer des agents, **affecter un bien à un agent**, **rapports sur les agents** (v0) |
| **[[Agent immobilier]]** (AGENCE) | Patrimoines/résidences/[[Bien\|biens]] ; loyers ([[Quittancement des loyers]], [[Relances et mise en demeure]]) ; [[Cycle de vie d'un incident\|incidents]] : qualification, [[Demande et sélection de devis\|devis]] (**sélection = approbation par intervention**) ; documents, échanges | En tant que [[Gérant]] : [[Bail]] (V1 dépôt PDF), [[Régularisation des charges]] annuelle, [[Comptabilité]] ; quittance sur template agence (v0) |
| **[[Propriétaire bailleur]]** (PROPRIÉTAIRE) | Gère ses biens/locataires/loyers/incidents ; **sélection du devis** sur ses incidents ; administre sa propre org ; abonnement `owner` | [[Bail]], [[Régularisation des charges]], [[Comptabilité]], **[[Fiscalité]] (seul persona** — tous régimes : nu/meublé, SCI, micro/réel) ; reporting financier/locatif (v0) |
| **[[Locataire]]** (LOCATAIRE, le plus restreint) | **Déclare un incident** (dashboard ou **bot** Telegram) ; **choisit les créneaux** ([[Planification d'intervention]]) ; consulte ses documents/quittances (les siennes uniquement) ; aucune gestion | Signe le [[Bail]] ; reçoit le décompte de [[Régularisation des charges]] + justificatif ; **note la qualité du travail de l'artisan** ; canal WhatsApp (v0) |
| **[[Artisan]]** (ARTISAN, multi-org possible) | Reçoit les demandes **partagées** ; répond aux [[Devis\|devis]] ; propose des créneaux ; avance l'[[Intervention et clôture\|intervention]] (photos, factures) ; **évalué** après intervention | Devis réalisables dans l'app ; canal WhatsApp (v0) ; **notation 3 niveaux** : taux de réponse 24 h (auto), qualité du travail ([[Locataire]]), prestation ([[Gérant]]) |

## Transverse (intention v0, non implémentée)
- **[[Agenda et échéances]]** pour tous : loyers, assurances, incidents, alertes documents à
  échéance (2 mois / 1 mois / 2 semaines), RDV créés automatiquement.

> [!warning] Points à trancher / rappels
> - ~~Persona « Gestionnaire »~~ → **tranché (2026-07-22)** : « Gestionnaire » = [[Gérant]]
>   (vocabulaire, pas un 7ᵉ persona) — divergence n°9 résolue.
> - **Notation artisan** : le code n'a qu'une évaluation unique à la clôture — le modèle
>   3 niveaux/3 évaluateurs est une intention à spécifier ([[Artisan]]).
> - Limites exactes agent vs admin sur les loyers (`can_manage_rent`) à confirmer.
> - Les colonnes 🎯 sont des **décisions**, pas des réalisations — rien dans le code à ce jour.
