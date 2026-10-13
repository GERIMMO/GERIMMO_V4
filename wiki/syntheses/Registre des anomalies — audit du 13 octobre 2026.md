---
type: synthesis
tags: [audit, anomalies, registre, v1, mission-operationnelle]
status: in-progress
created: 2026-10-13
updated: 2026-10-13
sources: []
---

# Registre des anomalies — audit du 13 octobre 2026

Registre vivant de la mission opérationnelle du 12/10/2026, tenu au fil des résultats. Version testée :
commit `e9f31ac` de `main` (PR #177 incluse), banc local isolé et gratuit, aucun effet réel. **Chaque ligne vient d'une
observation ou d'une preuve citée par l'agent qui l'a relevée** ; une ligne « hypothèse » n'a pas été reproduite.

Gravité : **P0** sécurité critique, perte de données ou service indisponible ; **P1** parcours essentiel bloqué ou calcul
erroné ; **P2** dégradation avec contournement ; **P3** cosmétique. Statuts : *ouverte*, *corrigée en branche* (commit poussé, non déployé), *déployée* (en production), *à trancher*
(aval du dirigeant), *acceptée*, *hypothèse* (à vérifier), *réfutée*.

## Synthèse

| Gravité | ouverte | corrigée en branche | déployée | à trancher | acceptée | hypothèse | réfutée | Total |
|---|---|---|---|---|---|---|---|---|
| **P0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| **P1** | 0 | 1 | 0 | 0 | 0 | 0 | 0 | **1** |
| **P2** | 17 | 2 | 0 | 0 | 1 | 0 | 0 | **20** |
| **P3** | 29 | 2 | 0 | 2 | 0 | 0 | 0 | **33** |
| **Total** | 46 | 5 | 0 | 2 | 1 | 0 | 0 | **54** |

Sources lues : auditeur/a, auditeur/b, coordinateur, proprietaire/s01, relecture/finance, relecture/reprises, relecture/supervision.

> [!warning] Couverture à ne pas surestimer
> Ce registre ne couvre que ce que les agents ont effectivement exécuté (voir le registre d'exécution à venir).
> Les rôles ou volets absents de la colonne « Sources lues » n'ont pas encore rendu de rapport : leur absence n'est
> pas une preuve d'absence d'anomalie.

## P0 — sécurité critique, perte de données, service indisponible (0)

Aucune anomalie de cette gravité à ce jour.

## P1 — parcours essentiel bloqué ou calcul erroné (1)

| ID | Source | Anomalie | Statut |
|---|---|---|---|
| `FIN-01` | relecture/finance | Le document « Récapitulatif annuel · location nue » appelle le nouveau recapitulatifFiscal sans qualifications, composantes ni exercices : toutes les rubriques s'impriment à 0,00 €. | corrigée en branche — commit cddf339 (tests rouges puis verts) |

### Fiches P1

#### `FIN-01` — Le document « Récapitulatif annuel · location nue » appelle le nouveau recapitulatifFiscal sans qualifications, composantes ni exercices : toutes les rubriques s'impriment à 0,00 €.

- **Observé** : Propriétaire direct, lot nu avec 3 loyers encaissés (3 x 840 €, composantes bien capturées par le déclencheur) et 3 dépenses (assurance 300, travaux 1 200, taxe foncière 900) en 2026. Il génère le document « Récapitulatif annuel · location nue » depuis le catalogue (intérêts 0). Le PDF stocké dans la GED affiche 211 = 0,00 €, 223/224/227 = 0,00 € et « Périmètre : 6 écritures enregistrées », puis affirme « Les loyers et provisions sont ventilés selon les montants du bail enregistrés lors de la génération ». L'ancienne fonction (1e464f1) donnait 211 = 2 340, 223 = 300, 224 = 1 200, 227 = 900. Le générateur passe encore l'option ventilationLoyers, que la nouvelle fonction ignore, et ne lit jam…
- **Cause probable** : app/src/lib/documents/modeles/catalogue-gestion.ts:131-148 (appel à recapitulatifFiscal ligne 143)
- **Correction proposée** : Faire charger au générateur les mêmes données que l'écran (qualifications, composantes, exercices du lot et de l'année) et appeler recapitulatifFiscal avec exigerPerimetre:true ; imprimer les alertes et « à compléter » à la place de 0,00 € ; retirer la phrase sur la ventilation par les montants du bail. À défaut, refuser le document avec un message renvoyant à l'écran fiscal tant que des pièces sont à qualifier.
- **Preuve (banc)** : preuves/relecture/finance/ts/extrait_document_recap_fiscal_nu.txt (sortie du vrai assemblerComplementGestion, lignes lues dans la copie gerimmo_ci_rel_finance) ; comparaison ancien/nouveau : exécution de preuves/relecture/finance/ts/t2.mts (ancien 2340/300/1200/900 ; nouveau 0 partout, 3 alertes) ; banc 3100 non utilisé (la génération écrirait en GED sur la base d'intégration). Chemin HTTP/PDF non exercé, calcul et HTML exercés.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `-- Lecture seule : documents « récapitulatif nu » produits depuis la mise en ligne (à ouvrir : rubriques à 0,00 € attendues). select d.id, d.organization_id, d.titre, d.created_at from public.documents d where d.titre = 'Récapitulatif annuel · location nue' and d.created_at >= '2026-10-12' order by d.created_at;`
- **Statut** : corrigée en branche — commit cddf339 (tests rouges puis verts)

## P2 — dégradation avec contournement (20)

| ID | Source | Anomalie | Statut |
|---|---|---|---|
| `AUD-A-01` | auditeur/a | Un agent restreint modifie les équipements d'un lot hors de son portefeuille (RPC definir_equipements_lot) | ouverte |
| `AUD-A-02` | auditeur/a | L'annulation d'une écriture comptable (contre_ecriture) n'enregistre pas son auteur | ouverte |
| `AUD-A-03` | auditeur/a | L'annulation d'une mission artisan (annuler_mission) ne garde ni auteur ni événement | ouverte |
| `AUD-A-04` | auditeur/a | La suppression d'une détention (quote-part de propriété d'un lot) ne laisse aucune trace | ouverte |
| `AUD-B-01` | auditeur/b | E-mails de relance, d'appel et de rappel : valeurs saisies insérées sans échappement HTML | ouverte |
| `PROP-02` | proprietaire/s01 | Code postal à 4 chiffres et année 1500 acceptés et enregistrés à la création du bien | ouverte |
| `PROP-03` | proprietaire/s01 | Un fichier de plus de 10 Mo provoque une erreur HTTP 500 et un message sans rapport avec la cause | ouverte |
| `PROP-07` | proprietaire/s01 | Fiche personne : date de naissance future, téléphone « abc » et code postal « 75 » acceptés | ouverte |
| `PROP-12` | proprietaire/s01 | Encaissement à 3 décimales accepté et stocké tel quel : totaux affichés incohérents au centime | ouverte |
| `PROP-13` | proprietaire/s01 | Un encaissement daté dans le futur (01/01/2027) est accepté et compté comme déjà reçu | ouverte |
| `PROP-14` | proprietaire/s01 | Entrée en cours de mois : le premier terme (prorata) est exigible le 1er du mois, avant l'entrée, et passe tout de suite en « Impayé » | ouverte |
| `FIN-07` | relecture/finance | Le filtre par mot-clé « fonds travaux / alur » écarte la pièce avant de consulter la qualification justifiée du propriétaire : une dépense qualifiée « déductible 224 » reste exclue des charges et la qualification est enregistrée mais sans effet. | ouverte |
| `FIN-11` | relecture/finance | Les migrations ne rétro-capturent aucun loyer existant et la reprise « retrouver_ventilation_fiscale » refuse tout bail qui a plus d'un appel : sur les données réelles déjà en production, le récapitulatif 2044 passe à 0 € de loyers et chaque pièce doit être q… | ouverte |
| `REP-01` | relecture/reprises | contre_proposer_creneaux n'est pas rejouable : un second envoi (reponse perdue, double envoi) marque comme REFUSEES les propositions du locataire lui-meme, porte le compteur a 6 et declenche une alerte critique d'arbitrage fantome | ouverte |
| `SUP-01` | relecture/supervision | L'arret d'urgence (global ou par mission) ne couvre pas les 8 taches SQL planifiees par pg_cron : seules les routes Next/Vercel appellent verifier_arret_supervision. | ouverte |
| `SUP-02` | relecture/supervision | Pendant une session de diagnostic artisan ouverte (30 min), le trigger de lecture seule est pose sur TOUTES les tables de public, y compris supervision_arrets / supervision_operations : l'arret d'urgence est refuse. | ouverte |
| `SUP-05` | relecture/supervision | Les « faits de direction » copient, pour toutes les organisations, des données personnelles (titres d'alertes contenant le nom du locataire, ex. « État des lieux d'entrée — Lot 1 · Marie Durand ») dans brief_direction_snapshots, sans aucune trace d'audit par… | ouverte |
| `MKT-01` | coordinateur | La préparation du soir du marketing n'a jamais été déclenchée par pg_cron : pas de fenêtre de veto la veille, seul le rattrapage de la matinée préparait les posts | corrigée en branche — commit 9d5ed9d ; migration 20261013110000 à appliquer en production |
| `PUB-01` | coordinateur | Le formulaire « Agences » de l'accueil était le seul canal de contact des pages légales (exercice des droits sur les données) tant que l'adresse de l'éditeur manque ; il restait une demande de devis commerciale | corrigée en branche — commit e7982a7 |
| `PROP-BANC-01` | proprietaire/s01 | Banc : serveur :3100 démarré sans SUPABASE_SERVICE_ROLE_KEY (inscription et liens bloqués) | acceptée — défaut du banc d'essai, pas du produit ; banc-up.sh vérifie la clé de service |

### Fiches P2

#### `AUD-A-01` — Un agent restreint modifie les équipements d'un lot hors de son portefeuille (RPC definir_equipements_lot)

- **Attendu** : Refus 'hors de votre portefeuille' comme pour demarrer_restitution, enregistrer_conge, generer_grille_edl (garde_portefeuille_agent).
- **Observé** : Appel accepté sans erreur ; équipements du lot passés de 1 à 0. L'agent voit 0 ligne de ce lot (lots visibles : 1 sur 18). Les 32 autres tables rattachées aux lots portent le déclencheur garde_portefeuille_agent, pas lot_equipements.
- **Cause probable** : app/supabase/migrations/20260909190000_correctifs_audit_hors_documents.sql:460 (fonction SECURITY DEFINER qui ne teste que le rôle) ; app/supabase/migrations/20260909230000_perimetre_agent_serveur_et_base.sql:~244 (liste des tables gardées sans lot_equipements).
- **Correction proposée** : Dans definir_equipements_lot, refuser si public.lot_hors_portefeuille(v_org, p_lot) ; ou ajouter lot_equipements à la liste des tables du déclencheur garde_portefeuille_agent (via lot_id).
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/travail/preuve-agent-definir-equipements-lot.txt
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : ouverte

#### `AUD-A-02` — L'annulation d'une écriture comptable (contre_ecriture) n'enregistre pas son auteur

- **Attendu** : Auteur, cible, date, motif, résultat tracés (audit_log ou colonne auteur), comme supprimer_encaissement qui écrit audit_log.
- **Observé** : Seule la table ecritures change (20 -> 21 lignes) : la contre-écriture porte motif, contre_ecriture_de et created_at, mais ecritures n'a aucune colonne auteur/created_by et audit_log ne reçoit rien. Dans une agence à plusieurs gestionnaires, qui a annulé l'écriture est introuvable.
- **Cause probable** : app/supabase/migrations/20260927182000_contre_ecriture_ecritures_liees.sql:56 (aucun insert dans audit_log) ; colonnes de public.ecritures sans auteur.
- **Correction proposée** : Insérer dans audit_log (action 'contre_ecriture', account_id = auth.uid(), organisation, détails : écriture annulée, nouvelle écriture, montant, motif) dans la fonction.
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/travail/trace-5.txt
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : ouverte

#### `AUD-A-03` — L'annulation d'une mission artisan (annuler_mission) ne garde ni auteur ni événement

- **Attendu** : Événement d'incident avec acteur (comme demarrer_intervention qui écrit incident_evenements.acteur_account_id) ou ligne audit_log.
- **Observé** : Quatre tables changent (incident_interventions, incident_devis passé 'annule', intervention_creneaux 'caduc', incidents requalifié) mais ni incident_evenements ni audit_log ne reçoivent de ligne ; la mission garde annulee_le et annulation_motif sans annulee_par. L'artisan perd son devis retenu sans trace de qui a décidé.
- **Cause probable** : app/supabase/migrations/20260911240000_module8_correctifs_bloquants.sql:146 (update sans insert d'événement).
- **Correction proposée** : Ajouter un insert dans incident_evenements (type 'mission_annulee', acteur_account_id = auth.uid(), détails : intervention, motif) comme demarrer_intervention.
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/travail/trace-3.txt
- **Correction sans aval** : oui
- **Statut** : ouverte

#### `AUD-A-04` — La suppression d'une détention (quote-part de propriété d'un lot) ne laisse aucune trace

- **Attendu** : Trace de la suppression d'un droit de propriété (auteur, cible, date), ou archivage plutôt que suppression (wiki 'Archivage plutôt que suppression').
- **Observé** : La table detentions passe de 22 à 21 lignes ; audit_log et tous les autres journaux inchangés.
- **Cause probable** : fonction supprimer_detention (delete sans audit_log) ; migration non localisée dans l'extrait lu (hypothèse sur le fichier).
- **Correction proposée** : Journaliser dans audit_log (détails : lot, personne, quote-part supprimée) ou archiver la ligne.
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/travail/trace-4.txt
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : ouverte

#### `AUD-B-01` — E-mails de relance, d'appel et de rappel : valeurs saisies insérées sans échappement HTML

- **Attendu** : Texte échappé (&lt;a&gt;…) comme dans quittance-email.ts (echapperHtml) et notifications.ts (echapperMarque)
- **Observé** : corpsRelanceLoyer et corpsInformationCaution (lib/relance-loyer-email.ts) insèrent prenom, lot, emetteur, locataire tels quels dans le HTML du message ; appel-email.ts, rappel-email.ts, relance-paiement-email.ts n'ont aucun échappement non plus. Exécution de la fonction avec prenom='<img src=x onerror=...>', lot='<a href="https://evil.example">', emetteur='<script>': le HTML sortant contient ces balises intactes. Les valeurs viennent de la RPC relances_loyer_dues : lot=lots.nom, prenom/locataire=persons.prenom/nom, emetteur=organizations.name, tous saisis par le propriétaire ou l'agence (et possiblement par le locataire pour son propre nom : hypothèse à vérifier). Le message part du domaine…
- **Cause probable** : snap-main/app/src/lib/relance-loyer-email.ts:54,60,77-98 ; lib/appel-email.ts:64,80 ; absence d'appel à echapperMarque
- **Correction proposée** : Passer chaque valeur interpolée par echapperMarque() (déjà dans marque-organisation.ts) dans relance-loyer-email.ts, appel-email.ts, rappel-email.ts, relance-paiement-email.ts ; ajouter un test unitaire avec entrée '<b>'.
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/t-relance-sortie.txt (exécution de la fonction réelle du snapshot avec entrées hostiles ; seuls eur/formaterDate/moisDeLaPeriode sont substitués)
- **Correction sans aval** : oui
- **Statut** : ouverte

#### `PROP-02` — Code postal à 4 chiffres et année 1500 acceptés et enregistrés à la création du bien

- **Attendu** : refus d'un code postal qui n'a pas 5 chiffres (France) et d'une année de construction invraisemblable, message clair
- **Observé** : le formulaire passe à l'étape 2 (« Bâtiment — Renseigné »), puis le bien est créé : biens.postal_code='7501', annee_construction=1500, commune_insee NULL ; l'adresse affichée est « 1 rue Test, 7501 Paris »
- **Cause probable** : aucun contrôle de forme du code postal (champ texte maxlength 12, formulaire parc/nouveau) ; seule contrainte en base : annee_construction entre 1000 et 2100 (biens_annee_construction_check)
- **Correction proposée** : valider ^\d{5}$ côté serveur et client (pattern + inputmode), borner l'année (ex. 1800 à année en cours + 3)
- **Preuve (banc)** : captures/s2-03-cp4-annee1500.png ; captures/s2-07-bien-cp-invalide-cree.png ; SQL select postal_code,annee_construction from biens (bien '[TEST-proprietaire] Bien invalide')
- **Correction sans aval** : oui
- **Statut** : ouverte

#### `PROP-03` — Un fichier de plus de 10 Mo provoque une erreur HTTP 500 et un message sans rapport avec la cause

- **Attendu** : message « Fichier trop volumineux (10 Mo max) » (le formulaire annonce « 10 Mo maximum »)
- **Observé** : POST renvoie HTTP 500 ; message affiché : « La confirmation n’a pas pu être reçue. Votre saisie est conservée ; rouvrez le dossier pour vérifier le résultat avant de recommencer. » ; aucun diagnostic créé. Un fichier de 9,95 Mio (10 433 329 octets) est accepté.
- **Cause probable** : le message de taille (src/app/actions/parc.ts → deposerFichierGed, TAILLE_MAX_OCTETS=10 Mio dans src/lib/file-type.ts:57) n'est jamais atteint : la requête échoue avant l'action, très probablement à la mise en mémoire tampon du corps par le proxy Next (limite par défaut de 10 Mo, indépendante de serverActions.bodySizeLimit 55mb, next.config.ts:157) — hypothèse à vérifier
- **Correction proposée** : contrôler la taille côté client avant l'envoi (File.size) avec message explicite ; régler proxyClientMaxBodySize ; traduire le 500 en « fichier trop lourd »
- **Preuve (banc)** : captures/s4-07-fichier-12Mo-erreur-vague.png ; sql: diagnostics inchangé (1 ligne active)
- **Correction sans aval** : oui
- **Statut** : ouverte

#### `PROP-07` — Fiche personne : date de naissance future, téléphone « abc » et code postal « 75 » acceptés

- **Attendu** : refus d'une naissance dans le futur, d'un téléphone et d'un code postal mal formés
- **Observé** : les étapes avancent et la fiche est créée : persons.date_naissance='2030-01-01', telephone saisi libre ; l'écran de fiche affiche « né(e) le 01/01/2030 ». Seule la validation native de l'e-mail bloque.
- **Cause probable** : aucun contrôle de plausibilité dans l'assistant de création de fiche (champ date sans max, champs tel/cp sans pattern)
- **Correction proposée** : max=aujourd'hui (et âge majeur pour un locataire), pattern téléphone/code postal côté client et serveur
- **Preuve (banc)** : captures/s6-04-recap-invalide.png ; captures/s6-07-fiche-locataire.png ; SQL select date_naissance from persons (corrigée ensuite à 1990-05-14 par « Modifier la fiche »)
- **Correction sans aval** : oui
- **Statut** : ouverte

#### `PROP-12` — Encaissement à 3 décimales accepté et stocké tel quel : totaux affichés incohérents au centime

- **Attendu** : refus d'un montant à plus de deux décimales (comme le fait l'étape Loyer du bail : « au plus deux décimales ») ou arrondi explicite au centime avant stockage
- **Observé** : encaissements.montant = 12.345 enregistré ; carte « Loyers & paiements » : DÛ 485,16 € · ENCAISSÉ 222,35 € · RESTE DÛ 262,82 € (485,16 − 222,35 = 262,81) ; le texte de la ligne dit « (reste 262,81 €) » ; le reçu est enregistré pour 222.35
- **Cause probable** : l'action d'encaissement ne contrôle que montant > 0 (message « Montant invalide. ») ; la colonne encaissements.montant est numeric sans échelle ; l'affichage arrondit après addition
- **Correction proposée** : refuser les montants avec plus de 2 décimales (client et serveur) et contraindre numeric(12,2)
- **Preuve (banc)** : captures/s8-05-incoherence-reste-du.png ; sql: encaissements 12.345@2026-10-13 (retiré ensuite avec motif)
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : ouverte

#### `PROP-13` — Un encaissement daté dans le futur (01/01/2027) est accepté et compté comme déjà reçu

- **Attendu** : refus (ou alerte) d'une date de paiement postérieure à aujourd'hui ; le paiement non encore reçu ne doit pas couvrir l'appel
- **Observé** : encaissement créé ; « couvert 222,35 € » inclut les 10 € ; la liste affiche « 10,00 € 01/01/2027 Virement » ; le bloc ENCAISSÉ le compte aujourd'hui
- **Cause probable** : aucun contrôle de borne sur date_paiement (champ date sans max, action sans contrôle)
- **Correction proposée** : max = aujourd'hui (fuseau Paris) côté client et serveur
- **Preuve (banc)** : captures/s8-05-incoherence-reste-du.png
- **Correction sans aval** : oui
- **Statut** : ouverte

#### `PROP-14` — Entrée en cours de mois : le premier terme (prorata) est exigible le 1er du mois, avant l'entrée, et passe tout de suite en « Impayé »

- **Attendu** : première échéance au plus tôt à la date d'entrée (16/10/2026) : pas d'impayé avant le début du bail ni de relance possible
- **Observé** : appels_loyer : période 2026-10-01, loyer 438.71, charges 46.45, total 485.16 (prorata correct), date_echeance = 2026-10-01 (15 jours avant l'entrée) ; l'écran affiche « Impayé » et « impayé en cours » avant tout paiement ; le bloc Relances est actif
- **Cause probable** : supabase/migrations/20260927102000_appels_terme_echu.sql (generer_appels_loyer_interne) : date_echeance = début de mois + jour_echeance − 1, sans max(date_debut)
- **Correction proposée** : date_echeance = greatest(date_echeance calculée, date_debut) pour le premier terme
- **Preuve (banc)** : captures/s8-03-echeancier.png ; sql: select periode,date_echeance from appels_loyer
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : ouverte

#### `FIN-07` — Le filtre par mot-clé « fonds travaux / alur » écarte la pièce avant de consulter la qualification justifiée du propriétaire : une dépense qualifiée « déductible 224 » reste exclue des charges et la…

- **Observé** : Le propriétaire saisit « Appel de fonds travaux ravalement 2026 » (800 €, travaux votés payés dans l'année), la qualifie « Dépense déductible vérifiée », rubrique 224, justification « facture approuvée en assemblée ». La base accepte et versionne la qualification (audit_log inclus) ; le récapitulatif compte 224 = 0 et 800 € dans « Fonds travaux ALUR — à part » (« ne sont pas comptés dans les charges »). Aucun message n'explique que son choix est ignoré, et le libellé du journal étant immuable, seul un contournement par contre-écriture et ressaisie sous un autre libellé est possible. Contredit le principe posé en tête du fichier : « seuls les faits figés et choix justifiés chiffrent les tota…
- **Cause probable** : app/src/lib/fiscal.ts:60 (test estFondsTravauxAlur avant la lecture de la qualification), 22 (regex)
- **Correction proposée** : Ne mettre à part que les pièces sans qualification (ou ajouter une nature « fonds_travaux_alur » qualifiable) et laisser une qualification « deductible » l'emporter ; resserrer l'expression (« fonds (de )?travaux.*alur » ou « fonds alur ») pour ne plus attraper « appel de fonds travaux ».
- **Preuve (banc)** : preuves/relecture/finance/ts/t6.mts (224 = 0 et fondsTravauxAlur = 800 pour « Appel de fonds travaux… » et « Cotisation fonds de travaux » malgré la qualification ; « travaux plomberie » donne 224 = 800)
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `-- Lecture seule : dépenses au libellé « fonds travaux / alur » et leur qualification éventuelle. select e.organization_id, e.id, e.date_piece, e.categorie, e.montant, q.nature, q.rubrique, q.version from public.ecritures e left join lateral (select * from public.fiscal_qualifications_ecritures x where x.ecriture_id=e.id order by version desc limit 1) q on true where e.sens='depense' and e.contre_ecriture_de is null and lower(e.categorie) ~ 'fonds (de )?travaux\|fonds alur\|alur' order by e.organization_id, e.date_piece;`
- **Statut** : ouverte

#### `FIN-11` — Les migrations ne rétro-capturent aucun loyer existant et la reprise « retrouver_ventilation_fiscale » refuse tout bail qui a plus d'un appel : sur les données réelles déjà en production, le récapitu…

- **Observé** : Bail régulier, trois appels de 840 € (780 + 60) et trois paiements de 840 € antérieurs à la migration : la fonction répond trois fois « Plusieurs échéances ou aucune échéance : la ventilation doit être justifiée », 0 capture. Avec exigerPerimetre, le récapitulatif ne compte rien tant que l'exercice du lot n'est pas confirmé, puis refuse chaque loyer ancien (« attendent leur ventilation historique ») tant qu'il n'a pas reçu une qualification justifiée (nature, lot, parts HC et charges, justification, case de confirmation) : une pièce par mois et par lot. Le comportement précédent (ventilation au prorata du bail) affichait des totaux. Le choix de « ne rien réécrire » est assumé dans les comme…
- **Cause probable** : app/supabase/migrations/20261012224000_fiscalite_historique_qualifiee.sql et app/src/lib/fiscal.ts:migration 56-97 (capture seulement à l'INSERT), 155-183 (reprise limitée à un seul appel) ; fiscal.ts 54-60 et 76-84
- **Correction proposée** : Offrir une reprise explicite par lot (action unique, auditée, non silencieuse) pour les baux dont les appels sont cohérents (montant_du = loyer_hc + charges), dont chaque paiement s'impute sans avance sur les appels existants, et qui n'ont ni annulation ni anomalie ; la même règle FIFO que le déclencheur peut être rejouée en SQL sur les paiements existants dans l'ordre (created_at, id). Annoncer dans l'interface le nombre de pièces à qualifier.
- **Preuve (banc)** : preuves/relecture/finance/sql/t14_historique_reel.sql (sortie : sql/t14_sortie.txt : trois refus, 0 capture ; état d'avant-migration simulé par session_replication_role=replica dans une transaction annulée) ; ts/t2.mts pour le contraste avec l'ancien calcul
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `-- Lecture seule : combien de loyers existants sont sans capture, par organisation (c'est le nombre de pièces à qualifier à la main). select e.organization_id, count(*) filter (where c.ecriture_id is null) as loyers_sans_capture, count(*) as loyers_total, min(e.date_piece) premiere, max(e.date_piece) derniere from public.ecritures e left join public.fiscal_encaissements_composantes c on c.ecriture_id=e.id where e.categorie='loyer' and e.sens='recette' and e.contre_ecriture_de is null group by 1 order by 2 desc;`
- **Statut** : ouverte

#### `REP-01` — contre_proposer_creneaux n'est pas rejouable : un second envoi (reponse perdue, double envoi) marque comme REFUSEES les propositions du locataire lui-meme, porte le compteur a 6 et declenche une aler…

- **Observé** : Le locataire (bail actif, mission 'acceptee', 3 creneaux de l'artisan en attente) envoie ses 3 disponibilites ; la reponse reseau se perd (la page n'affiche pas le succes) et il renvoie le meme formulaire - ou double envoi. Le 2e appel passe (la mission est toujours 'acceptee', aucune garde 'mes propositions sont deja en attente') : l'UPDATE vise TOUS les creneaux statut='propose', y compris ceux proposes par le locataire au 1er appel -> 3 'refuse/locataire' + 3 'refuse/artisan' = 6 refus (RM-10.4.1) alors que le locataire n'a refuse que 3 creneaux. Consequences observees : (a) alerte 'creneaux_arbitrage' de criticite 'critique' ouverte pour le gerant ('6 creneaux refuses : reglez le rendez…
- **Cause probable** : app/supabase/migrations/20261012190000_validation_creneaux.sql:111-190 (contre_proposer_creneaux : update ... set statut='refuse' where intervention_id=... and statut='propose', l.~163-166 de la fonction)
- **Correction proposée** : Dans contre_proposer_creneaux : (1) refuser si le locataire a deja des propositions en attente : 'if exists (select 1 from intervention_creneaux where intervention_id=p_intervention and statut='propose' and propose_par='locataire' and debut>now()) then raise exception 'Vos disponibilites sont deja transmises ...'' ; (2) limiter l'UPDATE a propose_par='artisan' ; (3) idempotence applicative : transmettre une cle de tentative (comme declarer_mon_incident_reprise) pour rejouer sans effet. Test de non-regression : appeler 2 fois avec les memes dates et verifier 1 seul tour locataire et 0 alerte.
- **Preuve (banc)** : preuves/relecture/reprises/t11-contre-proposition.sortie.txt et t11b-suite.sortie.txt (scripts ts/t11-contre-proposition.mjs, ts/t11b-suite.mjs) : apres 1 envoi {propose/locataire:3, refuse/artisan:3, alertes:0} ; apres rejeu {propose/locataire:3, refuse/artisan:3, refuse/locataire:3, alertes:1} ; 2 envois simultanes : meme etat final (alerte:1) ; evenements refuses_cumules 3 puis 6 ; proposer_creneaux ensuite : 'Six creneaux ont deja ete refuses'
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `select a.intervention_id, a.tour as tour_locataire_refuse, min(b.tour) as tour_locataire_suivant, (select count(*) from public.intervention_creneaux r where r.intervention_id=a.intervention_id and r.statut='refuse') as refus_cumules, exists (select 1 from public.alerts al where al.type='creneaux_arbitrage' and al.details->>'intervention_id'=a.intervention_id::text) as alerte_arbitrage from public.intervention_creneaux a join public.intervention_creneaux b on b.intervention_id=a.intervention_id and b.propose_par='locataire' and b.tour>a.tour where a.propose_par='locataire' and a.statut='refuse…`
- **Statut** : ouverte

#### `SUP-01` — L'arret d'urgence (global ou par mission) ne couvre pas les 8 taches SQL planifiees par pg_cron : seules les routes Next/Vercel appellent verifier_arret_supervision.

- **Observé** : La supervision enregistre un arret 'global' (ou 'purge', 'quittances', 'appels'). verifier_arret_supervision(...) renvoie false pour les 13 cles, les routes /api/cron/* s'arretent. Mais pg_cron continue : retention-quotidienne (appliquer_retention : DELETE sur tech_log, audit_log, demandes_devis, intentions_conge, demandes_signature, purge/anonymisation de documents), cycle-mensuel (generation des appels de loyer et quittances), alertes-*, propositions-publication-hebdo.
- **Cause probable** : verifier_arret_supervision exige auth.role()='service_role' ou un superviseur ; pg_cron s'exécute sans JWT, donc les fonctions planifiées (appliquer_retention, cycle_mensuel_interne, generer_alertes_*, proposer_publications_interne) ne l'appellent pas.
- **Correction proposée** : Ajouter un prédicat interne (sans exigence de JWT) lu en tête de chaque fonction planifiée par pg_cron, ou documenter dans l'écran de relais que l'arrêt ne couvre pas les 8 tâches SQL. Décision métier requise.
- **Preuve (banc)** : preuves/relecture/supervision/20-arret-pgcron.sortie.txt (arret global actif ; appliquer_retention() appelee en contexte cron supprime la ligne de test : avant=1, apres=0) + requete pg_proc : seules 4 fonctions referencent supervision_arrets/verifier_arret_supervision (commander_, executer_tache_consigne, traiter_vacances, verifier_).
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `select jobname, schedule, command from cron.job where active order by jobname; select cle, arrete, motif, modifie_le from public.supervision_arrets where arrete;`
- **Statut** : ouverte

#### `SUP-02` — Pendant une session de diagnostic artisan ouverte (30 min), le trigger de lecture seule est pose sur TOUTES les tables de public, y compris supervision_arrets / supervision_operations : l'arret d'urg…

- **Observé** : Un super-administrateur ouvre un diagnostic sur un artisan, puis doit declencher l'arret d'urgence : commander_arret_supervision echoue avec 'Diagnostic artisan en lecture seule : aucune modification autorisee' (message affiche tel quel par l'ecran, sans dire qu'il faut quitter la session). L'arret redevient possible apres fermer_session_artisan().
- **Cause probable** : 20261012222100:poser_gardes_diagnostic_artisan exclut seulement supervision_sessions_artisan et audit_log ; supervision_arrets, supervision_operations, supervision_vacances, supervision_alertes_internes, supervision_consignes* reçoivent le trigger refuser_mutation_diagnostic_artisan.
- **Correction proposée** : Ajouter les tables supervision_* à la liste d'exclusion (l'arrêt d'urgence ne doit jamais dépendre de l'état d'une session de diagnostic) puis rejouer poser_gardes_diagnostic_artisan() ; à défaut, faire fermer la session par commander_arret_supervision et préciser le message d'erreur.
- **Preuve (banc)** : preuves/relecture/supervision/21-arret-pendant-diagnostic.sortie.txt
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `select count(*) from public.supervision_sessions_artisan where fermee_le is null and expire_le>now(); -- sessions pendant lesquelles un arrêt d'urgence serait refusé`
- **Statut** : ouverte

#### `SUP-05` — Les « faits de direction » copient, pour toutes les organisations, des données personnelles (titres d'alertes contenant le nom du locataire, ex. « État des lieux d'entrée — Lot 1 · Marie Durand ») da…

- **Observé** : Un superviseur clique « Préparer le point maintenant » : preparer_faits_direction lit alerts.titre de toutes les organisations et stocke la copie dans sources->echeances->donnees->faits (jusqu'à 20 faits x 5 sources par clic, un instantané par clic, conservé indéfiniment). Delta audit_log = 0 et supervision_operations = 0 pour l'appel SQL ; côté TypeScript une seule ligne générique point_du_matin_prepare (sans organisation, écrite après coup et non transactionnelle). La lecture de l'écran /admin/brief (lire_faits_direction) n'est jamais tracée. Écart à la règle documentée « traversée par le Super Admin autorisée mais journalisée » (wiki/regles-metier/Isolation multi-organisation.md, RM-A1.1…
- **Cause probable** : 20261012222000 : collecter_source_direction('echeances') renvoie le titre brut ; aucune écriture log_sa_access ; aucune clause de rétention dans appliquer_retention().
- **Correction proposée** : Ne stocker que des identifiants et libellés génériques (type d'alerte + href) au lieu de alerts.titre ; journaliser via log_sa_access(org,'consultation_faits_direction') pour chaque organisation citée ou une ligne d'audit par préparation dans la même transaction ; ajouter une purge à 90 jours dans appliquer_retention().
- **Preuve (banc)** : preuves/relecture/supervision/94-faits-donnees-personnelles-trace.sortie.txt (delta journaux 0/0, nom présent dans la copie durable, 0 fonction de rétention citant la table)
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `select count(*) nb, min(jour), max(jour), pg_size_pretty(pg_total_relation_size('public.brief_direction_snapshots')) taille from public.brief_direction_snapshots; -- puis, pour voir si des noms y figurent : select jour, jsonb_path_query_array(sources,'$.echeances.donnees.faits[*].titre') from public.brief_direction_snapshots order by genere_le desc limit 3;`
- **Statut** : ouverte

#### `MKT-01` — La préparation du soir du marketing n'a jamais été déclenchée par pg_cron : pas de fenêtre de veto la veille, seul le rattrapage de la matinée préparait les posts

- **Attendu** : à 18 h (Paris) la veille d'un jour de publication, pg_cron juge la préparation due et déclenche /api/cron/equipes?mission=marketing
- **Observé** : cible_preparation_marketing() filtrait sur auth.role() = 'service_role' ; pg_cron appelle declencher_marketing() avec le rôle de la base, sans jeton JWT : auth.role() est nul, aucune ligne, préparation jamais due. Seule la diffusion (requête directe sur publications) partait. Un seul appel pg_net en production depuis le 7/10 (09/10, rattrapage).
- **Cause probable** : supabase/migrations/20261007100000_marketing_fenetre_de_veto.sql (cible_preparation_marketing, garde auth.role())
- **Correction proposée** : migration 20261013110000 : version interne sans garde, fermée à tous les rôles ; la version publique garde sa garde service_role ; aucun droit élargi
- **Preuve (banc)** : tests/marketing-veto.test.ts (deux tests rouges sur le schéma d'avant, verts après) ; cron.job_run_details en production (lecture seule) : 1 097 exécutions réussies, une seule requête pg_net
- **Correction sans aval** : oui
- **Statut** : corrigée en branche — commit 9d5ed9d ; migration 20261013110000 à appliquer en production

#### `PUB-01` — Le formulaire « Agences » de l'accueil était le seul canal de contact des pages légales (exercice des droits sur les données) tant que l'adresse de l'éditeur manque ; il restait une demande de devis…

- **Attendu** : un canal de contact général, indépendant de l'offre agence, vers lequel renvoient les pages légales
- **Observé** : FORMULAIRE_ACCUEIL = /#agences ; formulaire à champs « Votre agence » et « lots en gestion » ; relevé déjà fait le 24/09 (lib/editeur.ts). Le retrait des agences du site public aurait supprimé ce canal.
- **Correction proposée** : formulaire de contact général (ancre #contact, message obligatoire), pages légales renvoyées vers lui ; l'adresse e-mail de l'éditeur reste à fournir (src/lib/editeur.ts)
- **Preuve (banc)** : app/src/lib/editeur.ts, app/src/components/coquille-legale.tsx, app/src/app/page.tsx (avant correction)
- **Correction sans aval** : oui
- **Statut** : corrigée en branche — commit e7982a7

#### `PROP-BANC-01` — Banc : serveur :3100 démarré sans SUPABASE_SERVICE_ROLE_KEY (inscription et liens bloqués)

- **Attendu** : compte créé et espace ouvert (comme en première passe)
- **Observé** : /api/sante = 503 {motif: 'SUPABASE_SERVICE_ROLE_KEY absente.'} ; inscription valide = « Inscription impossible : L’envoi des liens de connexion n’est pas configuré. Contactez l’administrateur. »
- **Cause probable** : environnement du processus 3100 (hors produit) ; lib/supabase/service.ts:30-33 renvoie null sans la clé
- **Correction proposée** : relancer le serveur du banc avec la clé de service (hors périmètre de ce rôle)
- **Preuve (banc)** : sql/api-sante.txt ; captures/s1-12-espace-ouvert-bureau.png (état dégradé)
- **Correction sans aval** : oui
- **Statut** : acceptée — défaut du banc d'essai, pas du produit ; banc-up.sh vérifie la clé de service

## P3 — cosmétique ou mineur (33)

| ID | Source | Anomalie | Statut |
|---|---|---|---|
| `AUD-A-05` | auditeur/a | Écart documentation/code : la piste d'audit générique documentée n'existe pas | ouverte |
| `AUD-A-06` | auditeur/a | Insertion anonyme directe dans demandes_devis sans limite de débit | ouverte |
| `PROP-04` | proprietaire/s01 | Surface démesurée : message technique « numeric field overflow » affiché à l'utilisateur | ouverte |
| `PROP-05` | proprietaire/s01 | Nom d'espace sans élision : « Parc de Éloïse … » | ouverte |
| `PROP-08` | proprietaire/s01 | Recherche globale (⌘K) insensible à la casse mais pas aux accents ; code postal non recherchable | ouverte |
| `PROP-09` | proprietaire/s01 | Libellés d'agence ou de permission dans l'espace propriétaire direct | ouverte |
| `PROP-10` | proprietaire/s01 | Message serveur de la clé de répartition avec point décimal : « fait 99.99 » | ouverte |
| `PROP-11` | proprietaire/s01 | Un même PDF ne peut pas être déposé pour deux lots (DPE collectif) et la consigne n'est pas réalisable depuis le formulaire | ouverte |
| `PROP-16` | proprietaire/s01 | Hypothèse à vérifier : aucune cohérence contrôlée entre loyer, loyer de référence et loyer de référence majoré | ouverte |
| `FIN-02` | relecture/finance | Sur une organisation dont l'abonnement est suspendu, « Encaisser » répond « Accès refusé. » au lieu du message d'abonnement suspendu renvoyé par toutes les autres écritures. | ouverte |
| `FIN-03` | relecture/finance | Aucune contrainte de centime sur encaissements.montant / ecritures.montant : un paiement à 3 décimales est capturé avec un écart de 0,005 et ne peut plus jamais être qualifié (les parts doivent réconcilier exactement un montant que deux décimales ne peuvent p… | ouverte |
| `FIN-04` | relecture/finance | La régularisation 230 reste exigée (et est réintégrée si saisie) pour les lots passés en meublé ou hors périmètre, alors que leurs pièces sont exclues de la 2044. | ouverte |
| `FIN-05` | relecture/finance | « Montant net à qualifier » additionne recettes et dépenses non qualifiées en valeurs positives : ce n'est pas un net. | ouverte |
| `FIN-06` | relecture/finance | « Retrouver la ventilation historique » annonce un succès sans rien changer quand la pièce a déjà une capture avec une part non ventilée (avance). | ouverte |
| `FIN-08` | relecture/finance | Toute dépense qualifiée « Hors revenus fonciers » est présentée au propriétaire comme de la taxe d'enlèvement des ordures ménagères, et toute recette « hors 2044 » comme des provisions de charges encaissées. | ouverte |
| `FIN-09` | relecture/finance | La capture fiscale calcule « déjà encaissé avant » en sommant tous les AUTRES encaissements du bail présents en fin d'ordre : un INSERT à plusieurs lignes pour un même bail répartit faux (hypothèse : aucun chemin actuel de l'application n'insère plusieurs pai… | ouverte |
| `FIN-10` | relecture/finance | Le wiki métier n'a pas été mis à jour : il décrit encore la ligne 229 comme « part non récupérable seulement, postes récupérables retirés lot par lot », alors que le code ne retire plus rien (coproRecuperableExclue vaut toujours 0) et traite la réintégration… *(hyp.)* | ouverte |
| `FIN-12` | relecture/finance | Hypothèse à vérifier : les lectures de qualifications, de captures et d'écritures n'ont ni filtre d'année (captures, qualifications) ni garde contre la limite de 1 000 lignes de l'API, alors que d'autres écrans du dépôt la connaissent (« trop de lignes »). *(hyp.)* | ouverte |
| `FIN-13` | relecture/finance | Hypothèse à vérifier : l'encaissement en un clic prend la date par défaut de la base (current_date, fuseau UTC), pas la date de Paris ; entre 00 h 00 et 01 h 59 (heure de Paris) un règlement est daté de la veille, y compris le 31 décembre pour un 1er janvier. *(hyp.)* | ouverte |
| `REP-02` | relecture/reprises | Le courriel d'urgence au gestionnaire n'est envoye qu'a la premiere execution : si la premiere tentative a cree l'incident puis s'est arretee avant l'e-mail, la reprise (rejoue:true) ne l'envoie jamais *(hyp.)* | ouverte |
| `REP-03` | relecture/reprises | Clients externes (module desactive en production) : apres un refus de validation, le meme justificatif ne peut plus etre remplace par un autre fichier de meme type tant que le formulaire n'est pas recharge, et un devis re-genere ne peut pas etre redepose *(hyp.)* | ouverte |
| `REP-04` | relecture/reprises | choisir_creneau et accepter_creneau_locataire ne sont pas rejouables : une reponse perdue suivie d'un nouvel envoi affiche une erreur alors que le rendez-vous est confirme | ouverte |
| `REP-05` | relecture/reprises | Ecart au wiki : l'expiration J+30 et le refus trace sont livres, mais les relances J+3 / J+10 prevues par le module 16 n'existent nulle part | ouverte |
| `SUP-03` | relecture/supervision | N'importe quel super-administrateur permanent peut accuser réception d'une alerte de relais adressée à un autre responsable : la fonction ne compare pas auth.uid() au destinataire (message d'erreur annonce pourtant « Responsable habilité requis »), et l'écran… | ouverte |
| `SUP-04` | relecture/supervision | Pas de séparation des rôles pour une consigne : le même superviseur peut la rédiger, se désigner responsable et l'approuver (alors que enregistrer_vacances impose « un autre responsable »). L'« approbation » n'est donc pas une double vérification humaine. | ouverte |
| `SUP-06` | relecture/supervision | Ces trois lectures font db.from('accounts').select('id,email') sans filtre puis filtrent en JavaScript : au-delà de la limite de lignes de l'API (1 000 par défaut chez Supabase), la liste des responsables habilités et les noms des destinataires sont tronqués… *(hyp.)* | ouverte |
| `SUP-07` | relecture/supervision | Le périmètre d'arrêt « Sauvegarde » est proposé au superviseur et accepté par la base, mais aucun code (workflow GitHub de sauvegarde, scripts app/scripts/sauvegarde/*) ne lit verifier_arret_supervision('sauvegarde') : l'arrêt n'arrête rien. *(hyp.)* | ouverte |
| `SUP-08` | relecture/supervision | Quand le responsable désigné perd son habilitation, traiter_vacances passe TOUTES les alertes non accusées du plan en « non_acheminee », y compris celles déjà escaladées vers le créateur (qui, lui, est habilité) ; elles ne peuvent alors plus escalader (l'esca… | ouverte |
| `SUP-09` | relecture/supervision | Chaque validation d'un devis téléverse un nouveau PDF (chemin aléatoire) dans le compartiment devis-preparations et n'efface jamais l'ancien (ni celui d'une validation perdante en cas de conflit 409) : des PDF orphelins contenant les coordonnées de l'entrepri… *(hyp.)* | ouverte |
| `PUB-02` | coordinateur | Offre agence présentée au public alors que les agences sont hors périmètre V1 publique : accueil (repères, espaces, bandeau tarif, FAQ), tarifs, connexion, inscription artisan, choix d'espace, pied de page, métadonnées, deux sujets éditoriaux | corrigée en branche — commit e7982a7 |
| `PROP-06` | proprietaire/s01 | La page /connexion présente encore l'offre agence alors que les agences sont hors V1 publique | corrigée en branche — commit e7982a7 (/connexion sans offre agence) |
| `EDI-01` | coordinateur | La ligne éditoriale de la veille accepte « agence » comme public valide (PUBLICS_JOURNAL) : un article visant seulement les agences passerait le filtre de pertinence en V1 | à trancher — ligne éditoriale |
| `PUB-03` | coordinateur | Les textes juridiques (conditions générales, mentions légales, confidentialité) décrivent encore l'offre et la tarification agence | à trancher — textes juridiques non modifiés |

---

Voir aussi : [[Audit d'acquisition du 3 octobre 2026]], [[Design system Gerimmo]].
