---
type: synthesis
tags: [accueil, vue-ensemble]
status: in-progress
created: 2026-07-20
updated: 2026-07-25
sources: []
---

# Accueil — Wiki métier Gerimmo

Point d'entrée du wiki. **Gerimmo** est un projet de développement d'une application de
**gérance immobilière** ; ce wiki documente toute la **connaissance métier** qui
soutient le projet.

## Naviguer
- **[[index]]** — catalogue de toutes les pages
- **`log.md`** — journal des opérations
- **`CLAUDE.md`** — conventions et workflows du wiki

## Grands domaines
- **Personas** — les 6 acteurs : [[Super Admin]] (plateforme), [[Administrateur d'agence]],
  [[Agent immobilier]], [[Propriétaire bailleur]] (indépendant), [[Artisan]], [[Locataire]].
- **Processus** — le cycle incident (déclaration → [[Devis|devis]] → planification →
  [[Intervention et clôture|intervention]]), le [[Quittancement des loyers|quittancement]],
  les [[Relances et mise en demeure|relances]], l'[[Onboarding et abonnement|onboarding]].
- **Concepts** — [[Organisation]] (multi-tenant), [[Bien]], [[Occupation d'un bien]],
  [[Incident]], [[Document]], [[Période de loyer]], [[Abonnement]]…
- **Règles métier** — [[Grille tarifaire]], [[Quittance conforme]], [[Isolation multi-organisation]],
  [[Archivage plutôt que suppression]], [[RGPD]], [[Socle de sécurité]],
  [[Plan de reprise d'activité]], [[Vétusté et décote]],
  [[Machines à états et événements]], [[Notification et valeur probante]].
- **Synthèses** — analyses transverses : [[État du projet et décisions ouvertes]]
  (**les arbitrages en attente — à lire en premier**),
  [[Divergences code et référentiel V3]], [[Modèle de rôles et permissions]],
  [[Modèle de données]], [[Architecture du socle V3]], [[Canaux de communication]],
  [[Analyse concurrentielle]], [[Fonctionnalités par persona]].

## État (2026-07-25)
**Toutes les sources sont ingérées.** Trois familles :
1. **Le code** ([[Dépôt Gerimmo-V3]], 2026-07-21) — l'état réel de l'application.
2. **La concurrence** (Rentila, Smovin, Oskar + recherche web) → [[Analyse concurrentielle]].
3. **Le référentiel V3 (2026-07-24), complet** : 22 modules de parcours + 6 livrables
   transverses A1–A6 — **les six points bloquants P0 de l'audit ont chacun leur
   livrable**. « Le référentiel peut servir de base au développement. »

Voir [[index]] pour le catalogue et [[État du projet et décisions ouvertes]] pour les
points à trancher ; les écarts code ↔ cible sont dans
[[Divergences code et référentiel V3]].

## Prochaines étapes suggérées
1. **Trancher les arbitrages ouverts** (Yousign V1, validation du modèle
   d'identité A1, sort de Telegram, fiscalité…) — [[État du projet et décisions ouvertes]].
2. **Valider avec des experts** : doctrine financière A6 (expert-comptable — préparer
   la note de synthèse de 2-3 pages), matrices A2/A3 et CGU (conseil juridique).
3. **Combler la connaissance hors-référentiel** : proposition de valeur, points de
   douleur des personas (entretiens, surtout [[Locataire]]).
