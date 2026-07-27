---
type: source
tags: [document, ged, preuve, notification, lrar, signature, audit]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-A3-Documents-canaux-preuve.md
source-type: livrable-transverse (référentiel V3, issu de l'audit externe du 2026-07-24, point P0.4)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Livrable A3 : Documents, canaux et preuve

**En une phrase :** livrable transverse qui corrige une erreur de droit du module 12 —
la trace d'envoi GED ne prouve rien — et fixe, document par document, le **canal**, la
**date d'effet** et la **preuve** exigés. Principe : **« Gerimmo génère et suit, il ne
notifie jamais »** (RM-A3.1).

**Réserve affichée : matrice à faire valider par un conseil juridique.**

## L'erreur corrigée

Le module 12 affirmait que la date d'envoi conservée en GED « fonde les délais ».
C'est faux en droit : un email, un pixel d'ouverture et une LRAR n'ont pas les mêmes
effets. **Aucune trace GED ne constitue une preuve juridique** (RM-A3.2) — elle sert le
**suivi opérationnel** (qu'est-ce qui est parti, quand, à qui), la relance et le contrôle
interne, jamais la preuve d'un délai ou d'une réception.

## Affirmations clés

1. **Cinq niveaux de preuve** selon le canal : acte de commissaire de justice (date et
   contenu incontestables) > LRAR (date certaine) > remise en main propre contre
   émargement (date certaine) > email simple et mise à disposition en ligne (**aucune
   valeur probante**, même avec trace d'ouverture).
2. **C'est la première présentation qui fait courir le délai** (RM-A3.5) — ni la
   génération, ni l'envoi, ni le retrait effectif. Un locataire qui ne retire pas sa LRAR
   ne bloque pas le délai. **L'agent saisit cette date** lue sur l'avis de réception
   (RM-A3.4) et les délais sont calculés depuis la date saisie, jamais depuis l'envoi
   (RM-A3.6). → [[Notification et valeur probante]]
3. **Trois familles de documents** :
   - **Actes à effet juridique** (congés, mise en demeure, décompte de restitution) —
     canal légal imposé (LRAR ou acte), Gerimmo ne notifie pas ;
   - **Documents engageants** (bail, cautionnement, mandat) — **signature électronique
     simple via Yousign** qui porte la preuve ; **exception : l'état des lieux**, signé
     **sur place en tactile** = consentement en présence, pas une signature électronique
     eIDAS (RM-A3.7, qualifie RM-13.1.6) ;
   - **Documents courants** (quittance, appel de loyer, relance simple, rapport de
     gestion, récapitulatif fiscal, devis/facture) — email ou espace personnel, aucune
     exigence de preuve (RM-A3.8).
4. **Décision confirmée contre deux audits : la pièce jointe email** pour les documents
   financiers du propriétaire, **sans lien sécurisé** (RM-A3.9). Raisons : zéro stockage
   temporaire, zéro expiration, zéro développement. Conséquences assumées : circulation
   en clair, pas de révocation ni de trace de consultation (RM-A3.11). Le lien sécurisé
   reste une évolution possible, ni V1 ni commercialisation.
5. **Cas particulier du décompte de restitution** : le délai court depuis la **remise des
   clés** (RM-2.4.1), pas depuis la notification — mais le recommandé reste recommandé
   pour prouver les diligences de l'agence.
6. **Saisie protectrice** : numéro de recommandé et avis de réception scanné stockables,
   non obligatoires (RM-A3.10) — même logique que la trace des relances du module 3 :
   l'agence prouve ses diligences.

## Les 11 règles RM-A3

| Code | Règle | Bloquant |
|---|---|---|
| RM-A3.1 | Gerimmo génère et suit, il ne notifie jamais | Structurel |
| RM-A3.2 | Aucune trace GED ne constitue une preuve juridique | Structurel |
| RM-A3.3 | Un acte à effet juridique exige un canal légal | **Oui** |
| RM-A3.4 | La date de notification est saisie par l'agent | **Oui** |
| RM-A3.5 | La première présentation fait courir le délai | Structurel |
| RM-A3.6 | Délais calculés depuis la date saisie, jamais l'envoi | **Oui** |
| RM-A3.7 | La signature tactile d'un EDL n'est pas une signature électronique | Structurel |
| RM-A3.8 | Documents courants par email ou espace personnel | Structurel |
| RM-A3.9 | Documents sensibles en pièce jointe, sans lien sécurisé | Structurel |
| RM-A3.10 | N° de recommandé et avis stockables, non obligatoires | Non |
| RM-A3.11 | Une pièce jointe envoyée : ni révocation, ni trace de consultation | Structurel |

## Corrections apportées au référentiel

| Règle | Avant | Après |
|---|---|---|
| RM-12.4.1 | Envoi tracé (date, canal, destinataire) | Inchangé, **mais sans valeur probante** |
| Module 12, p. 9 | « La trace d'envoi fonde les délais » | **Formulation à supprimer** |
| RM-12.4.3 | Recommandé tracé manuellement | Précisé — date de **présentation** |
| RM-1.10.1 | Préavis depuis réception du congé | Confirmé — première présentation |
| RM-1.11.6 | Alerte préemption à deux mois | Depuis la date de présentation |
| RM-13.1.6 | EDL signés sur place | Qualifié — consentement en présence |

## Impacts sur les modules

Module 1 (champ « date de première présentation » sur le congé), module 3 (idem mise en
demeure), module 2 (décompte en recommandé), module 12 (retirer la formulation sur la
preuve), module 13 (distinguer Yousign et signature tactile).

## Réserves et pistes

- **Validation par un conseil juridique requise** (canaux imposés, dates d'effet).
- Piste d'évolution : le **recommandé électronique qualifié** pourrait remplacer la LRAR
  pour certains actes — à vérifier juridiquement avant toute simplification du circuit.

## Pages mises à jour par cet ingest

[[Notification et valeur probante]] (créée) · [[Document]] · [[Canaux de communication]] ·
[[Relances et mise en demeure]] · [[Bail]] · [[Quittancement des loyers]] ·
[[État du projet et décisions ouvertes]]
