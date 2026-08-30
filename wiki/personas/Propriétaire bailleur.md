---
type: persona
tags: [role, proprietaire]
status: in-progress
created: 2026-07-21
updated: 2026-08-30
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-module-0b-dossier-locataire]]", "[[2026-07-24-gerimmo-v3-module-0-biens-et-lots]]", "[[2026-07-24-gerimmo-v3-module-0c-copropriete]]", "[[2026-07-24-gerimmo-v3-module-5-mandat-de-gestion]]"]
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
création de son compte et de son organisation `independent_owner` → essai 14 jours →
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
