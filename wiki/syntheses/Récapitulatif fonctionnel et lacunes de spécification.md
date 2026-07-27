---
type: synthesis
tags: [recap, fonctionnalites, specifications, roadmap, archive]
status: archived
created: 2026-07-22
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-21-fonctionnalites-par-persona-v0]]", "[[Analyse concurrentielle]]", "[[Fonctionnalités par persona]]"]
---

# Récapitulatif fonctionnel et lacunes de spécification

> [!warning] Page archivée (2026-07-25, décision humaine)
> Snapshot du 2026-07-22, **antérieur au référentiel V3** qui l'a supplanté : les
> lacunes de spécification listées ici sont couvertes par les 22 modules et les
> livrables A1–A6. Conservée pour l'historique, **ne plus s'y référer** — voir
> [[État du projet et décisions ouvertes]] et [[Divergences code et référentiel V3]].

État des lieux complet au 2026-07-22 : **tous les modules fonctionnels**, leurs personas, et
**ce qui manque en spécification** pour commencer/corriger les développements du dépôt
Gerimmo-V3. Légende : ✅ implémenté (code) · ⚠️ implémenté mais divergent de l'intention ·
🎯 décidé, non implémenté · ❓ non décidé.

## A. Modules fonctionnels et personas

### 1. Gestion du parc ✅
Hiérarchie [[Patrimoine et résidences]] > [[Bien]] (loyer + provisions de charges).
**Personas** : le [[Gérant]] (agent ou propriétaire) crée/modifie ; l'[[Administrateur d'agence]]
affecte 🎯 un bien à un agent (v0). Un bien = **une seule** org (décision n°12).

### 2. Occupants et bail
- ✅ [[Occupation d'un bien]] (`bien_occupants`) : qui occupe quoi, déclenche les loyers.
- 🎯 [[Bail]] : ALUR + clauses + signature — V1 = génération PDF, signature hors plateforme,
  dépôt du PDF signé (couvre aussi les baux préexistants) ; V2 = SEA eIDAS en réserve.
  **Personas** : [[Gérant]] crée/dépose ; [[Locataire]] signe.

### 3. Loyers ✅⚠️
- ✅ [[Quittancement des loyers]] : échéances mensuelles auto ([[Période de loyer]]),
  confirmation **déclarative** « loyer reçu ? » (choix assumé, pas de sync bancaire),
  quittance PDF conforme ([[Quittance conforme]]) ; 🎯 template agence (v0).
- ⚠️ [[Relances et mise en demeure]] : code = 2 relances + mise en demeure ; v0 = validé par
  défaut, mise en demeure à 7 j paramétrable, niveau 3 « à définir » (divergence n°8).
- 🎯 [[Régularisation des charges]] : annuelle + justificatif + prorata au départ,
  [[Locataire]] ↔ [[Gérant]].

### 4. Incidents — le cœur différenciant ✅
Chaîne complète [[Cycle de vie d'un incident]] :
1. **Déclaration** par le [[Locataire]] (dashboard ou bot Telegram ✅ / WhatsApp 🎯) → fiche type.
2. **[[Demande et sélection de devis]]** : sollicitation d'artisans (`prive`/`gerimmo_valide`),
   devis comparés avec **score de recommandation**, sélection par le [[Gérant]] (jamais le locataire).
3. **[[Planification d'intervention]]** : négociation de créneaux artisan ↔ locataire par
   « rounds » ; si blocage → le gérant tranche.
4. **[[Intervention et clôture]]** : statuts, matériaux, photos, **rapport PDF officiel**, clôture.
5. **Évaluation** : ✅ une évaluation multi-critères à la clôture ; ⚠️ cible = **3 niveaux**
   (taux de réponse 24 h auto / qualité du travail par [[Locataire]] / prestation par [[Gérant]]).

### 5. Artisans ✅
[[Artisan]] : portail dédié, multi-org, devis (🎯 rédigés in-app, v0), créneaux, statuts,
factures. **Deux portes** : validation globale ([[Super Admin]] seul) ≠ sélection du devis
par le gérant, incident par incident.

### 6. Documents (GED) ✅
[[Document]] : centralisation typée (quittance, rapport, contrat, courrier), visibilité par
persona, versioning, documents officiels. 🎯 Vue 360 Bâtiment > Bien (v0, divergence n°11).

### 7. Communication ✅⚠️
[[Canaux de communication]] : bot **Telegram actif** (locataire + artisan), e-mail Resend,
messagerie interne ; ⚠️ migration **WhatsApp** non finalisée (n°5) ; n8n abandonné, endpoints
résiduels (n°4).

### 8. Agenda 🎯
[[Agenda et échéances]] (v0, divergence n°10) : agenda pour **tous** les personas — loyers,
assurances, incidents, alertes documents (2 mois/1 mois/2 sem), RDV auto.

### 9. Abonnement SaaS ✅⚠️
[[Onboarding et abonnement]] (essai 14 j, 10 étapes), [[Grille tarifaire]] (8 offres, 2 sur
devis), [[Cycle de vie de l'abonnement]], Stripe. ⚠️ Facturation annuelle non fiable (n°3).
**Personas** : admin d'agence / propriétaire gèrent ; [[Super Admin]] pilote les offres.

### 10. Comptabilité et fiscalité 🎯
- [[Comptabilité]] : recettes/dépenses par bien et org, alimentation **déclarative** (tranché),
  pour le [[Gérant]].
- [[Fiscalité]] : [[Propriétaire bailleur]] **uniquement** — tous régimes (nu micro/réel,
  meublé LMNP/LMP, SCI IR/IS via **export expert-comptable**) ; table de paramètres par année
  (agent IA V2 + R/W [[Super Admin]]).

### 11. Administration plateforme ✅
[[Super Admin]] : validation artisans, imports, stats, support, système, **impersonation de
tous les personas**, seul DELETE réel.

### 12. Transverse ✅
[[Isolation multi-organisation]] (RLS), [[Archivage plutôt que suppression]] + audit,
[[RGPD]], [[Plan de reprise d'activité]], [[Modèle de rôles et permissions]] (6 rôles).

## B. Lacunes de spécification pour développer

### B1. Nouvelles fonctionnalités décidées (specs à produire avant dev)
1. **[[Bail]]** : modèle de données (champs : dépôt de garantie ? durée/renouvellement ?
   clauses structurées ou texte ?) ; template(s) ALUR — nu et/ou meublé ? ; articulation avec
   `bien_occupants` (qui crée quoi) ; contenu exact du PDF généré.
2. **[[Régularisation des charges]]** : le solde passe-t-il par une [[Période de loyer]]
   ajustée ou un objet dédié ? nature des justificatifs acceptés ; forme du décompte.
3. **[[Comptabilité]]** : périmètre agence (simple suivi vs compta de gérance réglementée —
   comptes mandants, garantie financière) ; plan de comptes/catégories ; formats d'export
   (CSV, FEC).
4. **[[Fiscalité]]** : forme de l'aide (récap par case vs pré-remplissage guidé) ; contenu de
   l'export SCI-IS (à définir **avec un expert-comptable**) ; FR seul ou FR+BE ; schéma de la
   table de paramètres ; garde-fous de l'agent IA V2 (validation humaine ?).
5. **Notation artisan 3 niveaux** : mapping avec `createArtisanEvaluation` existant ; qui est
   sollicité quand (à la clôture ? relance ?) ; définition d'une « réponse » pour le taux 24 h
   (réponse au devis ? au message ?) ; pondération dans le score de recommandation des [[Devis]].

### B2. Divergences code ↔ intention à trancher (corrections du dépôt)
6. **Relance loyer** (n°8) : séquence exacte — v0 dit rappel mail → mise en demeure 7 j
   paramétrable → niveau 3 **« à définir »** ; le code fait 2 relances. Quelle est la cible ?
7. **[[Agenda et échéances]]** (n°10) : spec complète absente (sources des événements, fenêtres
   d'alerte, création auto de RDV, par persona).
8. **Vue 360 / navigation Bâtiment > Bien** (n°11) : spec UX absente (v0 ne donne que le principe).
9. **Rôles** (n°2) : lier `member_type` ↔ `roles.key` en DB ? activer le RBAC fin (tables
   `permissions` vides) ou l'assumer en dur ? sort du portail `user` fallback.
10. **Tarification annuelle** (n°3) : refixer les prix annuels (proposé : mensuel × 10) avant
    lancement.
11. **WhatsApp** (n°5) : finaliser la migration ou statuer Telegram-only ; nettoyer les
    endpoints n8n (n°4).
12. **Devis artisan privé unique** (n°6) : documenter la règle `allow_single_private_artisan`.
13. **`can_manage_rent`** : limites exactes agent vs admin sur les loyers.

### B3. Socle projet manquant
14. **Tests d'acceptation** : aucun critère formalisé (docs vides) — indispensable avant de
    « corriger » : définir le comportement attendu par module.
15. **`docs/` du dépôt** : obsolètes/contradictoires (architecture fictive) — à réécrire depuis
    le wiki.
16. **Proposition de valeur et périmètre exclu** : à formaliser (piste : « gérer les problèmes,
    pas seulement les papiers », [[Analyse concurrentielle]]).
17. **Non décidés** (❓, hors périmètre actuel) : EDL, indexation IRL, mise en location.

> [!warning] Priorisation suggérée (agent, à valider)
> Pour « corriger » l'existant : B2-6 (relance loyer) et B2-10 (tarifs annuels) touchent des flux
> critiques déjà en prod potentielle. Pour « commencer » le nouveau : B1-1 (Bail) est le socle des
> autres (charges, compta, fiscalité s'y adossent).
