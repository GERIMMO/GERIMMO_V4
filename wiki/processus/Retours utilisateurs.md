---
type: process
tags: [retours, bugs, idees, support]
status: draft
created: 2026-07-25
updated: 2026-07-25
sources: ["[[2026-07-24-gerimmo-v3-module-20-retours-utilisateurs]]"]
---

# Retours utilisateurs

**En une phrase :** comment Gerimmo écoute ses utilisateurs — deux objets, deux
circuits : le **Signalement** (bug, traitement immédiat) et l'**Idée** (évolution,
revue mensuelle). « Les mélanger produirait soit des bugs traités trop lentement,
soit des évolutions décidées dans l'urgence. »
Source : [[2026-07-24-gerimmo-v3-module-20-retours-utilisateurs|Module 20]].

## Le signalement de bug

- Tout utilisateur connecté, menu permanent ; description attendu/constaté
  obligatoire ; **contexte technique capturé automatiquement** (écran, action,
  navigateur, appareil, agence/rôle, horodatage, erreurs) — **jamais de donnée
  personnelle** : champs, noms, montants et pièces affichées **floutés
  automatiquement**, avec **prévisualisation** avant envoi (RM-20.1.5/6).
- Support **séparé des données métier** (RM-20.1.7), conservation **6 mois**
  (RM-A2.6, [[RGPD]]) ; accusé de réception immédiat.
- **Tri par le [[Super Admin]]** : bug confirmé (bloquant/majeur/mineur),
  **incompréhension d'usage** (→ pistes de documentation — un signal de conception),
  ou idée déguisée. **Une réponse dans tous les cas.**

## La frontière avec le code (correction post-audit)

**« Gerimmo transmet et suit, il ne corrige jamais »** (RM-20.3.1/2) : le bug confirmé
part, avec son contexte, vers une file de l'environnement de développement (Claude
Code) ; la correction relève d'un **processus d'ingénierie** hors application —
branche isolée (jamais la production), relecture, **tests automatisés + préproduction
+ déploiement progressif jamais optionnels** (« le vrai garde-fou » quand relecteur et
super admin sont la même personne), surveillance, rollback. Le SA suit l'avancement
(reçu/en cours/corrigé, référence technique, version) mais **ne valide pas le
correctif** ; l'utilisateur est notifié à la confirmation puis à la correction.

## Les idées

- **Décrire le besoin, pas la solution** (formulaire guidé) ; idées similaires
  proposées avant création, doublons fusionnés (soutiens additionnés).
- Visibilité : l'auteur + **son agence** (soutien, anti-doublons) — **jamais les
  autres agences** ; le SA voit tout.
- **Revue mensuelle** (alerte module 14) avec **classement automatique** : soutiens
  (fort), **agences distinctes (le plus fort)**, ancienneté (modéré) — il éclaire,
  la décision reste humaine.
- **Trois statuts, jamais le rejet** (RM-20.5.5) : **retenue** → notification +
  **article** diffusé à toute la plateforme via les annonces
  ([[Agenda et échéances]], 14.6 — échéance indicative, jamais un engagement) ;
  **non retenue pour le moment** → **motif compréhensible + date de réexamen
  automatique** ; **déjà couverte** → explication. Archivée après deux ans, auteur
  informé.

## Relations

Console et files du [[Super Admin]] (module 18) ; alerte de revue et annonces au
module 14 ; conservation [[RGPD]] 6 mois. **Plan de livraison** : signalement dès le
**lot 1** (« c'est ainsi qu'on découvre ce qui ne va pas »), idées au lot 2.
