---
type: source
tags: [administration, roles, facturation, stripe, audit, suspension, module-18]
status: stable
created: 2026-07-25
updated: 2026-07-25
source-file: raw/assets/GERIMMO-V3-Module-18-Administration.md
source-type: module du référentiel des parcours clients (V3)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 18 : Administration

**En une phrase :** 6 parcours, 3 objets (Utilisateur, Abonnement, Entrée d'audit) —
le **point de convergence** du référentiel (11 modules y délèguent leur paramétrage)
et la **nouveauté : la facturation entre dans le périmètre** (décision révisée).
**Module clos.**

## Affirmations clés

1. **Trois rôles figés, aucune permission fine** (RM-18.1.1/2, décision actée) :
   agent, admin agence, super admin — « une agence de 5 à 15 personnes n'a pas besoin
   de profils sur mesure » (rôles personnalisables : V2). **Un agent ne voit que les
   dossiers de ses mandats** (RM-18.1.3) ; désactivation **bloquée** tant que des
   mandats lui restent (RM-18.1.4) ; compte désactivé jamais supprimé.
2. **Transfert temporaire de mandats — ajouté (répond au point P1.1 de l'audit)** :
   pour un agent absent, réassignation des mandats et alertes **sans changer le
   titulaire**, restitution en un clic (RM-18.1.6/7). **Équipes partageant un
   portefeuille : hors périmètre** (superflu à cette échelle).
3. **Paramétrage de l'agence (18.2)** : 9 familles sur un écran unique, tout a un
   défaut **sauf identité, indices IRL et utilisateurs** ; IRL et seuil de délégation
   **conditionnent des parcours** (RM-18.2.3).
4. **Supervision (18.3)** : console unique du SA — indicateurs (agences, lots pour la
   facturation, essais, suspendues, volumes) et **six files d'attente** (demandes de
   modèles, contestations de notes, modèles WhatsApp, bugs, correctifs, idées —
   module 20).
5. **Suspension / archivage (18.4)** : impayé → **suspension en lecture seule**
   réversible au paiement ; résiliation → **archivage, jamais de suppression**
   (baux en cours, compta 10 ans) ; **l'export reste toujours possible**
   (portabilité — RM-18.4.2) ; réactivation par le SA.
6. **Journal d'audit (18.5)** : ~10 actions sensibles tracées (réouverture de
   période, purge RGPD, consultations de pièces/documents, blacklists, accès SA aux
   notes, paramètres, rôles, suspensions, correctifs) — **ne se purge jamais**
   (RM-18.5.2, cohérent audit_log du lot 0).
7. **Facturation (18.6) — décision révisée : au périmètre** : « Gerimmo compte,
   Stripe encaisse et facture » (RM-18.6.9). **Trois flux** : mise en route (une
   fois), **abonnement exclusivement mensuel** (RM-18.6.7), **redevance annuelle**
   à la date anniversaire. **Deux modèles** : agences **par palier** de lots,
   propriétaires directs **par bien**. **Comptage : lot sous mandat actif au dernier
   jour du mois** (vacant compté, sans mandat non, archivé non — RM-18.6.4/5).
   Essai 14 jours sans restriction, alerte J-3, puis **lecture seule** (données
   conservées). Échec de prélèvement → relance puis suspension, **jamais
   suppression** (RM-18.6.10, cohérent webhooks Stripe d'A5).

## Décisions actées / reports

Actées : 3 rôles figés, archivage jamais suppression, facturation au périmètre
(révisée), essai 14 j, paliers/par bien, mise en route, mensuel seul, redevance
annuelle, **transfert temporaire (P1.1)**. **V2** : rôles personnalisables. **Hors
périmètre** : équipes, émission des factures par Gerimmo. 5 US, 7 critères.

> [!warning] Divergences code ↔ V3
> - **3 rôles V3 vs 6 rôles du code** (`administrateur_agence`, `agent_immobilier`,
>   `proprietaire`, `artisan`, `locataire`, `super_admin`) : le V3 réserve « rôle » au
>   staff — locataire/artisan/PD ont des espaces par nature. Vocabulaire à réconcilier.
> - **Périmètre de l'agent** : V3 = ses mandats uniquement ; code = tout membre voit
>   l'organisation entière. Restriction majeure à implémenter.
> - **Tarification PD** : V3 « par bien » vs paliers owner_1_5/6_20/21_50 du code ;
>   « abonnements exclusivement mensuels » clôt la question de l'annuel non fiable
>   (la « gestion annuelle » devient une **redevance**, pas une option de facturation).

## Pages mises à jour par cet ingest

[[Modèle de rôles et permissions]] · [[Grille tarifaire]] · [[Super Admin]] ·
[[Agent immobilier]] · [[État du projet et décisions ouvertes]]
