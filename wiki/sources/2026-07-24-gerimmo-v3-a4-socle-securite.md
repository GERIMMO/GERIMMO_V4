---
type: source
tags: [securite, mfa, chiffrement, sauvegarde, sous-traitants, livrable-a4]
status: stable
created: 2026-07-25
updated: 2026-07-25
source-file: raw/assets/GERIMMO-V3-A4-Socle-securite.md
source-type: livrable transverse du référentiel V3 — issu de l'audit externe (point P0.5)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Livrable A4 : Socle sécurité

**En une phrase :** 14 règles transverses qui comblent le constat de l'audit —
« **aucune exigence de sécurité dans les 22 modules** » (ni MFA, ni politique de mot
de passe, ni chiffrement, ni analyse des fichiers, ni plan de sauvegarde) alors que
la plateforme héberge pièces d'identité, revenus et RIB pour plusieurs agences.
**À valider avant mise en production.** Réserve de méthode : des exigences
fonctionnelles, pas une architecture — « ce qui doit être garanti, non comment ».

## Affirmations clés

1. **MFA proportionné au risque (acté)** : **obligatoire pour le super admin**
   (RM-A4.1 — compromis = toutes les agences), recommandé/activable pour l'admin
   agence (RM-A4.2), optionnel pour agent, locataire, artisan. « La sécurité
   théorique nuirait à la sécurité réelle » — l'imposer partout produirait des
   contournements (mot de passe partagé, session jamais fermée).
2. **Mots de passe** (RM-A4.3/4) : **12 caractères minimum, vérification contre les
   fuites connues**, pas de complexité imposée (« la longueur prime »), **pas
   d'expiration périodique** (« produit des variantes prévisibles »), historique 5,
   blocage temporaire après 10 échecs. **Sessions par rôle** (RM-A4.5) : SA 30 min
   d'inactivité / 8 h absolu · admin 2 h / 12 h · agent 4 h / 12 h · locataire et
   artisan **7 j / 30 j** (usages ponctuels — un locataire se connecte 4 fois par an).
3. **Chiffrement sans exception** (RM-A4.6) : TLS 1.2 min en transit, disque + stockage
   + sauvegardes au repos. **Hébergement en région européenne** (RM-A4.7, acté —
   « la question n'est pas technique mais contractuelle »), multi-zone, base non
   exposée publiquement. Cloisonnement applicatif = reprise des RM-A1.6/7/11/12
   ([[Isolation multi-organisation]]).
4. **Fichiers déposés** — « un point d'entrée souvent négligé » : extension
   PDF/JPG/PNG, **type réel vérifié, pas l'extension** (RM-A4.9 — « attestation.pdf »
   peut être un exécutable renommé), 10 Mo max, **antivirus systématique** (RM-A4.8,
   acté — refus + alerte), empreinte anti-doublon. Accès : **jamais d'URL directe**
   (RM-A4.10), contrôle de droits à chaque accès, lien temporaire à expiration
   rapide, consultation des pièces sensibles tracée (RM-0b.7.5).
5. **Sauvegardes** : continue, **perte max 24 h** (RM-A4.11), remise en service 4 h,
   rétention 30 jours glissants, **test de restauration annuel documenté**
   (RM-A4.12 — « une sauvegarde jamais testée n'est pas une sauvegarde » ; le premier
   avant mise en production). Restauration : plateforme (SA) · **une agence/une
   table** (SA sur demande) · objet isolé → corbeille applicative (RM-0b.8.5).
6. **Sous-traitants** (RM-A4.13 — liste déclarée aux agences dans le contrat de
   sous-traitance, information préalable à tout changement) : hébergeur (UE, toutes
   données) · Yousign (France) · Stripe (Irlande) · **Meta (hors UE)** — transfert
   acceptable par le triptyque consentement explicite + canal optionnel + repli email
   permanent (RM-16.5.1), **encadré par clauses contractuelles types et déclaré aux
   agences** · antivirus (à déterminer). **Incidents de sécurité** : qualification
   2 h, confinement 4 h (SA), **information des agences sans délai** (RM-A4.14),
   **notification CNIL 72 h** par l'agence ou Gerimmo selon la qualification A2.
   Journaux : connexions/mots de passe → technique 6 mois · traversée SA, rôles,
   exports → audit 3 ans · consultation de pièce → accès 1 an (durées RM-A2.6).

## Décisions actées / reports

Actées : MFA par rôle, hébergement UE, antivirus systématique, sessions par rôle,
pas d'expiration de mot de passe. **Reste à faire** : choix du service antivirus et
configuration d'hébergement (avant développement), contrat de sous-traitance type
(avant commercialisation), procédure de notification et **premier test de
restauration (avant mise en production)**, **audit de sécurité externe recommandé
avant lancement**.

## Ce que ce livrable impose ailleurs

Module 0b/8/9 : antivirus au dépôt des pièces · module 12 : aucun accès direct par
URL · module 16 : politique de mot de passe à la première connexion · module 18 :
MFA obligatoire SA · module 19 : compression des photos avant envoi. Le
[[Architecture du socle V3|lot 0]] implémente (étape 2 : authentification, MFA,
sessions ; étape 3 : stockage + antivirus ; `audit_log`/`tech_log`).

> [!warning] Points à trancher / contradictions
> - **Test de restauration : trimestriel (code, `docs/plan-reprise-activite.md`) vs
>   annuel (RM-A4.12)** — le code actuel est plus exigeant que la cible V3 ; à
>   harmoniser. → [[Plan de reprise d'activité]]
> - La localisation du **service antivirus** entrera au tableau des sous-traitants
>   une fois le prestataire choisi.

## Pages mises à jour par cet ingest

[[Socle de sécurité]] (créée) · [[Plan de reprise d'activité]] ·
[[Isolation multi-organisation]] · [[Super Admin]] · [[Architecture du socle V3]] ·
[[Canaux de communication]] · [[Document]] · [[RGPD]] ·
[[État du projet et décisions ouvertes]]
