---
type: concept
tags: [signature, yousign, demande-de-signature]
status: draft
created: 2026-07-24
updated: 2026-07-25
sources: ["[[2026-07-24-gerimmo-v3-module-13-signature-electronique]]"]
---

# Signature électronique

**Définition :** le circuit de signature des documents engageants (**Yousign**,
signature **simple** : email + code SMS — RM-13.1.1). Objet : **Demande de
signature** (document + signataires).
Source : [[2026-07-24-gerimmo-v3-module-13-signature-electronique|Module 13]].

> [!note] Phasage acté (humain, 2026-07-25) — point n° 1 clos
> Démarche **itérative, sans forte intégration au départ** : en **V0** (usage
> interne), la signature reste **hors plateforme** — la GED assure d'abord le
> socle documentaire (**dépôt, consultation, téléchargement** du PDF signé).
> **Yousign est intégré en V1**, la première version ouverte aux utilisateurs.
> Cela réconcilie la décision du 2026-07-22 (« hors plateforme + dépôt PDF ») et la
> révision du référentiel (« Yousign dès la V1 ») : les deux sont vraies, séquencées.

## Le circuit

- **Séquentiel, bailleur en dernier** (RM-13.1.2) — il ne s'engage que sur un document
  déjà accepté. Ordres par type : [[Bail]] (locataire → colocataires → garants →
  bailleur/mandataire), acte de cautionnement ([[Garantie]] — garant seul),
  **[[Mandat de gestion]]** (propriétaire → agence), congé bailleur (agence seule).
- **Aucun compte à créer** (RM-13.2.1) : le signataire clique le lien reçu par email,
  consulte le document, reçoit un code SMS, signe — le
  [[Propriétaire bailleur|mandant]] signe ainsi **sans jamais entrer dans
  l'application** (RM-13.1.4). Email valide obligatoire (bloquant).
- **La dernière signature rapatrie le document signé en GED (horodaté) et déclenche le
  parcours métier** (RM-13.2.3/4) : bail actif + lot loué + échéancier + alerte EDL ;
  gestion activée ; garantie effective. Le document signé fait foi
  ([[Notification et valeur probante]] — Yousign porte le dossier de preuve).

## Machine à états (= registre A5)

préparée → envoyée → en cours → **complète** ; refusée → préparée ; expirée →
préparée ; annulée. **Une seule demande active par document** (RM-13.1.5) ; document
**non modifiable pendant la signature** (RM-13.2.7).

## Refus, relances, expiration

- **Refus = motif obligatoire** (RM-13.2.5 — « un refus est une information, pas un
  échec »), circuit interrompu (les suivants ne reçoivent rien), **agent alerté
  immédiatement**.
- **Relances automatiques J+7 et J+21**, **alerte agent à J+28**, **expiration à
  J+30** ; document expiré conservé en GED, **relançable en un clic sans
  régénération** (RM-13.4.5) ; signatures partielles conservées mais sans valeur.
- **Tant que rien n'est signé, le parcours métier reste bloqué** (RM-13.4.6) et le
  lot reste *disponible*.

## Périmètre

Bail/avenants, cautionnement, mandat — **pas les [[État des lieux|états des lieux]]**
(signature tactile sur place, RM-13.1.6). Signature avancée/qualifiée : hors périmètre
(« un bail d'habitation ne l'exige pas »).

## Relations

Consomme les documents générés ([[Document]], module 12 — état « en signature » à
ajouter) ; déclenche les chaînes critiques ([[Machines à états et événements]] —
webhooks Yousign) ; alertes au module 14 ([[Agenda et échéances]]).
