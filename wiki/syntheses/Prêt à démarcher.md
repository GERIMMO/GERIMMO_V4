---
type: synthesis
tags: [demarchage, lancement, production, v1, pilotage, promesses]
status: draft
created: 2026-10-16
updated: 2026-10-16
sources: ["[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Dossier de validation — version candidate du 13 octobre 2026]]", "[[Registre des anomalies — audit du 13 octobre 2026]]", "[[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]]", "[[Audit d'acquisition du 3 octobre 2026]]", "[[Expansion territoriale autonome]]", "[[Parrainage]]", "[[Choisir son locataire selon les conditions des assurances loyers impayés]]"]
---

# Prêt à démarcher

Ce que Gerimmo peut montrer et promettre à un prospect **au 16/10/2026**, d'après l'état réel de la production : ce qui
est en ligne, ce qui est fragile, ce qu'on peut promettre et ce qu'on ne doit pas promettre. Chaque ligne renvoie à sa
preuve (PR et SHA de fusion, entrée du journal `log.md`, page du wiki). Rien n'est promis sans preuve ; ce qui n'a pas été
vérifié est écrit tel quel. La décision de démarcher appartient au dirigeant.

> [!warning] Qui démarcher : une règle déjà posée
> D'après le wiki, **les particuliers ne sont jamais démarchés directement** (décision du porteur du 19/09/2026 :
> [[Expansion territoriale autonome]]) ; les leviers autorisés vers eux sont la publicité Instagram et Facebook et le
> [[Parrainage]]. Les agences sont hors du site public de la V1 (fiches PUB-01, PUB-02 du
> [[Registre des anomalies — audit du 13 octobre 2026]]). Un « prospect », ici, est donc d'abord une personne qui
> arrive par la publicité, le journal ou une recommandation. Le démarchage d'artisans n'est pas tranché dans le wiki :
> **à préciser par le dirigeant**.

## 1. Préalables avant le premier prospect

Relevés par le tour final de vérification du 16/10 et par le journal ; aucun n'est tranché ici.

1. **Faille de sécurité du parcours d'inscription (compte pré-inscrit)**, présente sur `main` : le correctif n'existe que
   dans le lot « invitation d'un artisan par un propriétaire », en cours et non fusionné (quatrième tour de relecture).
   Aucun compte n'est aujourd'hui en attente de confirmation en production, mais l'inscription publique est ouverte :
   chaque nouvelle inscription d'artisan ou de propriétaire y serait exposée. Recommandation du tour final : livrer ce
   correctif **avant** le premier démarchage, dans un lot de sécurité séparé si nécessaire. Des réglages du service
   d'authentification, hors dépôt, restent à vérifier (modèles de courriers, confirmation de l'adresse, inscriptions
   directes).
2. **Identité de l'éditeur et textes légaux** (D32, H1) : l'identité de l'éditeur n'est pas fournie ; les conditions
   générales, les mentions légales et la politique de confidentialité décrivent encore l'offre des agences. Toute
   modification des conditions après les premiers inscrits demande un préavis d'un mois (CGU art. 16, d'après
   [[Décisions groupées — version candidate du 13 octobre 2026]]). Relecture juridique recommandée.
3. **Quatre P1 « montant faux »** (Q3/Q5 : VER-TS-02, PR178-B-06, CHF-01, CHF-02) : corrigés dans le code en production
   depuis le 14/10 (PR #181, `d38487a`), mais **aucun contrôle en production** n'a été joué ; une recette dédiée est en
   préparation.

## 2. Ce qui est en ligne au 16/10/2026

Production = `main` à `bdaf755` (PR #193). Détail des fusions et des recettes : [[Dossier de validation — version candidate du 13 octobre 2026]] § 5 quater.

| Ce qui est en ligne | Preuve | Limite connue |
|---|---|---|
| Site public (accueil, tarifs, journal), inscription et récupération de compte ; page d'inscription des artisans | recettes de production n° 6 à 14 (parcours `public` et `inscription-recuperation` ; la page d'inscription des artisans est seulement ouverte) | textes légaux incomplets et faille d'inscription (§ 1) |
| Espace du propriétaire direct sous `/espace/<id>` (biens, lots, baux, loyers, documents, incidents, comptabilité, fiscalité) ; l'ancienne adresse `/agence/<id>` redirige | D27-B, PR #191, `d55f87b` ; recette n° 14 | parcours de base seulement ; aucune donnée réelle en production |
| Espace du locataire, invitation, et **relances automatiques J+3 et J+10** de l'invitation | X16, PR #190, `f93ec6e` ; recette n° 13 | aucune relance réelle observée ; les invitations en attente avant le 15/10 ne sont pas relancées |
| Règles de loyer au jour de Paris (état des loyers, impayés, relances, quittances, encaissements, dépôt, IRL, charges, rapports) | PR #186, `6b2a130` ; PR #189, `0c9328a` | restitution du dépôt, factures d'honoraires, appels de charges de copropriété : hors décision |
| Chaîne incident → devis → rendez-vous → intervention → facture : devis refusable puis révisable (D18), report ou annulation du rendez-vous par le locataire (D22-B), règlement déclaratif de la facture (D23-A) | PR #187, `8a168dd` ; PR #188, `98f3fd7` | **parcours complets jamais joués dans un navigateur** ; la recette n'a ni compte artisan ni compte de supervision ; le réseau d'artisans ne s'ouvre que commune par commune et métier par métier ([[Ouverture du réseau d'artisans]]) |
| Supervision : arrêt d'urgence étendu aux tâches de la base (neuf sur dix), limite des appels IA (50 par jour par défaut), recherche par référence | PR #182, `8c4aed6` ; PR #190 | console jamais parcourue par la recette |
| Relais du dirigeant : e-mail quotidien à 05 h 00 heure de Paris et e-mail immédiat des urgences du mode vacances, vers deux adresses fournies par le dirigeant et gardées hors du dépôt | D46-B, PR #192, `a722f94` | aucun e-mail de 5 h le 16/10 ; premier attendu le 17/10 au plus tôt ; heure réelle d'arrivée à constater |
| Sauvegarde quotidienne chiffrée, tâches de la base comprises | D07-A, PR #182 | **restauration d'une sauvegarde réelle jamais essayée** (D07, D43 à autoriser) |

## 3. Ce qui est fragile

- **Production quasi vide** (relevé en lecture seule du tour final, 16/10) : aucun bail actif, aucun encaissement, aucune
  intervention. Aucune fonction n'a encore tourné sur des données réelles d'un client.
- **Ce que la recette ne couvre pas** : l'espace artisan, la console de supervision, les parcours complets de D18, D22-B
  et D23-A, les contrôles des quatre P1 (journal, recettes n° 10 à 13).
- **Manques déclarés des fonctions livrées** : pas d'alerte au propriétaire quand un artisan devient non affectable
  pendant la révision d'un devis, pas de PDF par version (D18) ; pas de relance de l'artisan avant l'échéance d'une
  demande de report, pas de « J'en prends acte », pas de badge dans son agenda (D22-B).
- **Ajout de son propre artisan par un propriétaire** : impossible aujourd'hui (fiche PRO2-01) ; l'invitation d'un artisan
  par un propriétaire, décidée le 15/10, est **en cours, non livrée**.
- **Dépôt de fichiers** : l'écran annonce 10 Mo, la documentation de la plateforme borne le corps d'une requête à 4,5 Mo ;
  la mesure (D12) n'est pas autorisée : un fichier de 4,5 à 10 Mo peut échouer sans message clair.
- **Conseils « choisir son locataire »** affichés au propriétaire depuis la PR #182 alors que la page source est en
  brouillon et que les sources primaires (conditions générales des assureurs, textes légaux) n'ont pas été relues
  ([[Choisir son locataire selon les conditions des assurances loyers impayés]]) : à ne pas présenter comme un conseil
  juridique ; le maintien en ligne est une question au dirigeant.
- **Alerte de 5 h du relais** : la route est bornée à 60 s sans délai maximal d'envoi ; si le service d'e-mail est lent,
  l'alerte du jour peut être perdue sans bruit (constat du tour final, à corriger).
- **Liens de connexion** : le code à usage unique vaut 86 400 s (24 h) dans le réglage actuel ; sa réduction (H1) n'est pas
  décidée.
- **Dépendance à une seule personne** pour piloter le code ([[Audit d'acquisition du 3 octobre 2026]]).

## 4. Ce qu'on peut promettre à un prospect

Seulement ce qui est en production et prouvé par une recette ou un test cité ci-dessus, sans chiffre de performance :

- un espace de gestion locative en ligne pour le propriétaire bailleur et un espace pour son locataire (parcours joués sur
  téléphone par la recette de production ; écrans audités à 768 et 1440 px sur le banc) ;
- l'invitation du locataire avec deux relances automatiques (J+3, J+10) ;
- les dates de loyer, de quittance et d'impayé comptées au jour de Paris ;
- le suivi d'un incident jusqu'à la facture de l'artisan, avec refus motivé et révision d'un devis, report ou annulation
  du rendez-vous par le locataire, et règlement noté par le propriétaire (déclaratif) — **à condition** que le réseau
  d'artisans soit ouvert pour sa commune et le métier, et en précisant que ces parcours n'ont pas encore été joués de bout
  en bout en production ;
- une sauvegarde quotidienne chiffrée des données.

L'offre commerciale (formules, essai, parrainage) est celle de [[Grille tarifaire]] et de [[Cycle de vie de l'abonnement]] ;
le mode de la clé de paiement de production (essai ou réel) reste à confirmer par le dirigeant avant le premier paiement.

## 5. Ce qu'on ne doit pas promettre

- **Encaissement en ligne des loyers ou rapprochement bancaire** : absents (le gérant saisit chaque paiement ;
  [[Audit d'acquisition du 3 octobre 2026]]).
- **Signature électronique** : non activée au lancement ([[Signature électronique]]).
- **Mise en location** (annonces, multidiffusion, candidatures) : absente ([[Audit d'acquisition du 3 octobre 2026]]).
- **Offre aux agences** : hors du site public de la V1.
- **Artisans partout** : le réseau ne s'ouvre que commune par commune et métier par métier ; l'ajout de son propre artisan
  n'est pas encore livré.
- **Outil « clients externes » de l'artisan** (devis, factures, avoirs pour ses propres clients) : désactivé en production
  jusqu'à la validation comptable de la forme de l'avoir (D24-C).
- **Un délai de restauration** : l'objectif du [[Plan de reprise d'activité]] n'a jamais été éprouvé sur une sauvegarde
  réelle.
- **Des conseils juridiques ou fiscaux** : le récapitulatif fiscal est une aide à la déclaration, les conseils de choix du
  locataire ne sont pas relus sur leurs sources.
- **Des mentions légales complètes** tant que l'identité de l'éditeur n'est pas fournie.

> [!warning] Points à trancher / contradictions
> - **Ordre des priorités** : le tour final recommande de livrer le correctif de la faille d'inscription avant tout
>   démarchage, alors qu'il est aujourd'hui attaché au lot « invitation d'un artisan », encore en relecture. À trancher
>   par le dirigeant : lot de sécurité séparé, ou attente de l'invitation.
> - **Démarchage d'artisans** : ni autorisé ni interdit par le wiki ; la règle « jamais de démarchage direct » ne vise
>   explicitement que les particuliers.
> - **Conseils « choisir son locataire »** : en ligne alors que leur page source est un brouillon non relu sur les
>   sources primaires ; garder, masquer, ou retirer la qualification « règle légale » ?
> - **Paiement** : premier paiement possible à la fin de l'essai ; le mode de la clé de paiement de production n'est pas
>   confirmé dans le wiki.

## Relations

[[Décisions groupées — version candidate du 13 octobre 2026]] · [[Dossier de validation — version candidate du 13 octobre 2026]] ·
[[Registre des anomalies — audit du 13 octobre 2026]] · [[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]] ·
[[Audit d'acquisition du 3 octobre 2026]] · [[Expansion territoriale autonome]] · [[Parrainage]] · [[Grille tarifaire]] ·
[[Recette de production]] · [[Propriétaire bailleur]] · [[Locataire]] · [[Artisan]]
