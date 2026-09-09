---
type: persona
tags: [role, agence]
status: in-progress
created: 2026-07-21
updated: 2026-09-09
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-module-18-administration]]", "[[2026-07-24-gerimmo-v3-module-19-mobile]]"]
---

# Agent immobilier

**En une phrase :** collaborateur/gestionnaire opérationnel au sein d'une agence
([[Organisation]] de type `agency`).

Nom technique : rôle `agent_immobilier` (scope `organization`), `member_type = agent`,
portail **AGENCE**.

## Rôle et objectifs
- Assurer la gestion locative quotidienne : biens, loyers, incidents, documents, échanges.

## Responsabilités / activités
- Créer/modifier [[Patrimoine et résidences|patrimoines/résidences]] et [[Bien|biens]].
- Gérer les [[Période de loyer|loyers]] et le [[Cycle de vie d'un incident|cycle des incidents]].
- Accéder aux profils des membres de l'organisation.

## Permissions clés
- Autorisé en INSERT/UPDATE sur `patrimoines`/`residences`/`biens` (avec admin et propriétaire).
- `can_access_profile` / `can_access_organization_member` l'incluent → voit les fiches membres.
- **Non** : pas de `can_manage_users` ni `can_manage_organization` (pas d'invitation ni d'admin d'org) ;
  pas de validation d'artisan.

## Périmètre V3 : ses mandats uniquement (module 18)
**Un agent ne voit que les dossiers de ses mandats** (RM-18.1.3) : lots, baux,
écritures, alertes assignées, agenda — **aucune visibilité sur les dossiers des
autres agents** (divergence majeure avec le code, où tout membre voit l'organisation).
Sa **désactivation est bloquée** tant que ses mandats ne sont pas réaffectés
(RM-18.1.4) ; en cas d'**absence temporaire**, transfert de mandats **sans changer le
titulaire**, restitution en un clic (RM-18.1.6/7).

## Usage mobile : l'état des lieux (module 19)

Sa déclinaison mobile est l'[[État des lieux]] (parcours 1.12/1.13, deux fois par
bail) — **criticité MAXIMALE**, « le parcours le plus exigeant du produit » : debout
dans un logement souvent mal couvert. Sauvegarde locale automatique et
synchronisation au retour du réseau, indicateur permanent des données non
synchronisées, alerte avant fermeture (RM-19.1.1 à 19.1.9 — détail dans
[[État des lieux]]). Aucune règle métier n'est modifiée par le mobile.

## Changement d'agence (Livrable A1, 2026-07-24)
Cas tranché par le [[Compte, personne et adhésion|modèle d'identité]] : au départ de
l'agence A, ses mandats sont réaffectés (RM-18.1.4), son adhésion A passe en **inactive**
(ses actions restent tracées) ; à l'arrivée en agence B, **nouvelle adhésion sur le même
compte**. **Il n'emporte aucune donnée.** La suppléance entre agents et le transfert de
portefeuille restent à spécifier (point P1.1, phase B —
[[État du projet et décisions ouvertes]]).

## Relations
- Subordonné à l'[[Administrateur d'agence]], qui **hérite de toutes ses capacités** (« agent ++ »)
  et y ajoute la gestion des utilisateurs et de l'organisation.
- Interlocuteur des [[Propriétaire bailleur|propriétaires]], [[Locataire|locataires]] et [[Artisan|artisans]].
- Voir [[Modèle de rôles et permissions]].

> [!warning] Points à trancher / contradictions
> - Rôle le moins documenté ; ses limites exactes sur les loyers restent à confirmer.
>

## Périmètre portefeuille appliqué en base (2026-09-09, durci le soir même)

Deux temps dans la journée :
1. **Matin** — le périmètre était un cadrage d'écran (RPC messages + `p_lots`
   GED), avec un repli « sans mandat confié, il voit tout » et une RLS
   org-entière.
2. **Soir** — l'audit fonctionnel externe (P0) a montré qu'un agent à zéro
   mandat voyait toute l'agence et pouvait préparer des opérations financières
   globales. **Décision : le périmètre est désormais une cloison, appliquée en
   base**, et le repli est supprimé.

Règle : **portefeuille = lots des lignes ouvertes des mandats dont l'agent est
titulaire** (`mandats.agent_account_id`, états brouillon/à signer/actif/préavis).
**Zéro mandat → listes vides** (l'admin doit confier les mandats). Trois étages :
- **policies RLS restrictives** (lecture) sur ~25 tables métier — lots, biens,
  baux, appels, encaissements, écritures, quittances, EDL, restitutions,
  personnes, messages, documents (liens), mandats, alertes… — qui ne mordent
  que si l'appelant n'est QU'agent dans l'organisation ;
- **trigger générique `garde_portefeuille_agent`** sur les mutations : toute
  écriture (même via RPC definer ou requête forgée) sur un objet hors
  portefeuille est refusée ; les mandats eux-mêmes restent à l'admin ;
- **RPC de lecture durcies** (`quittancement_mois`, `etat_loyers_bail`,
  `totaux_ecritures`, `quittance_detail`, `messages_personne`…) : plus jamais
  l'agence entière, même avec des paramètres forgés.

Le périmètre « personnes » couvre les locataires/garants des baux de ses lots,
les mandants de ses mandats et les propriétaires (détentions) de ses lots.
L'agent conserve les documents qu'il a lui-même déposés. Un agent peut créer
une fiche personne (création rapide de locataire) : elle entre dans son
périmètre dès son rattachement à un bail du portefeuille. Vérifié par
impersonation SQL : agent sans mandat = 0 partout ; agent avec un mandat =
exactement son lot ; admin, PD, [[Super Admin]] et locataires inchangés.
Migration : `20260909230000_perimetre_agent_serveur_et_base.sql`.
