---
type: synthesis
tags: [corrections, sci, securite, alerte, locataire, audit]
status: draft
created: 2026-11-19
updated: 2026-11-19
sources: []
---

# Corrections après l'audit PR 347 — 19 novembre 2026

Après [[Audit après publication PR 347 — 8c0449c6 — 19 novembre 2026]], le dirigeant a demandé de corriger ce qui
pouvait l'être et de lister ce qui ne le pouvait pas. Il a choisi quatre lots : [[SCI]], locataire invité, correctifs
techniques, alerte de secours.

- **Branche :** `claude/corrections-post-pr347`, partie de la version en production (`8c0449c6`).
- **État :** poussée **sans PR, sans fusion, sans publication**.
- **Rapport complet :** `livrables/corrections-post-pr347-20261119/RAPPORT.md`.

## Ce qui est corrigé

- **SCI** :
  - la fiche de la société reçoit l'e-mail du compte, puis les coordonnées du profil (SCI-2) ;
  - la quittance nomme le représentant : « *Société*, représentée par … » (SCI-3, formulation **à valider par un
    juriste**, voir [[Quittance conforme]]) ;
  - le formulaire public demande le prénom du gérant (SCI-4).
- **[[Locataire]] invité** : il arrive connecté sur son invitation, sans ressaisir le mot de passe qu'il vient de
  choisir (UX-1).
- **Alerte quotidienne** : un bandeau dans la console signale une alerte non partie (OPS-1, en partie).
- **Technique** :
  - Next 16.4.6 ;
  - réponses génériques pour les anonymes sur `/api/sante` et le webhook Stripe ;
  - anti-rejeu du webhook Zoho Sign ;
  - export comptable durci.

## Vérification

Sur le banc isolé, données fictives, dernier commit `bba781a2` :
- suite navigateur complète : 281 réussis, 0 échec ;
- suite unitaire : 12 941 réussis. Le seul échec dépend de l'ordre des essais sur le banc et passe sur base neuve.

Les nouveaux tests échouent sans les corrections. Détail et limites dans le rapport.

## Règle métier modifiée sur délégation

L'adresse e-mail d'une fiche devient unique **par nature** dans un espace : une société peut partager celle de son
gérant. La règle et ses conséquences sont décrites dans [[Compte, personne et adhésion]]. Le dirigeant a délégué ce
choix : elle reste à confirmer.

## Ce qui reste hors de portée du code

- Médiateur de la consommation.
- Premier paiement Stripe réel.
- Réception de l'alerte du 20/11.
- Antivirus des dépôts.
- CAPTCHA et réglages de Supabase Auth.
- Secret du suivi Resend en production.
- Validation juridique de la quittance SCI.
- Publication.

Le détail est dans le rapport.

## Liens

- [[Audit après publication PR 347 — 8c0449c6 — 19 novembre 2026]]
- [[Audit indépendant complet avant lancement — 341b770f — 19 novembre 2026]]

> [!warning] Points à trancher / contradictions
> - La règle d'unicité par nature a été choisie par l'agent sur délégation (« fait au mieux »). Elle est à confirmer.
> - La formulation de la quittance d'une SCI est à valider par un juriste.
> - Rien n'est en production tant que la branche n'est pas publiée et ses quatre migrations appliquées par le circuit
>   protégé.
