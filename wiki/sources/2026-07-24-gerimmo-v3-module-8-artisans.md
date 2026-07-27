---
type: source
tags: [artisan, decennale, pieces, blacklist, score, module-8]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-Module-8-Artisans.md
source-type: module du référentiel des parcours clients (V3)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 8 : Artisans

**En une phrase :** 5 parcours, 2 objets (**Artisan**, **Pièce justificative**) —
l'enjeu : **« aucun artisan sans assurance valide chez un locataire »**. Rend
applicable RM-7.3.2 via le suivi des pièces et de leurs expirations. **Module clos.**

## Affirmations clés

1. **L'agence crée la fiche, l'artisan la maîtrise** : l'admin agence pose nom, SIRET
   (clé d'unicité, RM-8.1.1), métiers (liste fermée), zone (codes postaux) puis
   **invite l'artisan** (module 16) qui dépose **lui-même** ses pièces (RM-8.2.1) et
   **décide seul de sa visibilité** (RM-8.4.2, décision actée) : privé par défaut,
   public ou privé à des agences choisies. Un artisan public existant est **rattaché,
   jamais dupliqué** (RM-8.1.5) — ses pièces valent pour toutes les agences (RM-8.2.8).
2. **Seule la décennale bloque** — et **selon la nature des travaux, pas le métier**
   (RM-8.2.9, décision révisée) : entretien courant/réparation simple = pas de
   décennale requise ; remplacement d'équipement, clos et couvert, réseaux encastrés,
   gros œuvre = requise. Décennale expirée → **retrait automatique des listes
   d'affectation** pour ces travaux (RM-8.2.2) ; dépôt à jour → rétablissement
   immédiat ; **une intervention en cours n'est jamais interrompue** (RM-8.2.7).
   Autres pièces (URSSAF 6 mois, RC pro, Kbis 3 mois, certifications) : alerte sans
   blocage. Seuils : **J-60 / J-30 / J-7 / J+0** (RM-8.2.5).
3. **Recherche (8.3)** : métier déduit de la catégorie de l'incident, zone comparée
   au code postal du lot, **filtre décennale non désactivable** (RM-8.3.1),
   blacklistés exclus, **tri par score décroissant**.
4. **Score composite** (spécifié au module 11) : **gérant 50 %** (qualité, délai,
   qualité-prix — « le seul à voir l'ensemble »), **locataire 25 %** (ce qu'il a vu
   sur place), **plateforme 25 %** (fiabilité auto : délais d'acceptation et
   d'intervention, taux de refus, RDV manqués, ponctualité documentaire). L'artisan
   voit sa moyenne et son score de fiabilité, jamais le détail de qui a noté quoi ;
   il ne répond pas publiquement (contestation via messagerie, module 11).
5. **Désactivation ≠ blacklist** (8.5) : désactivation neutre sans motif ; blacklist
   **motivée** (motif conservé indéfiniment). **Locale** (admin agence, n'engage que
   son agence — RM-8.5.2) vs **globale** (super admin seul, faits objectifs : fausse
   attestation, radiation, travail dissimulé — réversible par lui seul, recréation
   impossible). Aucune blacklist avec intervention en cours ; devis en attente
   annulés.

## Décisions actées / reports

Actées : décennale liée à la nature (révisée), dépôt par l'artisan, visibilité par
l'artisan, note publique/commentaires privés, blacklist 2 niveaux, scoring par
intervention. **V2** : extraction automatique des dates de pièces. **Hors périmètre** :
vérification en ligne des attestations, paiement des artisans. 6 US, 9 critères.

## Ce que ce module impose ailleurs

Module 7 (filtre décennale applicable), module 9 (devis annulés à la blacklist),
module 11 (score → tri), module 16 (invitation), module 18 (blacklist globale en
console).

## Pages mises à jour par cet ingest

[[Artisan]] (consolidée) · [[État du projet et décisions ouvertes]]
