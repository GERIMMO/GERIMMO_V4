---
type: synthesis
tags: [accueil, vue-ensemble]
status: in-progress
created: 2026-07-20
updated: 2026-09-29
sources: ["[[2026-09-20-cahier-des-charges-maitre-v3]]", "[[2026-09-28-decision-tarification]]", "[[2026-09-28-reseau-national-ouvertures-locales]]", "[[Dépôt Gerimmo-V3]]"]
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
  [[Incident]], [[Document]], [[Période de loyer]], [[Abonnement]], [[Parrainage]],
  [[Signature électronique]]…
- **Règles métier** — [[Grille tarifaire]], [[Quittance conforme]], [[Isolation multi-organisation]],
  [[Cycle de vie de l'abonnement]], [[Ouverture du réseau d'artisans]],
  [[Archivage plutôt que suppression]], [[RGPD]], [[Socle de sécurité]],
  [[Plan de reprise d'activité]], [[Vétusté et décote]],
  [[Machines à états et événements]], [[Notification et valeur probante]].
- **Synthèses** — analyses transverses : [[Proposition de valeur]]
  (**l'énoncé fondateur du projet**), [[État du projet et décisions ouvertes]]
  (**les arbitrages en attente — à lire en premier**),
  [[Divergences code et référentiel V3]], [[Modèle de rôles et permissions]],
  [[Modèle de données]], [[Architecture du socle V3]], [[Canaux de communication]],
  [[Analyse concurrentielle]], [[Fonctionnalités par persona]].

## État au lancement (30/09/2026)
Gerimmo est publiée le 30/09/2026 sur `gerimmo.app`. Ce qui vaut au lancement :
- **Référence produit** : le [[2026-09-20-cahier-des-charges-maitre-v3|cahier des
  charges maître V3]] (adopté le 20/09) prime sur les notes antérieures.
- **Tarifs (28/09/2026)** — [[Grille tarifaire]], [[Abonnement]] : particuliers et
  SCI Solo (1 bien, 5,99 €/mois ou 59,90 €/an), Bailleur (≤ 3, 9,99 €),
  Investisseur (≤ 10, 19,99 €), Patrimoine (≤ 20, 29,99 €), +1 €/mois par bien
  au-delà ; agences 39 € HT jusqu'à 10 lots puis tranches cumulatives. **Aucun bien
  offert** : essai de 14 jours sans carte, puis gel en lecture seule jusqu'au
  paiement. **Franchise en base de TVA** (art. 293 B du CGI). [[Parrainage]] sans
  avantage tarifaire. CGU en production (`/conditions`) : préavis d'un mois
  (art. 8.8 et 16), rétractation de 14 jours (art. 8.9).
- **Réseau d'artisans** — [[Ouverture du réseau d'artisans]] : la gestion locative
  est nationale ; seul le réseau s'ouvre, **commune × métier**, par le
  [[Super Admin]] ; le carnet personnel reste utilisable partout.
- **[[Signature électronique]] non activée** au lancement (masquée, décision du
  27/09) : circuit de transition V0 — le signataire télécharge, signe et dépose
  le document signé.
- **Reste à fournir** : l'identité de l'éditeur (dénomination, siège, SIRET/RCS,
  e-mail, directeur de la publication, médiateur) —
  [[État du projet et décisions ouvertes]].

Les audits successifs : [[Audit et point santé du 11 septembre 2026]],
[[Audit de nuit — fonctionnalités, personas et automatisation (20 septembre 2026)]],
[[Audit complet du 25 septembre 2026]], [[Audit complet du 27 septembre 2026]] ; la
décision tarifaire : [[2026-09-28-decision-tarification]] ; la recette :
[[Recette de production]].

## Historique — état au 2026-07-25
Trois familles de sources :
1. **Le code** ([[Dépôt Gerimmo-V3]], 2026-07-21) — l'état réel de l'application.
2. **La concurrence** (Rentila, Smovin, Oskar + recherche web) → [[Analyse concurrentielle]].
3. **Le référentiel V3 (2026-07-24), complet** : 22 modules de parcours + 6 livrables
   transverses A1–A6.

Voir [[index]] pour le catalogue et [[État du projet et décisions ouvertes]] pour les
points à trancher ; les écarts code ↔ cible sont dans
[[Divergences code et référentiel V3]].

## Prochaines étapes suggérées
1. **Fournir l'identité de l'éditeur** (mentions légales, formulaire de
   rétractation) — [[État du projet et décisions ouvertes]].
2. **Ouvrir les premières communes du réseau** (valider, rattacher, ouvrir par
   métier) — [[Ouverture du réseau d'artisans]].
3. **Valider avec des experts** : doctrine financière A6 (expert-comptable),
   matrices A2/A3 et CGU (conseil juridique).
4. **Combler la connaissance hors-référentiel** : points de douleur des personas
   (entretiens, surtout [[Locataire]]).
