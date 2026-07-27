---
type: source
tags: [dossier-locataire, pieces, assurance, garant, purge-rgpd, module-0b]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-Module-0b-Dossier-locataire.md
source-type: module du référentiel des parcours clients (V3)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 0b : Dossier locataire

**En une phrase :** 8 parcours et 3 objets métier autour des **pièces justificatives**
du locataire et du garant — principe fondateur : **le dossier appartient à la personne,
pas au bail**. Statut : **module clos, aucune question ouverte**. Criticité haute
(obligation légale annuelle sur l'assurance).

## Affirmations clés

1. **Hors périmètre — décision actée** : la prospection et la sélection du locataire.
   Le module commence **après** : le gérant enregistre les pièces d'un locataire déjà
   retenu, avant de générer le [[Bail]].
2. **Le dossier suit la personne** ([[Dossier locataire]]) : un locataire qui change de
   lot dans la même agence garde son dossier (RM-0b.7.2), quel que soit le propriétaire.
   Il ne franchit **jamais** la frontière d'une autre agence (RM-0b.7.3 = RM-A1.10) et
   le **propriétaire mandant n'y a aucun accès** (RM-0b.7.4, bloquant). Toute
   consultation est tracée (RM-0b.7.5).
3. **La personne n'a pas de rôle fixe** (RM-0b.1.1) : le rôle se déduit des
   rattachements (locataire ici, garant là). Unicité fonctionnelle nom + date de
   naissance, **non bloquante** ; **email unique sur toute la plateforme = blocage**
   (RM-0b.1.3, aligné RM-A1.1 — [[Compte, personne et adhésion]]).
4. **Le garant est une personne à part entière** (RM-0b.3.1) : sa fiche, ses pièces —
   réutilisables pour couvrir plusieurs locataires (parent garant de deux étudiants).
   Le **lien de garantie est porté par le bail** (RM-0b.3.3) ; la fin du bail éteint le
   lien, pas la fiche.
5. **Versioning intégral des pièces** : toutes les versions conservées, aucune écrasée
   (RM-0b.4.1), seule la courante affichée ; chaque version datée et attribuée. Usage :
   prouver quelle assurance couvrait le locataire à la date d'un sinistre.
6. **Assurance habitation = le parcours le plus critique** : obligation légale annuelle,
   seul parcours où le locataire agit seul (dépôt depuis son espace, RM-0b.5.1).
   **Seuils d'alerte** : J-30 locataire, J-15 agence, J+0 défaut constaté, J+15 relance
   hebdomadaire (RM-0b.6.1). **Chaque alerte est horodatée et conservée comme preuve**
   (RM-0b.6.2) — le bailleur ne peut invoquer le défaut que s'il prouve avoir réclamé.
   Le défaut **alerte mais ne verrouille rien** (RM-0b.6.4).
7. **Dossier incomplet n'empêche pas le bail** — il alerte (RM-0b.2.3). Formats
   PDF/JPG/PNG, 10 Mo max (cohérent RM-A4.9).
8. **Purge RGPD (0b.8, V2 mais modèle conçu en V1)** : 5 ans après la fin du dernier
   bail (RM-0b.8.1), compteur remis à zéro par un nouveau bail, **suspension
   automatique si procédure en cours** (RM-0b.8.3), alerte J-30 à l'agence, corbeille
   **3 mois** restaurable puis suppression définitive, journal d'audit indéfini.
   **La purge ne supprime jamais la personne, ses baux ni sa comptabilité**
   (RM-0b.8.7) — seules les pièces. Déclenchable manuellement sur demande RGPD
   (RM-0b.8.9), refusée si bail actif, bloquée si la personne est encore garante
   (RM-0b.8.10).

## Les pièces attendues

| Catégorie | Déposant | Expire |
|---|---|---|
| Identité (CNI, titre de séjour) | Agent | Oui — mêmes seuils que l'assurance (RM-0b.6.5) |
| Revenus, fiscalité, domicile | Agent | Non |
| **Assurance habitation** | **Locataire** | **Oui — annuelle** |
| Garant (mêmes catégories) | Agent | Variable |
| Sur demande du gérant | Locataire (RM-0b.2.5) | Non |

## Les 8 parcours

0b.1 fiche personne (V1) · 0b.2 dépôt des pièces (V1) · 0b.3 pièces du garant (V1) ·
0b.4 mise à jour/versions (V1) · **0b.5 dépôt attestation par le locataire (V1,
criticité maximale)** · **0b.6 alertes d'expiration (V1, maximale)** · 0b.7 consultation
(V1, trois portes : fiche personne / lot / bail) · 0b.8 purge RGPD (**V2**).
14 user stories, 24 critères d'acceptation.

## Ce que ce module impose ailleurs

Module 1 (lien de garantie porté par le bail) · module 2 (cautionnement sur pièces du
garant) · module 3 (un impayé suspend la purge) · module 14 (4 seuils d'alerte
assurance) · module 19 (dépôt d'attestation sur mobile).

## Pages mises à jour par cet ingest

[[Dossier locataire]] (créée) · [[Locataire]] · [[Compte, personne et adhésion]] ·
[[RGPD]] · [[Document]] · [[Agenda et échéances]] · [[Bail]] ·
[[Propriétaire bailleur]] · [[Notification et valeur probante]] ·
[[État du projet et décisions ouvertes]]
