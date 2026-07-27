---
type: source
tags: [retours, bugs, idees, support, module-20]
status: stable
created: 2026-07-25
updated: 2026-07-25
source-file: raw/assets/GERIMMO-V3-Module-20-Retours-utilisateurs.md
source-type: module du référentiel des parcours clients (V3) — lacune identifiée après l'audit
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 20 : Retours utilisateurs

**En une phrase :** 6 parcours, 2 objets (**Signalement**, **Idée**) — « aucun module
ne décrivait comment Gerimmo écoute ses propres utilisateurs ». Deux circuits :
**bug = immédiat**, **idée = revue mensuelle**. Correction post-audit majeure : **la
modification du code sort du périmètre**. **Module clos.**

## Affirmations clés

1. **Signalement de bug (20.1)** : tout utilisateur connecté, depuis un menu
   permanent ; **contexte technique capturé automatiquement** (écran, action,
   navigateur, appareil, agence/rôle, horodatage, message d'erreur) **sans aucune
   donnée personnelle** (RM-20.1.2) : champs saisis, noms, montants et pièces
   affichées **masqués/floutés automatiquement**, avec **prévisualisation** de ce qui
   part (RM-20.1.5/6). Support **séparé du métier** (RM-20.1.7), conservation
   **6 mois** (RM-A2.6). Accusé de réception immédiat.
2. **Tri par le super admin (20.2)** : trois issues — **bug confirmé** (priorité
   bloquant/majeur/mineur), **incompréhension d'usage** (« un signal de conception » →
   file de pistes de documentation), **idée déguisée** (→ 20.4). **Une réponse dans
   tous les cas** (RM-20.2.4).
3. **Transmission au suivi technique (20.3) — correction post-audit** : la version
   antérieure prévoyait un correctif validé et appliqué depuis l'administration —
   « c'était une erreur de conception ». Désormais : **« Gerimmo transmet et suit, il
   ne corrige jamais »** (RM-20.3.1/2) — le bug confirmé part avec son contexte vers
   **une file dédiée dans l'environnement Claude Code** ; la correction suit un
   **processus d'ingénierie** (branche isolée, relecture, **tests automatisés et
   déploiement progressif jamais optionnels** — « le vrai garde-fou », préproduction,
   surveillance, rollback). « Le super admin pilote le produit, pas le code. »
   L'utilisateur est notifié à la confirmation puis à la correction.
4. **Idées (20.4–20.6)** : décrire **le besoin, pas la solution** (formulaire guidé) ;
   doublons proposés avant création (soutiens additionnés) ; visibilité **dans son
   agence seulement** (pas d'attente publique sur la roadmap), le SA voit tout.
   **Revue mensuelle** avec **classement automatique** — soutiens, **agences
   distinctes (signal le plus fort** : « six agences valent plus que six soutiens
   d'une seule »), ancienneté — qui « éclaire la décision, ne la remplace pas ».
5. **Aucune idée n'est refusée — mais aucune sans réponse** (décision affinée
   post-audit) : trois statuts — retenue (→ **article** diffusé à tous via les
   annonces 14.6, échéance **indicative jamais un engagement**), **non retenue pour
   le moment (motif + date de réexamen automatique)**, déjà couverte (explication).
   Archivage après deux ans, auteur informé.

## Décisions actées / reports

Actées : signalement universel, tout au SA, masquage des données perso (ajouté),
revue mensuelle, article par idée retenue, classement auto. **Corrigé post-audit** :
la correction du code hors périmètre ; « aucun refus » affiné (motif + date).
**Hors périmètre** : visibilité inter-agences des idées, feuille de route publique.
6 US, 10 critères. **Plan de livraison** : signalement en **lot 1**, idées en lot 2.

## Ce que ce module impose ailleurs

Module 14 (alerte de revue mensuelle, articles via annonces), module 18 (files bugs
et idées de la console SA), processus technique externe (reçoit les bugs confirmés).

## Pages mises à jour par cet ingest

[[Retours utilisateurs]] (créée) · [[Super Admin]] ·
[[État du projet et décisions ouvertes]]
