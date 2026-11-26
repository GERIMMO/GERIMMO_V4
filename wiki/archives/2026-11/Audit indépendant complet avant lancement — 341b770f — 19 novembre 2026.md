---
type: synthesis
tags: [audit, securite, sci, production, recette, lancement, commercial, asvs]
status: archived
archived: 2026-11-26
superseded-by: "[[Historique des audits]]"
created: 2026-11-19
updated: 2026-11-19
sources: []
---

# Audit indépendant complet avant lancement — 341b770f — 19 novembre 2026

> [!note] Page archivée le 26/11/2026
> Historique : cette page n'est plus tenue à jour. La référence actuelle est [[Historique des audits]].


Le dirigeant a demandé cet audit indépendant après les PR #345 et #346 : Gerimmo est-il prêt pour 10 premiers
propriétaires, puis pour une commercialisation payante ?

Le rapport complet est dans le dépôt, sous `livrables/audit-complet-20261119/` (`RAPPORT.md` et `preuves/`).

## Méthode

- **État relevé en lecture seule** :
  - version servie ;
  - CI ;
  - registre des migrations ;
  - tâches planifiées ;
  - erreurs Vercel ;
  - avertissements Supabase ;
  - configuration (noms de variables seulement).
- **Écritures en production, avec accord, puis purgées** :
  - la recette n° 51 (voir [[Recette de production]]) ;
  - un parcours [[SCI]] complet, de l'inscription publique à la quittance, avec un compte fictif.
- **Deux bancs isolés à 341b770f** :
  - tests unitaires et tests navigateur rejoués ;
  - sonde d'autorisation sur les 419 fonctions SECURITY DEFINER, sous deux profils : un propriétaire étranger et un
    [[Locataire]] ;
  - sondes de chemin de fichier entre espaces.
- **Revue du code** (OWASP ASVS 5.0) :
  - routes ;
  - webhooks ;
  - tâches planifiées ;
  - dépôts ;
  - sessions.

## Résultats

- **Aucun P0.** L'isolation entre clients tient en base : aucune des 419 fonctions sondées n'a cédé.
- **Ce qui fonctionne** :
  - la recette n° 51 réussit entièrement ;
  - le parcours particulier est juste (reçu en cas de paiement partiel, [[Quittance de loyer]] au solde, DPE exigé) ;
  - le locataire ne peut pas encaisser.
- **SCI** : le nom de l'espace, la fiche titulaire et la détention sont corrigés. Le choix du représentant reste bloqué.
- **Trois P1** :
  - **SEC-1** : une fiche de document peut viser le fichier d'un autre espace. La conservation automatique le ferait
    alors supprimer, ou un locataire complice pourrait le lire. Il faut connaître le chemin exact.
  - **SCI-1** : la gérante est refusée comme représentante faute de prénom, avec un message qui n'explique pas la cause.
  - **OPS-1** : l'alerte du dirigeant échoue du 12/11 au 19/11. Le destinataire a été corrigé le 19/11 ; l'effet est à
    constater le 20/11.
- **P2** :
  - double authentification activée mais jamais demandée à la connexion, hors supervision ;
  - aucun antivirus ;
  - pas de CAPTCHA côté application ;
  - fiche de la société sans coordonnées ;
  - aucun médiateur de la consommation ;
  - paiement Stripe jamais exercé en réel.

## Verdicts

| Cible | Verdict |
|---|---|
| 10 [[Propriétaire bailleur\|propriétaires]] particuliers gratuits | **GO sous deux conditions** : correctif SEC-1 et alerte constatée. |
| Propriétaires en SCI | **NO GO aujourd'hui**, GO après SCI-1. |
| Commercialisation payante à grande échelle | **NO GO** : médiateur, paiement réel, antivirus, double authentification, validation juridique. |

## Liens

- Audit précédent : [[Audit fonctionnel en production — 2928d63f — 19 novembre 2026]].
- Audit UX : [[Audit UX-UI complet — dca39641 — 18 novembre 2026]].

> [!warning] Points à trancher / contradictions
> - L'audit du 19/11 au matin donnait le P1-1 SCI comme seul blocage SCI. Après #346, un second blocage apparaît au
>   même endroit (prénom du représentant). Les tests de la PR ne l'ont pas couvert.
> - Le registre des migrations compte 511 versions pour 514 fichiers. Le schéma est complet, mais quatre noms diffèrent
>   et ne sont pas documentés.
> - À constater le 20/11 : la suppression des 26 fichiers en file (03 h 40 UTC) et l'envoi de l'alerte (04 h 00 UTC).
