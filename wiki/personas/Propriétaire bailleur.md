---
type: persona
tags: [role, proprietaire]
status: in-progress
created: 2026-07-21
updated: 2026-07-24
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
