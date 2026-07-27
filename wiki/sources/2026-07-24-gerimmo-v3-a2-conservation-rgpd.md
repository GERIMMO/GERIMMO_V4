---
type: source
tags: [rgpd, conservation, purge, anonymisation, sous-traitant, livrable-a2]
status: stable
created: 2026-07-25
updated: 2026-07-25
source-file: raw/assets/GERIMMO-V3-A2-Conservation-RGPD.md
source-type: livrable transverse du référentiel V3 — issu de l'audit externe (point P0.3)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Livrable A2 : Conservation et RGPD

**En une phrase :** livrable transverse qui **corrige les durées de tous les
modules** — l'audit reprochait les conservations « sans limite » (journal d'audit,
blacklist, baux, mandats, EDL) et le principe « jamais supprimé, seulement archivé »
qui « ne répond pas au droit à l'effacement ». Qualification actée : **Gerimmo est
sous-traitant pour les données d'agence, responsable pour les traitements
plateforme**. **Réserve : matrice à faire valider par un conseil spécialisé.**

## Affirmations clés

1. **Trois principes** : toute durée découle d'une **finalité écrite** (RM-A2.1/2,
   bloquants — aucune conservation indéfinie sans base légale) ; **trois sorts
   finaux** — suppression, anonymisation, conservation justifiée (RM-A2.3) ; **un
   journal a sa propre durée, plus courte que la donnée** (RM-A2.6 — la
   journalisation ne prolonge rien).
2. **« Jamais supprimé » est corrigé** : l'archivage devient une **étape du cycle de
   vie, jamais un sort final** (RM-A2.4). Cycle en **trois étapes** : base active
   (usage quotidien) → **archivage intermédiaire** (consultation sur justification,
   aucune modification — admin agence et SA seulement) → sort final (la donnée
   disparaît ou perd son caractère personnel). **Tout contentieux gèle le passage au
   sort final** (RM-A2.7, généralise RM-0b.8.3). L'**anonymisation doit être
   irréversible** (RM-A2.5) — pas une pseudonymisation : « Loyer Martin Dupont » →
   « Loyer lot 47 » ; elle concilie effacement et obligation comptable.
3. **Partage des rôles RGPD** (RM-A2.8/9) : l'**agence est responsable** de la
   gestion locative, des dossiers, de la comptabilité, des incidents, de la
   messagerie (Gerimmo exécute — **contrat de sous-traitance obligatoire**,
   autorisation de l'agence pour les sous-traitants ultérieurs) ; **Gerimmo est
   responsable** de l'annuaire artisan public, du **score/notation artisan** (« aucune
   agence ne décide de la formule […] c'est la définition du responsable de
   traitement »), de la blacklist globale, des comptes et de la facturation.
   Violation de données : **Gerimmo alerte l'agence sans délai** (RM-A2.10), notifie
   la CNIL pour ses propres traitements.
4. **Matrice de conservation** (finalité, base légale, actif, archive, sort) —
   grandes lignes : pièces du dossier locataire **bail + 5 ans → suppression** ;
   identité/coordonnées, **baux, EDL, cautionnement, congés, mandats : bail/mandat +
   5 ans → anonymisation** (prescription des actions nées du bail) ; **comptable
   (écritures, quittances, factures, rapports, récaps fiscaux) : + 10 ans →
   anonymisation** ; interventions : incidents/photos bail + 2 ans → suppression,
   devis non retenu 1 an, RDV 1 an ; artisan (plateforme) : profil actif + 3 ans,
   évaluations individuelles 3 ans, score tant qu'actif ; communication :
   conversations bail + 2 ans, consentement WhatsApp valeur + 3 ans, traces d'envoi
   bail + 5 ans → anonymisation. **Journaux** : technique **6 mois** · audit
   **3 ans** · accès aux pièces **1 an**.
5. **Cinq corrections explicites au référentiel** : RM-0b.8.7 (la personne n'était
   jamais supprimée → **anonymisation au terme de l'archivage**) ; RM-8.5.6 (motifs
   de blacklist indéfinis → **3 ans local, 5 ans global** — « un artisan doit pouvoir
   repartir sans que son passé le suive ») ; RM-12.5.6 (durées « sans limite » →
   toutes rattachées à une finalité) ; RM-18.5.2 (journal d'audit jamais purgé →
   **3 ans**, recommandation CNIL) ; RM-18.4.4 (agence jamais supprimée → **archivée
   10 ans puis anonymisée**).
6. **Droits des personnes** : accès/rectification/effacement… répartis agence vs
   plateforme ; **la contestation de note artisan = droit à l'intervention humaine**
   (RM-A2.11, qualifie RM-11.4.4 — à présenter comme tel à l'artisan). Limites à
   l'effacement : bail en cours, impayé, contentieux, écriture comptable (mais
   anonymisable au terme) — **oui** après prescription (bail terminé sans dette) et
   **sur demande, même avant terme, pour les pièces du dossier**.

## Décisions actées / reports

Actées : qualification sous-traitant/responsable, 3 sorts finaux, cycle 3 étapes,
matrice complète, durées des journaux, 5 corrections au référentiel. **Restent à
produire** : contrat de sous-traitance type + politique de confidentialité (conseil
juridique), registre des traitements plateforme, **analyse d'impact (AIPD) sur le
score artisan — profilage à évaluer**, procédure de notification de violation.
**Réserve : la matrice « ne se substitue pas à une consultation juridique »** —
validation par un conseil spécialisé (durées de prescription, bases légales).

## Ce que ce livrable impose ailleurs

Corrige les modules 0b (purge → anonymisation), 8 (blacklist), 12 (conservation par
type), 18 (journal d'audit, archivage d'agence) ; abroge le principe transverse
« [[Archivage plutôt que suppression|jamais supprimé]] » comme sort final ; la table
`retention_rules` du [[Architecture du socle V3|lot 0]] (32 types) implémente cette
matrice ; les journaux `audit_log` 3 ans / `tech_log` 6 mois du lot 0 en découlent.

> [!warning] Points à trancher / contradictions
> - **[[Diagnostic]]** : « historique conservé indéfiniment » (RM-0.6.5) n'est pas
>   dans les corrections d'A2 mais contredit RM-A2.2 (aucune conservation indéfinie).
>   Finalité à écrire ou durée à fixer.
> - Le module 20 cite « conservation 6 mois (RM-A2.6) » pour les signalements de
>   bug — cohérent avec le journal technique, mais le rattachement exact
>   signalement ↔ catégorie de la matrice reste implicite.

## Pages mises à jour par cet ingest

[[RGPD]] (refonte) · [[Archivage plutôt que suppression]] (principe corrigé) ·
[[Dossier locataire]] · [[Artisan]] · [[Document]] · [[Organisation]] ·
[[Modèle de rôles et permissions]] · [[État du projet et décisions ouvertes]]
