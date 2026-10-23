---
type: persona
tags: [role, proprietaire]
status: in-progress
created: 2026-07-21
updated: 2026-10-23
sources: ["[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-module-0b-dossier-locataire]]", "[[2026-07-24-gerimmo-v3-module-0-biens-et-lots]]", "[[2026-07-24-gerimmo-v3-module-0c-copropriete]]", "[[2026-07-24-gerimmo-v3-module-5-mandat-de-gestion]]", "[[Invitation d'un artisan par un propriétaire]]"]
---

# Propriétaire bailleur

**En une phrase :** propriétaire-bailleur **indépendant** — il crée et gère sa propre
[[Organisation]] (`organization_type = 'independent_owner'`).

Nom technique : rôle `proprietaire` (scope `organization`), `member_type = owner`,
portail **PROPRIÉTAIRE**.

## Rattachement d'un bien : l'un OU l'autre
**Décision produit (état actuel) :** un [[Bien]] est géré par **exactement un** des deux :
un **propriétaire indépendant** OU une **agence** — jamais les deux. Il n'y a **pas encore** de
« propriétaire client d'une agence » : le cas où un propriétaire confie son parc à une agence tout
en gardant un portail propre **n'est pas actif pour l'instant**.

Le schéma (`member_type = 'owner'` rattachable à une org `agency`) *anticipe* ce futur cas, mais
il n'est pas exploité aujourd'hui — voir le point de divergence dans
[[État du projet et décisions ouvertes]].

**Décision du 2026-08-19 — exclusivité PD / PM par personne, assumée :** une même
personne ne peut pas être **à la fois** propriétaire gestion directe (pour une partie
de son parc) et propriétaire mandant (pour l'autre). Le **parc mixte partiellement
confié** est un angle mort **connu et accepté pour le moment** : le seul mécanisme
prévu reste la **bascule complète** d'un état à l'autre par l'adhésion (cas n°5 d'A1,
[[Compte, personne et adhésion]]).

## Scission officielle PM / PD (module 0, 2026-07-24)
Le module 0 officialise la scission en **deux personas distincts, aux droits opposés**,
« à appliquer sur les 150 parcours » :
- **PM — Propriétaire mandant** : signe un mandat avec une agence, **aucun accès à
  l'application** — c'est un **objet de données**. Le parcours 0.11 (« consultation de
  son patrimoine ») a été **supprimé** du référentiel. Il est informé par : rapport de
  gestion mensuel (6.2), récapitulatif fiscal (6.4), sollicitation ponctuelle pour les
  **devis au-dessus du seuil** (9.5 — mécanisme hors application à trancher au
  module 9), documents à la demande (12.4). Dans l'autre sens, le mandant a **un
  devoir de transmission** : c'est lui qui reçoit l'[[Appel de charges]] du syndic et
  doit le faire suivre à l'agence — relances automatiques toutes les 3 semaines puis
  escalade s'il tarde (module 0c). **Il signe sans accès** (module 5) : son
  [[Mandat de gestion]] part en signature Yousign **par email** (RM-5.6.2/RM-13.1.4),
  puis il reçoit sa copie ; le **seuil de délégation** du mandat borne ce que l'agent
  engage seul — au-delà, accord sollicité hors plateforme et tracé par l'agent.
- **PD — Propriétaire gestion directe** : accès complet, sans agence — il **reprend
  tels quels les parcours de l'agent** (0.1 à 0.10) ; ses parcours propres (~15 :
  bail, EDL, quittances, impayés, IRL, régularisations, livre recettes-dépenses)
  restent à créer dans les modules 1 à 4.
- La **détention** se rattache au **[[Lot]]**, avec quote-part datée jamais supprimée
  (l'historique garantit les rapports passés). Ventilation par indivisaire : hors
  périmètre (acté).

> [!note] Signature électronique non activée au lancement (30/09/2026, décision du 27/09) → [[Signature électronique]]

## Propriétaire direct ↔ mandant (Livrable A1, 2026-07-24)
Le référentiel V3 distingue le **propriétaire direct** (gère lui-même) du **mandant**
(a confié ses lots à une agence). Le [[Compte, personne et adhésion|modèle d'identité]]
décrit la transition — c'est l'**état de l'adhésion** qui change, pas la personne ni ses données :
- il confie ses lots → un mandat est créé (module 5) et son adhésion passe en **inactive** :
  **« le mandant reçoit, il ne consulte pas »** (aucun accès) ; ses données sont rattachées
  à l'agence mandataire ;
- retour en gestion directe → l'adhésion est **réactivée**.

~~Un portail propriétaire par lien sécurisé (point P1.2 de l'audit)~~ — **clos le
2026-07-25 : NON**. Le mandant n'a **pas de compte sur Gerimmo, réception pure** ;
« le mandant reçoit, il ne consulte pas » est confirmé sans exception. C'était le
dernier point de l'audit encore ouvert — **l'audit est intégralement soldé**.
Application concrète (module 0b) : **le mandant n'a aucun accès aux pièces du
[[Dossier locataire]]** (RM-0b.7.4, bloquant) — le dossier reste accessible à l'agence
même si le lot change de propriétaire.

## Arrivée dans l'application (décision 2026-08-19)
**Voie normale :** il **s'inscrit seul en ligne** — page d'inscription publique →
création de son compte et de son organisation `independent_owner` → essai (14 jours ; **2 mois** depuis le 30/09/2026) →
abonnement par bien via Stripe. Pas de commerciaux, indépendant de bout en bout.
**Voie de secours :** le [[Super Admin]] peut aussi **créer manuellement tout
profil**, PD compris (support, cas particuliers). Détail : [[Onboarding et abonnement]]. **Priorisé le 2026-08-19** :
le S9 est scindé, le PD ouvre le bal — sprint **9a dédié** (auto-inscription +
espace complet + livre recettes-dépenses + récap fiscal), le paiement Stripe au S11.

## Rôle et objectifs
- Gérer/suivre ses [[Bien|biens]], ses [[Locataire|locataires]], ses [[Période de loyer|loyers]] et incidents.
- Suivre son [[Abonnement]] (offres d'audience `owner`).
- **(note produit v0)** Vue sur ses biens et l'état des incidents en cours ; accès aux documents (**baux, quittances, PV**) ; **reporting financier et locatif** ([[2026-07-21-fonctionnalites-par-persona-v0]]).
- **(décision 2026-07-22, cible)** Signe le [[Bail]] avec son locataire ; effectue la
  [[Régularisation des charges]] ; tient sa [[Comptabilité]] ; bénéficie — seul persona —
  de l'aide [[Fiscalité]] (déclaration des revenus locatifs).

## Permissions clés
- Création/modification de patrimoines, résidences, biens (accordé le 2026-07-18).
- Lecture des données d'abonnement/facturation/onboarding de son organisation.
- `can_manage_organization()` = vrai **uniquement pour sa propre organisation** (renommer,
  inviter, suspendre/archiver ses locataires).
- **Garde-fou** : ce droit **ne s'étend pas** à l'organisation d'une agence dont il serait
  membre — sinon faille de sécurité.
- Portail : `manage:properties/users/settings/subscription`, `supervise:property/tenant`
  — mais **pas** `supervise:contractor` ni `supervise:owner` (réservés à l'agence).

## Point de douleur (historique, corrigé)
- Auparavant un propriétaire « ne pouvait rien créer » ni « administrer, pas même sa propre
  organisation » → corrigé par les migrations des 2026-07-18 et 2026-07-20.

## Relations
- Autonome sur sa propre organisation ; supervise ses [[Locataire|locataires]] et [[Bien|biens]].
- Approuve l'[[Artisan]] **par intervention** (sélection du devis sur ses propres incidents), mais
  ne **supervise** pas les artisans en tant que tels (`supervise:contractor` réservé à l'agence).
- Voir [[Modèle de rôles et permissions]], [[Isolation multi-organisation]].

## Livraison du Sprint 9a (2026-08-30 — en recette)

- **Auto-inscription** : page publique `/inscription` (prénom, nom, email, mot de
  passe 12 caractères, conditions) → compte Supabase Auth (confirmation d'email)
  → à la première session, `initialiser_espace_proprietaire()` (idempotente)
  crée l'organisation `type = proprietaire_direct` (« Parc de Prénom Nom »),
  **statut essai, `essai_fin` = J+14**, l'adhésion `proprietaire_direct` et sa
  **fiche personne** (qui porte la détention de ses lots). Le paiement Stripe
  reste au S11 ; rien ne se ferme à la fin de l'essai pour l'instant.
- **Espace propriétaire** = les écrans de l'agence, relus : « Espace
  propriétaire », bandeau d'essai, onglets **Mes lots · Locataires · Livre**,
  pas de carte Mandats sur les fiches, pas de rapports de gestion, aucun
  honoraire (les honoraires ne naissent qu'avec une ligne de mandat).
- **Livre recettes-dépenses** : même journal immuable, clôture par le
  propriétaire lui-même (recommandée, jamais imposée par un rapport).
- **Récapitulatif fiscal** (`/comptabilite/fiscal`, PD seulement) : rubriques
  de la 2044 alimentées par mots-clés des catégories du livre, agrégées sur la
  date de pièce, contre-écritures soustraites de leur rubrique, **fonds travaux
  ALUR à part**, **intérêts d'emprunt à compléter**, « autres dépenses non
  rangées » pour ne rien perdre — phase 1 (location nue) de [[Fiscalité]].
- **Garde-fous livrés** : exclusivité PD/PM par adresse email (inscription
  refusée à un mandant en cours ; mandat refusé à un PD — `a_signer`/`actif`/
  `preavis`) ; `can_manage_organization(org)` = SA, admin d'agence ou PD de
  **sa** propre organisation ; statut/type/essai réservés au SA (trigger).
- Droits ajustés : le PD crée et modifie ses personnes, clôture et rouvre ses
  mois. Recette : [[Recette - test par sprint et persona]] § 2.00 (30.1 à 30.3).

## Ce que fait le code aujourd'hui (relevé du 16/10/2026)
- **Son adresse : `/espace`** (décision D27, option B, fiche DES-A-08, PR #191, fusion
  `d55f87b`, en production depuis le 16/10, jour de Paris : fusion à 00 h 38, entrée du
  journal datée du 15/10) : les écrans du propriétaire direct vivent sous
  `/espace/<id>/…`, sans le mot « agence ». C'est un alias réécrit par le proxy après toutes
  ses gardes ; les pages restent celles du dossier `app/agence/[orgId]`. Un ancien lien
  `/agence/<id>/…` d'un propriétaire direct est **redirigé à vie (308)**, chemin et requête
  conservés (un envoi de formulaire n'est pas redirigé) ; `/espace/<id>` d'une autre
  organisation répond « introuvable » ; les agences restent sous `/agence`. Tout lien que
  l'application émet pour un propriétaire direct pointe vers `/espace`
  (`app/src/lib/racine-espace.ts`).
- **Qualification d'un incident** (PR #193, fusion `bdaf755`, 16/10) : le repère juridique
  lui dit « C'est vous qui décidez qui paie » (et non plus « C'est vous qui tranchez à la
  qualification », mot d'agence).
- **Sur ses incidents**, comme gestionnaire : il peut refuser un devis avec un motif ou en
  demander une révision (D18, [[Devis]]), et déclarer le règlement d'une facture validée,
  sans paiement par Gerimmo (D23-A, [[Intervention et clôture]]) ; il reçoit l'alerte quand
  un locataire annule un rendez-vous (D22-B, [[Planification d'intervention]]).
- **Inviter un artisan dans son carnet** (décision du 15/10/2026, un propriétaire
  **invite** un artisan, l'artisan s'inscrit lui-même ; remplace la question D17-B ; journal
  `log.md`, entrée « decision » du 15/10, point 1) : **en production depuis le 16/10**
  (PR #194, fusion `f24dfb0`, migrations `20261014840000` à `20261014849000`). Depuis « Mes
  artisans » (`/espace/<id>/artisans`), il invite par l'adresse e-mail de l'artisan (nom et
  métier pour mémoire, jamais montrés à l'artisan) ; il suit l'état de chaque invitation,
  la renvoie, l'annule ou la refait. Il ne voit la fiche de l'artisan qu'après son
  acceptation, jamais les motifs des décisions de Gerimmo. Une fois l'inscription validée
  par Gerimmo, il le sollicite depuis la fiche d'un incident, **même si l'artisan n'est pas
  proposé par le réseau** (profil resté privé), pour les biens que couvre la zone de
  l'artisan ; la fiche de l'incident dit pourquoi un
  artisan du carnet n'est pas proposé. L'ajout par SIRET reste réservé aux agences (PR #170,
  migration `20261007190000`), et il ne peut pas modifier la zone ni les métiers d'un artisan
  (`20261014841000`). Détail, réglages et limites : [[Invitation d'un artisan par un propriétaire]].
- **Réseau d'artisans — décision du 23/10/2026** (migration `20261023180000`, appliquée
  en production le 23/10) : pour un bien dont la commune est confirmée, il voit les
  artisans **validés et publics** dont la zone d'intervention (choisie par l'artisan)
  couvre le code postal du bien, pour le métier demandé ; plus de « commune fermée ». Sans
  artisan : message « aucun artisan disponible », voie de sortie et « Signaler mon
  intérêt ». Il voit le nom, les métiers et la note d'un artisan proposé ; son téléphone et
  son e-mail lui sont transmis avec sa demande (ou d'emblée s'il l'a dans son carnet).
  Voir [[Ouverture du réseau d'artisans]].

> [!warning] Points à trancher / contradictions (D27-B)
> - Les liens fabriqués par la base pour la console de supervision pointent encore vers
>   `/agence` (ils aboutissent par la redirection 308) : question du lot.
> - Côté navigateur, l'absence de `/espace` pour une agence n'est contrôlée que sur un
>   écran (constat du tour final de vérification).

> [!warning] Points à trancher / contradictions (invitation d'un artisan, 16/10/2026)
> - Parcours de l'invitation **jamais joué de bout en bout en production** (banc local
>   seulement) ; recette n° 17 sur `f24dfb0` verte (38875612888).
> - Deux réglages de Supabase hors dépôt, à faire par le dirigeant, **non faits au 16/10** :
>   coller les trois modèles de courrier et désactiver « Allow new users to sign up »
>   (`app/supabase/templates/LISEZ-MOI.md`).
> - Réglages par défaut choisis par le lot (validité de 30 jours, plafonds d'envoi, aucune
>   relance) sans décision écrite du dirigeant : voir
>   [[Invitation d'un artisan par un propriétaire]].

> [!warning] Changement du 23/10/2026 — réseau d'artisans
> - Plus de « commune fermée » : le propriétaire voit les artisans validés et publics dont
>   la zone, choisie par l'artisan, couvre son bien (migration `20261023180000`,
>   appliquée en production le 23/10). Choix de prudence à confirmer par le dirigeant : le
>   téléphone d'un artisan du réseau n'est plus montré avant la demande
>   ([[Ouverture du réseau d'artisans]]).
