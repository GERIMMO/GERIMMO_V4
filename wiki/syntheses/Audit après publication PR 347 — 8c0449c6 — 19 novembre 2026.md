---
type: synthesis
tags: [audit, securite, mfa, sci, documents, purge, production, recette]
status: stable
created: 2026-11-19
updated: 2026-11-19
sources: []
---

# Audit après publication PR 347 — 8c0449c6 — 19 novembre 2026

Le dirigeant a demandé un audit indépendant après la publication de la PR #347. Elle corrige les trois défauts
relevés le même jour dans [[Audit indépendant complet avant lancement — 341b770f — 19 novembre 2026]] :
- SEC-1 : la provenance des documents ;
- la double authentification non exigée ;
- le représentant [[SCI]].

Le rapport complet est dans le dépôt, sous `livrables/audit-pr347-20261119/`.

## Méthode

- **Production en lecture seule**, plus trois comptes fictifs créés avec accord puis purgés :
  - un [[Propriétaire bailleur|propriétaire]] avec double authentification ;
  - son [[Locataire]] ;
  - une SCI.
- **Recette n° 52** (voir [[Recette de production]]).
- **Banc isolé à 8c0449c6** : sondes d'attaque et de purge dans des transactions annulées, tests de la PR et suite
  navigateur.

## Résultats

- **SEC-1 corrigé.**
  - Une fiche ne peut plus viser le fichier d'un autre espace.
  - Ni la conservation, ni la purge de nuit, ni la purge manuelle ne peuvent supprimer un fichier encore référencé,
    même face à une fiche malveillante antérieure à la correction.
  - En production : 0 document hors de son organisation, et les téléchargements entre espaces sont refusés.
- **Double authentification corrigée.** Vérifié en production :
  - le mot de passe seul renvoie vers `/securite`, et l'API répond 428 ;
  - un code faux est refusé ; le code juste rend l'accès ;
  - la déconnexion invalide le jeton.

  Le locataire n'a pas de régression.
- **SCI corrigée.**
  - Le prénom est exigé à l'écran de confirmation.
  - Le représentant est enregistré du premier coup, avec son justificatif.
  - La quittance est juste.

  Reste SCI-2 : la fiche de la société naît sans coordonnées.
- **Recette n° 52 réussie.** Aucune erreur serveur depuis la publication.

## Verdicts

| Cible | Verdict |
|---|---|
| 10 propriétaires particuliers gratuits | **GO** |
| SCI | **GO, avec accompagnement** : faire compléter la fiche de la société (SCI-2). |
| Abonnements payants | **NO GO** : médiateur, paiement réel, antivirus, alerte du dirigeant. |

## Liens

- Audit précédent : [[Audit indépendant complet avant lancement — 341b770f — 19 novembre 2026]].
- Suite : [[Corrections après l'audit PR 347 — 19 novembre 2026]] (SCI-2, SCI-3, SCI-4, UX-1, alerte, TEC ; branche
  non publiée).

> [!warning] Points à trancher / contradictions
> - L'alerte du dirigeant et la purge des 33 fichiers d'audit ne pouvaient pas être constatées le 19/11 au soir.
>   Passages prévus le 20/11 à 03 h 40 et 04 h 00 UTC ; contrôle programmé à 04 h 15 UTC.
> - Le formulaire public SCI ne demande toujours pas le prénom en production : seul l'écran de confirmation l'exige.
>   Corrigé sur la branche `claude/corrections-post-pr347`, non publiée.
