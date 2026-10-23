---
type: synthesis
tags: [matrice, droits, roles, rpc, actions-serveur, securite]
status: draft
created: 2026-10-14
updated: 2026-10-23
sources: []
---

# Matrice fonctions × rôles × droits (RPC SQL et actions serveur)

> [!info] Provenance et rejeu
> - Version du code : `9396669` (branche `claude/compassionate-euler-qpqjp6`), relevé le 2026-10-14 04:41:12 +0000.
> - Arbre de travail : propre sur app/src, app/supabase, app/e2e, app/tests au moment du relevé.
> - Scripts : `scripts/03_base.py`, `scripts/02_actions.py`, `scripts/05_matrice.py`, `scripts/09_page_matrice.py`, `scripts/00_controles_croises.sh` (rejeu complet : `bash scripts/rejouer.sh`).
> - Contrôle croisé (commande indépendante des scripts) : `select count(*) … has_function_privilege('authenticated', …)` = 354 ; `… ilike '%super_admin%'` = 99 (fichier `donnees/controles-croises.tsv`).


## 1. Légende, sources et méthode

**Trois sources croisées** :

- **(a) le code** : corps SQL des fonctions du catalogue reconstruit (jetons de garde : `is_permanent_super_admin()`, `is_super_admin()`, `org_ids_avec_roles(array['…'])`, `mon_artisan_id()`, `auth.uid()`, propagation par les fonctions appelées sur 3 niveaux) et, pour les actions serveur, les gardes `verifierGerant`, `verifierLocataire`, `verifierArtisanAction`, `garderSuperAdmin`… (`scripts/05_matrice.py`) ;
- **(b) la matrice de droits du super-administrateur** (`preuves/superadmin/matrice-droits.md` ; données : `sql2/matrice_rpc_negative_candidate.json` = rejeu sur la version candidate, `sql/matrice_rpc_negative.json` = rejeu sur e9f31ac) : les **99** fonctions qui citent `super_admin`, appelées par 7 profils (propriétaire, locataire, artisan, agent, admin d'agence, multi, super-admin en aal1) et par `anon`, dans une transaction annulée ;
- **(c) la matrice d'accès de l'auditeur** (`preuves/auditeur/a/matrice-acces.md` ; données : `travail/fuzz*.txt`, `matrice-lecture-api.json`, `ecritures-*.json`) : les **354** RPC exécutables par `authenticated`, appelées avec des arguments typés visant l'organisation Alpha par 11 comptes distincts (16 fichiers : 10 de première passe, 6 de seconde passe), comparaison d'empreinte des tables avant/après.

**Cellule de rôle** = `code` puis, entre parenthèses, le **constat du banc** : `A` autorisé, `P` autorisé sous réserve (périmètre propre du compte, ou rôle de l'organisation non précisé dans le corps), `R` refusé, `?` indéterminé (aucune garde lue dans le corps : fonction SECURITY INVOKER dont les politiques RLS tranchent, ou fonction pure), `–` sans objet (déclencheur). Constat : `ERR` = tous les appels de ce rôle ont été refusés ; `OK` = tous ont abouti **sans erreur** (ce qui n'établit pas une autorisation : une fonction à filtre `WHERE` renvoie un résultat vide) ; `mix` = comptes de ce rôle différents (organisation propre / étrangère) ; vide = rôle non appelé.
**Statut de ligne** : « constaté sur le banc » si au moins une des matrices (b) ou (c) contient un appel de cette fonction ; « lu dans le code seulement » sinon. Le profil **super-administrateur aal2** (`SA2`) n'a pas été rejoué dans la matrice (b) (profil `aal1` seulement) : sa colonne est « code » sauf mention « exercé » (la fonction est nommée dans les scripts ou sorties du rôle super-admin).

## 2. Synthèse

| Classe de garde lue | Fonctions | Constatées sur le banc | Lues dans le code seulement |
|---|---|---|---|
| membre d'organisation | 170 | 170 | 0 |
| interne (service_role seulement) | 99 | 11 | 88 |
| déclencheur | 94 | 4 | 90 |
| SECURITY INVOKER (garde par RLS) | 36 | 36 | 0 |
| super_admin permanent aal2 | 32 | 32 | 0 |
| compte connecté (périmètre propre) | 31 | 31 | 0 |
| artisan | 28 | 28 | 0 |
| super_admin | 26 | 26 | 0 |
| super_admin + membre d'organisation | 22 | 22 | 0 |
| interne (aucun EXECUTE) | 7 | 1 | 6 |
| super_admin permanent aal2 + membre d'organisation | 4 | 4 | 0 |
| aucune garde détectée | 3 | 3 | 0 |
| super_admin + artisan + membre d'organisation | 2 | 2 | 0 |
| TOTAL | 554 | 370 | 184 |

- Fonctions distinctes dans `public` : **554** (surcharges comprises : 554 signatures).
- Exécutables par `authenticated` (hors déclencheurs) : **354** ; par `anon` : **0** ; par `service_role` seulement : 99 ; sans aucun EXECUTE : 7 ; fonctions de déclencheur : 94.
- Couverture des matrices du banc : la matrice (c) a appelé **354** fonctions (toutes les 354 exécutables par `authenticated`, 0 manquante) ; la matrice (b) en a appelé **99** (0 absente du catalogue courant). Total constaté : **370** lignes sur 554 ; **184** lues dans le code seulement (déclencheurs, fonctions internes `service_role`).
- Super-administrateur : sur 86 fonctions de classe « super_admin », **6** seulement sont nommées dans les scripts ou sorties du rôle super-admin (les autres gestes passent par l'interface sans nommer la RPC) ; l'autorisation positive en aal2 est donc **lue dans le code** pour la majorité (voir CAR-08).

## 3. Divergences entre le code et les matrices du banc

Calculées par `05_matrice.py` (champ `divergences` de `donnees/matrice.json`). Un écart « brut » est expliqué ou retenu comme fiche CAR après lecture du corps SQL de chaque fonction citée.

| Contrôle | Écarts bruts | Verdict après lecture |
|---|---|---|
| Couverture : RPC authenticated absentes du fuzz de l'auditeur | 0 | 0 : les 354 RPC exécutables par `authenticated` sont dans la matrice (c). |
| Garde « super_admin seul » lue, mais appel sans erreur d'un autre profil | 5 | Expliqué : `artisan_supervise`, `has_supervision_power`, `ma_session_artisan`, `ma_session_artisan_diagnostic`, `supervision_abonnement` filtrent par `WHERE … is_(permanent_)super_admin()` : elles renvoient NULL / faux / zéro ligne au lieu de lever une erreur (lu dans le corps). Refus silencieux, pas d'accès. |
| Rôle exclu par la garde lue, appel sans erreur sur fonction qui écrit | 5 | Expliqué : `purger_fichier_sans_fiche` renvoie `false` pour un appelant hors des rôles gérants (corps lu : `return false`) ; aucune ligne écrite. |
| Compte d'une organisation étrangère : appel sans erreur sur fonction écrivante | 34 | Expliqué : 4 fonctions distinctes — `accepter_cgu` et `fermer_session_artisan` (périmètre propre du compte), `purger_fichier_sans_fiche` (renvoie `false`), `initialiser_espace_proprietaire` (idempotent, ouvre l'espace du **propre** compte). L'empreinte des tables de l'auditeur n'a bougé que sur `acceptations_cgu` (propre CGU). |
| Fonction écrivante exécutable par authenticated sans garde lue (SECURITY DEFINER) | 0 | Expliqué après propagation : `mes_messages_locataire` et `mon_conge_locataire` s'appuient sur `ma_personne_espace()` / `ma_personne_locataire()` (garde par helper) ; 3 fonctions restent « sans garde » : fonctions pures de tarif (`formule_couvrante`, `montant_abonnement_cents`, `montant_offre_cents`). |
| SECURITY DEFINER sans `search_path` fixé | 0 | 0 |
| Fonctions exécutables par `anon` (hors déclencheurs) | 0 | 0 : toutes révoquées à `anon` (cohérent avec le refus `permission denied for function` de la matrice (b)). |
| Action serveur dont aucun rôle admis n'est accepté par la RPC appelée | 0 | 0 (prédicats de garde `is_*`/`has_*` exclus). |
| RPC appelées par `app/src` et absentes du catalogue | 0 | 0. |
| RPC exécutables par `authenticated` jamais appelées par `app/src` | 99 | Information, pas anomalie : appelées par d'autres fonctions SQL, des tâches ou des tests, ou réservées à une évolution (liste en annexe, `donnees/matrice.json`). |

**Conclusion honnête** : aucune divergence de fond entre la garde lue dans le code et les deux matrices ; les écarts bruts sont des refus « silencieux » (filtre, `false`) ou des appels propres au compte. Restent des **limites de preuve** (fiches CAR-02, CAR-05, CAR-08, CAR-10) : lignes de référence périmées dans la matrice (b), profil aal2 non rejoué en RPC, privilèges de table plus larges que les politiques. L'inférence « lu dans le code » reste une lecture de motifs : une garde par helper non reconnu apparaît « ? ».

## 4. RPC exécutables par `authenticated` (une ligne par fonction)

Colonnes : `D/I` = SECURITY DEFINER / INVOKER ; `anon` et `svc` = EXECUTE (A/R) ; `Loc` locataire, `Art` artisan, `Agt` agent, `Adm` admin d'agence, `PD` propriétaire direct, `SA2` super-administrateur aal2 (cellule `code(constat)`) ; `Preuve` : `b` = matrice super-admin, `c` = fuzz de l'auditeur, `S2` = nommée dans les scripts du rôle super-admin ; `aal1` = résultat du super-admin sans second facteur (matrice b).

### 4.1 membre d'organisation (170)

| Fonction | D/I | anon | svc | Loc | Art | Agt | Adm | PD | SA2 | Preuve |
|---|---|---|---|---|---|---|---|---|---|---|
| `abandonner_reprise` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(mix) | A(ERR) | R | c |
| `abonnement_changements_a_recalculer` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(mix) | A(ERR) | R | c |
| `abonnement_client_pose` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(mix) | A(ERR) | R | c |
| `ajouter_retenue` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `ajouter_retenue_avec_justificatif` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `annuler_conge` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `annuler_demande_signature` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `annuler_invitation_locataire` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `annuler_mission` | D | R | A | R(ERR) | R(ERR) | A(mix) | A(mix) | A(ERR) | R | c |
| `artisan_blacklist_locale` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(mix) | A(ERR) | R | c |
| `artisan_creer_ou_rattacher` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `artisan_lever_blacklist_locale` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(mix) | A(ERR) | R | c |
| `artisan_statut_local` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(mix) | A(ERR) | R | c |
| `artisans_affectables` | D | R | A | R(ERR) | R(ERR) | A(OK) | A(mix) | A(ERR) | R | c |
| `attestation_emetteur_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `attribuer_incident` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | b,c |
| `bail_hors_portefeuille` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | c |
| `bien_hors_portefeuille` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | c |
| `charges_recuperables_exercice` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `chemins_pieces_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `choisir_personne_bail` | I | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `cloturer_incident` | D | R | A | R(ERR) | R(ERR) | A(mix) | A(mix) | A(ERR) | R | c |
| `cloturer_mois` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(ERR) | A(ERR) | R | c |
| `comptabilite_du_lot` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `consultation_hors_portefeuille` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | c |
| `contester_imputation` | D | R | A | A(mix) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `contrats_du_lot` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `contre_ecriture` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `controler_mise_en_location` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `decider_avenant_devis` | D | R | A | R(ERR) | R(ERR) | P(ERR) | P(ERR) | P(ERR) | R | c |
| `declarer_mon_incident` | D | R | A | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `declarer_mon_incident_reprise` | D | R | A | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `definir_equipements_lot` | D | R | A | R(ERR) | R(ERR) | A(OK) | A(mix) | A(ERR) | R | c |
| `definir_signature_organisation` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(ERR) | A(ERR) | R | c |
| `demander_periodicite_suivante` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A(ERR) | R | c |
| `demandes_signature_document` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `demarrer_restitution` | D | R | A | R(ERR) | R(ERR) | A(mix) | A(mix) | A(ERR) | R | c |
| `detail_tranches_abonnement` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `detenteur_principal_du_lot` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `devalider_bail` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `devis_hors_portefeuille` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | c |
| `documents_du_lot` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `edl_hors_portefeuille` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | c |
| `emettre_facture_honoraires` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(mix) | R(ERR) | R | c |
| `emettre_quittances` | D | R | A | R(ERR) | R(ERR) | A(OK) | A(mix) | A(ERR) | R | c |
| `encaisser_depot` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `encaisser_reste_atomique` | D | R | A | R(ERR) | R(ERR) | A(mix) | A(mix) | A(ERR) | R | c |
| `enregistrer_annexes_edl` | D | R | A | R(ERR) | R(ERR) | A(OK) | A(mix) | A(ERR) | R | c |
| `enregistrer_conge` | D | R | A | R(ERR) | R(ERR) | A(mix) | A(mix) | A(ERR) | R | c |
| `enregistrer_depart_colocataire` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `enregistrer_exercice_fiscal_lot` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A(ERR) | R | c |
| `enregistrer_grille_edl` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `enregistrer_grille_edl_avec_preuve` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `enregistrer_proprietaires_bail` | I | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `enregistrer_versement` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `envoyer_pour_signature` | D | R | A | A(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `envoyer_rapport` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `etat_abonnement` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `etat_loyers_bail` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `evaluer_artisan_gerant` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `fiche_lot` | D | R | A | A(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `fichier_signature_autorise` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `fils_messages_gerant` | D | R | A | A(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `finaliser_decompte` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `fixer_creneau_arbitrage` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `fixer_creneau_arbitrage_motive` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `generer_appels_loyer` | D | R | A | R(ERR) | R(ERR) | A(OK) | A(mix) | A(ERR) | R | c |
| `generer_grille_edl` | D | R | A | R(ERR) | R(ERR) | A(mix) | A(mix) | A(ERR) | R | c |
| `generer_rapport` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `has_org_role` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | c |
| `historique_du_lot` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `impact_activation_mandat` | D | R | A | R(OK) | R(OK) | R(OK) | A(OK) | R(OK) | R | c |
| `importer_parc` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(mix) | A(ERR) | R | c |
| `incident_hors_portefeuille` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | c |
| `initialiser_espace_proprietaire` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A(OK) | R | c |
| `intervention_hors_portefeuille` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | c |
| `interventions_a_evaluer` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `is_active_member` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | c |
| `is_permanent_super_admin` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | b,c |
| `is_super_admin` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | b,c |
| `joindre_photo_incident` | D | R | A | A(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `justifier_retenue` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `justifier_retenue_avec_piece` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `log_tech` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `lot_hors_portefeuille` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | c |
| `ma_personne_espace` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `ma_personne_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `ma_restitution_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `ma_souscription_stripe` | D | R | A | R(OK) | R(OK) | R(OK) | A(OK) | A(OK) | R | c |
| `mandat_hors_portefeuille` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | c |
| `marquer_decompte_envoye` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `mes_creneaux_locataire` | D | R | A | A(OK) | A(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mes_demandes_signature` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mes_edl_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mes_incidents_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mes_infos_pratiques_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mes_messages_locataire` | D | R | A | A(mix) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `mes_pieces_demandees` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mes_pieces_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mes_relances_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mes_retenues_restitution` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `messages_non_lus_gerant` | D | R | A | A(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `messages_non_lus_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `messages_personne` | D | R | A | A(ERR) | R(ERR) | A(ERR) | A(mix) | A(ERR) | R | c |
| `mon_abonnement` | D | R | A | R(OK) | R(OK) | R(OK) | A(OK) | A(OK) | R | c |
| `mon_bail_document_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mon_bail_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mon_client_stripe` | D | R | A | R(OK) | R(OK) | R(OK) | A(OK) | A(OK) | R | c |
| `mon_conge_locataire` | D | R | A | A(mix) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `mon_dernier_bail_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mon_document_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mon_echeancier_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mon_espace_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mon_gestionnaire_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mon_intention_conge` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mon_lot_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mon_suivi_intervention` | D | R | A | A(OK) | A(OK) | R(OK) | R(OK) | R(OK) | R | b,c |
| `montants_restitution_a_jour` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `noter_envoi_invitation_locataire` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `ouvrir_incident_agence` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `ouvrir_reprise` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(mix) | A(ERR) | R | c |
| `parcours_demarrage` | D | R | A | A(ERR) | R(ERR) | A(OK) | A(mix) | A(ERR) | R | c |
| `partager_document_locataire` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `person_hors_portefeuille` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | c |
| `peut_utiliser_signature_organisation` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `photo_incident_supprimable` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `pieces_bail_locataire` | D | R | A | A(OK) | R(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `preparer_invitation_locataire` | D | R | A | A(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `provisions_charges_annee` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `purger_fichier_sans_fiche` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `qualifier_ecriture_fiscale` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A(ERR) | R | c |
| `qualifier_incident` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `quittance_detail` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `quittance_document` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `quittancement_mois` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `rafraichir_montants_restitution` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `rapport_du_lot` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `rattacher_signature_youtrust` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `regulariser_charges` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `relances_du_lot` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `remplacer_document_ged` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `repondre_invitation_locataire` | D | R | A | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `repondre_message_personne` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(mix) | A(ERR) | R | c |
| `reprendre_soldes` | D | R | A | A(ERR) | R(ERR) | R(ERR) | A(ERR) | A(ERR) | R | c |
| `restitution_hors_portefeuille` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | c |
| `retablir_bien` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(mix) | A(ERR) | R | c |
| `retenir_devis` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `retirer_bien` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(ERR) | A(ERR) | R | c |
| `retrouver_ventilation_fiscale` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A(ERR) | R | c |
| `reviser_imputation_apres_diagnostic` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `reviser_loyer` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `rouvrir_detention` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `rouvrir_incident` | D | R | A | A(ERR) | R(ERR) | A(mix) | A(mix) | A(ERR) | R | c |
| `rouvrir_mois` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(mix) | A(ERR) | R | c |
| `signer_edl` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `signer_edl_avec_preuve` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `solliciter_artisan` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `soumettre_retour` | D | R | A | R(ERR) | R(ERR) | P(ERR) | P(ERR) | P(ERR) | R | c |
| `statut_acces_locataire` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(mix) | A(ERR) | R | c |
| `supprimer_bail_brouillon` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `supprimer_detention` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `supprimer_retenue` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `terme_bail` | D | R | A | R(ERR) | R(ERR) | A(OK) | A(mix) | A(ERR) | R | c |
| `terminer_bail` | D | R | A | A(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `totaux_ecritures` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | R | c |
| `user_org_ids` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | R | c |
| `valider_attestation` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `valider_facture_artisan` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `valider_ventilation` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |
| `ventiler_depense_bien` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | R | c |

### 4.2 SECURITY INVOKER (garde par RLS) (36)

| Fonction | D/I | anon | svc | Loc | Art | Agt | Adm | PD | SA2 | Preuve |
|---|---|---|---|---|---|---|---|---|---|---|
| `alerte_origine` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `annee_de_bail` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `bail_mentions_manquantes` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `bail_mentions_manquantes_valeurs` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `calculer_devis_lignes` | I | R | A | ?(ERR) | ?(ERR) | ?(ERR) | ?(ERR) | ?(ERR) | ? | c |
| `comparatif_edl` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `creer_bien_avec_lot` | I | R | A | ?(ERR) | ?(ERR) | ?(ERR) | ?(ERR) | ?(ERR) | ? | c |
| `decennale_requise` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `decouper_bien` | I | R | A | ?(ERR) | ?(ERR) | ?(ERR) | ?(ERR) | ?(ERR) | ? | c |
| `delai_defaut_paiement_jours` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `documents_a_renouveler` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `documents_courants` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `documents_stats_par_type` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `dossier_personne` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `duree_bail_nu_annees` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `ecran_support_sans_donnees` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `ecriture_annulable_depuis_le_journal` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `essai_ordinaire_fin` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `instant_paris` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `lot_blocages_location` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `lots_blocages_location` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `mesures_automatisation` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `parrainage_jours_filleul` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `parrainage_jours_parrain` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `plafond_depot_mois` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `publication_incomplete` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `qualite_bailleur_normalisee` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `qualites_bailleur` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `restitution_date_limite` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `seuil_devis_agence` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `socle_agence_lots` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `supprimer_encaissement` | I | R | A | ?(ERR) | ?(ERR) | ?(ERR) | ?(ERR) | ?(ERR) | ? | c |
| `supprimer_encaissement_depot` | I | R | A | ?(ERR) | ?(ERR) | ?(ERR) | ?(ERR) | ?(ERR) | ? | c |
| `tarif_supplement_bien_cents` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `trimestre_irl_annee` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `trimestre_irl_numero` | I | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |

### 4.3 super_admin permanent aal2 (32)

| Fonction | D/I | anon | svc | Loc | Art | Agt | Adm | PD | SA2 | Preuve |
|---|---|---|---|---|---|---|---|---|---|---|
| `accuser_alerte_vacances` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `actualiser_orchestration` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `artisan_supervise` | D | R | A | R(OK) | R(OK) | R(OK) | R(OK) | R(OK) | A | b,c |
| `collecter_source_direction` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `commander_arret_supervision` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A(exercé) | b,c,S2 |
| `controler_organisation` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `creer_relais_supervision` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `decider_consigne` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A(exercé) | b,c,S2 |
| `decider_developpement` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `decider_point_du_matin` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `decider_publication_marketing` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `decider_veille` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `demande_devis_traitee` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `enregistrer_consigne` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A(exercé) | b,c,S2 |
| `enregistrer_etude_territoriale` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `enregistrer_point_du_matin` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `enregistrer_vacances` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `executer_tache_consigne` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A(exercé) | b,c,S2 |
| `has_supervision_power` | D | R | A | R(OK) | R(OK) | R(OK) | R(OK) | R(OK) | A | b,c |
| `lire_faits_direction` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `ma_session_artisan` | D | R | A | R(OK) | R(OK) | R(OK) | R(OK) | R(OK) | A | b,c |
| `ma_session_artisan_diagnostic` | D | R | A | R(OK) | R(OK) | R(OK) | R(OK) | R(OK) | A | b,c |
| `marquer_point_lu` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `ouvrir_session_artisan` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `preparer_faits_direction` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `regler_mission` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `reserver_diffusion_facebook` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `revoquer_relais_supervision` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `signaler_urgence_vacances` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `suspendre_consigne` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A(exercé) | b,c,S2 |
| `traiter_vacances` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `verifier_arret_supervision` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A(exercé) | b,c,S2 |

### 4.4 compte connecté (périmètre propre) (31)

| Fonction | D/I | anon | svc | Loc | Art | Agt | Adm | PD | SA2 | Preuve |
|---|---|---|---|---|---|---|---|---|---|---|
| `accepter_cgu` | D | R | A | A(OK) | A(OK) | A(OK) | A(OK) | A(OK) | A | c |
| `artisan_classer_piece` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `artisan_externe_ecrire` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `artisan_identite_reelle` | D | R | A | A(OK) | A(OK) | A(OK) | A(OK) | A(OK) | A | c |
| `artisan_module_actif` | D | R | A | A(OK) | A(OK) | A(OK) | A(OK) | A(OK) | A | c |
| `artisan_reglement_ecrire` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `choisir_creneau` | D | R | A | A(mix) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `contre_proposer_creneaux` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `deposer_ma_piece` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `deposer_mon_attestation` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `envoyer_message_locataire` | D | R | A | A(mix) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `exiger_artisan_reel` | D | R | A | A(ERR) | A(OK) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `fermer_session_artisan` | D | R | A | A(OK) | A(OK) | A(OK) | A(OK) | A(OK) | A | c |
| `finaliser_photo_incident` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `lots_de_mon_portefeuille` | D | R | A | A(OK) | A(OK) | A(OK) | A(OK) | A(OK) | A | c |
| `mes_annonces_locataire` | D | R | A | A(OK) | A(OK) | A(OK) | A(OK) | A(OK) | A | c |
| `mes_invitations_locataire` | D | R | A | A(OK) | A(OK) | A(OK) | A(OK) | A(OK) | A | c |
| `mon_activite_artisan_privee` | D | R | A | A(ERR) | A(OK) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `mon_artisan_id` | D | R | A | A(OK) | A(OK) | A(OK) | A(OK) | A(OK) | A | c |
| `mon_depot_locataire` | D | R | A | A(OK) | A(OK) | A(OK) | A(OK) | A(OK) | A | c |
| `mon_dossier_locataire` | D | R | A | A(OK) | A(OK) | A(OK) | A(OK) | A(OK) | A | c |
| `noter_artisan_locataire` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `ouvrir_consultation` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `preparer_photo_incident` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `reseau_confirmer_commune` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `reseau_disponibilite` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(mix) | A(ERR) | A | c |
| `reseau_signaler_interet` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `retourner_document_signe` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `session_artisan_diagnostic_active` | D | R | A | A(OK) | A(OK) | A(OK) | A(OK) | A(OK) | A | c |
| `soutenir_idee` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `valider_cle_repartition` | I | R | A | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |

### 4.5 artisan (28)

| Fonction | D/I | anon | svc | Loc | Art | Agt | Adm | PD | SA2 | Preuve |
|---|---|---|---|---|---|---|---|---|---|---|
| `accepter_creneau_locataire` | D | R | A | R(ERR) | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `accepter_mission` | D | R | A | R(ERR) | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `artisan_possede_intervention` | D | R | A | R(OK) | A(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `chemins_fichiers_artisan` | D | R | A | R(OK) | A(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `decliner_sollicitation` | D | R | A | R(ERR) | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `definir_ma_visibilite` | D | R | A | R(ERR) | A(OK) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `demander_avenant_devis` | D | R | A | R(ERR) | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `demarrer_intervention` | D | R | A | R(ERR) | A(OK) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `deposer_compte_rendu` | D | R | A | R(ERR) | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `deposer_devis_structure` | D | R | A | R(ERR) | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `deposer_facture_artisan` | D | R | A | R(ERR) | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `deposer_ma_piece_artisan` | D | R | A | R(ERR) | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `deposer_photo_intervention` | D | R | A | R(ERR) | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `dossiers_de_mes_factures_a_deposer` | D | R | A | R(OK) | A(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `envoyer_mon_devis_prepare` | D | R | A | R(ERR) | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `inscrire_mon_entreprise_artisan` | D | R | A | R(ERR) | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `ma_note_artisan` | D | R | A | R(OK) | A(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mes_creneaux_artisan` | D | R | A | R(OK) | A(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mes_pieces_artisan` | D | R | A | R(OK) | A(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mes_sollicitations` | D | R | A | R(OK) | A(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mon_agenda_artisan` | D | R | A | R(OK) | A(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mon_artisan` | D | R | A | R(OK) | A(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `mon_budget_intervention` | D | R | A | R(ERR) | A(OK) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `orgs_de_mes_missions` | D | R | A | R(OK) | A(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `orgs_de_mes_sollicitations_ouvertes` | D | R | A | R(OK) | A(OK) | R(OK) | R(OK) | R(OK) | R | c |
| `proposer_creneaux` | D | R | A | R(ERR) | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `refuser_creneaux_locataire` | D | R | A | R(ERR) | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |
| `refuser_mission` | D | R | A | R(ERR) | A(ERR) | R(ERR) | R(ERR) | R(ERR) | R | c |

### 4.6 super_admin (26)

| Fonction | D/I | anon | svc | Loc | Art | Agt | Adm | PD | SA2 | Preuve |
|---|---|---|---|---|---|---|---|---|---|---|
| `appliquer_retention` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `artisan_decider_plateforme` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `artisan_definir_siret_etat` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `artisans_a_valider` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `autoriser_orchestration` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `clore_revue_idees` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `file_retours_supervision` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `generer_alertes_assurance` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `generer_alertes_diagnostics` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `generer_alertes_restitution` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `journaliser_supervision` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `log_sa_access` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `maintenance_artisans` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `proposer_publications` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `purger_signalements_support` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `regrouper_idees` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `reseau_interets_pilotage` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `reseau_pilotage` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `reseau_rattacher_artisan` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `reseau_regler_ouverture` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `resume_relais_supervision` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | c |
| `retirer_evaluation` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `signaler_presence_supervision` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `supervision_abonnement` | D | R | A | R(OK) | R(OK) | R(OK) | R(OK) | R(OK) | A | b,c |
| `traiter_inscription_artisan_atomique` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |
| `traiter_retour` | D | R | A | R(ERR) | R(ERR) | R(ERR) | R(ERR) | R(ERR) | A | b,c |

### 4.7 super_admin + membre d'organisation (22)

| Fonction | D/I | anon | svc | Loc | Art | Agt | Adm | PD | SA2 | Preuve |
|---|---|---|---|---|---|---|---|---|---|---|
| `activer_bail` | D | R | A | A(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `alerte_dans_portefeuille` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | P | b,c |
| `artisan_definir_metiers_zones` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | A | b,c |
| `artisan_lisible` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | A | b,c |
| `artisans_disponibles_bien` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(mix) | A(ERR) | A | c |
| `can_manage_organization` | D | R | A | R(OK) | R(OK) | R(OK) | A(OK) | A(OK) | A | b,c |
| `confirmer_bilan_contact` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | A | b,c |
| `creer_bien_complet` | I | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | A | b,c |
| `document_dans_portefeuille` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | P | b,c |
| `enregistrer_conge_avec_justificatif` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `enregistrer_parrainage` | D | R | A | R(ERR) | R(ERR) | P(ERR) | P(ERR) | P(ERR) | P | b,c |
| `est_agent_restreint` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | A | b,c |
| `inviter_agent` | D | R | A | A(ERR) | A(ERR) | A(ERR) | A(mix) | R(ERR) | A | b,c |
| `inviter_locataire` | I | R | A | A(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `log_document_access` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | A | b,c |
| `org_ids_avec_roles` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | P | b,c |
| `org_membres_gerants` | D | R | A | R(OK) | R(OK) | A(OK) | A(OK) | A(OK) | A | b,c |
| `ouvrir_organisation` | D | R | A | R(ERR) | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A | b,c |
| `perimetre_persons_gerant` | D | R | A | R(OK) | R(OK) | R(OK) | A(OK) | A(OK) | A | b,c |
| `peut_lire_retour` | D | R | A | R(OK) | R(OK) | R(OK) | A(OK) | R(OK) | A | b,c |
| `regulariser_charges_avec_justificatif` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(ERR) | A(ERR) | A | c |
| `reseau_etats_bien` | D | R | A | R(ERR) | R(ERR) | A(ERR) | A(mix) | A(ERR) | A | c |

### 4.8 super_admin permanent aal2 + membre d'organisation (4)

| Fonction | D/I | anon | svc | Loc | Art | Agt | Adm | PD | SA2 | Preuve |
|---|---|---|---|---|---|---|---|---|---|---|
| `dossier_compte_supervision` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | P | b,c |
| `enregistrer_plan_continuite` | D | R | A | R(ERR) | R(ERR) | P(ERR) | P(ERR) | P(ERR) | P | b,c |
| `etat_continuite` | D | R | A | R(ERR) | R(ERR) | P(ERR) | P(ERR) | P(ERR) | P | b,c |
| `rechercher_comptes_supervision` | D | R | A | R(OK) | R(OK) | P(OK) | P(OK) | P(OK) | P | b,c |

### 4.9 aucune garde détectée (3)

| Fonction | D/I | anon | svc | Loc | Art | Agt | Adm | PD | SA2 | Preuve |
|---|---|---|---|---|---|---|---|---|---|---|
| `formule_couvrante` | D | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `montant_abonnement_cents` | D | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |
| `montant_offre_cents` | D | R | A | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ?(OK) | ? | c |

### 4.10 super_admin + artisan + membre d'organisation (2)

| Fonction | D/I | anon | svc | Loc | Art | Agt | Adm | PD | SA2 | Preuve |
|---|---|---|---|---|---|---|---|---|---|---|
| `lire_devis_structure` | D | R | A | R(ERR) | A(mix) | A(mix) | A(mix) | A(ERR) | A | b,c |
| `mes_publics_veille` | D | R | A | A(OK) | A(OK) | A(OK) | A(OK) | A(OK) | A | b,c |

## 5. Fonctions non exécutables par `authenticated`

Sans objet pour les rôles d'API (refus par privilège : `permission denied for function`), appelables par la clé de service, par d'autres fonctions ou par les déclencheurs. Statut : **lu dans le code seulement** (la matrice (b) constate le refus `permission denied` pour `anon` et `authenticated` sur celles qui citent `super_admin`).

### 5.1 `service_role` seulement (99)

`abonnement_appliquer`, `abonnement_avis_reconduction_envoye`, `abonnement_basculer_grille`, `abonnement_client_remplace`, `abonnement_details`, `abonnement_echeance_preparee`, `abonnement_en_ligne_possible`, `abonnement_evenement_a_traiter`, `abonnement_evenement_rejouable`, `abonnement_evenement_solde`, `abonnement_facture_payee`, `abonnement_par_client`, `abonnement_quantite_cible`, `abonnement_relance_envoyee`, `abonnement_synchro_faite`, `abonnements_a_relancer`, `abonnements_a_synchroniser`, `abonnements_avis_reconduction_dus`, `abonnements_echeance_a_preparer`, `appels_a_envoyer`, `artisan_affectable`, `artisan_assurance_deposee`, `artisan_decennale_valide`, `artisan_indicateurs_fiabilite`, `artisan_note`, `autoriser_lien_mot_de_passe`, `autoriser_lien_mot_de_passe_cle`, `avantage_parrainage_solde`, `avantages_parrainage_a_appliquer`, `capacite_souscrite`, `cible_preparation_marketing`, `classer_echec_signature_youtrust`, `commencer_mission`, `conflit_planning_artisan`, `conserver_etude_veille`, `controler_fichier_ged`, `creer_fiche_justificatif`, `creer_fiche_preuve_edl`, `cycle_mensuel_interne`, `debut_conservation_document`, `declencher_marketing`, `deposer_devis`, `destinataire_facturation`, `document_deja_visible_agent`, `email_superviseur_permanent`, `engendrer_code_parrainage`, `etat_location_du_lot`, `etat_loyers_bail_brut`, `fermer_alertes_origine`, `fermer_fonctions_a_anon`, `finaliser_signature_youtrust`, `garde_capacite`, `generer_alertes_impayes`, `generer_appels_loyer_interne`, `import_personne`, `incident_creer`, `incident_prochain_numero`, `interrompre_mission_supervision`, `jeton_declencheur_marketing`, `log_automation_event`, `lot_couvert_par_mandat`, `marquer_appel_envoye`, `marquer_quittance_envoyee`, `marquer_rappel_envoye`, `montants_reels_bail`, `org_ecriture_ouverte`, `parrainage_avantage_filleul`, `parrainage_recompenser`, `plafond_intervention`, `poser_alerte_seuil`, `poser_gardes_abonnement`, `poser_gardes_diagnostic_artisan`, `preparation_marketing_due`, `preparer_rapports_automatiques`, `preparer_recrutement_territorial`, `programmer_publication_marketing`, `publications_marketing_echues`, `publier_article_automatique`, `quittances_a_envoyer`, `relance_loyer_consigner`, `relances_loyer_dues`, `rendez_vous_a_rappeler`, `reperes_devis_realises`, `reseau_artisan_eligible`, `reseau_contact_dans_zone`, `reseau_contact_personnel`, `reseau_nom_commune`, `reseau_verifier_acces_bien`, `reserver_visuel_marketing`, `responsable_supervision_habilite`, `resynchroniser_quittances`, `suivre_impayes_bail`, `surveiller_continuite`, `tache_systeme`, `terme_bail_calcule`, `terminer_mission`, `unites_a_couvrir`, `verifier_declarant_photo`, `zone_artisan_couvre`

### 5.2 Aucun EXECUTE (helpers internes) (7)

`actualiser_orchestration_socle`, `artisans_affectables_interne`, `cible_preparation_marketing_interne`, `motif_de_contre_ecriture`, `ouvrir_consultation_interne`, `proposer_publications_interne`, `solliciter_artisan_interne`

### 5.3 Fonctions de déclencheur (94)

`abonnement_marquer_a_resynchroniser`, `abonnements_parrainage_conversion`, `acceptations_cgu_ajout_seul`, `alerte_pose_origine`, `alerte_zone_tendue_inconnue`, `archiver_diagnostic_remplace`, `bail_personnes_suppression_brouillon`, `basculer_grille_a_l_ajout`, `bien_type_coherent_avec_lots`, `capturer_composantes_fiscales`, `conserver_etape_dossier`, `consigner_cgu_inscription`, `contre_ecriture_client_controlee`, `contre_ecriture_exige_son_motif`, `contre_passer_depot_encaissement`, `contre_passer_encaissement`, `controler_chambre_et_plafond`, `controler_cloture_intervention`, `controler_contrat_individuel`, `controler_cotitulaire_individuel`, `controler_dates_attestation_artisan`, `controler_forfait_charges_bail`, `controler_mentions_a_l_activation`, `controler_plafond_depot_garantie`, `controler_titulaire_mandat`, `controler_transitions_du_bail`, `demandes_devis_limiter`, `diagnostic_archive_ferme_alertes`, `diffuser_veille`, `document_remplace_ferme_alertes`, `ecrire_encaissement`, `ecriture_mois_ouvert`, `edl_annexe_verifier_non_signe`, `edl_lignes_fige`, `edl_signature_exige_preuve`, `edl_signe_ferme_alertes`, `encaissement_exige_mandat`, `encaissement_resynchronise_quittances`, `figer_zone_tendue_bail`, `garde_archivage_bien`, `garde_capacite_apres`, `garde_capacite_biens`, `garde_capacite_mandat_ligne`, `garde_destination_photo_incident`, `garde_document_fichier_depose`, `garde_document_fichier_portefeuille`, `garde_document_liens_portefeuille`, `garde_photo_incident_abandonnee`, `garde_portefeuille_agent`, `garder_alerte_facture_ouverte`, `garder_delegation_supervision`, `garder_depassement_devis`, `garder_proposition_developpement`, `garder_verification_marque`, `handle_auth_user_change`, `journaliser_adhesion`, `mandat_ligne_verifier`, `mandat_ligne_verrouiller_resilie`, `mandat_titulaire_protege`, `mandat_verifier_contenu_transition`, `mandat_verifier_exclusivite_pd`, `mandat_verrouiller_resilie`, `mesurer_resultat_complementaire`, `mesurer_resultat_metier`, `organizations_champs_reserves_sa`, `organizations_parrainage_conversion`, `organizations_poser_code_parrainage`, `persons_qualite_liste_fermee`, `point_du_matin_source_changee`, `postes_appel_non_fige`, `preserve_creation_bien`, `proposer_amelioration_depuis_retour`, `proteger_mentions_contrat_location`, `proteger_mentions_edl_signe`, `proteger_signature_organisation`, `publication_prete_a_paraitre`, `publications_touche`, `refuser_ecriture_si_fermee`, `refuser_ecriture_si_fermee_par_parent`, `refuser_mutation_diagnostic_artisan`, `reseau_controler_commune_bien`, `revision_annuelle_par_bail`, `set_updated_at`, `supervision_version_immuable`, `suppression_encaissement_exige_motif`, `verifier_bien_verrouille`, `verifier_cle_invalidation`, `verifier_coherence_lot_bail`, `verifier_detention_totale`, `verifier_equipement_meme_agence`, `verifier_lien_meme_agence`, `verifier_transition_lot`, `verrouiller_bail_hors_fonctions`, `verrouiller_echeancier_encaissement`

## 6. Actions serveur × rôle

259 fonctions exportées de 70 fichiers. **A** = rôle admis par la garde de l'action ; pour les fonctions **sans garde reconnue**, la garde réelle est celle de la RPC appelée (colonne « Rôles admis par la RPC »). Pour `verifierGerant` / `verifierAccesEspace`, le super-administrateur passe aussi (`A` en SA2) en **traversée journalisée** (`log_sa_access`). Statut de preuve : **lu dans le code seulement**, sauf les fonctions de `consignes-vacances.ts` et `controle-supervision.ts`, dont le rejeu POST est **constaté sur le banc** (404 pour un profil sans rôle, 303 anonyme, 307 vers `/securite` en aal1 — matrice super-admin §1). Les parcours Playwright exercent des actions par l'interface mais ne constatent pas de refus par rôle.

#### `actions/abonnement.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `demarrerAbonnement` | R | R | A | A | A | R | admin_agence, agent, proprietaire_direct | code |
| `confirmerHausse` | R | R | A | A | A | R | admin_agence, agent, proprietaire_direct | code |
| `demanderPeriodicite` | R | R | A | A | A | R | admin_agence, proprietaire_direct | code |
| `resilierAbonnement` | R | R | A | A | A | R | admin_agence, proprietaire_direct | code |
| `ouvrirPortailAbonnement` | R | R | A | A | A | R | admin_agence, proprietaire_direct | code |

#### `actions/agenda-gestion.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `chargerAgendaGestion` | R | R | A | A | A | A | - | code |

#### `actions/alertes.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `creerAlerte` | R | R | A | A | A | A | - | code |
| `escaladerAlerte` | R | R | A | A | A | A | - | code |
| `fermerAlerte` | R | R | A | A | A | A | - | code |

#### `actions/annexe-bail.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `deposerAnnexeBail` | R | R | A | A | A | A | - | code |
| `corrigerClasseDpeBail` | R | R | A | A | A | A | - | code |
| `deposerDiagnosticBail` | R | R | A | A | A | A | - | code |

#### `actions/annonces.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `creerAnnonce` | R | R | A | A | A | A | - | code |
| `supprimerAnnonce` | R | R | A | A | A | A | - | code |

#### `actions/appels-charges.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `creerAppelCharges` | R | R | A | A | A | A | - | code |
| `ajouterPosteCharge` | R | R | A | A | A | A | - | code |
| `modifierPosteCharge` | R | R | A | A | A | A | - | code |
| `supprimerPosteCharge` | R | R | A | A | A | A | - | code |
| `validerVentilation` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `supprimerAppelCharges` | R | R | A | A | A | A | - | code |

#### `actions/artisan.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `inscrireMonEntreprise` | R | A | R | R | R | R | artisan | code |
| `mettreAJourMetiersZones` | R | A | R | R | R | R | admin_agence, agent, proprietaire_direct, super_admin | code |
| `definirMaVisibilite` | R | A | R | R | R | R | artisan | code |
| `deposerMaPiece` | R | A | R | R | R | R | artisan | code |
| `declinerMaSollicitation` | R | A | R | R | R | R | artisan | code |
| `deposerMonDevis` | R | A | R | R | R | R | - | code |
| `accepterMaMission` | R | A | R | R | R | R | artisan | code |
| `refuserMaMission` | R | A | R | R | R | R | artisan | code |
| `proposerMesCreneaux` | R | A | R | R | R | R | artisan | code |
| `demarrerMonIntervention` | R | A | R | R | R | R | artisan | code |
| `accepterDateLocataire` | R | A | R | R | R | R | artisan | code |
| `refuserDatesLocataire` | R | A | R | R | R | R | artisan | code |
| `deposerMaFacture` | R | A | R | R | R | R | artisan | code |
| `deposerPhotoChantier` | R | A | R | R | R | R | artisan | code |
| `deposerMonCompteRendu` | R | A | R | R | R | R | artisan | code |
| `demanderMonAvenant` | R | A | R | R | R | R | artisan | code |

#### `actions/attestation-locataire.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `deposerMonAttestation` | A | R | R | R | R | R | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |

#### `actions/auth.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `seDeconnecter` | public | public | public | public | public | public | - | code |
| `demanderReinitialisation` | public | public | public | public | public | public | - | code |
| `definirNouveauMotDePasse` | ? | ? | via RPC | via RPC | via RPC | ? | admin_agence, agent, proprietaire_direct | code |
| `inscrireProprietaire` | public | public | public | public | public | public | - | code |
| `creerCompteArtisan` | public | public | public | public | public | public | - | code |
| `ouvrirEspaceProprietaire` | via RPC | via RPC | via RPC | via RPC | via RPC | via RPC | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |

#### `actions/autonomie.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `actualiserDossiers` | R | R | R | R | R | A | super_admin | code |
| `creerDelegation` | R | R | R | R | R | A | super_admin | code |
| `revoquerDelegation` | R | R | R | R | R | A | super_admin | code |
| `deciderAmelioration` | R | R | R | R | R | A | super_admin | code |
| `actualiserCorrection` | R | R | R | R | R | A | - | code |
| `signalerPresence` | R | R | R | R | R | A | super_admin | code |
| `enregistrerBilanContact` | ? | ? | via RPC | via RPC | via RPC | via RPC | admin_agence, agent, proprietaire_direct, super_admin | code |

#### `actions/baux.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `creerBail` | R | R | A | A | A | A | - | code |
| `modifierBail` | R | R | A | A | A | A | - | code |
| `modifierComplementsBail` | R | R | A | A | A | A | - | code |
| `deposerBailSigne` | R | R | A | A | A | A | admin_agence, agent, locataire, proprietaire_direct, super_admin | code |
| `deposerReglementCopropriete` | R | R | A | A | A | A | admin_agence, agent, locataire, proprietaire_direct, super_admin | code |
| `corrigerBail` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `envoyerBailSigne` | R | R | A | A | A | A | - | code |
| `enregistrerConge` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct, super_admin | code |
| `annulerConge` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `terminerBail` | R | R | A | A | A | A | admin_agence, agent, locataire, proprietaire_direct | code |
| `ajouterInventaireLigne` | R | R | A | A | A | A | - | code |
| `supprimerInventaireLigne` | R | R | A | A | A | A | - | code |
| `ajouterBailPersonne` | R | R | A | A | A | A | - | code |
| `supprimerBailPersonne` | R | R | A | A | A | A | - | code |
| `enregistrerDepartColocataire` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |

#### `actions/catalogue-documents.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `genererDepuisCatalogue` | R | R | A | A | A | A | - | code |

#### `actions/chambres.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `enregistrerChambre` | R | R | A | A | A | A | - | code |
| `enregistrerPlafondColocation` | R | R | A | A | A | A | - | code |

#### `actions/classe-dpe-lot.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `corrigerClasseDpeLot` | R | R | A | A | A | A | - | code |

#### `actions/compta.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `genererRapport` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `envoyerRapport` | R | R | A | A | A | A | - | code |
| `enregistrerVersement` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `ajouterEcriture` | R | R | A | A | A | A | - | code |
| `passerContreEcriture` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `ventilerDepense` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `cloturerMois` | R | R | A | A | A | A | admin_agence, proprietaire_direct | code |

#### `actions/compte.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `changerMonMotDePasse` | ? | ? | via RPC | via RPC | via RPC | ? | admin_agence, agent, proprietaire_direct | code |

#### `actions/conge-locataire.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `donnerMonConge` | via RPC | ? | ? | ? | ? | ? | locataire | code |

#### `actions/consignes-vacances.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `enregistrerConsigne` | R | R | R | R | R | A | - | constaté (rejeu POST) |
| `commanderConsigne` | R | R | R | R | R | A | - | constaté (rejeu POST) |
| `enregistrerVacances` | R | R | R | R | R | A | - | constaté (rejeu POST) |
| `commanderRelais` | R | R | R | R | R | A | - | constaté (rejeu POST) |

#### `actions/controle-supervision.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `renvoyerInvitation` | R | R | R | R | R | A | - | constaté (rejeu POST) |
| `controlerOrganisation` | R | R | R | R | R | A | super_admin | constaté (rejeu POST) |
| `controlerCompte` | R | R | R | R | R | A | admin_agence, agent, proprietaire_direct, super_admin | constaté (rejeu POST) |

#### `actions/depot.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `encaisserDepot` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `supprimerEncaissementDepot` | R | R | A | A | A | A | - | code |

#### `actions/devis-admin.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `marquerDevisTraitee` | R | R | R | R | R | A | super_admin | code |

#### `actions/devis.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `demanderDevis` | public | public | public | public | public | public | - | code |

#### `actions/documents-ged.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `remplacerDocument` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `rattacherDocument` | R | R | A | A | A | A | - | code |

#### `actions/documents-generes.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `genererDocument` | R | R | A | A | A | A | - | code |

#### `actions/dossier.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `deposerPieceDossier` | R | R | A | A | A | A | - | code |
| `validerAttestation` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |

#### `actions/edl.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `enregistrerMentionsEdl` | R | R | A | A | A | A | - | code |
| `creerEdl` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `regenererGrilleEdl` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `majGrilleEdl` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `enregistrerAnnexesEdl` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `ajouterCompteur` | R | R | A | A | A | A | - | code |
| `supprimerCompteur` | R | R | A | A | A | A | - | code |
| `ajouterCle` | R | R | A | A | A | A | - | code |
| `supprimerCle` | R | R | A | A | A | A | - | code |

#### `actions/equipes.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `commanderMission` | R | R | R | R | R | A | super_admin | code |
| `enregistrerContinuite` | R | R | R | R | R | A | admin_agence, agent, proprietaire_direct, super_admin | code |
| `demanderCorrection` | R | R | R | R | R | A | - | code |

#### `actions/erreurs.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `signalerErreurEcran` | ? | ? | via RPC | via RPC | via RPC | ? | admin_agence, agent, proprietaire_direct | code |

#### `actions/etapes-bail.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `modifierEtapeBail` | R | R | A | A | A | A | - | code |
| `commencerBail` | R | R | A | A | A | A | - | code |

#### `actions/etudes-territoriales.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `enregistrerEtude` | R | R | R | R | R | A | super_admin | code |

#### `actions/fiche-lot.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `chargerFicheLot` | via RPC | ? | via RPC | via RPC | via RPC | ? | admin_agence, agent, locataire, proprietaire_direct | code |
| `chargerDocumentsDuLot` | ? | ? | via RPC | via RPC | via RPC | ? | admin_agence, agent, proprietaire_direct | code |
| `chargerComptabiliteDuLot` | ? | ? | via RPC | via RPC | via RPC | ? | admin_agence, agent, proprietaire_direct | code |
| `chargerEcheancierLocataire` | via RPC | ? | ? | ? | ? | ? | locataire | code |
| `chargerRelancesDuLot` | ? | ? | via RPC | via RPC | via RPC | ? | admin_agence, agent, proprietaire_direct | code |
| `chargerHistoriqueDuLot` | ? | ? | via RPC | via RPC | via RPC | ? | admin_agence, agent, proprietaire_direct | code |
| `envoyerRapportDuLot` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |

#### `actions/fiscalite.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `qualifierPieceFiscale` | R | R | A | A | A | A | proprietaire_direct | code |
| `retrouverVentilation` | R | R | A | A | A | A | proprietaire_direct | code |
| `enregistrerExerciceFiscal` | R | R | A | A | A | A | proprietaire_direct | code |

#### `actions/ged.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `deposerDocument` | R | R | A | A | A | A | - | code |

#### `actions/import-parc.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `importerParc` | R | R | A | A | A | A | admin_agence, proprietaire_direct | code |

#### `actions/incidents-locataire.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `choisirMonCreneau` | A | R | R | R | R | R | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |
| `proposerMesCreneaux` | A | R | R | R | R | R | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |
| `noterMonIntervention` | A | R | R | R | R | R | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |

#### `actions/incidents.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `declarerMonIncident` | A | R | R | R | R | R | locataire | code |
| `contesterImputation` | A | R | R | R | R | R | locataire | code |
| `signalerProblemePersiste` | A | R | R | R | R | R | admin_agence, agent, locataire, proprietaire_direct | code |
| `ouvrirIncident` | R | R | A | A | A | A | admin_agence, agent, locataire, proprietaire_direct | code |
| `qualifierIncident` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `cloturerIncident` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `rouvrirIncident` | R | R | A | A | A | A | admin_agence, agent, locataire, proprietaire_direct | code |
| `attribuerIncident` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `joindrePhotoIncident` | R | R | A | A | A | A | admin_agence, agent, locataire, proprietaire_direct | code |
| `ouvrirConsultation` | R | R | A | A | A | A | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |
| `solliciterArtisan` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `retenirDevis` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `fixerRendezVous` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `reviserImputation` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `annulerMission` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `evaluerArtisan` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `deciderAvenant` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `validerFactureArtisan` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |

#### `actions/invitations.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `inviterLocataire` | R | R | A | A | A | A | admin_agence, agent, locataire, proprietaire_direct | code |
| `annulerInvitation` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `repondreInvitation` | via RPC | ? | ? | ? | ? | ? | locataire | code |

#### `actions/loyers.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `envoyerQuittance` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `ajouterRelance` | R | R | A | A | A | A | - | code |
| `supprimerRelance` | R | R | A | A | A | A | - | code |
| `regulariserCharges` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct, super_admin | code |
| `genererAppels` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `ajouterEncaissement` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `supprimerEncaissement` | R | R | A | A | A | A | - | code |
| `reviserLoyer` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `emettreQuittances` | R | R | A | A | A | A | - | code |

#### `actions/mandats.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `creerMandat` | R | R | A | A | A | A | - | code |
| `ajouterLigneMandat` | R | R | A | A | A | A | - | code |
| `supprimerLigneMandat` | R | R | A | A | A | A | - | code |
| `changerEtatMandat` | R | R | A | A | A | A | - | code |
| `changerTitulaireMandat` | R | R | A | A | A | A | - | code |
| `modifierDateMandat` | R | R | A | A | A | A | - | code |

#### `actions/messages.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `envoyerMessageLocataire` | via RPC | via RPC | via RPC | via RPC | via RPC | via RPC | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |
| `repondreMessagePersonne` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |

#### `actions/organisation.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `modifierProfilOrganisation` | R | R | A | A | A | A | - | code |
| `inviterAgent` | R | R | A | A | A | A | admin_agence, agent, artisan, locataire, super_admin | code |

#### `actions/organisations-admin.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `ouvrirOrganisation` | ? | ? | via RPC | via RPC | via RPC | via RPC | admin_agence, agent, proprietaire_direct, super_admin | code |

#### `actions/parc.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `creerBien` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct, super_admin | code |
| `modifierBien` | R | R | A | A | A | A | - | code |
| `modifierLot` | R | R | A | A | A | A | - | code |
| `changerEtatLot` | R | R | A | A | A | A | - | code |
| `decouperBien` | R | R | A | A | A | A | - | code |
| `ajouterDetention` | R | R | A | A | A | A | - | code |
| `cloreDetention` | R | R | A | A | A | A | - | code |
| `supprimerDetention` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `rouvrirDetention` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `deposerDiagnostic` | R | R | A | A | A | A | - | code |
| `ajouterPieceLot` | R | R | A | A | A | A | - | code |
| `proposerPiecesLot` | R | R | A | A | A | A | - | code |
| `supprimerPieceLot` | R | R | A | A | A | A | - | code |
| `enregistrerInfosPratiques` | R | R | A | A | A | A | - | code |
| `validerCle` | R | R | A | A | A | A | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |
| `ajouterEquipementCatalogue` | R | R | A | A | A | A | - | code |
| `definirEquipementsLot` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |

#### `actions/personnes-bail.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `choisirPersonneBail` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `creerPersonneBail` | R | R | A | A | A | A | - | code |
| `modifierPersonneBail` | R | R | A | A | A | A | - | code |
| `retirerPersonneBail` | R | R | A | A | A | A | - | code |
| `enregistrerProprietairesBail` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |

#### `actions/personnes.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `creerPersonne` | R | R | A | A | A | A | - | code |
| `archiverPersonne` | R | R | A | A | A | A | - | code |
| `modifierPersonne` | R | R | A | A | A | A | - | code |

#### `actions/pieces-demandees.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `demanderPieceLocataire` | R | R | A | A | A | A | - | code |
| `relancerPieceDemandee` | R | R | A | A | A | A | - | code |
| `annulerPieceDemandee` | R | R | A | A | A | A | - | code |
| `deposerMaPiece` | via RPC | via RPC | via RPC | via RPC | via RPC | via RPC | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |

#### `actions/publications.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `genererPropositions` | R | R | R | R | R | A | super_admin | code |
| `enregistrerPublication` | R | R | R | R | R | A | - | code |
| `publierPublicationFacebook` | R | R | R | R | R | A | super_admin | code |
| `publierPublication` | R | R | R | R | R | A | - | code |
| `retirerPublication` | R | R | R | R | R | A | - | code |
| `refuserPublication` | R | R | R | R | R | A | - | code |

#### `actions/quittancement.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `encaisserReste` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `emettreQuittanceBail` | R | R | A | A | A | A | - | code |
| `envoyerQuittancesMois` | R | R | A | A | A | A | - | code |

#### `actions/recherche-espace.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `rechercherDansEspace` | R | R | A | A | A | A | - | code |

#### `actions/recherche-supervision.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `rechercherDansSupervision` | R | R | R | R | R | A | admin_agence, agent, proprietaire_direct, super_admin | code |

#### `actions/reprise-comptable.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `reprendreSoldes` | R | R | A | A | A | A | admin_agence, locataire, proprietaire_direct | code |
| `abandonnerReprise` | R | R | A | A | A | A | admin_agence, proprietaire_direct | code |

#### `actions/reseau.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `confirmerCommuneBien` | R | R | A | A | A | A | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |
| `confirmerCommunesEvidentes` | R | R | A | A | A | A | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |
| `signalerInteretReseau` | R | R | A | A | A | A | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |
| `reglerOuvertureReseau` | R | R | R | R | R | A | super_admin | code |
| `rattacherArtisanReseau` | R | R | R | R | R | A | super_admin | code |

#### `actions/restitution.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `demarrerRestitution` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `ajouterRetenue` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `supprimerRetenue` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `justifierRetenue` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `rafraichirMontantsRestitution` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `marquerDecompteEnvoye` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `finaliserDecompte` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |

#### `actions/retention.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `lancerPurge` | R | R | R | R | R | A | super_admin | code |

#### `actions/retours.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `envoyerRetour` | ? | ? | via RPC | via RPC | via RPC | ? | admin_agence, agent, proprietaire_direct | code |
| `soutenirRetour` | via RPC | via RPC | via RPC | via RPC | via RPC | via RPC | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |
| `deciderRetour` | R | R | R | R | R | A | super_admin | code |
| `regrouperRetours` | R | R | R | R | R | A | super_admin | code |
| `cloreRevue` | R | R | R | R | R | A | super_admin | code |

#### `actions/retrait-bien.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `retirerBien` | R | R | A | A | A | A | admin_agence, proprietaire_direct | code |
| `retablirBien` | R | R | A | A | A | A | admin_agence, proprietaire_direct | code |

#### `actions/session-artisan.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `entrerDansSessionArtisan` | ? | ? | ? | ? | ? | via RPC | super_admin | code |
| `quitterSessionArtisan` | via RPC | via RPC | via RPC | via RPC | via RPC | via RPC | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |

#### `actions/signature-locataire.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `retournerDocumentSigne` | via RPC | via RPC | via RPC | via RPC | via RPC | via RPC | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |

#### `actions/signature.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `enregistrerSignature` | R | R | A | A | A | A | admin_agence, proprietaire_direct | code |
| `retirerSignature` | R | R | A | A | A | A | admin_agence, proprietaire_direct | code |
| `envoyerPourSignature` | R | R | A | A | A | A | admin_agence, agent, locataire, proprietaire_direct | code |
| `annulerDemandeSignature` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `partagerDocument` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |

#### `actions/supervision-artisans.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `traiterInscriptionArtisan` | R | R | R | R | R | A | super_admin | code |

#### `actions/supprimer-bail-brouillon.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `supprimerBailBrouillon` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |

#### `actions/veille.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `deciderVeille` | R | R | R | R | R | A | super_admin | code |

#### `actions/verification-marque.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `verifierConnexionMarque` | R | R | R | R | R | A | - | code |

#### `admin/brief/actions.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `analyserBriefIA` | R | R | R | R | R | A | - | code |
| `preparerPointDuMatin` | R | R | R | R | R | A | - | code |
| `marquerPointLu` | R | R | R | R | R | A | super_admin | code |
| `deciderDecisionDuMatin` | R | R | R | R | R | A | super_admin | code |

#### `admin/marketing/actions.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `enregistrerReglagesMarketing` | R | R | R | R | R | A | - | code |
| `programmerCampagne` | R | R | R | R | R | A | - | code |
| `deciderPostProgramme` | R | R | R | R | R | A | super_admin | code |

#### `admin/publications/nouvelle/actions.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `creerArticleIA` | R | R | R | R | R | A | - | code |

#### `agence/[orgId]/artisans/actions.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `creerOuRattacherArtisan` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct | code |
| `definirMetiersEtZones` | R | R | A | A | A | A | admin_agence, agent, proprietaire_direct, super_admin | code |
| `definirStatutLocalArtisan` | R | R | A | A | A | A | admin_agence, proprietaire_direct | code |
| `blacklisterArtisanLocal` | R | R | A | A | A | A | admin_agence, proprietaire_direct | code |
| `leverBlacklistArtisanLocal` | R | R | A | A | A | A | admin_agence, proprietaire_direct | code |

#### `agence/[orgId]/baux/[bailId]/verifier-dossier.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `verifierDossierBail` | R | R | A | A | A | A | - | code |

#### `artisan/clients/actions.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `enregistrerActivitePrivee` | R | A | R | R | R | R | admin_agence, agent, artisan, locataire, proprietaire_direct, super_admin | code |

#### `artisan/devis/actions-preparation.ts`

| Fonction | Loc | Art | Agt | Adm | PD | SA2 | Rôles admis par la RPC appelée | Preuve |
|---|---|---|---|---|---|---|---|---|
| `preparerPropositionDevis` | R | A | R | R | R | R | - | code |
| `enregistrerBrouillonDevis` | R | A | R | R | R | R | - | code |
| `enregistrerProfilDocuments` | R | A | R | R | R | R | - | code |
| `envoyerDevisValide` | R | A | R | R | R | R | artisan | code |

## 7. Tables : lecture et écriture constatées par compte (matrice d'accès de l'auditeur)

| Compte | Relations interrogées | Lisibles (HTTP 200) | Refusées (HTTP 403) | Avec au moins une ligne visible |
|---|---|---|---|---|
| proprietaire1 | 149 | 141 | 8 | 12 |
| proprietaire2 | 149 | 141 | 8 | 8 |
| sansrole | 149 | 141 | 8 | 6 |
| locataire_pd | 149 | 141 | 8 | 9 |
| locataire_alpha | 149 | 141 | 8 | 9 |
| artisan_alpha | 149 | 141 | 8 | 12 |
| admin_alpha | 149 | 141 | 8 | 39 |
| admin_beta | 149 | 141 | 8 | 9 |
| agent_alpha | 149 | 141 | 8 | 37 |

Les 149 relations de la matrice correspondent exactement aux 149 relations de `public` du catalogue courant (0 manquante, 0 en trop) ; les 8 refusées (403) sont les 8 tables à RLS sans politique ni privilège (`abonnements`, `abonnement_evenements`, …). L'en-tête du document de l'auditeur parle de « 141 tables et vues » : c'est le nombre de relations **lisibles** (141 + 8 refusées = 149). Résultat annoncé : 0 ligne d'une organisation étrangère sur 9 comptes × 149 relations ; 692 tentatives d'écriture croisée, 0 ligne touchée (417 × 403, 275 × 200 avec 0 ligne). Statut : **constaté sur le banc** (version e9f31ac, copie `gerimmo_ci_rel_audit_a`).

Écritures directes (PATCH REST) possibles **dans sa propre organisation**, constatées :

| Compte | Tables modifiables | Détail |
|---|---|---|
| locataire_pd | 0 | aucune |
| locataire_alpha | 0 | aucune |
| artisan_alpha | 0 | aucune |
| agent_alpha | 9 | `alerts`, `baux`, `biens`, `detentions`, `edl_lignes`, `etats_des_lieux`, `lot_pieces`, `lots`, `persons` |
| proprietaire1 | 4 | `biens`, `detentions`, `lots`, `persons` |
| admin_alpha | 12 | `alerts`, `baux`, `biens`, `detentions`, `diagnostics`, `edl_lignes`, `etats_des_lieux`, `lot_pieces`, `lots`, `mandat_lignes`, `mandats`, `persons` |

## 8. Limites

- Les matrices du banc ont été produites sur e9f31ac (auditeur) et sur la candidate 5d15b4d (super-admin) ; le catalogue lu ici est celui de la tête (9396669). Les noms de fonctions concordent à l'identique (0 absente), mais **les corps n'ont pas été comparés** : une fonction modifiée depuis le passage de l'auditeur n'est pas détectable ici (hypothèse à vérifier).
- Le fuzz de l'auditeur appelle chaque fonction avec des arguments fictifs : un `OK` ne dit pas que le geste métier réussirait, un `ERR` peut venir d'un argument invalide plutôt que d'une garde. Seuls les messages de refus explicites (« Accès refusé », « Réservé à… ») sont des refus de garde.
- La colonne « admin d'agence / agent / propriétaire » suppose que le corps cite les rôles en littéraux ; une fonction qui reçoit les rôles en paramètre apparaît « P » (gérants supposés).
- Aucune fonction n'a été exécutée par cette cartographie (lecture du catalogue seulement).

> [!warning] Changement du 23/10/2026 — réseau d'artisans
> - Décision du dirigeant : les communes et les métiers du réseau sont choisis par l'artisan (sa zone
>   d'intervention et ses métiers), même pendant la bêta ; l'ouverture commune × métier par le super
>   administrateur est supplantée. Migration `20261023180000`, non appliquée en production au 23/10 :
>   voir [[Ouverture du réseau d'artisans]].
> - Depuis `20261023180000` (non appliquée en production au 23/10) : `reseau_rattacher_artisan` et
>   `reseau_regler_ouverture` refusent aussi au super administrateur (« le réseau ne s'ouvre plus commune par
>   commune… ») ; `artisan_definir_metiers_zones` refuse une agence pour un artisan qui a son compte, ou par une
>   relation désactivée ou en liste noire ; nouvelle fonction interne `zones_couvrant_code_postal` (aucun rôle
>   client). Lignes du tableau à reprendre à la mise en production.
