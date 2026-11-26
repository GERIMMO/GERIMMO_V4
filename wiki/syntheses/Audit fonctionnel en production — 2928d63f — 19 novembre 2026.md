---
type: synthesis
tags: [audit, production, recette, pilote, sci, securite, isolation, quittance, charges]
status: stable
created: 2026-11-19
updated: 2026-11-19
sources: []
---

# Audit fonctionnel en production — 2928d63f — 19 novembre 2026

Audit indépendant demandé par le dirigeant après la publication de la PR #345 : Gerimmo peut-il accueillir ses
10 premiers propriétaires pilotes ? Le rapport complet est dans le dépôt, sous
`livrables/audit-production-20261119/` (`RAPPORT.md` et `preuves/`).

## Méthode

- **Vérifications techniques en lecture seule** : version servie, CI, registre des migrations, sauvegarde et
  restauration, comptages de données, erreurs Vercel.
- **Parcours réels en production** avec des comptes fictifs, créés avec l'accord du dirigeant et purgés à la fin :
  - un [[Propriétaire bailleur]] particulier ;
  - une SCI ;
  - un [[Locataire]].
- **Recette automatisée** du projet, n° 50 (voir [[Recette de production]]).

Ni paiement, ni signature, ni recommandé, ni courriel à une personne réelle.

## Résultats

- **Version** : `2928d63f` servie, identique au candidat `f489641f` ; migration `inscription_proprietaire_progressive`
  appliquée ; ventes fermées.
- **Données** : les comptages sont identiques avant et après l'audit (5 espaces, 8 comptes, 11 baux brouillon).
- **Parcours du particulier réussi de bout en bout** :
  - plafonds de dépôt appliqués ;
  - quittance de 640 € exacte ;
  - régularisation : 120 € de charges réelles − 40 € de provisions = 80 € de complément ;
  - incident clos ;
  - PDF réels ;
  - espace locataire cohérent.
- **SCI** :
  - paiement partiel traité en reçu, puis quittance au solde ;
  - colocation réussie ;
  - plafond du meublé à 2 mois ;
  - DPE exigé avant la mise en location ;
  - congé enregistré.

  Mais le rattachement à la SCI demande un contournement (P1-1).
- **Isolement étanche** :
  - pages d'autrui en 404 ;
  - API à 0 ligne ;
  - encaissement par le locataire refusé (403) ;
  - session révoquée à la déconnexion.
- **Recette n° 50** : 63 réussis, 4 échecs dus à des tests restés sur les anciens libellés.

## Anomalies

- **P0** : aucune.
- **P1-1** : l'inscription « en tant que SCI » rattache les logements à la gérante en personne. Le signataire du bail ne
  peut pas être la gérante : la liste ne propose que les locataires.
- **P1-2** : l'alerte quotidienne du dirigeant (relais) échoue chaque jour depuis le 12/11.
- **P2** :
  - recette non alignée ;
  - fichier téléchargé nommé « download » ;
  - bail signé classé en « Documents généraux » ;
  - « gestionnaire » encore utilisé côté locataire ;
  - mentions de quittance pour une SCI ou une colocation ;
  - zone tendue non déduite à Paris ;
  - logement portant le nom du bien.

## Verdict

**GO pour les propriétaires particuliers.** Corrections indispensables :
1. le parcours SCI, avant d'accueillir un pilote SCI ;
2. l'alerte du dirigeant.

Vérification indispensable : faire une inscription réelle avec une vraie boîte mail, puisque la confirmation par
e-mail n'a pas pu être jouée ce jour.

## Liens

- Audit UX précédent : [[Audit UX-UI complet — dca39641 — 18 novembre 2026]].
- Audit commercial : [[Audit de qualité commerciale V1 — a776ed43 — 16 novembre 2026]].

> [!warning] Points à trancher / contradictions
> - Le modèle SCI : l'inscription donne à la gérante la qualité « SCI », alors que les baux attendent une société
>   « personne morale » représentée par une « personne physique ». À trancher : créer la société dès l'inscription.
> - Les 19 fichiers des espaces fictifs sont en file de purge : suppression physique attendue le 20/11 à 03 h 40 UTC,
>   contrôle programmé.
