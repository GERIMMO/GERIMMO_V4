---
type: synthesis
tags: [demarchage, lancement, production, v1, pilotage, promesses]
status: draft
created: 2026-10-16
updated: 2026-10-16
sources: ["[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Invitation d'un artisan par un propriétaire]]", "[[Dossier de validation — version candidate du 13 octobre 2026]]", "[[Registre des anomalies — audit du 13 octobre 2026]]", "[[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]]", "[[Audit d'acquisition du 3 octobre 2026]]", "[[Expansion territoriale autonome]]", "[[Parrainage]]", "[[Choisir son locataire selon les conditions des assurances loyers impayés]]", "[[Recette de production]]", "[[Relais du dirigeant]]", "[[Le jour de référence est le jour de Paris]]"]
---

# Prêt à démarcher

> [!info] Relevé de la mission du 16 octobre, en soirée
> État vérifié et preuves : [[Mission du 16 octobre — suivi vérifié]]. PR #197 fusionnée (`4a5ddf5`). Inscription publique et anonyme fermées, confirmation d’adresse active, liens limités à une heure et trois modèles de courrier enregistrés dans Supabase. La recette n°19 passe au premier essai ; la n°20 confirme les nouveaux réglages (39 réussites, 1 ignoré, aucun test instable, nettoyage réussi). La trace D04 a été relue : montant vide envoyé, aucun montant faux enregistré. Les compléments D18, D22, D08-C, X08, relais et dates sont préparés et testés localement, **pas encore publiés**. Les anciens constats ci-dessous sont datés ; cette mission ne clôt ni les avis spécialisés ni les limites de recette restantes.


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

Relevés dans le journal, le code et les réglages documentés du dépôt ; aucun n'est tranché ici.

1. **Réglages d'authentification hors dépôt, non faits** : le correctif de sécurité (« première confirmation » : tout
   premier lien qui confirme une adresse remplace le mot de passe choisi avant) est **en production depuis le 16/10**,
   livré avec l'invitation d'un artisan (PR #194, `f24dfb0`). Il n'est complet qu'avec deux gestes du dirigeant dans
   Supabase, hors dépôt (`app/supabase/templates/LISEZ-MOI.md`) : **coller les trois modèles de courrier** du dépôt et
   **désactiver « Allow new users to sign up »**. Non faits au 16/10 (aucune entrée du journal ne les dit faits) ; tant
   que les modèles ne sont pas collés, le renvoi public de confirmation reste un chemin de prise de compte. Proposition :
   les faire **avant** le premier démarchage. Détail : [[Invitation d'un artisan par un propriétaire]].
2. **Identité de l'éditeur et textes légaux** (D32, H1) : l'identité de l'éditeur n'est pas fournie ; les conditions
   générales, les mentions légales et la politique de confidentialité décrivent encore l'offre des agences. Toute
   modification des conditions après les premiers inscrits demande un préavis d'un mois (CGU art. 16, d'après
   [[Décisions groupées — version candidate du 13 octobre 2026]]). Relecture juridique recommandée.
3. **Quatre P1 « montant faux »** (Q3/Q5 : VER-TS-02, PR178-B-06, CHF-01, CHF-02) : corrigés dans le code en production
   depuis le 14/10 (PR #181, `d38487a`) ; **contrôlés en production le 16/10** par la recette n° 18 (38880135882, sur
   `db0a95f`, recette `@montants` de la PR #195, données éphémères purgées après passage), **réussis au second essai
   seulement** : au premier, la saisie « 840,00 » a été refusée (« Montant invalide », rien d'enregistré), cause non
   établie : non reproduite en 20 essais au banc, perte de saisie à l'hydratation réfutée au banc ; dans le cas observé,
   le refus est visible et aucun montant faux n'est enregistré ; le test lit désormais le champ avant d'envoyer (pas
   encore joué en production) ; traces de la recette à lire avant le 30/10. Limites : le PDF 2044 n'est pas généré, le
   chemin confirmé d'une régularisation d'exercice en cours n'est pas joué. Leur fermeture n'est pas prononcée
   ([[Registre des anomalies — audit du 13 octobre 2026]]).

## 2. Ce qui est en ligne au 16/10/2026

Production = `main` à `db0a95f` (PR #195, correctifs du tour final de vérification, 16/10 ; recette n° 18, 38880135882). Détail des fusions et des recettes : [[Dossier de validation — version candidate du 13 octobre 2026]] § 5 quater.

| Ce qui est en ligne | Preuve | Limite connue |
|---|---|---|
| Site public (accueil, tarifs, pages légales, outils), inscription et récupération de compte ; page d'inscription des artisans | recettes de production n° 6 et n° 8 à 16 (parcours `public` et `inscription-recuperation` ; la page d'inscription des artisans est seulement ouverte) ; après le changement de `/auth/confirm` (PR #194) : recette n° 17 sur `f24dfb0` (38875612888), inscription d'un compte fictif, confirmation dans le navigateur de l'inscription et récupération réussies ; le remplacement du mot de passe par la « première confirmation » (lien ouvert dans un autre navigateur) n'y est pas joué | le journal (`/journal`) n'est pas parcouru par la recette ; textes légaux incomplets et réglages d'authentification hors dépôt non faits (§ 1) |
| Espace du propriétaire direct sous `/espace/<id>` (biens, lots, baux, loyers, documents, incidents, comptabilité, fiscalité) ; l'ancienne adresse `/agence/<id>` redirige | D27-B, PR #191, `d55f87b` ; recette n° 14 | parcours de base seulement ; aucune donnée réelle en production |
| Espace du locataire, invitation, et **relances automatiques J+3 et J+10** de l'invitation | X16, PR #190, `f93ec6e` ; recette n° 13 | aucune relance réelle observée ; les invitations en attente avant le 15/10 ne sont pas relancées |
| Règles de loyer au jour de Paris (état des loyers, impayés, relances, quittances, encaissements, dépôt, IRL, charges, rapports) | PR #186, `6b2a130` ; PR #189, `0c9328a` ; restitution du dépôt : PR #195, `db0a95f` | restitution du dépôt (décompte, date d'envoi) au jour de Paris depuis le 16/10 : **interprétation** du point 1 de la décision du 15/10, **à faire ratifier** par le dirigeant ; factures d'honoraires, appels de charges de copropriété : hors décision |
| Chaîne incident → devis → rendez-vous → intervention → facture : devis refusable puis révisable (D18), report ou annulation du rendez-vous par le locataire (D22-B), règlement déclaratif de la facture (D23-A) | PR #187, `8a168dd` ; PR #188, `98f3fd7` | **parcours complets jamais joués dans un navigateur** ; la recette n'a ni compte artisan ni compte de supervision ; le réseau d'artisans ne s'ouvre que commune par commune et métier par métier ([[Ouverture du réseau d'artisans]]) |
| Supervision : arrêt d'urgence étendu aux tâches de la base (neuf sur dix), limite des appels IA (50 par jour par défaut), recherche par référence | PR #182, `8c4aed6` ; PR #190 ; écran des arrêts complété (`maintenance-artisans`) : PR #195 | console jamais parcourue par la recette |
| Relais du dirigeant : e-mail quotidien à 05 h 00 heure de Paris et e-mail immédiat des urgences du mode vacances, vers deux adresses fournies par le dirigeant et gardées hors du dépôt | D46-B, PR #192, `a722f94` ; passage de 5 h borné sous 60 s et registres du relais conservés six mois au catalogue : PR #195, `db0a95f` | aucun e-mail de 5 h le 16/10 ; premier attendu le 17/10 au plus tôt ; heure réelle d'arrivée à constater |
| Invitation d'un artisan par le propriétaire direct (« Mes artisans », sous `/espace`) : l'artisan crée son compte, inscrit son entreprise et accepte ; validé par Gerimmo, il devient sollicitable par ce propriétaire même en commune fermée, pour les biens de sa zone. Avec la « première confirmation » de toute adresse | PR #194, `f24dfb0` (16/10) ; migrations vérifiées en lecture seule ; recette n° 17 verte (38875612888) | **parcours de bout en bout jamais joué en production** (banc local seulement ; la recette n'a pas de parcours d'artisan) ; aucune invitation réelle au journal ; réglages Supabase hors dépôt non faits (§ 1) |
| Sauvegarde quotidienne chiffrée, tâches de la base comprises | D07-A, PR #182 | **restauration d'une sauvegarde réelle jamais essayée** (D07, D43 à autoriser) |

## 3. Ce qui est fragile

- **Fonctions peu éprouvées sur des données réelles** : le journal relève aucune écriture comptable en production
  (14/10) et aucun devis en base (15/10) ; la comptabilité et la chaîne des devis n'avaient donc pas encore tourné sur
  des données de client à ces dates.
- **Ce que la recette ne couvre pas** : l'espace artisan, la console de supervision, les parcours complets de D18, D22-B
  et D23-A, l'invitation d'un artisan (journal, recettes n° 10 à 13 ; `app/e2e/recette-production/`). Les contrôles des
  quatre P1 y sont depuis la recette n° 18, sans le PDF 2044 ni le chemin confirmé de D38.
- **Échecs au premier essai de la recette** (diagnostic du 16/10, [[Recette de production]]) : « Créer la fiche » d'un
  locataire (admin d'agence, mobile), en échec au premier essai à chacune des recettes depuis la n° 6 (15/10 ; n° 6 à
  18), est un **défaut du test**, prouvé au banc (il attendait une redirection que l'écran ne fait plus depuis la
  PR #170) : aucun défaut de l'écran ; le second essai de ces recettes ne vérifiait pas l'ouverture de la fiche ; test
  corrigé (`72e1e0b`, PR #196), pas encore joué en production : la recette qui suit la fusion de la PR #196 le
  confirmera. Le bloc des P1 a échoué une fois (D04, recette n° 18) :
  cause non établie, non reproduite en 20 essais au banc ; aucun montant faux enregistré dans le cas observé ; traces à
  lire dans l'artefact de la recette jusqu'au 30/10.
- **Manques déclarés des fonctions livrées** : pas d'alerte au propriétaire quand un artisan devient non affectable
  pendant la révision d'un devis, pas de PDF par version (D18) ; pas de relance de l'artisan avant l'échéance d'une
  demande de report, pas de « J'en prends acte », pas de badge dans son agenda (D22-B).
- **Ajout de son propre artisan par un propriétaire** : possible depuis le 16/10 **par invitation** (PR #194, fiche
  PRO2-01) : l'artisan doit lui-même s'inscrire, accepter et être validé par Gerimmo, et il n'est sollicitable que pour
  les biens situés dans sa zone d'intervention. Parcours **jamais joué de bout en bout en production**
  ([[Invitation d'un artisan par un propriétaire]]).
- **Dépôt de fichiers** : l'écran annonce 10 Mo, la documentation de la plateforme borne le corps d'une requête à 4,5 Mo ;
  la mesure (D12) n'est pas autorisée : un fichier de 4,5 à 10 Mo peut échouer sans message clair.
- **Conseils « choisir son locataire »** affichés au propriétaire depuis la PR #182 alors que la page source est en
  brouillon et que les sources primaires (conditions générales des assureurs, textes légaux) n'ont pas été relues
  ([[Choisir son locataire selon les conditions des assurances loyers impayés]]) : à ne pas présenter comme un conseil
  juridique ; le maintien en ligne est une question au dirigeant.
- **Alerte de 5 h du relais** : le risque de dépasser les 60 s de la route est traité par la PR #195 (`db0a95f`,
  16/10) : les appels au service d'e-mail doivent être finis en 45 s, l'e-mail de 5 h part vers les adresses en
  parallèle, chaque appel borné au temps restant (10 s au plus), et les urgences passent d'abord, bornées pour laisser
  son créneau à l'e-mail de 5 h (`app/src/lib/relais-alerte-envoi.ts`). Non vérifié en production : aucun e-mail de 5 h
  n'est encore parti.
- **Liens de connexion** : le code à usage unique vaut 86 400 s (24 h) dans le réglage actuel ; sa réduction (H1) n'est pas
  décidée.
- **Dépendance à une seule personne** pour piloter le code ([[Audit d'acquisition du 3 octobre 2026]]).

## 4. Ce qu'on peut promettre à un prospect

Seulement ce qui est en production et prouvé par une recette ou un test cité ci-dessus, sans chiffre de performance :

- un espace de gestion locative en ligne pour le propriétaire bailleur et un espace pour son locataire (parcours joués sur
  téléphone par la recette de production ; écrans audités à 768 et 1440 px sur le banc) ;
- l'invitation du locataire dans son espace ;
- les dates de loyer, de quittance et d'impayé comptées au jour de Paris ;
- le suivi d'un incident jusqu'à la facture de l'artisan, avec refus motivé et révision d'un devis, report ou annulation
  du rendez-vous par le locataire, et règlement noté par le propriétaire (déclaratif) — **à condition** que le réseau
  d'artisans soit ouvert pour sa commune et le métier, et en précisant que ces parcours n'ont pas encore été joués de bout
  en bout en production ;
- l'invitation d'un artisan qu'il connaît, **à condition** que l'artisan s'inscrive, accepte et soit validé par Gerimmo,
  et seulement pour les biens situés dans sa zone d'intervention, en précisant que ce parcours n'a été joué que sur le
  banc (`app/e2e/invitation-artisan.spec.ts`), pas en production ;
- une sauvegarde quotidienne chiffrée des données.

L'offre commerciale (formules, essai, parrainage) est celle de [[Grille tarifaire]] et de [[Cycle de vie de l'abonnement]] ;
le mode de la clé de paiement de production (essai ou réel) reste à confirmer par le dirigeant avant le premier paiement.

## 5. Ce qu'on ne doit pas promettre

- **Encaissement en ligne des loyers ou rapprochement bancaire** : absents (le gérant saisit chaque paiement ;
  [[Audit d'acquisition du 3 octobre 2026]]).
- **Signature électronique** : non activée au lancement ([[Signature électronique]]).
- **Mise en location** (annonces, multidiffusion, candidatures) : absente ([[Audit d'acquisition du 3 octobre 2026]]).
- **Offre aux agences** : hors du site public de la V1.
- **Artisans partout** : le réseau ne s'ouvre que commune par commune et métier par métier ; son propre artisan, invité,
  n'est sollicitable qu'après son acceptation et la validation de Gerimmo, et seulement dans sa zone d'intervention.
- **Les relances automatiques de l'invitation (J+3, J+10)**, tant qu'aucune n'a été observée en production : livrées
  (PR #190), mais la recette n° 13 ne joue pas de relance ; seuls les tests du dépôt les exercent, sur une base de test
  (`app/tests/relances-invitations-locataires.test.ts`).
- **Outil « clients externes » de l'artisan** (devis, factures, avoirs pour ses propres clients) : désactivé en production
  jusqu'à la validation comptable de la forme de l'avoir (D24-C).
- **Un délai de restauration** : l'objectif du [[Plan de reprise d'activité]] n'a jamais été éprouvé sur une sauvegarde
  réelle.
- **Des conseils juridiques ou fiscaux** : le récapitulatif fiscal est une aide à la déclaration, les conseils de choix du
  locataire ne sont pas relus sur leurs sources.
- **Des mentions légales complètes** tant que l'identité de l'éditeur n'est pas fournie.

> [!warning] Points à trancher / contradictions
> - ~~**Ordre des priorités** : correctif de sécurité attaché au lot « invitation d'un artisan », non fusionné~~ →
>   **réglé par les faits** : le correctif est en production avec l'invitation (PR #194, `f24dfb0`, 16/10). **Reste à
>   faire par le dirigeant**, avant tout démarchage (proposition) : coller les trois modèles de courrier dans Supabase
>   et désactiver « Allow new users to sign up » — non faits au 16/10.
> - **Démarchage d'artisans** : ni autorisé ni interdit par le wiki ; la règle « jamais de démarchage direct » ne vise
>   explicitement que les particuliers.
> - **Conseils « choisir son locataire »** : en ligne alors que leur page source est un brouillon non relu sur les
>   sources primaires ; garder, masquer, ou retirer la qualification « règle légale » ?
> - **Paiement** : premier paiement possible à la fin de l'essai ; le mode de la clé de paiement de production n'est pas
>   confirmé dans le wiki.
> - **Quatre P1 contrôlés au second essai** : les fermer malgré l'échec du premier essai de D04 (cause non établie, non reproduite au banc) et
>   les limites (PDF 2044, chemin confirmé de D38) est à trancher.
> - **Restitution du dépôt au jour de Paris** (PR #195) : interprétation du point 1 de la décision du 15/10, à faire
>   ratifier par le dirigeant.

## Relations

[[Décisions groupées — version candidate du 13 octobre 2026]] · [[Dossier de validation — version candidate du 13 octobre 2026]] ·
[[Registre des anomalies — audit du 13 octobre 2026]] · [[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]] ·
[[Audit d'acquisition du 3 octobre 2026]] · [[Expansion territoriale autonome]] · [[Parrainage]] · [[Grille tarifaire]] ·
[[Recette de production]] · [[Propriétaire bailleur]] · [[Locataire]] · [[Artisan]] ·
[[Invitation d'un artisan par un propriétaire]]
