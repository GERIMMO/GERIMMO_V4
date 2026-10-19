# Retours arrière des migrations du 13 au 19 octobre 2026

Ce dossier **n'est pas** un dossier de migrations. Aucun chantier ne le lit : `migrations.yml` se place dans
`app/supabase/migrations/` et n'applique que les fichiers qu'on lui nomme (aucune occurrence de `retours-arriere` dans
`.github/workflows/`). Ces scripts se jouent **à la main**, après décision du dirigeant, une fois, et se consignent.

| Fichier | Défait | Objets touchés |
|---|---|---|
| `20261019120000_liste_attente_bornee.retour.sql` | `20261019120000_liste_attente_bornee.sql` (lot M2, audit du 19/10 : table `public.liste_attente` créée hors dépôt le 29/09, version `20260929200141` sans fichier au dépôt, intégrée et bornée) | **Préparé et vérifié localement le 19/10, non exécuté en production.** Retire les trois contraintes de borne (`liste_attente_email_borne`, `liste_attente_biens_borne`, `liste_attente_source_borne`), l'index unique `liste_attente_email_lower_idx` sur `lower(email)`, le plafond d'insertion (déclencheur `liste_attente_limiter`, fonction `public.liste_attente_limiter()` — la seule fonction créée par la migration, absente de production au relevé du 19/10 —, index `liste_attente_recent_idx`), le commentaire de table et sa seule version d'historique ; rend à `authenticated` ses droits de table hérités (sans politique : inopérants sous RLS). **Ne supprime ni la table ni ses lignes** (elle précède la migration en production) ; conserve la clé primaire, `liste_attente_email_key`, `liste_attente_email_format`, la RLS, la politique « inscription anonyme », le droit d'insertion par colonne de `anon` (email, biens, source) et le déclencheur `diagnostic_artisan_lecture`. Aucune donnée lue ni modifiée ; aucune autre fonction touchée. Transaction externe (`psql --single-transaction -v ON_ERROR_STOP=1 -f`), comme `20261018231827`. Indépendant de la chaîne du jour de Paris. Réintroduit : insertion anonyme sans borne de longueur ni plafond horaire (30 inscriptions par heure glissante) et doublon à casse différente accepté. Avant d'appliquer la migration (CHECK validés à la pose) : vérifier en production `select count(*) from public.liste_attente` et `select lower(email), count(*) from public.liste_attente group by 1 having count(*) > 1` (relevé du 19/10 : 0 ligne, aucun doublon). Preuve : `tests/liste-attente-base.test.ts` (rôles, bornes, blancs Unicode, doublon, plafond, catalogue, rejeu, retour, réapplication). |
| `20261019121000_droits_anon_contact_articles_et_prospects.retour.sql` | `20261019121000_droits_anon_contact_articles_et_prospects.sql` (audit du 19/10, lot mineurs, f et i) | **Préparé et vérifié localement le 19/10, non exécuté en production.** Rend à `anon` la lecture de la table entière de `publications` (droits par colonne retirés) et de `demandes_devis` (état antérieur, droit sans usage compris) ; remet sans action référentielle la clé `supervision_prospects.demande_id → demandes_devis` et rétablit le déclencheur `supervision_tracer_modification()` d'origine (20261018061548). Décision Q2 du 19/10 (retour au plan) : la migration ne touche ni les clés vers les comptes (responsable, auteur ; auteur du registre) ni l'obligation d'auteur, et son chemin « système » (révision inchangée, sans session ou déclencheur imbriqué — l'action référentielle, y compris sous la session du super admin qui lance la purge) n'écrit rien au registre : **ce retour est toujours jouable**, aucune ligne sans auteur n'existant jamais. Retire sa seule ligne d'historique ; gère sa propre transaction, attente de verrou bornée à dix secondes (comme la migration). Aucune donnée touchée. Preuves : `tests/publications-colonnes-anon.test.ts` (colonnes, rôle anon, rejeu, retour, réapplication), `tests/supervision-prospects-purge.test.ts` (purge sans session et sous session super admin, clés vers les comptes inchangées, règle de version, rejeu, retour, retour après purge). |
| `20261019120500_relance_abonnement_periodicite.retour.sql` | `20261019120500_relance_abonnement_periodicite.sql` (audit du 19/10, lot mineurs, a ; version `120500` : `120000` est prise par la liste d'attente d'un autre lot) | **Préparé et vérifié localement le 19/10, non exécuté en production.** Recrée `abonnements_a_relancer(integer)` avec ses huit colonnes d'origine (texte de production du 19/10, au jour de Paris : 4 `aujourdhui_paris()`, 0 `current_date`), droits identiques (service_role seul), retire sa seule ligne d'historique. Aucune donnée touchée. **Remettre le code applicatif précédent avant** (`lib/relances-paiement.ts` lit `periodicite` et `montant_periode_cents` ; la migration ne replie sur le montant mensuel qu'un abonnement mensuel, un annuel sans montant de période rend NULL). **À jouer AVANT** le retour de `20261018231827`, qui réécrit cette fonction par compte exact. Attente de verrou bornée à dix secondes (comme la migration). Preuves : `tests/relance-paiement.test.ts` (colonnes, annuel sans montant de période, droits), `tests/abonnement-jour-paris-migration.test.ts` (compte exact conservé), `tests/jour-de-paris-suite-migrations-rejeu.test.ts` (chaîne complète). |
| `20261019122000_relais_point_demandes_contact.retour.sql` | `20261019122000_relais_point_demandes_contact.sql` (M16, audit du 19/10 : demandes de contact du site vitrine comptées dans l'e-mail de 5 h) | **Préparé et vérifié localement le 19/10, non exécuté en production.** Supprime la seule fonction ajoutée (`demandes_contact_en_attente`, qui n'existait pas en production le 19/10 : aucune définition antérieure à restaurer) et retire sa seule version d'historique, dans la transaction contrôlée (`psql --single-transaction`), avec attente de verrou bornée (`lock_timeout` 10 s). Aucune donnée, aucune table, aucune politique, aucune tâche touchée. **Remettre d'abord le code précédent** (`relais-alerte-envoi.ts`) : sinon chaque passage de 5 h compte un contrôle impossible et fait partir un e-mail par jour. Preuve : `tests/relais-demandes-contact-base.test.ts` (comptage, 48 h, demande traitée, droits, rejeu). |
| `20261019123000_identite_editeur_prestataires.retour.sql` | `20261019123000_identite_editeur_prestataires.sql` (lot « pages légales », 19/10 : localisation de la Base Adresse Nationale et coordonnées des prestataires dans `supervision_identite`) | **Préparé et vérifié localement le 19/10, non exécuté en production.** Repose les deux contraintes d'origine de `supervision_identite` (`identite_champs_connus` : les treize clés du 18/10 ; `supervision_identite_valeurs_check` : moins de 20 000 octets), retire les douze clés nouvelles si elles sont vides (révision + 1, `modifie_le` posé ; le déclencheur de traçage est suspendu le temps de cette seule instruction : une session de maintenance n'a pas d'auteur, que `supervision_registre` exige), **refuse sans rien modifier** si l'une d'elles porte une valeur saisie (décision du dirigeant requise) ; refuse aussi, en nommant le poids, si les treize faits d'éditeur pèsent à eux seuls 20 000 octets ou plus (admis depuis la migration : la borne d'origine ne pourrait pas être reposée, les raccourcir revient au dirigeant), retire sa ligne d'historique. Aucun droit, aucune fonction, aucune autre donnée. Transaction externe (`psql --single-transaction -v ON_ERROR_STOP=1`), en tête de la chaîne « Ordre complet ». **Remettre le code d'avant AVANT** : le nouveau formulaire écrit vingt-cinq clés et serait refusé au premier enregistrement. Preuves : `tests/identite-prestataires-migration-rejeu.test.ts` (clés admises, clé inconnue refusée, borne, rejeu, retour refusé — valeur saisie, poids des treize faits — puis accepté, réapplication) et la chaîne complète de `tests/jour-de-paris-suite-migrations-rejeu.test.ts`. |
| `20261016210000_retour_adresse_confirmee.retour.sql` | `20261016210000_retour_adresse_confirmee.sql` (T7, compatibilité) | **Préparé localement le 16/10, non exécuté en production.** Retire la RPC de lecture du contexte de changement d'adresse et uniquement sa version d'historique, dans sa propre transaction avec attente de verrou bornée. Aucun compte ni flux Auth modifié. Remettre le code applicatif précédent avant ce retour ; le modèle Supabase reste inchangé. Preuve : `tests/retour-adresse-confirmee-migration.test.ts` (droits, garde, retour et rejeu). |
| `20261016200000_jour_paris_complements.retour.sql` | `20261016200000_jour_paris_complements.sql` (Q3) | **Préparé et vérifié localement le 16/10, non exécuté en production.** Rétablit le jour de session dans 5 fonctions et les défauts de `factures_honoraires.emise_le`, `appels_charges.date_reception`, `cles_repartition.date_effet` ; aucune date enregistrée ni aucun montant modifié, droits conservés. Retire sa ligne d'historique. À jouer avant `20261014500000`. Preuve : `tests/jour-paris-complements-oct16.test.ts` (4 tests : état, bascule, retour/rejeu/droits, divergence). |
| `20261016190000_relance_report_reprise_sans_envoi.retour.sql` | `20261016190000_relance_report_reprise_sans_envoi.sql` (T9, reprise) | **Préparé et vérifié localement le 16/10, non exécuté en production.** Retire sa seule version d’historique dans la transaction contrôlée ; réapplication du fichier nommé testée (`tests/retours-oct16-registre.test.ts`). Retire la RPC de restitution d'une réservation de relance et restaure la réservation durable antérieure ; conserve la colonne UUID et les tentatives déjà enregistrées. À jouer avant `20261016110100`, avec le code de relance précédent. Preuves : `tests/devis-rdv-complements-rejeu.test.ts`, `tests/rdv-relance-concurrence-oct16.test.ts` (5 tests : rejeu, retour, droits, concurrence réelle et identifiant périmé). |
| `20261016180000_relais_retention_sentinelle.retour.sql` | `20261016180000_relais_retention_sentinelle.sql` (T12) | **Préparé et vérifié localement le 16/10, non exécuté en production.** Retire sa seule version d’historique dans la transaction contrôlée ; réapplication du fichier nommé testée (`tests/retours-oct16-registre.test.ts`). Rétablit les définitions antérieures de sentinelle/réservation/prise des urgences, retire le raccord et la fonction de purge du journal cron ; conserve la règle du catalogue, inactive de fait sans raccord. Ne restitue aucune ligne déjà purgée, ne reprogramme aucune tâche. À jouer avant les retours historiques du relais. Preuve : `tests/relais-retention-sentinelle-oct16.test.ts` (14 tests incluant rétention, droits, tâches désactivées et retour/rejeu). |
| `20261016172453_traversee_lecture_seule.retour.sql` | `20261016172453_traversee_lecture_seule.sql` (T10) | **Préparé et vérifié localement le 16/10, non exécuté en production.** Retire gardes et RPC de geste de support, restaure les définitions antérieures ciblées et leur raccord de rétention ; conserve les journaux et le registre privé de preuve. Retire sa ligne d'historique. Réintroduit les anciens droits de traversée : remettre le code correspondant avant ce retour. Gère sa propre transaction, comme le retour de confirmation Auth. Preuve : `tests/traversee-lecture-seule-base.test.ts`, retour/rejeu et droits sur base fictive. |
| `20261016150000_confirmation_auth.retour.sql` | `20261016150000_confirmation_auth.sql` (T4) | **Préparé localement le 16/10, non exécuté en production.** Retire `autoriser_confirmation_auth`, la table temporaire de comptage `tentatives_confirmation_auth` (compteurs effacés) et sa seule version d’historique dans sa propre transaction ; refuse un lot déjà ouvert et borne l’attente des verrous à dix secondes. Aucun compte ni jeton utilisateur supprimé. Remettre d’abord le code de confirmation antérieur. Preuves : `tests/confirmation-auth-migration-rejeu.test.ts` (retour, registre, réapplication et garde), `tests/jour-de-paris-suite-migrations-rejeu.test.ts` (chaîne complète), `tests/inscription-confirmation.test.ts` (comportement). |
| `20261016110100_rdv_relance_accuse_agenda.retour.sql` | `20261016110100_rdv_relance_accuse_agenda.sql` (T9) | **Préparé et vérifié localement le 16/10, non exécuté en production.** Retire sa seule version d’historique dans la transaction contrôlée ; réapplication du fichier nommé testée (`tests/retours-oct16-registre.test.ts`). Retire RPC de relance et de prise d'acte, rétablit le contrat de lecture artisan antérieur ; conserve les demandes et tous leurs marqueurs. À jouer après `20261016190000` et avant un éventuel retour D22 initial, avec le code précédent. Preuve : `tests/devis-rdv-complements-rejeu.test.ts` (définitions, droits, retour et réapplication). |
| `20261016110000_devis_pdf_versions_alerte.retour.sql` | `20261016110000_devis_pdf_versions_alerte.sql` (T8) | **Préparé et vérifié localement le 16/10, non exécuté en production.** Retire sa seule version d’historique dans la transaction contrôlée ; réapplication du fichier nommé testée (`tests/retours-oct16-registre.test.ts`). Retire la lecture PDF par version et les deux compléments du dépôt/envoi ; conserve les versions, préparations, alertes et leur marqueur d'idempotence. À jouer avant les retours historiques D18 et après avoir remis le code précédent. Preuve : `tests/devis-rdv-complements-rejeu.test.ts` (définitions, droits, retour et réapplication). |
| `20261013120000_correctifs_audit_13_octobre.retour.sql` | `20261013120000_correctifs_audit_13_octobre.sql` | 9 fonctions, 3 déclencheurs `diagnostic_artisan_lecture`, la contrainte `incident_evenements_type_check`, 1 ligne d'historique |
| `20261014821000_jour_de_paris_irl_terme_charges_rapports.retour.sql` | `20261014821000_jour_de_paris_irl_terme_charges_rapports.sql` (lot « fuseau-suite », 2/2 : décision du 15/10, point 2) | 6 fonctions (`reviser_loyer`, `terme_bail`, `regulariser_charges`, `rapport_du_lot`, `envoyer_rapport` : `current_date` rétabli ; `preparer_rapports_automatiques` : `date_trunc('month',now())` rétabli), le défaut de `regularisations_charges.date_emission`, 1 ligne d'historique. Aucune donnée touchée. **À jouer AVANT** le retour de `20261014500000` (voir la section « Lot fuseau-suite » plus bas) |
| `20261014820000_jour_de_paris_depot_et_journal.retour.sql` | `20261014820000_jour_de_paris_depot_et_journal.sql` (lot « fuseau-suite », 1/2 : décision du 15/10, point 1) | 3 fonctions (`encaisser_depot`, `contre_passer_depot_encaissement`, `contre_ecriture` : `current_date` rétabli), les défauts de `depot_encaissements.date_encaissement`, `ecritures.date_piece` et `ecritures.date_imputation`, 1 ligne d'historique. Aucune donnée touchée. **À jouer AVANT** le retour de `20261014500000` |
| `20261014610000_reglement_facture_intervention.retour.sql` | `20261014610000_reglement_facture_intervention.sql` (lot « reglement-facture », décision D23-A, PRO2-21, CHN-02/X06) | Chirurgical : 2 blocs retirés de la définition en vigueur (`valider_facture_artisan` : ligne d'audit « -- >> D23 (X06, CHN-02) » ; `ecriture_annulable_depuis_le_journal` : branche « -- >> D23 (PRO2-21) »), 4 fonctions supprimées (`enregistrer_reglement_facture`, `retirer_reglement_facture`, `mes_reglements_factures_artisan`, `etat_facture_intervention` ; refus si une autre fonction les appelle), 1 ligne d'historique. **Conservés à dessein** (fiche B.11) : la table `intervention_facture_reglements` et ses lignes, la colonne `intervention_factures.reglee_le`, la clé `intervention_factures_id_org_key`, les valeurs `facture_reglee` / `reglement_retire` de la liste des événements (inoffensives ; irretirables tant qu'une ligne du fil les porte, comme `mission_annulee`), les écritures et contre-écritures nées des règlements (une écriture de règlement redevient annulable depuis le journal par `contre_ecriture`), les lignes d'audit. **Revenir au code d'avant D23 AVANT** (l'écran de la facture et « Ma facturation » appellent les fonctions supprimées). Réintroduit PRO2-21 et CHN-02. Essayé sur une copie le 15/10 (base `gerimmo_ci_lane_u_retour`, PostgreSQL 16) : simulation par `sed` sans effet ; après le retour, définitions et droits des deux fonctions **identiques** (md5) à ceux d'une base construite sans la migration ; rejeu « rien à faire » ; refus dans un lot ; marche avant redonnant exactement l'état migré ; migration rejouée sans effet. Aucune donnée touchée. |
| `20261014504000_jour_de_paris_encaissements.retour.sql` | `20261014504000_jour_de_paris_encaissements.sql` (lot « fuseau-paris », 5/5) | 1 fonction (`contre_passer_encaissement`, `current_date` rétabli), le défaut de `encaissements.date_paiement`, 1 ligne d'historique. Aucune donnée touchée |
| `20261014503000_jour_de_paris_appels_et_quittances.retour.sql` | `20261014503000_jour_de_paris_appels_et_quittances.sql` (lot « fuseau-paris », 4/5) | 5 fonctions (`generer_appels_loyer_interne`, `cycle_mensuel_interne`, `resynchroniser_quittances`, `quittances_a_envoyer`, `appels_a_envoyer`), le défaut de `quittances.date_emission`, 1 ligne d'historique. Sur une base passée par la vague 4a (X13), `resynchroniser_quittances` et ce défaut sont déjà au jour de Paris : ni la migration ni le retour n'y touchent (jamais `current_date` sur eux). Aucune donnée touchée |
| `20261014502000_jour_de_paris_lot_et_contrats.retour.sql` | `20261014502000_jour_de_paris_lot_et_contrats.sql` (lot « fuseau-paris », 3/5) | 3 fonctions (`contrats_du_lot`, `fiche_lot`, `historique_du_lot`), 1 ligne d'historique. Aucune donnée touchée |
| `20261014501000_jour_de_paris_etat_loyers_et_impayes.retour.sql` | `20261014501000_jour_de_paris_etat_loyers_et_impayes.sql` (lot « fuseau-paris », 2/5) | 6 fonctions (`etat_loyers_bail_brut`, `suivre_impayes_bail`, `relances_loyer_dues`, `relance_loyer_consigner`, `actualiser_orchestration`, `collecter_source_direction`), le défaut de `relances.date_envoi`, 1 ligne d'historique. Aucune donnée touchée |
| `20261014500000_jour_de_paris_fonction.retour.sql` | `20261014500000_jour_de_paris_fonction.sql` (lot « fuseau-paris », 1/5) | la fonction `aujourdhui_paris()` supprimée, 1 ligne d'historique. **À jouer en dernier** : refuse tant qu'un objet s'en sert (voir la section « Lot fuseau-paris » plus bas) |
| `20261013110000_marketing_preparation_du_soir_cron.retour.sql` | `20261013110000_marketing_preparation_du_soir_cron.sql` | 2 fonctions, 1 fonction supprimée, 1 ligne d'historique |
| `20261014102000_cle_envoi_ecriture_libre.retour.sql` | `20261014102000_cle_envoi_ecriture_libre.sql` | la colonne `ecritures.cle_envoi` (et son droit d'insertion), 1 index unique partiel, 1 ligne d'historique. Aucune fonction. |
| `20261014101000_cle_envoi_depot_garantie.retour.sql` | `20261014101000_cle_envoi_depot_garantie.sql` | la fonction `encaisser_depot` à sept paramètres (remplacée par celle à six), la colonne `depot_encaissements.cle_envoi`, 1 index unique partiel, 1 ligne d'historique |
| `20261014100000_cle_envoi_encaissement_loyer.retour.sql` | `20261014100000_cle_envoi_encaissement_loyer.sql` | la colonne `encaissements.cle_envoi`, 1 index unique partiel, 1 ligne d'historique. Aucune fonction. |
| `20261014120000_premier_terme_apres_entree.retour.sql` | `20261014120000_premier_terme_apres_entree.sql` (D01, PROP-14) | 1 fonction (`generer_appels_loyer_interne`), 1 ligne d'historique |
| `20261014121000_sortie_reelle_bail.retour.sql` | `20261014121000_sortie_reelle_bail.sql` (D34, SOR-03 et SOR-04) | 2 fonctions (`terminer_bail`, `controler_mise_en_location`), 1 ligne d'historique ; la colonne `baux.date_sortie_reelle` est **conservée** |
| `20261014122000_restitution_remise_cles.retour.sql` | `20261014122000_restitution_remise_cles.sql` (D35 (1), SOR-02) | 1 fonction (`demarrer_restitution`), 1 ligne d'historique |
| `20261014123000_restitution_alerte_apres_correction.retour.sql` | `20261014123000_restitution_alerte_apres_correction.sql` (relecture du lot, D35 (1)) | 1 fonction (`demarrer_restitution`, celle de 122000), 1 fonction interne supprimée (`rafraichir_alerte_restitution`), 1 ligne d'historique |
| `20261014210000_maintenance_artisans_expiration_cron.retour.sql` | `20261014210000_maintenance_artisans_expiration_cron.sql` | 1 tâche `pg_cron` retirée, 1 fonction rétablie, 1 fonction supprimée, 1 ligne d'historique |
| `20261014211000_maintenance_artisans_arret_urgence.retour.sql` | `20261014211000_maintenance_artisans_arret_urgence.sql` | 1 fonction rétablie (`maintenance_artisans_interne()` sans lecture de l'arrêt d'urgence), la ligne de la tâche dans `supervision_taches_arret` si le lot D06 est là, 1 ligne d'historique |
| `releve-devis-perimes.sql` | rien (lecture seule) | **à jouer AVANT la première exécution** de la tâche `maintenance-artisans` : liste ce qu'elle va passer à « expiré » |
| `20261014220000_traversee_trace_precise.retour.sql` | `20261014220000_traversee_trace_precise.sql` (D08, SA-01) | 1 fonction (`log_sa_access`), 1 ligne d'historique. Réintroduit : une ligne `traversee_espace` par rendu de page (jusqu'à 15 par minute). Aucune ligne d'audit défaite |
| `20261014221000_alerte_relais_destinataire.retour.sql` | `20261014221000_alerte_relais_destinataire.sql` (D09, SUP-03) | 1 fonction (`accuser_alerte_vacances`), 1 ligne d'historique. Réintroduit : tout superviseur permanent peut accuser une alerte de relais adressée à un autre. Aucune donnée défaite |
| `20261014222000_consigne_activation_approbateur_distinct.retour.sql` | `20261014222000_consigne_activation_approbateur_distinct.sql` (D10, SUP-04) | 1 fonction (`decider_consigne`), 1 fonction supprimée (`tache_consigne_lecture_seule`), 1 ligne d'historique. Réintroduit : plus aucun approbateur distinct exigé, même le jour où une tâche agira. Aucune donnée défaite |
| `20261014223000_alerte_relais_reprise_destinataire_parti.retour.sql` | `20261014223000_alerte_relais_reprise_destinataire_parti.sql` (D09, relecture de SUP-03) | 1 fonction (`accuser_alerte_vacances`, qui retrouve la définition de 221000), 1 ligne d'historique. Réintroduit : une alerte escaladée vers un créateur qui a perdu son habilitation n'a plus personne pour l'accuser (la reprise redevient limitée au statut « non acheminée »). **À jouer AVANT le retour de 221000.** Aucune donnée défaite |
| `20261014620000_rendez_vous_locataire_report_annulation.retour.sql` | `20261014620000_rendez_vous_locataire_report_annulation.sql` (lot « rendez-vous-locataire », D22 option B ; LOC-21, CHN-01, REP-04) | 7 fonctions rétablies (`accepter_creneau_locataire`, `choisir_creneau`, `refuser_creneaux_locataire`, `fixer_creneau_arbitrage`, `fixer_creneau_arbitrage_motive`, `rendez_vous_a_rappeler`, `marquer_rappel_envoye`), 9 fonctions et 1 déclencheur supprimés, la table `intervention_demandes_rdv` et la colonne `intervention_creneaux.demande_id` supprimées, la clé d'origine des rappels rétablie (colonne `intervention_rappels.debut_prevu` retirée), les six types D22 retirés de `incident_evenements_type_check` s'ils ne portent aucune ligne, 1 ligne d'historique. **Refuse** s'il existe une demande de locataire (à archiver d'abord, sur décision) ou deux rappels d'une même échéance. Réintroduit : aucun geste du locataire sur un rendez-vous confirmé ; clic répété sur « Accepter »/« Confirmer » en erreur ; rendez-vous reporté non rappelé. Essayé le 15/10/2026 sur une copie de banc : aller, rejeu, retour (empreinte identique à la base sans la migration), rejeu du retour (« rien à faire »), refus dans un lot, aller de nouveau (empreinte identique). |
| `20261014302000_creneaux_non_retenus_caducs.retour.sql` | `20261014302000_creneaux_non_retenus_caducs.sql` (lot « chaîne d'incident », D21) | 2 fonctions (`choisir_creneau`, `accepter_creneau_locataire`), 1 ligne d'historique |
| `20261014301000_ecart_rendez_vous_chronologie.retour.sql` | `20261014301000_ecart_rendez_vous_chronologie.sql` (lot « chaîne d'incident », D20) | 3 fonctions (`demarrer_intervention`, `deposer_compte_rendu`, `deposer_facture_artisan`), 1 fonction supprimée (`ecart_rendez_vous`), 1 ligne d'historique |
| `20261014300000_devis_a_decider_alerte.retour.sql` | `20261014300000_devis_a_decider_alerte.sql` (lot « chaîne d'incident », D19) | 1 fonction (`deposer_devis`), 1 déclencheur et sa fonction supprimés (`fermer_alerte_devis_a_decider`), 1 ligne d'historique |
| `20261014310000_artisan_facture_numero_unique.retour.sql` | `20261014310000_artisan_facture_numero_unique.sql` (D24-B, ARC-04) | 1 bloc retiré de `artisan_externe_ecrire`, 1 index unique supprimé, 1 ligne d'historique (voir la section « Lot artisan-externe » plus bas) |
| `20261014311000_artisan_exclusion_ecritures.retour.sql` | `20261014311000_artisan_exclusion_ecritures.sql` (D25-B, ARC-08) | 1 bloc retiré de `artisan_externe_ecrire`, 1 clé retirée de `mon_activite_artisan_privee`, 1 fonction supprimée, 1 ligne d'historique |
| `20261014710000_artisan_avoir_facture_externe.retour.sql` | `20261014710000_artisan_avoir_facture_externe.sql` (lot « avoir-facture-externe », D24-C, ARC-07) | 1 bloc retiré de `artisan_externe_ecrire` (action « annuler_facture ») et sa garde du chantier terminé rétablie, 1 bloc retiré de `artisan_reglement_ecrire`, 2 clés retirées de `mon_activite_artisan_privee` (`annulee_le`, `avoirs`), la table `artisan_avoirs_externes` et la fonction de ses déclencheurs supprimées, la contrainte `unique(chantier_id)` de `artisan_factures_externes` rétablie à la place de l'index « une facture en vigueur par chantier », la colonne `annulee_le` retirée, 1 ligne d'historique. **Refuse sans rien modifier dès qu'un avoir a été émis ou qu'une facture a été annulée** (un avoir est une pièce numérotée : décision du dirigeant et avis comptable). À jouer **avant** le retour de `20261014500000` (sa branche cite `aujourdhui_paris()`). Réintroduit : une facture externe déposée ne s'annule plus, une seule facture par chantier. Méthode chirurgicale (définitions d'aujourd'hui relues), rejouable ; essayé sur une copie de la base de banc le 15/10/2026 (aller, retour, aller ; refus avec un avoir ; refus dans un lot) |
| `20261014330000_creation_fiche_personne_cle.retour.sql` | `20261014330000_creation_fiche_personne_cle.sql` (décision D31) | 1 colonne facultative (`persons.creation_cle`), 1 index unique partiel, 1 ligne d'historique ; aucune fonction. À jouer **après** avoir remis en production le code d'avant la décision D31 (il écrit cette colonne à chaque création de fiche depuis l'assistant). Aucune fiche n'est supprimée, seules les clés d'idempotence disparaissent. Il affiche son propre état « migrée (B) / antérieure (A) » à la fin (essayé : simulation, exécution, rejeu, refus dans un lot, marche avant). |
| `20261014400000_devis_vitrine_par_action_serveur.retour.sql` | `20261014400000_devis_vitrine_par_action_serveur.sql` (décision X02, AUD-A-06) | le droit d'insertion de `anon` et `authenticated` sur `demandes_devis` (six colonnes du formulaire), la politique `demandes_devis_insert_public`, le commentaire de la table, 1 ligne d'historique. Aucune fonction, aucune demande touchée ; le déclencheur de limite n'a jamais été modifié. **À jouer AVANT de remettre en production le code d'avant la décision X02** (qui écrit avec la clé publique : sans ce retour, le formulaire échouerait) ; le code de la décision X02 fonctionne avant comme après. Réintroduit : l'insertion directe par la clé publique, sans le pot de miel ni la validation de l'action serveur. |
| `20261014401000_incident_urgent_notifie.retour.sql` | `20261014401000_incident_urgent_notifie.sql` (décision X15, REP-02) | 1 fonction rétablie (`declarer_mon_incident_reprise`, qui ne dit plus `notifie`), 1 fonction supprimée (`marquer_incident_urgent_notifie`), 1 colonne facultative retirée (`commandes_incidents_locataire.notifie_le`), 1 ligne d'historique. Aucune déclaration touchée ; seule la mémoire de l'envoi de l'e-mail d'urgence disparaît. Le code de la décision X15 tolère une base sans `notifie` : l'ordre (code ou base d'abord) est sans importance. Réintroduit : une reprise de déclaration urgente n'envoie plus l'e-mail si la première tentative s'est arrêtée avant lui. |
| `20261014416000_quittance_jour_de_paris.retour.sql` | `20261014416000_quittance_jour_de_paris.sql` (X13, FIN-13, constat de relecture du 15/10) | 1 fonction rétablie (`resynchroniser_quittances`, datée du jour de la session), le défaut de la colonne `quittances.date_emission` remis à `CURRENT_DATE`, 1 ligne d'historique. Réintroduit : de minuit à 2 h à Paris, la quittance émise après « Encaisser » porte la veille du règlement qu'elle atteste. Aucune quittance redatée. |
| `20261014415000_reprise_soldes_au_centime.retour.sql` | `20261014415000_reprise_soldes_au_centime.sql` (X09, FIN-03, constat de relecture du 15/10) | 1 fonction rétablie (`reprendre_soldes`, sans le contrôle « au centime près » ni le refus de NaN/Infinity), 1 ligne d'historique. Réintroduit : le contrôle d'une reprise peut annoncer « Prêt à reprendre. » pour une ligne à trois décimales que la bascule refusera (message générique). Aucune donnée touchée. |
| `20261014414000_encaissements_montant_fini.retour.sql` | `20261014414000_encaissements_montant_fini.sql` (X09, FIN-03, constat de relecture du 15/10) | 1 contrainte supprimée (`encaissements_montant_fini_check`, posée NOT VALID), 1 ligne d'historique ; aucune fonction. La contrainte de centime n'est pas touchée. Dit combien d'encaissements sont NaN ou Infinity avant de la retirer. Réintroduit : un encaissement « NaN » écrit par requête directe solde un loyer et génère une quittance. Aucune donnée touchée. |
| `20261014413000_encaissement_plancher_honoraires.retour.sql` | `20261014413000_encaissement_plancher_honoraires.sql` (X14, PR178-B-03) | 1 fonction rétablie (`ecrire_encaissement()` sans le plancher d'honoraires), 1 ligne d'historique. Réintroduit : un encaissement trop petit pour porter des honoraires (0,01 € à 7 %) est de nouveau refusé par la contrainte des écritures, avec le message générique. Aucune donnée touchée. |
| `20261014412000_encaissements_montant_au_centime.retour.sql` | `20261014412000_encaissements_montant_au_centime.sql` (X09, FIN-03) | 1 contrainte supprimée (`encaissements_montant_centime_check`, posée NOT VALID), 1 ligne d'historique ; aucune fonction. Dit combien d'encaissements sont hors centime avant de la retirer. Aucune donnée touchée. |
| `20261014410000_encaissement_reste_jour_de_paris.retour.sql` | `20261014410000_encaissement_reste_jour_de_paris.sql` (X13, FIN-13) | 1 fonction rétablie (`encaisser_reste_atomique`, sans date explicite), 1 ligne d'historique. Réintroduit : « Encaisser » date le règlement du jour UTC de la base (la veille de minuit à 2 h à Paris). Aucune donnée touchée. |
| `verifier-etat.sql` | rien (lecture seule) | dit pour chaque objet s'il est « migré (B) » ou « antérieur (A) » |
| `20261014232000_effacement_instantanes_faits_direction.retour.sql` | `20261014232000_effacement_instantanes_faits_direction.sql` | **rien** : les instantanés effacés ne reviennent que d'une sauvegarde ; le script ne retire que la ligne d'historique |
| `20261014231000_retention_registres_execution.retour.sql` | `20261014231000_retention_registres_execution.sql` | 1 bloc retiré d'`appliquer_retention` (retrait chirurgical : le reste de la fonction n'est pas touché), 1 fonction supprimée, 5 règles de conservation, 1 ligne d'historique |
| `20261014230000_faits_direction_sans_noms.retour.sql` | `20261014230000_faits_direction_sans_noms.sql` | 3 fonctions rétablies, 2 fonctions supprimées, 1 ligne d'historique |
| `20261014233000_photos_demande_devis_artisan.retour.sql` | `20261014233000_photos_demande_devis_artisan.sql` | 2 fonctions supprimées (rien d'antérieur à rétablir), 1 ligne d'historique |
| `20261014420000_capture_fiscale_ordre_des_lignes.retour.sql` | `20261014420000_capture_fiscale_ordre_des_lignes.sql` (lot « petits-points », X11, FIN-09) | 1 fonction rétablie (`capturer_composantes_fiscales`, définition d'origine reprise de la base reconstruite), 1 ligne d'historique. Réintroduit : dans un INSERT à plusieurs lignes sur les encaissements d'un même bail, « déjà encaissé avant » recompte les autres lignes du même INSERT et la ventilation loyer / charges est fausse (aucun chemin actuel de l'application n'en émet). Ne modifie aucune capture déjà figée. Essayé sur une copie le 15/10/2026 (correctif en sa 2e version, critère « même instruction » au lieu des horodatages) : définition identique à l'origine (empreinte md5 égale à celle d'une base sans la migration), rejeu sans effet, garde de lot, marche avant redonnant l'état migré. |
| `20261014600000_devis_refus_motive.retour.sql` | `20261014600000_devis_refus_motive.sql` (lot « devis-revisable », D18 livraison 1 : refus motivé, fiches ART-13 et PRO2-12) | 1 fonction supprimée (`refuser_devis`), 2 fonctions rétablies par marque (`retenir_devis`, `fermer_alerte_devis_a_decider`), 1 fonction recréée avec son ancien type de retour (`mes_sollicitations`, drop puis create), 1 ligne d'historique. **Conserve** les colonnes `incident_devis.decision*`, les valeurs d'énumération `refuse` / `refusee` et le type d'événement `devis_refuse` ; aucun devis refusé n'est touché (il le dit en nombre). Refuse de se jouer tant que `20261014601000` (versions) est appliquée : son retour d'abord. Essayé sur une copie le 15/10/2026 : simulation, exécution, rejeu (« rien à faire » ×3), marche avant (empreinte des fonctions identique à la base migrée). |
| `20261014601000_devis_revision_versions.retour.sql` | `20261014601000_devis_revision_versions.sql` (lot « devis-revisable », D18 livraison 2 : révision et versions, fiches ART-13 et PRO2-12) | 3 fonctions supprimées (`demander_revision_devis`, `mes_versions_devis`, `expirer_revisions_devis`), 12 fonctions rétablies par marque (`deposer_devis`, `decliner_sollicitation`, `solliciter_artisan_interne`, `retenir_devis`, `artisan_blacklist_locale`, `artisan_decider_plateforme`, `mon_suivi_intervention`, `mes_photos_incident_artisan`, `lire_devis_structure`, `fermer_alerte_devis_a_decider`, `maintenance_artisans_interne`, `libelle_generique_alerte`), 1 fonction recréée avec son type de retour de la livraison 1 (`mes_sollicitations`), 1 ligne d'historique. **Conserve** les colonnes `version`, `devis_precedent_id`, `note_revision`, `revision_avant`, les valeurs d'énumération, les types d'événement, la contrainte `(sollicitation, version)` et l'index « un seul devis vivant par demande » (l'ancienne contrainte ne peut pas être reposée si des versions existent), les alertes `devis_revision_expiree` et les devis déjà révisés ; il dit en nombre les demandes encore « en révision », qui n'auront plus d'issue après le retour. **À jouer AVANT** le retour de `20261014600000` (qui le vérifie) et **AVANT** celui de `20261014211000` si celui-ci est en cause (il réécrit `maintenance_artisans_interne` en entier). Définitions antérieures générées depuis une base au stade de la livraison 1 ; essayé sur une copie le 15/10/2026 : simulation, exécution (empreinte des 568 fonctions identique à la livraison 1), rejeu (« rien à faire » ×13), marche avant (empreinte identique à la base migrée). |
| `20261014602000_devis_revision_verrous_stockage.retour.sql` | `20261014602000_devis_revision_verrous_stockage.sql` (lot « devis-revisable », D18, reprise du 15/10 après relecture : dépôt du PDF de la version suivante pendant une révision, dossier verrouillé en premier par les trois décisions sur un devis) | 1 fonction rétablie dans sa définition de `20260927121000` (`orgs_de_mes_sollicitations_ouvertes` : « envoyée » seule), 3 fonctions rétablies par l'opération inverse (`retenir_devis`, `refuser_devis`, `demander_revision_devis` : bloc retiré, commentaire d'origine reposé), 1 ligne d'historique. Aucune donnée touchée. **À jouer AVANT** le retour de `20261014601000`, qui le vérifie. Essayé sur une copie le 15/10/2026 : retour de `601000` joué d'abord → refus ; retour joué dans un lot → refus ; exécution, puis rejeu (« rien à faire » ×4) ; empreinte des 4 fonctions (définitions et droits) **identique** à celle d'une base où `601000` vient d'être réappliquée ; marche avant → empreinte identique à la base migrée. |
| `20261014730000_plafond_appels_ia.retour.sql` | `20261014730000_plafond_appels_ia.sql` (lot « plafond-ia », décision X19, fiche SA-10 : limite quotidienne des appels payants à l'IA, arrêt d'urgence consulté avant chaque appel payant) | 2 fonctions supprimées (`reserver_appel_ia`, `regler_plafond_ia`), 2 tables supprimées (`ia_appels_jour`, dont il dit combien de jours de compteur disparaissent, et `ia_plafond_reglage`, dont il dit la limite réglée), 1 ligne d'historique. Aucune fonction existante n'avait été modifiée : rien à rétablir. Les lignes « plafond_ia » du journal des gestes (`supervision_operations`) sont conservées. **Remettre d'abord le code d'avant X19** : le code X19 ne sait plus vérifier l'arrêt ni la limite sans `reserver_appel_ia` et, par prudence, n'appelle alors plus l'IA du tout. Réintroduit : aucune limite propre à Gerimmo, et les appels lancés à la main (brief, article, devis assisté, atelier) partent sous un arrêt d'urgence. Essayé sur une copie le 15/10/2026 : refus dans un lot, exécution (empreinte des fonctions, tables, index et politiques identique à une base sans la migration), rejeu (« rien à faire » ×4), marche avant (empreinte identique à la base migrée, limite revenue à 50). |
| `20261014840000_invitation_artisan_proprietaire.retour.sql` | `20261014840000_invitation_artisan_proprietaire.sql` (lot « invitation-artisan », décision du dirigeant du 15/10/2026 : un propriétaire direct invite un artisan, qui s'inscrit lui-même ; Gerimmo valide) | 12 fonctions supprimées (aucune n'existait avant : rien à rétablir ; dont 4 internes, les limites anti-abus comprises), la table `invitations_artisans` supprimée avec ses index et ses deux déclencheurs (le script dit combien d'invitations disparaissent, dont combien acceptées), 1 ligne d'historique. **Conserve** les rattachements au carnet déjà faits par une acceptation (`artisan_agences`), les traces du journal et les comptes et fiches créés par les artisans. **À jouer APRÈS** avoir remis en production le code d'avant la décision (carnet du propriétaire, page d'invitation et console de validation appellent ces fonctions). Réintroduit : un propriétaire direct n'a plus de moyen de faire entrer un artisan dans son carnet. Essayé sur une copie le 15/10/2026 : exécution, rejeu (« rien à faire » ×13), refus dans un lot, marche avant (12 fonctions recréées) ; `tests/invitation-artisan-migration-rejeu.test.ts` rejoue aller, retour, aller (empreinte identique). |
| `20261014841000_metiers_zones_sans_proprietaire.retour.sql` | `20261014841000_metiers_zones_sans_proprietaire.sql` (lot « invitation-artisan », relecture du 15/10/2026, constat bloquant : un propriétaire direct ne modifie plus les métiers ni la zone d'un artisan de son carnet) | 1 fonction rétablie par l'opération inverse (`artisan_definir_metiers_zones` : la liste des rôles d'origine, avec `proprietaire_direct`, est reposée ; le reste de la définition en vigueur est conservé), 1 ligne d'historique. Aucune donnée touchée, droits inchangés. Ordre indifférent avec le code. Réintroduit : après une invitation acceptée, le propriétaire peut réécrire la zone et les métiers de l'artisan (profil commun à toutes les organisations) et le solliciter hors de sa zone, commune fermée comprise. Essayé sur une copie le 15/10/2026 : refus dans un lot, exécution (« antérieure (A) »), rejeu (« rien à faire »), marche avant (« migrée », mêmes droits) ; `tests/invitation-artisan-migration-rejeu.test.ts` compare la définition rétablie à celle que crée `20260911180000` (empreinte identique). |
| `20261014842000_artisans_colonnes_internes.retour.sql` | `20261014842000_artisans_colonnes_internes.sql` (lot « invitation-artisan », seconde relecture du 15/10/2026, constat « important » : les colonnes de décision internes de la fiche artisan ne sont plus lisibles par les clients) | Droits par colonne de `authenticated` sur `public.artisans` retirés et droit SELECT de table rétabli (état d'avant, autres rôles inchangés), 2 fonctions supprimées (`decisions_artisans_supervision`, `decisions_artisan_supervision` : aucune n'existait avant ; refus si une autre fonction les appelle), 1 ligne d'historique. Aucune donnée touchée. **À jouer APRÈS** avoir remis en production le code d'avant (/admin/artisans et la fiche d'un artisan de la console appellent les deux fonctions). Réintroduit : un propriétaire direct ou une agence qui a l'artisan dans son carnet lit de nouveau, par requête directe, les motifs de refus et d'exclusion, les auteurs et dates des décisions de Gerimmo, les échéances de purge et l'organisation qui a créé la fiche ; remettre aussi l'ancien texte de consentement. `tests/invitation-artisan-migration-rejeu.test.ts` rejoue aller, rejeu, retour (droit de table rétabli pour `authenticated` seul), rejeu du retour, refus dans un lot, aller de nouveau (empreinte identique). |
| `20261014843000_liste_noire_locale_relation_prealable.retour.sql` | `20261014843000_liste_noire_locale_relation_prealable.sql` (lot « invitation-artisan », seconde relecture du 15/10/2026, constat de sécurité antérieur au lot : la liste noire locale exige une relation préalable réelle) | 1 fonction rétablie par l'opération inverse (`artisan_blacklist_locale` : le bloc de la relation préalable, avec sa marque, est retiré de devant sa ligne d'ancre ; le reste de la définition en vigueur est conservé), 1 ligne d'historique. Aucune donnée touchée, droits inchangés. Ordre indifférent avec le code. **À jouer AVANT** le retour de `20261014601000` si celui-ci doit l'être (il rétablit `artisan_blacklist_locale` en entier) ; rejouer ensuite `20261014843000` si le correctif doit rester. Réintroduit : une organisation peut mettre sur sa liste noire un artisan sans aucune relation, ce qui lui crée une ligne de carnet, lui ouvre la fiche de l'entreprise et sert d'oracle sur l'existence d'un identifiant. `tests/invitation-artisan-migration-rejeu.test.ts` rejoue aller, rejeu, retour (définition migrée moins le bloc), rejeu du retour, refus dans un lot, aller de nouveau (empreinte identique). |
| `20261014844000_invitation_artisan_budget_distinct.retour.sql` | `20261014844000_invitation_artisan_budget_distinct.sql` (lot « invitation-artisan », seconde relecture du 15/10/2026 : le budget horaire des invitations d'artisans est distinct de celui des invitations de locataires, même seuil de 30 par organisation et par heure) | 1 fonction rétablie par l'opération inverse (`limiter_envoi_invitation_artisan` : la ligne de la clé distincte, avec sa marque, redevient l'appel sur la clé commune `organisation:<uuid>` ; le reste est conservé), 1 ligne d'historique. Aucune donnée touchée, droits inchangés (fonction interne). Ordre indifférent avec le code. **À jouer AVANT** le retour de `20261014840000` (qui supprime la fonction ; joué après, ce script ne trouve rien à faire et le dit). Réintroduit : trente invitations d'artisans épuisent, pour l'heure, l'invitation des locataires de l'organisation. `tests/invitation-artisan-migration-rejeu.test.ts` rejoue aller, rejeu, retour (définition migrée où la ligne redevient l'ancre), rejeu du retour, refus dans un lot, aller de nouveau ; et le lot entier (840000 puis 844000) deux fois (empreinte identique). |
| `20261014845000_invitation_artisan_soi_meme.retour.sql` | `20261014845000_invitation_artisan_soi_meme.sql` (lot « invitation-artisan », seconde relecture du 15/10/2026 : on ne s'invite pas soi-même) | 2 fonctions rétablies par l'opération inverse (`preparer_invitation_artisan` : bloc « sa propre adresse ou celle de sa fiche d'artisan » retiré ; `repondre_invitation_artisan` : bloc « jamais l'invitation qu'on a envoyée » retiré ; le reste des définitions en vigueur est conservé), 1 ligne d'historique. Aucune donnée touchée, droits inchangés. Ordre indifférent avec le code. **À jouer AVANT** le retour de `20261014840000` (qui supprime ces fonctions). Réintroduit : un propriétaire peut s'inviter lui-même et accepter sa propre invitation. `tests/invitation-artisan-migration-rejeu.test.ts` rejoue aller, rejeu, retour (définitions migrées moins les blocs), rejeu du retour, refus dans un lot, aller de nouveau. |
| `20261014846000_invitation_artisan_annulation_suspendue.retour.sql` | `20261014846000_invitation_artisan_annulation_suspendue.sql` (lot « invitation-artisan », seconde relecture du 15/10/2026 : annuler une invitation reste possible quand l'abonnement est suspendu, geste protecteur) | 1 fonction rétablie par l'opération inverse (`refuser_ecriture_si_fermee`, la garde de l'abonnement : l'exception « en attente » → « annulée » de la seule table `invitations_artisans`, avec sa marque, est retirée de derrière sa ligne d'ancre ; le reste de la définition en vigueur est conservé), 1 ligne d'historique. Aucune donnée touchée, droits inchangés (fonction de déclencheur). Aucun passe-droit `gerimmo.systeme` (tests/abonnement-stripe.test.ts). Ordre indifférent avec le code et avec le retour de `20261014840000`. Réintroduit : abonnement suspendu, le propriétaire ne peut plus retirer une invitation en attente, que l'artisan peut toujours accepter. `tests/invitation-artisan-migration-rejeu.test.ts` rejoue aller, rejeu, retour (définition migrée moins le bloc), rejeu du retour, refus dans un lot, aller de nouveau. |
| `20261014847000_invitation_artisan_echeance_jour_paris.retour.sql` | `20261014847000_invitation_artisan_echeance_jour_paris.sql` (lot « invitation-artisan », seconde relecture du 15/10/2026 : l'échéance d'une nouvelle invitation tombe à la fin de son 30e jour de Paris, cohérente avec « valable jusqu'au … inclus ») | Le défaut de `invitations_artisans.expire_le` redevient `now() + 30 days` (celui de 20261014840000), le commentaire de la colonne est retiré, 1 ligne d'historique. **Aucune ligne touchée** : les invitations créées entre-temps gardent leur échéance à minuit, heure de Paris. Ordre indifférent avec le code (l'écran nomme le jour qui précède l'échéance, ce qui reste juste pour une échéance au milieu d'un jour). **À jouer AVANT** le retour de `20261014840000` (qui supprime la table). Réintroduit : une invitation expire à l'heure de son envoi, alors que l'écran annonce le jour entier. `tests/invitation-artisan-migration-rejeu.test.ts` rejoue aller, rejeu, retour (défaut d'origine exact, lignes intactes), rejeu du retour, refus dans un lot, aller de nouveau. |
| `20261014848000_carnet_artisans_bien.retour.sql` | `20261014848000_carnet_artisans_bien.sql` (lot « invitation-artisan », seconde relecture du 15/10/2026 : pour un bien, le carnet dit pourquoi un artisan ne peut pas y être sollicité — zone, décennale, validation, relation) | 1 fonction de lecture supprimée (`carnet_artisans_bien` : elle n'existait pas avant, rien à rétablir ; refus si une autre fonction l'appelle), 1 ligne d'historique. Aucune donnée touchée. **À jouer APRÈS** avoir remis en production le code d'avant (la fiche d'un incident du propriétaire l'appelle ; sans elle, l'écran dit que son carnet n'a pas pu être lu pour ce bien). Réintroduit : un artisan validé du carnet, hors de sa zone ou sans décennale, disparaît de la fiche de l'incident sans explication. `tests/invitation-artisan-migration-rejeu.test.ts` rejoue aller, rejeu, retour, rejeu du retour, refus dans un lot, aller de nouveau. |
| `20261014849000_liste_noire_levee_sans_rattachement.retour.sql` | `20261014849000_liste_noire_levee_sans_rattachement.sql` (lot « invitation-artisan », troisième relecture du 15/10/2026, constat de sécurité : la levée d'une liste noire locale ne fait jamais entrer un artisan dans un carnet) | 4 fonctions rétablies par l'opération inverse (`artisan_blacklist_locale` : la ligne créée n'est plus marquée ; `artisan_lever_blacklist_locale` : la suppression de la ligne créée par la liste noire est retirée ; `artisan_statut_local` : la garde de la réactivation est retirée ; `repondre_invitation_artisan` : l'acceptation ne retire plus la marque ; chaque morceau, avec sa marque, redevient sa ligne d'ancre, le reste des définitions en vigueur est conservé), 1 ligne d'historique. **Conserve** la colonne `artisan_agences.creee_par_liste_noire` et ses valeurs (le script dit combien de lignes la portent) ; aucune ligne touchée, droits inchangés. Ordre indifférent avec le code. **À jouer AVANT** le retour de `20261014840000` (qui supprime `repondre_invitation_artisan`), et AVANT ceux de `20261014843000` et `20261014601000` si ceux-ci doivent l'être (601000 rétablit `artisan_blacklist_locale` en entier ; rejouer ensuite 843000 puis 849000). Réintroduit : la levée passe en « actif » la ligne que la liste noire a créée ; un propriétaire direct qui a sollicité un artisan du réseau le fait entrer dans son carnet sans invitation, puis le sollicite dans une commune fermée ; une agence contourne l'ajout par SIRET. `tests/invitation-artisan-migration-rejeu.test.ts` rejoue aller, rejeu, retour (définitions migrées où chaque morceau redevient son ancre), rejeu du retour, refus dans un lot, aller de nouveau (empreinte identique) ; le rattrapage ne marque que les lignes encore sur liste noire depuis leur création. |
| `20261014600000_devis_refus_motive.retour.sql` | voir ci-dessus | — |
| `20261014830000_relances_invitations_locataires.retour.sql` | `20261014830000_relances_invitations_locataires.sql` (lot « relances-invitation », décision X16 du 15/10/2026, fiche REP-05 : relances J+3 et J+10 des invitations de locataire) | 4 fonctions supprimées (`relance_invitation_locataire_due`, `invitations_locataires_relances_dues`, `reserver_relance_invitation_locataire`, `noter_relance_invitation_locataire`), 1 table supprimée (`relances_invitations_locataires` : il dit combien de relances mémorisées disparaissent), 1 déclencheur et sa fonction supprimés (`premier_envoi_invitation_locataire`), 2 colonnes retirées (`invitations_locataires.premier_envoi_le`, `relances_prevues`), 1 ligne d'historique. Aucune fonction existante n'avait été réécrite ; aucune invitation supprimée ni modifiée ; les lignes du journal d'audit sont conservées. **Remettre d'abord le code d'avant X16** (sinon la mission « rappels » note « lecture impossible » et la fiche personne signale l'historique illisible). Réintroduit : plus aucune relance automatique. Deux de ses fonctions citent `public.aujourdhui_paris()` : **à jouer AVANT** le retour de `20261014500000` (le test `tests/jour-de-paris-migrations-rejeu.test.ts` joue cette chaîne, ce retour en tête). Essayé sur une copie le 15/10/2026 : exécution, rejeu (« rien à faire » ×9), refus dans un lot (`--single-transaction`), marche avant (empreinte des fonctions identique à la base migrée). |
| `20261014720000_recherche_reference_supervision.retour.sql` | `20261014720000_recherche_reference_supervision.sql` (lot « console-recherche », décision X18, fiche SA-09 : recherche d'un bien, d'un lot ou d'un incident par sa référence dans la console) | 1 fonction supprimée (`rechercher_reference_supervision`, rien d'antérieur à rétablir ; refuse de supprimer une fonction du même nom qui ne porte pas la marque `Décision X18 du 14/10 (SA-09)`), 1 ligne d'historique. Aucune donnée touchée ; **conserve** les lignes `recherche_reference` déjà écrites au journal d'audit. À retirer **avec** le code : sans la fonction, la recherche de la console affiche « Certains résultats sont momentanément indisponibles » (organisations, artisans et comptes restent trouvés). Essayé sur une copie le 15/10/2026 : exécution (fonction absente), rejeu sans effet, retour joué dans un lot → refus, marche avant → empreinte md5 de la définition identique à la base migrée, droits identiques (anon : non, authenticated : oui), fonction étrangère du même nom → refus. |
| `20261014810000_relais_alerte_quotidienne.retour.sql` | `20261014810000_relais_alerte_quotidienne.sql` (D46-B, partie « alerte e-mail du relais », décisions du 15/10/2026) | 5 fonctions supprimées (`reserver_alerte_relais`, `terminer_alerte_relais`, `sentinelle_relais`, `cron_derniere_echeance`, `cron_valeurs_champ`), la table `relais_alertes_envois` supprimée (il dit en nombre les passages retirés), 1 ligne d'historique. Aucune fonction existante n'était modifiée, aucune tâche `pg_cron` ajoutée : rien d'antérieur à rétablir. Réintroduit : plus aucune alerte e-mail quotidienne (IA-02, IA-03). Se joue **le dernier** du lot : il **refuse** tant que `812000` est en place (son jeton ou sa tâche `relais-urgences`) ou tant que `811000` l'est (sa file `relais_urgences`), et nomme le retour à jouer d'abord. À retirer **avec** le code (route `/api/cron/relais`, deux entrées de `vercel.json`, textes de la console), ou vider d'abord `GERIMMO_RELAIS_EMAILS`. Essayé sur une copie le 15/10/2026 : retour joué dans un lot → refus ; exécution ; empreinte des fonctions et des tables hors relais **identique** à celle d'avant le retour ; rejeu sans effet ; marche avant → empreinte des fonctions identique à la base migrée. |
| `20261014811000_relais_urgences_immediates.retour.sql` | `20261014811000_relais_urgences_immediates.sql` (D46-B, « envoi immédiat pour les urgences », décision du 15/10/2026) | 1 déclencheur retiré (`relais_urgence_a_envoyer` sur `supervision_alertes_internes`), 6 fonctions supprimées (`nature_urgence_relais`, `relais_urgence_a_envoyer`, `prendre_urgences_relais`, `terminer_urgences_relais`, `urgences_relais_recentes`, `urgences_relais_au_quotidien`), les tables `relais_urgences` et `relais_urgences_envois` supprimées (il dit en nombre les urgences retirées, dont celles qui attendaient leur e-mail immédiat), 1 ligne d'historique. Aucune fonction existante n'était modifiée, aucune tâche `pg_cron` ajoutée : rien d'antérieur à rétablir ; les alertes de la console restent intactes. Réintroduit : une urgence du mode vacances ne part plus sur le moment, seulement dans l'e-mail de 5 h. **Refuse** tant que `812000` est en place (son jeton ou sa tâche `relais-urgences`) : son retour d'abord, sinon la tâche resterait planifiée sans file et le retour de `812000` ne trouverait plus ses fonctions. À jouer **avant** le retour de `810000` (qui le vérifie), **avec** le code (appels depuis les missions, le passage de 5 h et la console), ou vider d'abord `GERIMMO_RELAIS_EMAILS`. Essayé dans la transaction d'un test (`tests/relais-urgences-retour.test.ts`) : tout est retiré, les alertes restent et se posent encore, rejeu sans effet, marche avant → tout revient. |
| `20261014812000_relais_urgences_passage_frequent.retour.sql` | `20261014812000_relais_urgences_passage_frequent.sql` (D46-B, passage fréquent des urgences : toutes les 10 minutes, relecture du 15/10/2026) | Chirurgical : la tâche `pg_cron` `relais-urgences` retirée **en premier** (plus aucun appel avec le jeton), 4 blocs balisés « Relais 15/10 » retirés de la définition en vigueur (`sentinelle_relais` : « tâches hors arrêt », « passage reçu » ; `urgences_relais_recentes` : « rappel exact » ; `relais_urgence_a_envoyer` : « clé imitée »), 5 fonctions supprimées (`declencher_relais_urgences`, `jeton_declencheur_relais_urgences`, `consigner_passage_urgences_relais`, `clore_envoi_urgences_vide`, `urgence_constatee_par_le_relais`), les tables `declencheur_relais_urgences` (le **jeton**) et `supervision_taches_hors_arret` (le recensement) supprimées, 1 ligne d'historique. Ne réécrit aucune donnée : les natures « signalement_manuel » déjà posées dans la file et les envois clos « abandonné » sans urgence restent. Réintroduit : urgences constatées seulement au passage des missions (jusqu'à ~18 h après l'événement), clé imitée qui change le texte, rappel de 5 h qui peut dire « en cours d'envoi » un envoi en échec. À jouer **avant** les retours de `811000` et `810000` (il modifie leurs fonctions ; tous deux refusent tant qu'il est en place), **avec** le code (route `?mode=urgences`, `clore_envoi_urgences_vide`). Essayé dans la transaction d'un test (`tests/relais-urgences-passage-retour.test.ts`) : tâche et jeton retirés, définitions des trois fonctions identiques à celles d'avant la migration, rejeu sans effet, marche avant → tout revient ; et joué par `psql -f` sur une copie de la base de travail (voir le rapport du lot). |
| `20261014850000_retention_registres_relais_ia.retour.sql` | `20261014850000_retention_registres_relais_ia.sql` (lot « correctifs-base », D48 : règles de conservation des registres créés le 15/10, tour final du 16/10/2026) | Chirurgical, comme le retour de `231000` : 1 bloc retiré de la définition en vigueur d'`appliquer_retention` (marque `purger_registres_relais_ia`, texte exact), 1 fonction supprimée sans cascade (`purger_registres_relais_ia`), 4 règles de `retention_rules` supprimées (`journal:relais_alertes_envois`, `journal:relais_urgences`, `journal:relais_urgences_envois`, `journal:ia_appels_jour` ; une durée réglée à la main depuis serait perdue), 1 ligne d'historique. **Ne ramène pas** les lignes déjà purgées (sauvegarde). Réintroduit : ces quatre registres hors du catalogue ; plus aucune purge du compteur des appels à l'IA (les trois du relais gardent celle de leurs propres fonctions, six mois, jamais modifiée). Indépendant du retour de `231000` (blocs et fonctions distincts, n'importe quel ordre). Sa fonction cite `aujourdhui_paris()` : **à jouer AVANT** le retour de `20261014500000` (voir l'ordre complet, section « fuseau-suite »). Essayé dans la transaction d'un test (`tests/retention-registres-relais-ia.test.ts`) : refus dans un lot, bloc retiré à l'identique, rejeu « rien à faire », aller-retour-aller identique, refus sans rien supprimer si la fonction a été réécrite, composable avec le retour de `231000`. |
| `20261014851000_jour_de_paris_restitution_depot.retour.sql` | `20261014851000_jour_de_paris_restitution_depot.sql` (lot « correctifs-base » : restitution du dépôt de garantie au jour de Paris, décision du 15/10, point 1, complétée le 16/10/2026) | 2 fonctions (`finaliser_decompte` : 5 `aujourdhui_paris()` remis en `current_date` ; `marquer_decompte_envoye` : 2, dont la valeur par défaut de `p_date`), nombre exact exigé, 1 ligne d'historique. Aucune donnée touchée. Réintroduit : de minuit à 1 h ou 2 h à Paris, un décompte finalisé et ses deux écritures (restitution du dépôt, trop-perçu) datés de la veille, un envoi daté du jour même refusé. **À jouer AVANT** le retour de `20261014500000`. Essayé dans la transaction d'un test (`tests/jour-de-paris-restitution-migration-rejeu.test.ts`) : refus dans un lot, nombre exact rétabli, rejeu sans effet, aller-retour-aller identique, refus sans rien modifier si la fonction a été réécrite. |

**Lot « devis-revisable » et lot « fuseau-paris ».** Les fonctions `refuser_devis`, `demander_revision_devis`, `deposer_devis` (version suivante) et
`expirer_revisions_devis` citent `public.aujourdhui_paris()`, comme `reserver_appel_ia` (lot « plafond-ia », X19) et `reserver_alerte_relais` (lot « relais-alertes », D46-B) : le retour de `20261014500000` (qui retire cette
fonction) refuse tant qu'elles existent et les nomme. L'ordre de tous les retours, si tout doit être défait, n'est écrit qu'à un seul endroit : la section
« Lot « fuseau-suite » » plus bas (elle commence par les compléments du 16 octobre). Le test
`tests/jour-de-paris-migrations-rejeu.test.ts` joue cette chaîne. Les deux scripts posent leur outil `pg_temp.restaurer_fonction` en « create or replace » :
joués dans une même session (le test, ou un opérateur qui enchaîne), ils ne se gênent pas.
| `verifier-etat.sql` | rien (lecture seule) | dit pour chaque objet s'il est « migré (B) » ou « antérieur (A) » (migrations du 13/10 seulement) |

**Clés d'envoi des encaissements (14/10, D05).** Les trois migrations `20261014100000`, `20261014101000` et `20261014102000` n'ajoutent
qu'une colonne facultative et un index unique partiel chacune (plus, pour le dépôt, un septième paramètre facultatif à `encaisser_depot`) ;
elles ne réécrivent aucune donnée financière. Leurs retours sont indépendants et se jouent dans l'ordre inverse (102000, 101000, 100000) ;
chacun dit combien de clés disparaissent (ce sont des références techniques : les encaissements, dépôts et écritures restent). Le retour
**réintroduit** le défaut PR178-B-06 (un encaissement rejouable après une réponse perdue) et **ne défait pas le code de l'application** :
l'application candidate écrit `cle_envoi` (et appelle `encaisser_depot` avec `p_cle_envoi`) ; sur une base revenue en arrière, ces saisies
échoueraient. Revenir au code précédent **avant** de jouer ces scripts. Ils se rejouent sans effet.

**Clés d'envoi des encaissements (14/10, D05).** Les trois migrations `20261014100000`, `20261014101000` et `20261014102000` n'ajoutent
qu'une colonne facultative et un index unique partiel chacune (plus, pour le dépôt, un septième paramètre facultatif à `encaisser_depot`) ;
elles ne réécrivent aucune donnée financière. Leurs retours sont indépendants et se jouent dans l'ordre inverse (102000, 101000, 100000) ;
chacun dit combien de clés disparaissent (ce sont des références techniques : les encaissements, dépôts et écritures restent). Le retour
**réintroduit** le défaut PR178-B-06 (un encaissement rejouable après une réponse perdue) et **ne défait pas le code de l'application** :
l'application candidate écrit `cle_envoi` (et appelle `encaisser_depot` avec `p_cle_envoi`) ; sur une base revenue en arrière, ces saisies
échoueraient. Revenir au code précédent **avant** de jouer ces scripts. Ils se rejouent sans effet.

Les deux migrations ne partagent aucune fonction : leurs retours sont indépendants (essayé dans les deux ordres et un par un).
L'ordre inverse (120000 puis 110000) reste l'ordre recommandé.
| `20261014200000_arret_urgence_taches_planifiees.retour.sql` | `20261014200000_arret_urgence_taches_planifiees.sql` (D06 : l'arrêt d'urgence couvre les 8 tâches `pg_cron`) | 8 fonctions planifiées (l'appel au prédicat est retiré), 1 fonction et 1 table supprimées, 1 ligne d'historique. Refuse de s'exécuter si une autre fonction appelle encore le prédicat. Aucune donnée métier touchée. |
| `verifier-etat.sql` | rien (lecture seule) | dit pour chaque objet s'il est « migré (B) » ou « antérieur (A) » |

Les deux premières migrations ne partagent aucune fonction : leurs retours sont indépendants (essayé dans les deux ordres et un par un).
L'ordre inverse (120000 puis 110000) reste l'ordre recommandé. Le retour de `20261014200000` ne touche aucune de leurs fonctions : il se joue seul,
avec la même procédure (essayé sur une copie de la base de recette : fonctions rétablies à l'identique, rejeu sans effet, marche avant
redonnant exactement l'état migré, refus dans un lot ouvert).

## Les quatre retours du 14 octobre 2026 (lot « bail-sortie »)

`verifier-etat.sql` ne couvre que les deux migrations du 13/10. Pour celles du 14/10, la marque du correctif se lit dans la définition
en vigueur : `select pg_get_functiondef('public.generer_appels_loyer_interne(uuid)'::regprocedure) like '%Décision D01 du 14/10 (PROP-14)%';`
(de même `Décision D34 du 14/10 (SOR-04)` pour `terminer_bail(uuid,date,boolean)`, `Décision D34 du 14/10 (SOR-03)` pour `controler_mise_en_location(uuid)`,
`Décision D35 (1) du 14/10 (SOR-02)` pour `demarrer_restitution(uuid,date,boolean)` ; la couche ajoutée par 123000 sur cette même fonction porte `Relecture du 14/10 (alerte du délai légal)`).
Les migrations 120000, 121000 et 122000 ne touchent aucune fonction en commun : leurs retours sont indépendants, dans n'importe quel ordre (essayé dans les deux sens,
122000 → 121000 → 120000 et 120000 → 121000 → 122000). **123000 s'ajoute à 122000 sur `demarrer_restitution`** : son retour se joue de préférence AVANT celui de 122000 (ordre inverse des migrations).
Dans l'autre ordre (essayé), le retour de 122000 rétablit déjà l'ancienne fonction, celui de 123000 répond « marque du correctif absente, rien à faire » puis retire la fonction interne devenue inutile : même état final.

| Script | Défaut qui revient | Ce que le retour ne défait pas |
|---|---|---|
| `20261014120000` | PROP-14 : le premier terme d'un bail qui entre en cours de mois redevient exigible le jour d'échéance du mois, donc avant l'entrée | Les appels générés pendant que la migration était en place gardent leur échéance (le 16, par exemple) : le script ne touche **aucun appel** |
| `20261014121000` | SOR-03 : un bail peut être activé avec une entrée antérieure à la sortie du bail précédent du même lot. SOR-04 : la clôture avant la fin du préavis ne demande plus de confirmation et n'enregistre plus de sortie réelle. `terminer_bail` retrouve son seul argument : **l'écran de clôture du code applicatif candidat appelle la version à trois arguments et échouera tant que le code n'est pas revenu lui aussi** | La colonne `baux.date_sortie_reelle` et les dates déjà saisies (données de gestion : elles restent, sans effet une fois les fonctions revenues). La supprimer relève d'une décision écrite du dirigeant, hors de ce script |
| `20261014122000` | SOR-02 : `demarrer_restitution` accepte de nouveau une remise des clés datée du futur, et un nouvel envoi tant que la restitution est « en cours » relit de nouveau, en silence, le dépôt, les impayés et le trop-perçu | Aucune restitution existante : dates et montants déjà enregistrés restent tels quels |
| `20261014123000` | Corriger la remise des clés ou le délai d'une restitution en cours ne remet plus l'alerte « à rendre avant le … » à la bonne date : elle peut afficher une date postérieure au vrai délai légal jusqu'à ce que le seuil change | Aucune alerte ni restitution : les alertes déjà remises à jour ou fermées (`closed_action` « Délai légal corrigé : … », seuil `corrige`) restent telles quelles ; le cron en repose une à J-7 au besoin |

Les droits des fonctions ne changent dans aucun sens (`generer_appels_loyer_interne` reste fermée aux comptes : seul `service_role` l'exécute ; la fonction interne `rafraichir_alerte_restitution` de 123000 est fermée de la même façon).

**Essai du retour de 123000** (banc local, base jetable reconstruite depuis `ordre-migrations.txt`) : A = les migrations jusqu'à 122000 ; B = avec 123000 ; C = B puis le retour. Empreinte de toutes les fonctions de `public`
(définition, droits, `security definer`, propriétaire : 554 fonctions en A, 555 en B) : **A = C**, B ≠ A ; simulation par `sed` (empreinte inchangée, identique à B), rejeu du retour (« rien à faire », empreinte identique),
marche avant (la migration rejouée sur C redonne exactement B), migration rejouée sur B (sans effet). Limites : mêmes que ci-dessous (banc, PostgreSQL 16, aucun essai sur la production).

**Preuves de l'essai** (banc local, base jetable reconstruite depuis `ordre-migrations.txt`) : A = les migrations d'origine **sans** les trois du 14/10 ; B = avec ; C = B puis les trois retours.
Comparés entre A et C : définition, drapeaux, droits et propriétaire de chacune des fonctions de `public`, contraintes, déclencheurs, politiques RLS et colonnes. **Seule différence : la colonne
`baux.date_sortie_reelle`, conservée à dessein.** Essayés en plus : simulation par `sed` (base inchangée, empreinte identique à B), rejeu des trois retours (« marque du correctif absente, rien à faire »,
empreinte identique), marche avant (les trois migrations rejouées sur C redonnent exactement B) et rejeu des migrations (sans effet). Limites : base de banc, PostgreSQL 16, aucun essai sur la production,
ni sur une copie restaurée de sauvegarde, ni avec des baux portant une sortie réelle (le script se borne alors à dire leur nombre).
L'ordre inverse (120000 puis 110000) reste l'ordre recommandé. `20261014210000` (caducité des devis d'artisan) ne partage aucune
fonction avec elles : son retour est indépendant des deux autres, dans n'importe quel ordre.
`20261014211000` (lecture de l'arrêt d'urgence par la caducité des devis) réécrit la même fonction interne que `20261014210000` : son retour se joue
**avant** celui de `20261014210000` (l'ordre inverse reste sans erreur : la fonction étant déjà supprimée, le script ne fait que retirer la ligne de
correspondance et l'historique).

## Les quatre retours du 14 octobre 2026 (lot « bail-sortie »)

`verifier-etat.sql` ne couvre que les deux migrations du 13/10. Pour celles du 14/10, la marque du correctif se lit dans la définition
en vigueur : `select pg_get_functiondef('public.generer_appels_loyer_interne(uuid)'::regprocedure) like '%Décision D01 du 14/10 (PROP-14)%';`
(de même `Décision D34 du 14/10 (SOR-04)` pour `terminer_bail(uuid,date,boolean)`, `Décision D34 du 14/10 (SOR-03)` pour `controler_mise_en_location(uuid)`,
`Décision D35 (1) du 14/10 (SOR-02)` pour `demarrer_restitution(uuid,date,boolean)` ; la couche ajoutée par 123000 sur cette même fonction porte `Relecture du 14/10 (alerte du délai légal)`).
Les migrations 120000, 121000 et 122000 ne touchent aucune fonction en commun : leurs retours sont indépendants, dans n'importe quel ordre (essayé dans les deux sens,
122000 → 121000 → 120000 et 120000 → 121000 → 122000). **123000 s'ajoute à 122000 sur `demarrer_restitution`** : son retour se joue de préférence AVANT celui de 122000 (ordre inverse des migrations).
Dans l'autre ordre (essayé), le retour de 122000 rétablit déjà l'ancienne fonction, celui de 123000 répond « marque du correctif absente, rien à faire » puis retire la fonction interne devenue inutile : même état final.

| Script | Défaut qui revient | Ce que le retour ne défait pas |
|---|---|---|
| `20261014120000` | PROP-14 : le premier terme d'un bail qui entre en cours de mois redevient exigible le jour d'échéance du mois, donc avant l'entrée | Les appels générés pendant que la migration était en place gardent leur échéance (le 16, par exemple) : le script ne touche **aucun appel** |
| `20261014121000` | SOR-03 : un bail peut être activé avec une entrée antérieure à la sortie du bail précédent du même lot. SOR-04 : la clôture avant la fin du préavis ne demande plus de confirmation et n'enregistre plus de sortie réelle. `terminer_bail` retrouve son seul argument : **l'écran de clôture du code applicatif candidat appelle la version à trois arguments et échouera tant que le code n'est pas revenu lui aussi** | La colonne `baux.date_sortie_reelle` et les dates déjà saisies (données de gestion : elles restent, sans effet une fois les fonctions revenues). La supprimer relève d'une décision écrite du dirigeant, hors de ce script |
| `20261014122000` | SOR-02 : `demarrer_restitution` accepte de nouveau une remise des clés datée du futur, et un nouvel envoi tant que la restitution est « en cours » relit de nouveau, en silence, le dépôt, les impayés et le trop-perçu | Aucune restitution existante : dates et montants déjà enregistrés restent tels quels |
| `20261014123000` | Corriger la remise des clés ou le délai d'une restitution en cours ne remet plus l'alerte « à rendre avant le … » à la bonne date : elle peut afficher une date postérieure au vrai délai légal jusqu'à ce que le seuil change | Aucune alerte ni restitution : les alertes déjà remises à jour ou fermées (`closed_action` « Délai légal corrigé : … », seuil `corrige`) restent telles quelles ; le cron en repose une à J-7 au besoin |

Les droits des fonctions ne changent dans aucun sens (`generer_appels_loyer_interne` reste fermée aux comptes : seul `service_role` l'exécute ; la fonction interne `rafraichir_alerte_restitution` de 123000 est fermée de la même façon).

**Essai du retour de 123000** (banc local, base jetable reconstruite depuis `ordre-migrations.txt`) : A = les migrations jusqu'à 122000 ; B = avec 123000 ; C = B puis le retour. Empreinte de toutes les fonctions de `public`
(définition, droits, `security definer`, propriétaire : 554 fonctions en A, 555 en B) : **A = C**, B ≠ A ; simulation par `sed` (empreinte inchangée, identique à B), rejeu du retour (« rien à faire », empreinte identique),
marche avant (la migration rejouée sur C redonne exactement B), migration rejouée sur B (sans effet). Limites : mêmes que ci-dessous (banc, PostgreSQL 16, aucun essai sur la production).

**Preuves de l'essai** (banc local, base jetable reconstruite depuis `ordre-migrations.txt`) : A = les migrations d'origine **sans** les trois du 14/10 ; B = avec ; C = B puis les trois retours.
Comparés entre A et C : définition, drapeaux, droits et propriétaire de chacune des fonctions de `public`, contraintes, déclencheurs, politiques RLS et colonnes. **Seule différence : la colonne
`baux.date_sortie_reelle`, conservée à dessein.** Essayés en plus : simulation par `sed` (base inchangée, empreinte identique à B), rejeu des trois retours (« marque du correctif absente, rien à faire »,
empreinte identique), marche avant (les trois migrations rejouées sur C redonnent exactement B) et rejeu des migrations (sans effet). Limites : base de banc, PostgreSQL 16, aucun essai sur la production,
ni sur une copie restaurée de sauvegarde, ni avec des baux portant une sortie réelle (le script se borne alors à dire leur nombre).

## Comment ces scripts ont été écrits

Aucune définition n'est écrite de mémoire. Chaque fonction antérieure vient d'une base **reconstruite en rejouant les migrations
d'origine** (`app/e2e/local/ordre-migrations.txt`, sans les deux migrations du 13/10), puis lue par `pg_get_functiondef` et recopiée
par un générateur. C'est nécessaire : une fonction comme `annuler_mission` n'a pas de « version d'origine » dans un seul fichier, car
les migrations suivantes y ont injecté des gardes en relisant sa définition (c'est la raison d'être de la migration 120000 elle-même).
La contrainte antérieure est celle de `20260930220000_validation_factures_artisan.sql`.

## Quand l'utiliser, et quand ne pas le faire

À envisager **seulement** si une des deux migrations cause un dommage constaté en production et qu'une correction en avant (nouvelle
migration) est plus lente ou plus risquée. Un retour arrière **réintroduit** les défauts corrigés :

| Script | Défaut qui revient |
|---|---|
| 120000 | AUD-A-01 (un agent restreint peut modifier les équipements de tout lot), AUD-A-02 et AUD-A-04 (annulation d'écriture et suppression de détention sans trace d'audit), AUD-A-03 (pas d'événement d'incident à l'annulation d'une mission), SUP-02 (l'arrêt d'urgence est refusé pendant une session de diagnostic), SUP-08 (alerte déjà escaladée requalifiée), REP-01 (second envoi de créneaux du locataire refusé), ARC-10 (« aujourd'hui » au jour UTC : date du jour refusée entre minuit et 2 h à Paris) |
| 110000 | La préparation du soir de la publication marketing ne part plus depuis `pg_cron` (elle ne se fait plus que par le rattrapage du matin, sans fenêtre de veto la veille) |
| 20261014210000 | AUT-01 : plus rien ne passe les devis périmés à « expiré » ; leur sollicitation reste « vivante » et garde l'une des deux places de la mise en concurrence (RM-9.1.1) ; l'artisan ne peut ni décliner ni redéposer ; `maintenance_artisans()` redevient la seule voie (à la main, super-administrateur, jour du serveur et non jour de Paris) |

| 20261014211000 | L'arrêt d'urgence (global ou « rappels ») n'arrête plus la caducité des devis d'artisan, une fois le lot D06 intégré : la tâche continue de passer des devis à « expiré » pendant un arrêt. Sans le lot D06, aucun effet visible. |

Si un seul défaut gêne, préférer un retour d'**une** fonction (copier son bloc `select pg_temp.restaurer_fonction(...)`) ou une correction en avant.

## Ce que le retour arrière ne défait PAS

- Les **données écrites avec la nouvelle valeur** : lignes `incident_evenements.type = 'mission_annulee'` (voir la section dédiée).
- Les **lignes d'audit** déjà écrites : `audit_log` (`contre_ecriture`, `detention_supprimee`). Elles restent lisibles, jamais supprimées.
- Les créneaux passés à `caduc` par la nouvelle `contre_proposer_creneaux` (le type existe déjà dans l'énumération d'origine).
- Les journaux et notifications partis entre-temps.
- Les devis passés à `expire` et les sollicitations passées à `expiree` par la tâche `maintenance-artisans` (20261014210000) : la base ne garde
  pas l'état d'avant, le retour ne les touche pas (ils restent « expirés », ce qui est exact). Voir « Avant la première exécution de la tâche
  `maintenance-artisans` » ci-dessous.
- Le **code de l'application** : la compatibilité d'une application candidate servie sur une base revenue à l'état antérieur n'a pas été essayée.

## Procédure

1. **Préparer.** Lancer « Sauvegarde quotidienne » à la main (Actions, `workflow_dispatch`) et attendre son succès (le bilan ne contient que des
   nombres). Jouer `verifier-etat.sql` : tout doit se lire « migrée (B) ». Vérifier qu'**aucune migration postérieure** à 20261013120000
   n'a réécrit ces fonctions (`git log --oneline -- app/supabase/migrations | head` ; chercher leurs noms) : sinon les scripts écraseraient
   ses ajouts, il faut les régénérer.
2. **Simuler.** `sed 's/^commit;$/rollback;/' <script> | psql "$URL" -v ON_ERROR_STOP=1` : tout est joué puis annulé.
3. **Exécuter**, dans l'ordre inverse :
   ```
   psql "$URL" -v ON_ERROR_STOP=1 -f 20261014211000_maintenance_artisans_arret_urgence.retour.sql     # seulement si cette migration est en cause (avant 210000)
   psql "$URL" -v ON_ERROR_STOP=1 -f 20261014210000_maintenance_artisans_expiration_cron.retour.sql   # seulement si cette migration est en cause
   psql "$URL" -v ON_ERROR_STOP=1 -f 20261013120000_correctifs_audit_13_octobre.retour.sql
   psql "$URL" -v ON_ERROR_STOP=1 -f 20261013110000_marketing_preparation_du_soir_cron.retour.sql
   ```
   `$URL` : le pooler en mode session (port 5432), comme `migrations.yml` ; le mot de passe par `PGPASSWORD`, jamais dans la ligne de commande ni dans un journal.
   Chaque script ouvre et ferme **sa** transaction : la moindre erreur annule tout. Il refuse de se jouer dans un lot déjà ouvert
   (`begin;` de `migrations.yml`, `psql --single-transaction`) : son `commit` validerait alors le lot entier et la simulation ne simulerait plus rien.
   **Ne jamais le passer à `migrations.yml`** (ce chantier laisse d'ailleurs passer un nom avec chemin, `../retours-arriere/...`, et inscrirait une version fantaisiste).
4. **Vérifier.** `verifier-etat.sql` : tout doit se lire « antérieure (A) » et la liste des versions doit être vide. Les scripts retirent eux-mêmes les versions
   `20261013110000`, `20261013120000`, `20261014210000` et `20261014211000` de `supabase_migrations.schema_migrations`, sans quoi `migrations.yml` refuserait de les rejouer (« version déjà enregistrée »).
5. **Consigner** la décision, l'heure, l'opérateur et le résultat (journal du wiki).

Rejeu : relancer un script sur une base déjà revenue ne change rien (chaque fonction répond « marque du correctif absente, rien à faire »).
Marche avant : après un retour, `migrations.yml` réapplique les deux migrations et redonne exactement l'état migré (essayé).

## Avant la première exécution de la tâche `maintenance-artisans` (20261014210000)

La migration ne réécrit **aucune donnée** : c'est le premier passage de la tâche (04 h 30 UTC, le lendemain de l'application) qui passe d'un coup à « expiré »
tous les devis encore « déposés » dont la validité est dépassée, et à « expirée » leur sollicitation. Ces statuts ne se restaurent pas automatiquement.
Un relevé de production, **en lecture seule**, doit donc être pris **avant** d'appliquer la migration (il n'a pas été fait par l'agent : la production n'a pas été consultée) :

1. `psql "$URL" -v ON_ERROR_STOP=1 -f releve-devis-perimes.sql` (le mot de passe par `PGPASSWORD`). Le fichier ne contient que des `select`.
2. Il répond à cinq questions : combien de devis « déposés » sont périmés (et dans combien d'agences et d'incidents) ; la liste exacte, avec l'état de leur sollicitation
   et de leur mise en concurrence ; les incidents dont les deux places sont tenues par des devis périmés (ceux que la tâche débloque) ; combien de sollicitations restées
   sans réponse la tâche ne traitera pas ; et si une tâche `maintenance-artisans` existe déjà hors dépôt.
3. Garder la liste (2e requête) avec la décision : `\copy (…) to 'releve-devis-perimes.csv' csv header`. Elle ne contient que des identifiants et des dates.
4. Si le nombre de devis est élevé ou si une date de validité paraît mal saisie, **décider avant** d'appliquer la migration : la tâche applique la règle RM-9.2.3 sans exception.

Pour défaire après coup (cas exceptionnel, décision humaine, identifiant par identifiant) : remettre `incident_devis.statut = 'depose'` et
`incident_sollicitations.statut = 'devis_depose'` pour les identifiants du relevé, **seulement si** le devis est toujours `expire` et que la sollicitation est toujours `expiree`
(un autre artisan a pu être sollicité sur la place libérée, un autre devis retenu). Jamais en masse, jamais sans le relevé.

La tâche n'appelle **pas** la purge des motifs de liste noire (reportée avant septembre 2029, durées à faire valider) ; elle ne traite pas non plus les sollicitations
restées sans réponse (voir le rapport du lot).

## Avec le lot « arrêt d'urgence » (D06, migration `20261014200000`) : ordre et points à reprendre à l'intégration

`20261014211000` fait lire l'arrêt d'urgence à la caducité des devis (décision D42, point 5, avec D06 option A). Elle n'a besoin d'aucun objet du lot D06 pour
s'appliquer : sans le prédicat `tache_planifiee_autorisee`, la fonction ne lit rien et la migration n'inscrit rien. Dès que le lot D06 est là, l'arrêt agit.

- **Ordre.** `20261014200000` (D06) d'abord, puis `20261014210000`, puis `20261014211000` : c'est l'ordre de `ordre-migrations.txt`. Si D06 arrive
  **après** `20261014211000`, la tâche manque dans la table de correspondance et le prédicat refuse la tâche (« Tâche planifiée inconnue de la table
  d'arrêt ») : elle échoue à chaque passage. Inscrire alors la ligne avant le prochain passage (04 h 30 UTC) :
  `insert into public.supervision_taches_arret (tache, cle) values ('maintenance-artisans', 'rappels') on conflict do nothing;`
- **Clé « rappels » : à confirmer par le dirigeant** (« Rendez-vous et suivi des dossiers », équipe « Incidents et artisans »). Aucune clé d'arrêt n'est propre à la
  tâche ; l'arrêt « global » l'arrête dans tous les cas. Changer la clé = changer la ligne de la table.
- **La tâche est la neuvième.** Dans le lot D06, à mettre à jour à l'intégration (vérifié sur une fusion d'essai : tout passe ensuite) :
  `tests/arret-taches-planifiees.test.ts` (table `CORRESPONDANCE`, 9 tâches), `tests/sauvegarde-taches-planifiees.test.ts` (deux cas : 9 tâches, `taches_planifiees` à 9),
  `src/lib/nom-arret-supervision.ts` (`TACHES_SQL` : l'écran « Relais et arrêts » doit citer la caducité des devis parmi les tâches arrêtées) et les tests qui comptent
  ces tâches (`tests/arret-urgence-ecrans.test.ts`), `docs/sauvegarde-et-restauration.md` (« Huit tâches SQL »). Deux conflits d'ajout en fin de fichier à résoudre :
  `ordre-migrations.txt` (garder `200000`, `210000`, `211000` dans cet ordre) et ce LISEZ-MOI.
- **Ce que l'arrêt ne couvre pas ici** : la purge manuelle des motifs de liste noire de `maintenance_artisans()` (usage manuel du super-administrateur, non planifiée).
  Appelée pendant un arrêt, la version publique rend `devis_expires = 0` (la caducité est arrêtée) et fait sa purge.

## Lignes `mission_annulee` : comportement et procédure

La contrainte antérieure ne connaît pas `mission_annulee`. Tant qu'une ligne utilise cette valeur, PostgreSQL refuse de la reposer
(`check constraint "incident_evenements_type_check" … is violated by some row`, essayé). Le script de 120000 le détecte **avant tout
travail** et s'arrête avec `RETOUR ARRIÈRE REFUSÉ, rien n'a été modifié : N ligne(s)…` (état de la base strictement inchangé, essayé).

Trois issues, à décider par un humain :

1. **Ne pas défaire 120000** (corriger en avant) : rien à faire, c'est le choix par défaut si des annulations de mission ont eu lieu.
2. **Défaire en gardant ces lignes** : jouer d'abord `set gerimmo.retour_arriere_conserver_mission_annulee = 'oui';` dans la même session, puis le script.
   Tout est rétabli sauf la contrainte, posée `NOT VALID` : elle refuse toute **nouvelle** écriture `mission_annulee` (essayé), laisse les lignes existantes
   intactes et lisibles, mais `validate constraint` échoue tant qu'elles existent. Toute mise à jour de ces lignes serait refusée. `pg_dump` émet bien la contrainte
   `NOT VALID` (essayé), donc une restauration ne bute pas dessus. `verifier-etat.sql` l'indique (« NOT VALID »). La marche avant remet une contrainte validée.
3. **Modifier ou supprimer les lignes** pour poser la contrainte validée : jamais en automatique. Ces lignes sont des traces d'audit visibles du locataire et de l'artisan
   (le fil de l'incident) ; une telle opération relève d'une décision écrite du dirigeant, hors de ce dépôt.

## Preuves de l'essai (banc local, PostgreSQL 16, base jetable)

Base reconstruite depuis `ordre-migrations.txt` : A (avant) → migrations appliquées comme `migrations.yml` (une transaction) → B → retours → C.
Comparés entre A et C, dans la même base : définition de **toutes** les fonctions de `public` (empreinte md5 de `pg_get_functiondef`, drapeaux, ACL, propriétaire),
contraintes, déclencheurs, politiques RLS, ACL des relations, index, vues, tâches `cron`, historique des migrations, nombre de lignes de chacune des 145 tables
et `pg_dump --schema-only -n public` (droits compris) : **identiques**. La suite de tests d'intégration SQL du dépôt (105 fichiers, 1329 tests) donne sur C le même
résultat qu'en A, test par test (27 échecs attendus : les tests des correctifs du 13/10 ; 0 échec en B). Essayés en plus : rejeu, un seul retour, l'ordre inverse du
recommandé, réapplication, refus avec `mission_annulee`, option `NOT VALID`, lignes d'audit conservées, refus d'un lot ouvert, simulation par `sed`,
et les retours joués sur une copie **restaurée** de la sauvegarde. Dossier de preuves de l'audit : `retour-arriere/` (journal : `essai/00_journal_essai_final.txt`).

Limites : base de banc (quelques centaines de lignes), PostgreSQL 16 (la production est en 17 : les scripts ne comparent jamais de texte pour décider, seulement la
présence de la marque du correctif) ; durée de chaque script < 0,1 s sur le banc, non mesurée sur le volume de production ; aucun essai sur la production.

## Lot « données personnelles » (14 octobre 2026) : quatre migrations, un ordre, une étape sans retour

Décisions D13 (fiche SUP-05), D48 (fiche IA-11) et D16 (fiche ART-15). Ordre d'application : `230000` (faits sans noms), `231000` (règles de
conservation), puis `232000` (effacement, **étape irréversible**, seulement après une sauvegarde) ; `233000` (photos du locataire visibles de
l'artisan) est indépendante des trois autres. Ordre de retour : l'inverse (`233000`, `232000`, `231000`, `230000`).
`233000` ne touche aucune politique de stockage ni aucune table : son retour ne fait que supprimer ses deux fonctions, mais le code de
l'application qui les appelle doit être retiré avec elles (sinon les écrans de la demande de devis et de la mission disent que les photos
n'ont pas pu être chargées).

- **`232000` n'a pas de retour arrière pour les données.** Avant de l'appliquer en production : lancer « Sauvegarde quotidienne » à la main,
  attendre son succès, puis jouer l'étape dans une session qui commence par `set local gerimmo.sauvegarde_confirmee = 'oui';` (voir l'en-tête de la
  migration). Sans cette confirmation, et s'il existe au moins un instantané de version 1, l'étape s'arrête par une erreur et rien n'est effacé.
- **`231000` : les règles naissent actives, la première purge est irrécupérable.** Le premier passage d'`appliquer_retention` après la migration
  supprime ce qui a plus de six mois dans les cinq registres (`agent_passages`, `supervision_operations`, `points_du_matin`, `decisions_du_matin`,
  `brief_direction_snapshots`). Sauvegarde d'abord. Pour différer la purge sans retirer les règles : `update public.retention_rules set actif = false where data_type = 'journal:…'`.
- Les trois scripts qui rétablissent des fonctions (`230000`, `231000`, `233000`) partagent la même garde (refus dans un lot ouvert) et la même marque
  de rejeu que ceux du 13/10. `230000` utilise le même outil `pg_temp.restaurer_fonction` (définitions antérieures lues sur une base reconstruite sans
  ces migrations, recopiées par un générateur). `231000` utilise un outil différent, `pg_temp.retirer_bloc`, voir ci-dessous. Essayés sur une copie :
  définitions et droits des 4 fonctions identiques à l'état antérieur après les trois retours ; rejeu sans effet ; marche avant ; refus dans un lot.
- `verifier-etat.sql` ne couvre pas ce lot : le contrôle se fait par `select pg_get_functiondef(…)` (marque « D13 (SUP-05) » ou « purger_registres_execution »)
  et `select data_type from public.retention_rules where data_type like 'journal:%'`.

### Fusion avec l'arrêt d'urgence des tâches planifiées (`20261014200000`, branche `lot-arret-taches`)

Les deux lots modifient la **même fonction**, `appliquer_retention` : `231000` y ajoute l'appel à la purge des registres, `200000` y ajoute la garde de
l'arrêt d'urgence (« Audit du 14/10 (SUP-01) »). Dans le sens aller, les deux ajouts se font par ancre sur la définition en vigueur et se composent dans
les deux ordres (essayé). Dans le sens retour :

- **Le retour de `231000` est chirurgical.** Il ne rétablit pas une ancienne définition : il retire de la définition en vigueur le seul bloc que `231000`
  y a posé (commentaire « D48 / D13 » et appel `purger_registres_execution`). La garde de l'arrêt d'urgence reste donc en place (essayé : garde présente,
  appel à la purge absent, définition identique à celle d'une base qui n'aurait jamais reçu `231000`). Si la marque est là mais que le bloc ne figure pas
  exactement une fois (fonction réécrite à la main), le script s'arrête par une erreur et ne supprime rien, pas même la fonction de purge.
  (Avant la relecture du 14/10, ce retour rétablissait la définition d'avant la migration et supprimait la garde en silence si `200000` était en place.)
- **Le retour de `200000`, lui, rétablit des définitions entières** (ce lot est livré séparément). Rejoué AVANT celui de `231000`, il supprimerait aussi
  l'appel à la purge des registres de `appliquer_retention` sans que ce retour ait été décidé. **Ordre de retour à respecter si les deux lots sont
  appliqués : `231000` d'abord, puis `200000`** ; ou, mieux, rendre le retour de `200000` chirurgical à son tour (retirer la garde par son texte exact
  dans les huit fonctions) avant de le jouer. Cette modification relève du lot `lot-arret-taches` et n'est pas faite ici.
- **Avant tout retour**, l'étape 1 de la procédure demande de vérifier les migrations postérieures à `20261013120000` : pour ce lot, chercher dans
  `app/supabase/migrations/` toute autre migration qui réécrit `appliquer_retention`, `preparer_faits_direction`, `lire_faits_direction`,
  `collecter_source_direction`, `organisations_citees_faits_direction`, `libelle_generique_alerte` (230000) ou `mes_photos_incident_artisan` (233000).
  Au 14/10, seule `200000` touche `appliquer_retention` ; aucune autre branche ne réécrit les fonctions de `230000` ni de `233000`. Le retour de `230000`
  rétablit des définitions entières : il écraserait une réécriture ultérieure de ces fonctions.
## Lot « chaîne d'incident » (migrations 20261014300000 à 20261014302000)

Trois migrations indépendantes (aucune fonction commune) ; trois retours indépendants, à jouer **dans l'ordre inverse** de préférence
(302000, 301000, 300000), chacun avec la procédure ci-dessus (simulation par `sed`, puis exécution). Même méthode que plus haut : chaque
définition antérieure est lue par `pg_get_functiondef` sur une base reconstruite sans ces migrations, et chaque fonction n'est rétablie
que si sa **marque** est dans la définition en vigueur (« Audit du 13/10 (CHN-01) », « (ART-21) », « (PRO2-13) »).

| Retour | Défaut qui revient | Ce que le retour ne défait PAS |
|---|---|---|
| 302000 | CHN-01 : un choix de créneau enregistre de nouveau les autres dates « refusées », qui recomptent dans les six refus | les créneaux déjà passés à « caduc » (valeur d'origine de l'énumération) |
| 301000 | ART-21 : plus aucune trace d'écart à la chronologie quand l'artisan démarre, rend compte ou facture plus de 2 h avant le rendez-vous | les clés `avant_rendez_vous`, `debut_prevu`, `ecart_minutes` déjà écrites dans `incident_evenements.details` (lignes de chronologie, jamais supprimées) |
| 300000 | PRO2-13 : plus d'alerte dans l'application à la réception d'un devis ; plus rien ne ferme les alertes `devis_a_decider` | les alertes `devis_a_decider` déjà écrites (voir ci-dessous) |

Rejouables : un script relancé sur une base déjà revenue répond « marque du correctif absente, rien à faire » pour chaque fonction.
Le retour 301000 ne supprime `ecart_rendez_vous` que si aucune fonction ne l'appelle plus (sinon il la garde et le dit).

**Alertes `devis_a_decider` après le retour 300000.** Elles restent en base, ouvertes pour celles qui l'étaient, et plus rien ne les ferme à la
décision. Le retour ne les modifie pas (il ne touche jamais une donnée écrite). Pour les fermer à la main, après décision :

```sql
update public.alerts
   set statut = 'fermee', closed_at = now(), closed_action = 'Alerte retirée (retour arrière 20261014300000)'
 where type = 'devis_a_decider' and statut = 'ouverte';
```

**Preuve de l'essai** (base jetable `gerimmo_ci_lane_j_retour`, PostgreSQL 16, reconstruite depuis `ordre-migrations.txt` sans les trois migrations) :
A (avant) → les trois migrations appliquées (une transaction chacune) → B → rejeu des trois : empreinte md5 des définitions et droits des 556 fonctions
de `public` **identique** à B → simulations par `sed` (annulées) → les trois retours → C : `pg_dump --schema-only -n public` de C **identique** à celui
de A (seuls diffèrent les jetons aléatoires `\restrict` / `\unrestrict` de `pg_dump`) → marche avant : les trois migrations rejouées sur C redonnent
exactement l'empreinte de B. Limites : base de banc, PostgreSQL 16 (la production est en 17), aucun essai sur la production.
## Lot artisan-externe — migrations du 14 octobre 2026 (D24-B et D25-B)

Deux migrations du lot « clients externes » (module désactivé en production), avec leur retour arrière dans ce dossier. Même procédure que ci-dessus
(préparer, simuler, exécuter, vérifier, consigner), avec ces particularités.

| Migration | Ajoute | Le retour retire |
|---|---|---|
| `20261014310000` (D24-B, ARC-04) | l'index unique `artisan_factures_externes_numero_normalise_key` sur `(artisan_id, lower(btrim(numero)))` ; un bloc entre `-- >> Audit du 14/10 (ARC-04)` et `-- << Audit du 14/10 (ARC-04)` dans `artisan_externe_ecrire` | exactement ce bloc et cet index |
| `20261014311000` (D25-B, ARC-08) | la fonction `artisan_exclusion_plateforme()` ; un bloc entre `-- >> Audit du 14/10 (ARC-08)` et `-- << Audit du 14/10 (ARC-08)` dans `artisan_externe_ecrire` ; la clé `'exclusion'` dans `mon_activite_artisan_privee` | exactement ces trois ajouts |

**Méthode chirurgicale.** Ces retours ne recopient pas une ancienne définition : ils relisent la définition **d'aujourd'hui** (`pg_get_functiondef`) et en retirent le bloc
marqué que la migration avait ajouté. Ils n'effacent donc pas ce qu'une autre migration aurait modifié dans la même fonction depuis. Si une marque est présente
mais que le bloc n'est plus intact (marque retouchée, répétée), le script s'arrête **sans rien modifier** (`Retour arrière refusé… le bloc … n'est plus intact`).
Sans marque, il ne fait rien (rejouable). Les deux retours sont indépendants : dans l'un ou l'autre ordre, la base revient au même état.

**Aucune donnée n'est touchée**, ni par les migrations ni par les retours : pas de facture modifiée, pas de statut d'artisan lu ou changé. Ce que le retour réintroduit :
après `…310000.retour`, deux factures de numéros « ART-1 » et « art-1 » peuvent de nouveau coexister (celles déjà déposées restent ce qu'elles sont) ; après
`…311000.retour`, un artisan refusé ou sur liste noire globale peut de nouveau créer clients, chantiers, devis et factures. Avant de jouer le retour de `…311000`, le script vérifie
qu'**aucune autre fonction** ne cite `artisan_exclusion_plateforme()` (sinon il refuse : la supprimer la casserait).

**Migration `…310000` et numéros déjà en double.** Si deux factures d'un même artisan ne différaient que par la casse ou les espaces de bord, la migration **s'arrête avant de créer l'index**,
sans rien modifier, en donnant le nombre de numéros concernés : garder l'une ou l'autre est une décision du dirigeant (fiche ARC-04). Le module étant désactivé en production, aucune facture externe n'est attendue.

Vérifier l'état (lecture seule) : « vrai » = migrée (B), « faux » = antérieure (A).

```sql
select position('-- >> Audit du 14/10 (ARC-04)' in pg_get_functiondef('public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)'::regprocedure)) > 0 as arc04_bloc_dans_la_fonction,
       to_regclass('public.artisan_factures_externes_numero_normalise_key') is not null as arc04_index_unique,
       position('-- >> Audit du 14/10 (ARC-08)' in pg_get_functiondef('public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)'::regprocedure)) > 0 as arc08_bloc_dans_la_fonction,
       position('''exclusion'',public.artisan_exclusion_plateforme()' in pg_get_functiondef('public.mon_activite_artisan_privee()'::regprocedure)) > 0 as arc08_cle_de_lecture,
       to_regprocedure('public.artisan_exclusion_plateforme()') is not null as arc08_fonction;
select version from supabase_migrations.schema_migrations where version in ('20261014310000', '20261014311000') order by 1;
```

Essais du 14/10/2026 (base de banc jetable, copie de la base migrée) : état A mesuré avant les migrations (empreinte md5 des définitions et ACL), migrations, retours dans les **deux** ordres →
définitions et droits **identiques** à l'état A ; marche avant (migrations rejouées) → identique à l'état B ; rejeu de chaque retour → « rien à faire » ; refus dans un lot
(`psql --single-transaction`) ; marque de fin retouchée → refus et base inchangée ; numéros déjà en double → la migration s'arrête, aucune ligne modifiée. Les tests
`tests/artisan-externe-migrations-rejeu.test.ts` (rejeu, définitions inattendues, cohérence des marques entre migration et retour) et
`tests/artisan-externe-numero-et-exclusion.test.ts` (comportement) couvrent le reste. Limites : base de banc, PostgreSQL 16 ; aucun essai sur la production.

## Lot « finance-dates » — migrations du 14 octobre 2026 (X13, X09, X14)

Six migrations (plage `20261014410000` à `20261014419999`), six retours dans ce dossier. Même procédure que ci-dessus (préparer, simuler, exécuter, vérifier,
consigner). **Ordre des retours : l'inverse des migrations** (416000, 415000, 414000, 413000, 412000, 410000) ; les six sont indépendants (aucune fonction partagée), l'ordre
est une habitude, pas une contrainte.

| Migration | Ajoute | Le retour rétablit |
|---|---|---|
| `20261014410000` (X13, FIN-13) | `encaisser_reste_atomique` pose `date_paiement = (now() at time zone 'Europe/Paris')::date` (marque `Décision X13 du 15/10 (FIN-13)`) | la définition d'avant (aucune date : la base posait le jour de son fuseau) |
| `20261014412000` (X09, FIN-03) | la contrainte `encaissements_montant_centime_check` (`montant = round(montant, 2)`), posée **NOT VALID** | rien à rétablir : la contrainte est supprimée |
| `20261014413000` (X14, PR178-B-03) | `ecrire_encaissement` refuse un encaissement dont les honoraires seraient arrondis à 0,00 €, avec le montant minimal (marque `Décision X14 du 15/10 (PR178-B-03)`) | la définition d'avant (aucun plancher) |
| `20261014414000` (X09, constat de relecture du 15/10) | la contrainte `encaissements_montant_fini_check` (`montant <> 'NaN' and montant <> 'Infinity'`), posée **NOT VALID**, en plus de la contrainte de centime | rien à rétablir : la contrainte est supprimée (celle du centime reste) |
| `20261014415000` (X09, constat de relecture du 15/10) | `reprendre_soldes` refuse dès le contrôle toute ligne dont le montant n'est pas au centime près (« Montant au centime près : … ») et tout montant NaN/Infinity (« illisible ») ; marque `Décision X09 du 15/10 (FIN-03, reprise de soldes)` | la définition d'avant (aucun contrôle du centime) |
| `20261014416000` (X13, constat de relecture du 15/10) | `resynchroniser_quittances` date l'émission (quittance, reçu réémis) de `(now() at time zone 'Europe/Paris')::date` (marque `Décision X13 du 15/10 (FIN-13)`, deux fois) ; le défaut de `quittances.date_emission` devient le même jour | la définition d'avant (`current_date`) et le défaut `CURRENT_DATE` |

**Élargissement retiré du lot (constat de relecture du 15/10, non ratifié).** Une migration `20261014411000` faisait aussi lire « échu » au jour de Paris dans
`etat_loyers_bail_brut`, `fiche_lot` et `contrats_du_lot`. La décision X13 ne demande que la date de « Encaisser » ; cette migration changeait le moment où un loyer passe
« impayé » (écran du locataire, fiche du lot), sans que le dirigeant l'ait ratifiée, et laissait `suivre_impayes_bail` (alertes) et `relances_loyer_dues` (relances, jours de retard)
sur le jour de la session : de 22 h à 24 h UTC, l'écran aurait dit « impayé » alors que l'alerte et la relance n'étaient pas encore posées (reproduit). Elle est **retirée du lot**
(fichiers supprimés, ligne du manifeste retirée) ; ces cinq fonctions sont donc **inchangées**. Conséquence connue : le test e2e `encaissement-reste.spec.ts`, qui date l'échéance de la veille
**à Paris** et attend « Impayé », échoue toujours de 22 h à 24 h UTC (heure d'été ; 23 h à 24 h l'hiver), comme avant le lot (constat par lecture du test et du code, non rejoué : les e2e exigent un navigateur). Si le dirigeant ratifie l'élargissement, il faudra aligner AUSSI
`suivre_impayes_bail` et `relances_loyer_dues` ; la migration retirée reste lisible dans l'historique de la branche (commit `c30698c`, fichier `20261014411000_loyer_echu_jour_de_paris.sql`).

**Aucune donnée n'est réécrite**, ni par les migrations ni par les retours : aucun encaissement, aucune écriture, aucun appel de loyer n'est modifié. La contrainte
NOT VALID ne relit pas les lignes existantes (le relevé de production du 13/10 en compte zéro hors centime) ; elle s'applique aux insertions et modifications à venir.
Les règlements déjà enregistrés la veille d'un jour de création entre 22 h et 24 h UTC (FIN-13) se repèrent par la requête de contrôle de la fiche (lecture seule) ; les
corriger relève d'une décision écrite du dirigeant. Il en va de même des quittances déjà émises dans cette fenêtre avec la date de la veille (`20261014416000` ne date que les émissions
à venir) : aucune clé ne relie la date d'émission d'une quittance à celle du règlement qui l'a produite, donc pas de relevé automatique fiable ; un relevé à la main, approximatif, compare `quittances.date_emission`
au `date_paiement` des encaissements du même bail enregistrés à la même minute que la quittance (`created_at`).

**Méthode.** Les migrations relisent la définition en vigueur (`pg_get_functiondef`), remplacent une ancre et s'arrêtent si elle est absente ou répétée ; elles se
rejouent sans effet (la marque dit que c'est fait). Les retours **recopient** la définition d'avant, extraite d'une base reconstruite sans la migration (générateur,
aucune définition écrite à la main), et ne la rétablissent que si la marque est présente dans la définition en vigueur (sans marque : « rien à faire »).

Ce que le retour ne défait pas : le code de l'application ne dépend d'aucun de ces objets (aucune colonne ni signature nouvelle) ; il n'y a donc pas de code à remettre avant.
Le retour de `…413000` réintroduit le message générique « Gerimmo n'a pas pu terminer cette action » pour un encaissement de 0,01 € sous mandat ; celui de `…412000`, la possibilité
d'écrire un montant à trois décimales par une requête directe.

Vérifier l'état (lecture seule) : « vrai » = migrée (B), « faux » = antérieure (A).

```sql
select position('Décision X13 du 15/10 (FIN-13)' in pg_get_functiondef('public.encaisser_reste_atomique(uuid,uuid,uuid,uuid,numeric,numeric)'::regprocedure)) > 0 as x13_encaisser,
       exists (select 1 from pg_constraint where conname = 'encaissements_montant_centime_check') as x09_contrainte,
       exists (select 1 from pg_constraint where conname = 'encaissements_montant_fini_check') as x09_contrainte_finie,
       position('Décision X14 du 15/10 (PR178-B-03)' in pg_get_functiondef('public.ecrire_encaissement()'::regprocedure)) > 0 as x14_plancher,
       position('Décision X09 du 15/10 (FIN-03, reprise de soldes)' in pg_get_functiondef('public.reprendre_soldes(uuid,uuid,jsonb,boolean)'::regprocedure)) > 0 as x09_reprise,
       position('Décision X13 du 15/10 (FIN-13)' in pg_get_functiondef('public.resynchroniser_quittances(uuid)'::regprocedure)) > 0 as x13_quittances,
       (select pg_get_expr(d.adbin, d.adrelid) like '%Europe/Paris%' from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
         where d.adrelid = 'public.quittances'::regclass and a.attname = 'date_emission') as x13_defaut_emission;
select version from supabase_migrations.schema_migrations where version in ('20261014410000', '20261014412000', '20261014413000', '20261014414000', '20261014415000', '20261014416000') order by 1;
```

Avant de valider les contraintes (`alter table public.encaissements validate constraint encaissements_montant_centime_check`, puis `… encaissements_montant_fini_check` ; décision du dirigeant, hors de ces scripts),
rejouer le relevé de la fiche FIN-03 : `select count(*) from public.encaissements where montant <> round(montant, 2);` doit rendre zéro, et de même
`select count(*) from public.encaissements where montant = 'NaN' or montant = 'Infinity';` (une ligne NaN passe le contrôle du centime : le relevé du 13/10 ne la comptait pas),
sans quoi la validation échoue (aucune donnée n'est alors modifiée).

**Hors périmètre, à décider par le dirigeant :** la table `ecritures` (`montant > 0`) accepte elle aussi « NaN » par une requête directe d'un compte connecté ; la contrainte de centime et la contrainte
« fini » ne portent que sur `encaissements`, comme la décision X09. Les étendre aux écritures est une décision à part (la fiche FIN-03 citait aussi `ecritures.montant`).

Essais du 15/10/2026 (bases de banc jetables, PostgreSQL 16, reconstruites depuis le manifeste ; copie de la base migrée pour chaque essai) : refus de se jouer dans un lot ouvert
(`psql --single-transaction`) ; les six retours joués dans l'ordre inverse → les quatre définitions (avec leurs droits), les contraintes et le défaut de `quittances.date_emission` sont
**identiques, empreinte md5 comparée,** à ceux d'une base construite SANS les six migrations (332 migrations) ; les trois derniers retours seuls (414000 à 416000) → identiques à ceux d'une base construite sans eux
(335 migrations) ; rejeu des retours sans effet (« rien à faire ») ; marche avant des migrations → l'état migré (338 migrations) est retrouvé à l'identique ; rejeu des migrations sans effet.
Les tests `tests/finance-dates-rejeu.test.ts` (rejeu, définitions inattendues, corps des retours, cohérence des marques, périmètre), `tests/finance-dates-jour-de-paris.test.ts` (X13, quittances),
`tests/finance-dates-centime-plancher.test.ts` (X09, X14) et `tests/finance-dates-reprise-centime.test.ts` (reprise de soldes) couvrent le reste. Limites : base de banc,
PostgreSQL 16, extension `pg_cron` simulée ; aucun essai sur la production.
## Lot « fuseau-paris » (15 octobre 2026) : cinq migrations, `20261014500000` à `20261014504000`

**Le défaut.** La base comparait des dates d'échéance de loyer à `current_date`, le jour du fuseau de la **session** (UTC chez Supabase), alors que toute
l'application raisonne au jour de Paris. Entre 22 h et 24 h UTC (00 h à 02 h à Paris), un loyer échu la veille à Paris restait « attendu », et des objets voisins
divergeaient (l'état disait « impayé » pendant que `suivre_impayes_bail` en comptait zéro). **La correction** : une fonction unique, `public.aujourdhui_paris()`
(`(now() at time zone 'Europe/Paris')::date`, indépendante du fuseau de la session), à laquelle sont rattachés tous les objets qui décident d'une règle de loyer.
Aucun montant, aucune colonne, aucune signature, aucun droit ne change ; **aucune ligne existante n'est réécrite** (les appels déjà générés gardent leur échéance,
les quittances et encaissements déjà datés leur date).

**Ordre des retours.** Inverse de l'aller : `…504000`, `…503000`, `…502000`, `…501000`, puis `…500000` **en dernier**. Les quatre premiers sont indépendants entre eux
(chacun défait sa famille). Le retour de `…500000` **refuse** tant qu'une fonction cite encore `aujourdhui_paris()` ou qu'une colonne l'a pour défaut, et les nomme : il
n'efface jamais une fonction sous un appel qui la nomme. Chaque retour relit la définition en vigueur, remet `current_date` à la place (nombre d'occurrences exigé à
l'unité près, sinon il s'arrête sans rien modifier), se rejoue sans effet et refuse de se jouer dans un lot. Il rétablit `current_date` en minuscules ; la logique est celle d'avant.

| Migration | Objets réécrits (nombre de `current_date` remplacés) |
|---|---|
| `…500000_jour_de_paris_fonction` | crée `aujourdhui_paris()` ; droits : authenticated et service_role, jamais anon |
| `…501000_jour_de_paris_etat_loyers_et_impayes` | `etat_loyers_bail_brut` (1), `suivre_impayes_bail` (1), `relances_loyer_dues` (6), `relance_loyer_consigner` (2), `actualiser_orchestration` (2), `collecter_source_direction` (7, voir ci-dessous) ; défaut de `relances.date_envoi` |
| `…502000_jour_de_paris_lot_et_contrats` | `contrats_du_lot` (2), `fiche_lot` (2), `historique_du_lot` (2, et ses trois jours d'événement tirés d'un horodatage : `edl.signe_le`, `i.created_at`, `i.clos_le`, convertis à Paris une fois chacun) |
| `…503000_jour_de_paris_appels_et_quittances` | `generer_appels_loyer_interne` (2), `cycle_mensuel_interne` (1), `resynchroniser_quittances` (2, **voir la vague 4a ci-dessous**), `quittances_a_envoyer` (1), `appels_a_envoyer` (1) ; défaut de `quittances.date_emission` (idem) |
| `…504000_jour_de_paris_encaissements` | `contre_passer_encaissement` (2) ; défaut de `encaissements.date_paiement` |

`collecter_source_direction` : le compteur « alertes en retard / dans 7 jours » (source `echeances`) range les alertes de toutes natures, dont l'alerte d'impayé, dans la
même fonction que les échéances de loyer. On ne peut pas le couper par nature sans changer sa règle : il passe donc lui aussi au jour de Paris (effet de bord assumé et
borné : le seul jour de référence de ce compteur, pour les alertes de diagnostics et d'assurances qu'il compte aussi).

**Vague 4a (décision X13, `20261014416000`, en production depuis le 15/10).** Elle a déjà daté `resynchroniser_quittances` (ses deux `current_date`) et le défaut de `quittances.date_emission`
du jour de Paris, par l'expression explicite `(now() at time zone 'Europe/Paris')::date` et non par `aujourdhui_paris()` (le relevé en lecture seule du 15/10, consigné au journal, donne 0 `current_date` pour `resynchroniser_quittances`).
Sur cette base, `…503000` **laisse ces deux objets tels quels** (même résultat ; les tests de la vague 4a exigent cette écriture) : elle ne les accepte **que** sous cette forme exacte, en nombre exact (deux expressions dans la fonction ;
le défaut rendu par le catalogue `((now() AT TIME ZONE 'Europe/Paris'::text))::date`) ; toute autre définition l'arrête, sans rien modifier, avec un message qui nomme la fonction ou la colonne. Sur une base qui n'a pas la vague 4a
(le banc d'avant), elle convertit comme pour les autres objets. Le retour de `…503000` ne remet **jamais** `current_date` sur ces deux objets, sinon il défairait X13 : il les nomme « rien à faire ». Seul le retour de
`20261014416000` (`20261014416000_quittance_jour_de_paris.retour.sql`) les défait. À la fusion avec la vague 4a, deux tests de celle-ci (`finance-dates-jour-de-paris.test.ts`, `finance-dates-rejeu.test.ts`) attendent encore
`current_date` dans l'état des loyers, la fiche du lot, les contrats du lot, les impayés et les relances (périmètre que la vague 4a avait restreint à « Encaisser ») : ces assertions sont à aligner avec ce lot (voir le journal).

**Ce qui n'est PAS modifié, volontairement** (liste complète et raisons dans la fiche du lot) : le dépôt de garantie (`encaisser_depot`, `contre_passer_depot_encaissement`,
`depot_encaissements.date_encaissement`), le journal comptable général (`contre_ecriture`, `ecritures.date_piece`, `ecritures.date_imputation`), la révision IRL
(`reviser_loyer`), le terme du bail (`terme_bail`), la régularisation de charges (`regulariser_charges`), le rapport de gestion (`rapport_du_lot`), les mandats, l'abonnement,
les artisans, les diagnostics, les assurances et les restitutions. Le **jour** auquel le cycle mensuel tourne (tâche `cycle-mensuel`, le 1er à 05 h UTC) n'est pas touché non plus :
c'est une règle métier, pas un fuseau.

**Côté application** (code, aucun retour SQL) : l'avis d'échéance imprimé date « Établi le » et « Fait à … le » du jour de Paris (`src/lib/documents/modeles/avis-echeance.ts`) ; « Mes paiements » du
locataire lit le mois suivant sur le jour de Paris (`premierDuMoisSuivant`, `src/lib/echeances.ts`). Revenir au code précédent ne demande rien côté base.

**Avant d'appliquer en production (lecture seule).** Les migrations relisent la définition en vigueur de chaque fonction et **s'arrêtent** si le nombre de `current_date` n'est pas celui
attendu ; la mise en forme d'une fonction en production peut différer du banc sans que cela les gêne (aucune ancre de plusieurs lignes). Pour le savoir **avant** de lancer `migrations.yml`,
jouer cette requête sur la production : la colonne `trouves` doit égaler `attendu` partout, **sauf `resynchroniser_quittances`** (après la vague 4a, appliquée en production le 15/10 : `trouves` = 0 et `jour_de_paris_explicite` = 2, les deux
expressions de X13), et les trois défauts doivent valoir `CURRENT_DATE`, **sauf celui de `quittances.date_emission`**, qui vaut alors `((now() AT TIME ZONE 'Europe/Paris'::text))::date`.

```sql
select f.signature, f.attendu,
       (select count(*) from regexp_matches(pg_get_functiondef(to_regprocedure(f.signature)), '\mcurrent_date\M', 'gi')) as trouves,
       (select count(*) from regexp_matches(pg_get_functiondef(to_regprocedure(f.signature)), '\(\s*now\(\)\s+at\s+time\s+zone\s+''Europe/Paris''\s*\)\s*::\s*date', 'gi')) as jour_de_paris_explicite,
       md5(regexp_replace(lower(pg_get_functiondef(to_regprocedure(f.signature))), '\s+', ' ', 'g')) as empreinte_espaces_normalises
from (values
  ('public.etat_loyers_bail_brut(uuid)', 1), ('public.suivre_impayes_bail(uuid)', 1), ('public.relances_loyer_dues(integer)', 6),
  ('public.relance_loyer_consigner(uuid,text,text)', 2), ('public.actualiser_orchestration()', 2), ('public.collecter_source_direction(text)', 7),
  ('public.contrats_du_lot(uuid)', 2), ('public.fiche_lot(uuid)', 2), ('public.historique_du_lot(uuid,integer)', 2),
  ('public.generer_appels_loyer_interne(uuid)', 2), ('public.cycle_mensuel_interne()', 1), ('public.resynchroniser_quittances(uuid)', 2),
  ('public.quittances_a_envoyer(integer)', 1), ('public.appels_a_envoyer(integer)', 1), ('public.contre_passer_encaissement()', 2)
) as f(signature, attendu) order by 1;
select c.table_name, c.column_name, c.column_default from information_schema.columns c
 where c.table_schema = 'public' and (c.table_name, c.column_name) in (('encaissements','date_paiement'), ('quittances','date_emission'), ('relances','date_envoi'));
```

`empreinte_espaces_normalises` se compare à la même requête jouée sur une base de banc reconstruite avec les migrations d'origine (la comparaison à espaces normalisés dit si deux
définitions ont la même logique malgré une mise en forme différente).

Vérifier l'état après coup (lecture seule) : « vrai » = migrée (B), « faux » = antérieure (A).

```sql
select to_regprocedure('public.aujourdhui_paris()') is not null as fonction_du_jour,
       position('public.aujourdhui_paris()' in pg_get_functiondef('public.etat_loyers_bail_brut(uuid)'::regprocedure)) > 0 as etat_au_jour_de_paris,
       position('public.aujourdhui_paris()' in pg_get_functiondef('public.fiche_lot(uuid)'::regprocedure)) > 0 as fiche_au_jour_de_paris,
       (position('public.aujourdhui_paris()' in pg_get_functiondef('public.resynchroniser_quittances(uuid)'::regprocedure)) > 0
        or position('at time zone ''Europe/Paris''' in pg_get_functiondef('public.resynchroniser_quittances(uuid)'::regprocedure)) > 0) as quittances_au_jour_de_paris,
       position('public.aujourdhui_paris()' in pg_get_functiondef('public.contre_passer_encaissement()'::regprocedure)) > 0 as contre_ecriture_au_jour_de_paris,
       (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'encaissements' and column_name = 'date_paiement') as defaut_encaissements;
select version from supabase_migrations.schema_migrations where version between '20261014500000' and '20261014504000' order by 1;
```

Essais du 15/10/2026 (base de banc jetable PostgreSQL 16, copie de la base d'avant les migrations) : état A mesuré (empreinte md5 des 15 définitions, de leurs droits et des 3 défauts, 66 fonctions
de `public` lisant `current_date`, 0 fonction ouverte à anon) ; lot des cinq migrations joué dans **une seule transaction** comme `migrations.yml`, en simulation (annulée → base **identique à A**)
puis pour de bon (51 fonctions lisent encore `current_date` : les domaines voisins ; droits des 15 fonctions **identiques** à A) ; retours `504000` → `503000` → `502000` → `501000` → `500000` →
empreinte **identique à A**, fonction du jour de Paris absente ; marche avant (migrations rejouées) → empreinte **identique à B** ; retour de `500000` joué en premier → **refus** avec la liste des quinze
fonctions ; rejeu d'un retour → « rien à faire » ; retour joué dans un lot (`psql --single-transaction`) → refus. Les tests `tests/jour-de-paris-migrations-rejeu.test.ts` (rejeu, **mise en forme
différente**, définition inattendue, défaut étranger, retours, ordre) et `tests/jour-de-paris-loyers.test.ts` (comportement de chaque objet sous cinq « temps » simulés, cohérence entre tous les objets,
inventaire du catalogue) couvrent le reste. Constat de relecture du 15/10 (intégration avec la vague 4a, reproduit puis corrigé) : sur une base reconstruite avec les migrations `20261014400000` à `20261014420000`, l'ancienne `…503000` s'arrêtait
(« resynchroniser_quittances(uuid) ne lit ni current_date ni aujourdhui_paris() ») et annulait tout le lot ; la nouvelle passe. Essais sur cette base (copie de la base d'avant le lot, 341 migrations, PostgreSQL 16) : simulation des cinq migrations dans
une seule transaction annulée → base **identique** à l'état d'avant (empreinte md5 des 17 définitions et de leurs droits, des 3 défauts ; 65 fonctions lisent `current_date`) ; application dans une seule transaction → état **identique** à celui d'une base construite
avec le lot (51 fonctions lisent `current_date`, aucune ouverte à anon) ; retours `504000` → `500000` → empreinte **identique** à l'état d'avant, `resynchroniser_quittances` et le défaut de `quittances.date_emission` inchangés tout du long ; aller de nouveau → état migré
retrouvé. Sur la base d'avant la vague 4a, la nouvelle `…503000` donne la même empreinte que l'ancienne. Les tests du lot passent sur les deux bancs (avec et sans la vague 4a). Le fuseau de `aujourdhui_paris()` est vérifié en évaluant son corps sur des instants fixes
(changements d'heure compris), plus sur le texte de sa définition. Limites : base de banc ; aucun essai sur la production ; l'horloge réelle n'est jamais simulée, c'est le fuseau de la **session** qui l'est (et, pour les mois et
années, une fonction `aujourdhui_paris()` figée le temps d'une transaction de test).

## Lot « fuseau-suite » (15 octobre 2026) : deux migrations, `20261014820000` et `20261014821000`

**La décision.** Le dirigeant a répondu « recommandations » aux cinq questions laissées par le lot « fuseau-paris ». Ce lot fait les points 1, 2 et 5, et
**rien** pour les points 3 (l'heure du cycle mensuel des appels de loyer ne change pas) et 4 (le compteur « alertes en retard » du brief de la direction
ne change pas) : toute date « du jour » du dépôt de garantie, du journal comptable général, de la révision IRL, du terme du bail, de la régularisation des
charges et du rapport de gestion passe au jour de Paris (`public.aujourdhui_paris()`, migration `20261014500000`) ; la date « Fait le » des documents de
contrat est celle de Paris (code de l'application, aucun retour SQL). **Exemple du défaut** : une révision IRL datée d'aujourd'hui, saisie après minuit à
Paris, était refusée comme « datée de demain » (« Révision anticipée »). Aucun montant, aucune colonne, aucune signature, aucun droit ne change ; **aucune
ligne existante n'est réécrite** (dépôts, écritures, révisions, régularisations, rapports et alertes déjà enregistrés gardent leurs dates).

| Migration | Objets réécrits (nombre exact attendu AVANT la migration, tous remplacés) |
|---|---|
| `…820000_jour_de_paris_depot_et_journal` (point 1) | `encaisser_depot(uuid,numeric,date,text,uuid,text,uuid)` (3 `current_date`), `contre_passer_depot_encaissement()` (2), `contre_ecriture(uuid,text)` (1) ; défauts de `depot_encaissements.date_encaissement`, `ecritures.date_piece`, `ecritures.date_imputation` |
| `…821000_jour_de_paris_irl_terme_charges_rapports` (point 2) | `reviser_loyer(uuid,numeric,text,date)` (2, dont la valeur par défaut du paramètre `p_date_demande`), `terme_bail(uuid,date)` (1, la valeur par défaut de `p_date`), `regulariser_charges(uuid,integer,numeric,uuid,text,boolean)` (4), `rapport_du_lot(uuid,date)` (1), `envoyer_rapport(uuid,text)` (1) ; `preparer_rapports_automatiques()` (0 `current_date`, 1 `date_trunc('month',now())`, qui devient `date_trunc('month', public.aujourdhui_paris()::timestamp)`) ; défaut de `regularisations_charges.date_emission` |

**Comment.** Même méthode que le lot « fuseau-paris » : chaque fonction est relue dans sa définition en vigueur (`pg_get_functiondef`), on remplace le seul mot
`current_date` (aucune ancre de plusieurs lignes) et on exige le nombre exact ci-dessus. Une fonction **déjà** au jour de Paris (ce nombre exact de
`public.aujourdhui_paris()` ou de `(now() at time zone 'Europe/Paris')::date`, et plus aucun `current_date`) est laissée telle quelle, sans échec ; un défaut
déjà au jour de Paris aussi. Toute autre forme (autre nombre, mélange des deux, ni l'un ni l'autre, fonction absente, défaut étranger) arrête la migration
avec un message qui nomme l'objet, sans rien modifier.

**Hors de ce lot, volontairement** (non tranché par la décision) : les restitutions (`finaliser_decompte`, `marquer_decompte_envoye`, alertes de restitution :
la restitution du dépôt est une catégorie distincte du lot « fuseau-paris », sans question au dirigeant), les mandats, l'abonnement, les artisans, les
diagnostics, les assurances, les factures d'honoraires (`factures_honoraires.emise_le`), les appels de charges de copropriété (`appels_charges.date_reception`)
et les clés de répartition (`cles_repartition.date_effet`). Le test `tests/jour-de-paris-suite-migrations-rejeu.test.ts` tient l'inventaire : aucune autre
fonction de ces domaines ne lit le jour de la session, hors `actualiser_orchestration_socle` (restitutions et devis), classée. **Depuis le 16/10**, la restitution
du dépôt (`finaliser_decompte`, `marquer_decompte_envoye`) est au jour de Paris : migration `20261014851000`, section « Lot « correctifs-base » » plus bas.

**Ordre des retours.** Les deux retours sont indépendants entre eux (aucune fonction commune) ; ordre recommandé : `…821000` puis `…820000`. Ils se jouent
**AVANT** le retour de `20261014500000`, qui refuse tant qu'un objet cite `aujourdhui_paris()` et nomme ces fonctions. Ordre complet si tout doit être défait :
`20261019120000` (liste d'attente du site vitrine : bornes, index et commentaire ; indépendant), `20261018231827` (abonnements au jour de Paris), `20261016210000` (retour du changement d'adresse), `20261016200000` (compléments Q3 : cinq fonctions et trois défauts), `20261016190000` (reprise de la relance avant envoi), `20261016180000` (sentinelle et rétention du relais), `20261016172453` (traversée et support), `20261016150000` (confirmation Auth), `20261016110100` (relance et prise d'acte RDV), `20261016110000` (PDF et alertes du devis), puis
`20261019121000` (droits anon : contact et articles ; clés des prospects), `20261019120500` (relance : périodicité et montant de la période ; recrée la fonction que le retour suivant réécrit, donc avant lui), `20261018231827` (abonnements au jour de Paris), `20261016210000` (retour du changement d'adresse), `20261016200000` (compléments Q3 : cinq fonctions et trois défauts), `20261016190000` (reprise de la relance avant envoi), `20261016180000` (sentinelle et rétention du relais), `20261016172453` (traversée et support), `20261016150000` (confirmation Auth), `20261016110100` (relance et prise d'acte RDV), `20261016110000` (PDF et alertes du devis), puis
`20261019122000` (demandes de contact dans l'e-mail du relais), `20261018231827` (abonnements au jour de Paris), `20261016210000` (retour du changement d'adresse), `20261016200000` (compléments Q3 : cinq fonctions et trois défauts), `20261016190000` (reprise de la relance avant envoi), `20261016180000` (sentinelle et rétention du relais), `20261016172453` (traversée et support), `20261016150000` (confirmation Auth), `20261016110100` (relance et prise d'acte RDV), `20261016110000` (PDF et alertes du devis), puis
`20261019123000` (identité : clés des prestataires), `20261018231827` (abonnements au jour de Paris), `20261016210000` (retour du changement d'adresse), `20261016200000` (compléments Q3 : cinq fonctions et trois défauts), `20261016190000` (reprise de la relance avant envoi), `20261016180000` (sentinelle et rétention du relais), `20261016172453` (traversée et support), `20261016150000` (confirmation Auth), `20261016110100` (relance et prise d'acte RDV), `20261016110000` (PDF et alertes du devis), puis
`851000` (restitution du dépôt), `850000` (catalogue de rétention), `812000`, `811000`, `810000` (les trois paliers du relais), `710000` (avoir sur facture externe), `730000` (plafond des appels IA), `830000` (relances d'invitation), `821000`, `820000`, `610000`, `602000`, `601000`, `600000`, `504000` → `501000`, puis `500000`. Le retour de `610000` (règlement de facture, D23) en fait
partie : `enregistrer_reglement_facture` et `retirer_reglement_facture` citent `aujourdhui_paris()`, et son retour les supprime ; il demande de revenir d'abord au
code d'avant D23 (voir sa ligne du tableau). `620000` ne cite pas la fonction du jour : il n'entre pas dans cette chaîne. Le test
`tests/jour-de-paris-suite-migrations-rejeu.test.ts` lit cette chaîne ici même et la joue telle qu'écrite, puis le retour de `500000` ;
`tests/jour-de-paris-migrations-rejeu.test.ts` joue la même, en retirant les fonctions de `610000` au lieu de jouer son retour.
Les retours historiques de dates relisent la définition en vigueur, remettent `current_date` (et `date_trunc('month',now())`) à sa place, nombre exact exigé (sinon ils s'arrêtent sans rien
modifier), se rejouent sans effet (« rien à faire »), refusent de se jouer dans un lot, et laissent en place une forme explicite du jour de Paris que la migration
n'avait pas posée. Revenir au code d'avant (documents) ne demande rien côté base, et inversement.

**Complément du 19 octobre.** Le retour `20261018231827_abonnement_jour_paris.retour.sql` précède toute la chaîne et se joue dans une transaction externe. Il remet les cinq calculs d’abonnement au jour de session sans changer les dates enregistrées, les montants ou les droits. Voir [la procédure détaillée](abonnement-19-octobre.md). Le retour `20261019120000_liste_attente_bornee.retour.sql` (lot M2 de l'audit du 19/10 : la table `public.liste_attente`, créée hors dépôt le 29/09 — version `20260929200141` dans l'historique de production, sans fichier au dépôt —, intégrée et bornée) le précède en tête de chaîne ; il se joue lui aussi dans une transaction externe, retire seulement les trois contraintes de borne, l'index unique sur `lower(email)`, le commentaire de table et sa version d'historique, rend à `authenticated` ses droits hérités, et **ne supprime ni la table ni ses lignes**. La version `20260929200141` reste dans l'historique de production sans fichier au dépôt : ne pas l'« adopter » (un fichier portant cette version serait rejoué sur le banc avec un contenu différent de celui appliqué).
**Complément du 19 octobre.** Le retour `20261018231827_abonnement_jour_paris.retour.sql` précède toute la chaîne et se joue dans une transaction externe. Il remet les cinq calculs d’abonnement au jour de session sans changer les dates enregistrées, les montants ou les droits. Voir [la procédure détaillée](abonnement-19-octobre.md). Le retour `20261019122000_relais_point_demandes_contact.retour.sql` (M16, dernière migration du manifeste) le précède à son tour : transaction externe également (`psql --single-transaction -v ON_ERROR_STOP=1 -f <retour>`), une fonction supprimée et sa version d'historique retirée, rien d'autre ; le code précédent doit être remis avant lui.
**Complément du 19 octobre.** Le retour `20261018231827_abonnement_jour_paris.retour.sql` ouvre la chaîne après le retour de l'identité (`20261019123000`) et se joue dans une transaction externe. Il remet les cinq calculs d’abonnement au jour de session sans changer les dates enregistrées, les montants ou les droits. Voir [la procédure détaillée](abonnement-19-octobre.md).

**Complément du 19 octobre (identité).** Le retour `20261019123000_identite_editeur_prestataires.retour.sql` ouvre désormais la chaîne, avant celui des abonnements ; il ne cite pas `aujourdhui_paris()` mais suit la convention (ordre inverse du manifeste) et se joue dans la même transaction externe. Il repose les deux contraintes d'origine de `supervision_identite` et retire sa version ; il **refuse** si une coordonnée ou une localisation de prestataire a été saisie (la retirer revient au dirigeant, depuis `/admin/parametres`, avant de rejouer le retour). En production au 19/10, la ligne vaut `{}` : rien à retirer, la ligne n'est pas touchée. Voir sa ligne du tableau.

**Compléments du 16 octobre.** Les versions à quatorze chiffres sont explicites ; les codes historiques à six chiffres ci-dessus désignent les versions préfixées par `20261014`. Cet ordre suit le manifeste en sens inverse. Pour les sept nouveaux retours, revenir d'abord au code compatible et lire la ligne du tableau : `20261016172453` et `20261016150000` gèrent leur propre transaction et refusent un lot ouvert ; les cinq autres n'ont pas de `COMMIT` interne et se jouent dans une transaction contrôlée, par exemple `psql --single-transaction -v ON_ERROR_STOP=1 -f <retour>`. Les retours historiques conservent leur enveloppe propre : ne pas leur ajouter `--single-transaction`. Aucun de ces sept retours n'a été exécuté en production pendant la mission. Chacun retire uniquement sa propre version de `supabase_migrations.schema_migrations`, dans la même transaction que le retour ; la migration nommée redevient donc applicable par le chantier normal après revue. Le retour `20261016110100` refuse de retirer ses RPC tant que le complément `20261016190000` est encore en place. La suite `tests/retours-oct16-registre.test.ts` vérifie cette garde, le maintien des autres versions et la réapplication avec réinscription des quatre versions T8/T9/T12. Les preuves locales de la chaîne complète sont les deux suites de rejeu des dates ; les traces de la mission sont conservées hors dépôt dans `rapports/Revue-T13-et-reprises.md`.

**Avant d'appliquer en production (lecture seule).** La colonne `trouves` doit égaler `attendu` partout, `deja_au_jour_de_paris` valoir 0 (ou `trouves` = 0 et
`deja_au_jour_de_paris` = `attendu` : la migration laisse alors la fonction telle quelle), `mois_de_session` valoir 1 pour `preparer_rapports_automatiques` et 0
ailleurs, et les quatre défauts `CURRENT_DATE`.

```sql
select f.signature, f.attendu,
       (select count(*) from regexp_matches(pg_get_functiondef(to_regprocedure(f.signature)), '\mcurrent_date\M', 'gi')) as trouves,
       (select count(*) from regexp_matches(pg_get_functiondef(to_regprocedure(f.signature)), '(\mpublic\.)?\maujourdhui_paris\(\)|\(\s*now\(\)\s+at\s+time\s+zone\s+''Europe/Paris''(::text)?\s*\)\)?\s*::\s*date', 'gi')) as deja_au_jour_de_paris,
       (select count(*) from regexp_matches(pg_get_functiondef(to_regprocedure(f.signature)), 'date_trunc\(\s*''month''\s*,\s*now\(\)\s*\)', 'gi')) as mois_de_session,
       md5(regexp_replace(lower(pg_get_functiondef(to_regprocedure(f.signature))), '\s+', ' ', 'g')) as empreinte_espaces_normalises
from (values
  ('public.encaisser_depot(uuid,numeric,date,text,uuid,text,uuid)', 3), ('public.contre_passer_depot_encaissement()', 2), ('public.contre_ecriture(uuid,text)', 1),
  ('public.reviser_loyer(uuid,numeric,text,date)', 2), ('public.terme_bail(uuid,date)', 1), ('public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)', 4),
  ('public.rapport_du_lot(uuid,date)', 1), ('public.envoyer_rapport(uuid,text)', 1), ('public.preparer_rapports_automatiques()', 0)
) as f(signature, attendu) order by 1;
select c.table_name, c.column_name, c.column_default from information_schema.columns c
 where c.table_schema = 'public' and (c.table_name, c.column_name) in
   (('depot_encaissements','date_encaissement'), ('ecritures','date_piece'), ('ecritures','date_imputation'), ('regularisations_charges','date_emission'))
 order by 1, 2;
```

`empreinte_espaces_normalises` sur la base de banc d'avant le lot (même requête, chemin de recherche par défaut) : `contre_ecriture` 92954ee46cdf3d8645aef924e9334cb5,
`contre_passer_depot_encaissement` 60f0325d21fffcd200f67deb6bc4ec83, `encaisser_depot` 7380c0d445f6ca933f3b01a2363614e8, `envoyer_rapport` ba76e55f66ef929ee312882b628f259e,
`preparer_rapports_automatiques` e0b3070f1b5c79232984bc450868b2a1, `rapport_du_lot` b3f578f7713d244b8d0796ca25ed1958, `regulariser_charges` eb3a3c9331134fb0e562924acc933eba,
`reviser_loyer` bb524d9e4dcf1268937dd9dea80a5660, `terme_bail` f7c8dbe452524b28484e9309edf8e931. Une empreinte différente en production ne bloque rien (le nombre exact
d'occurrences suffit à la migration) ; elle dit seulement que la fonction diffère du banc et mérite une lecture avant la simulation.

Vérifier l'état après coup (lecture seule) : « vrai » = migrée (B), « faux » = antérieure (A).

```sql
select position('aujourdhui_paris()' in pg_get_functiondef('public.encaisser_depot(uuid,numeric,date,text,uuid,text,uuid)'::regprocedure)) > 0 as depot_au_jour_de_paris,
       position('aujourdhui_paris()' in pg_get_functiondef('public.contre_ecriture(uuid,text)'::regprocedure)) > 0 as journal_au_jour_de_paris,
       position('aujourdhui_paris()' in pg_get_functiondef('public.reviser_loyer(uuid,numeric,text,date)'::regprocedure)) > 0 as irl_au_jour_de_paris,
       position('aujourdhui_paris()' in pg_get_functiondef('public.preparer_rapports_automatiques()'::regprocedure)) > 0 as rapport_au_mois_de_paris,
       (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'ecritures' and column_name = 'date_piece') as defaut_ecritures;
select version from supabase_migrations.schema_migrations where version in ('20261014820000', '20261014821000') order by 1;
```

**Côté application** (code, aucun retour SQL) : `formaterDateFr` (`src/lib/documents/gabarit.ts`) écrit un instant (heure de production, horodatage de signature d'un
état des lieux) au jour de Paris, ce qui corrige « Fait le » et « Établi le » de tous les modèles qui l'appellent (bail nu et meublé, congé, état des lieux, avenant,
notice, cautionnement, mandat, révision IRL, prorata, rappel d'assurance, décompte de restitution, avis d'échéance) ; une date seule s'écrit comme avant. Le congé
du bailleur sans date de présentation calcule le terme au jour de Paris (`aujourdhuiParis()`).

Essais du 15/10/2026 (base de banc jetable PostgreSQL 16, construite depuis `ordre-migrations.txt` sans ce lot ; état A mesuré : empreinte md5 des 572 fonctions de
`public` et de leurs droits, des valeurs par défaut ; 51 fonctions lisent `current_date`, 0 ouverte à anon) : simulation des deux migrations dans **une seule
transaction** annulée → base **identique à A** ; application dans une seule transaction → 43 fonctions lisent encore `current_date` (hors décision), droits des neuf
fonctions **identiques** à A, 0 fonction ouverte à anon ; sur une copie : retour de `500000` joué en premier → **refus** (il nomme, entre autres, les fonctions de ce
lot) ; retours `821000` puis `820000` → empreinte des 572 fonctions et des défauts **identique à A** ; rejeu des retours → « rien à faire » (13 fois) ; retour joué
dans un lot (`psql --single-transaction`) → refus ; marche avant → empreinte **identique à B** ; rejeu des migrations sur B → « déjà au jour de Paris » (9 fois),
empreinte inchangée. Limites : base de banc ; aucun essai sur la production ; l'horloge réelle n'est jamais simulée, c'est le fuseau de la session qui l'est, ou un
instant fixe substitué à `now()` dans le corps de `aujourdhui_paris()` le temps d'une transaction de test.

## Lot « correctifs-base » (16 octobre 2026) : deux migrations, `20261014850000` et `20261014851000`

**Les décisions.** Constats du tour final de vérification du 16/10/2026, appliqués à l'identique :
1. **D48** (« chaque nouveau registre naît avec sa règle ») : les registres créés le 15/10 sont déclarés au catalogue `retention_rules` et
   purgés par `appliquer_retention`, sur le modèle de `20261014231000`. Six mois partout : pour `relais_alertes_envois`, `relais_urgences` et
   `relais_urgences_envois`, la durée déjà codée dans leurs propres fonctions (`reserver_alerte_relais`, `prendre_urgences_relais`), qui ne
   sont **pas** modifiées ; pour `ia_appels_jour`, qui n'avait aucune purge, six mois comme les autres registres d'exécution (D48, D13).
2. **Décision du 15/10, point 1** (« dépôt de garantie et journal comptable général au jour de Paris ») : la **restitution** du dépôt, laissée
   au jour de la session par le lot « fuseau-suite », passe au jour de Paris. Aucun montant, aucune colonne, aucun droit ne change ; **aucune
   ligne existante n'est réécrite** (restitutions, décomptes envoyés, écritures, registres gardent leurs dates et leurs lignes).

| Migration | Objets touchés (nombre exact attendu AVANT la migration) |
|---|---|
| `…850000_retention_registres_relais_ia` (D48) | 4 règles `journal:relais_alertes_envois`, `journal:relais_urgences`, `journal:relais_urgences_envois`, `journal:ia_appels_jour` (6 mois, suppression, actives) ; 1 fonction nouvelle `purger_registres_relais_ia()` (fermée à `anon`, refus hors supervision et traitement planifié) ; `appliquer_retention()` complétée d'un appel posé juste **avant** la ligne de purge des signalements du support, ancre d'**une** ligne exigée **1** fois (sans son indentation) |
| `…851000_jour_de_paris_restitution_depot` (point 1) | `finaliser_decompte(uuid)` (**5** `current_date` : date d'émission du décompte, date de pièce et d'imputation des écritures « Restitution du dépôt de garantie » et « Restitution d'un trop-perçu au locataire ») ; `marquer_decompte_envoye(uuid,date)` (**2** : valeur par défaut de `p_date`, refus d'une date d'envoi postérieure au jour) |

**Inventaire (restitution du dépôt et journal comptable général).** Sur la base de banc d'avant le lot, 43 fonctions de `public` lisent
`current_date`. Parmi celles qui écrivent (insertion ou mise à jour) dans `restitutions`, `retenues`, `ecritures`, `depot_encaissements`,
`mouvements_mandants` ou `clotures_comptables`, seules `finaliser_decompte` et `marquer_decompte_envoye` le lisaient ; aucune n'utilise une autre
forme du jour de la session (`now()::date`, `localtimestamp`…) ; aucune valeur par défaut de ces tables ne lit plus `current_date`. Trois
fonctions lisent `current_date` et la restitution **sans écrire de date du jour** : `generer_alertes_restitution` et
`rafraichir_alerte_restitution` (seuil J-7 / J+0 de l'alerte du délai légal), `actualiser_orchestration_socle` (priorité d'un dossier de
pilotage) ; elles restent hors de ce lot, comme les honoraires, les appels de copropriété, les clés de répartition, l'assurance et
`org_ecriture_ouverte` (question au dirigeant). Le test `tests/jour-de-paris-restitution-migration-rejeu.test.ts` tient cet inventaire. Après
le lot : 41 fonctions lisent `current_date`. Depuis le complément `20261016200000` (Q3), les cinq fonctions et les trois défauts listés dans son entrée du tableau sont également au jour de Paris ; cet inventaire décrit le palier historique.

**Limite du palier D48 historique, levée par `20261016180000` (T12).** Avant ce complément, les purges propres au relais lisent leur durée en dur : désactiver ou allonger une règle du relais au catalogue
n'arrête pas leur purge à six mois, faite à chaque passage du relais. Les y rattacher demanderait de réécrire `reserver_alerte_relais` et
`prendre_urgences_relais`, hors du lot. La purge du catalogue saute un registre absent (retour de son lot joué seul) : le nettoyage de la nuit
n'échoue pas.

**Ordre des retours.** Les deux retours sont indépendants entre eux (aucun objet commun) ; ordre recommandé : `…851000` puis `…850000`. Leurs
fonctions citent `aujourdhui_paris()` : ils se jouent **AVANT** le retour de `20261014500000`, en tête de la chaîne complète donnée dans la section
« Lot « fuseau-suite » » ci-dessus. Le retour de `…850000` est indépendant de celui de `20261014231000` (blocs distincts dans
`appliquer_retention`, fonctions distinctes, n'importe quel ordre). Son outil de session porte un nom propre
(`pg_temp.retirer_bloc_registres_relais`) : le retour de `20261014610000`, plus loin dans la chaîne, pose son propre `pg_temp.retirer_bloc`.

**Avant d'appliquer en production (lecture seule).** Restitution : `trouves` doit égaler `attendu`, `deja_au_jour_de_paris` valoir 0 (ou
`trouves` = 0 et `deja_au_jour_de_paris` = `attendu` : la migration laisse alors la fonction telle quelle).

```sql
select f.signature, f.attendu,
       (select count(*) from regexp_matches(pg_get_functiondef(to_regprocedure(f.signature)), '\mcurrent_date\M', 'gi')) as trouves,
       (select count(*) from regexp_matches(pg_get_functiondef(to_regprocedure(f.signature)), '(\mpublic\.)?\maujourdhui_paris\(\)|\(\s*now\(\)\s+at\s+time\s+zone\s+''Europe/Paris''(::text)?\s*\)\)?\s*::\s*date', 'gi')) as deja_au_jour_de_paris,
       md5(regexp_replace(lower(pg_get_functiondef(to_regprocedure(f.signature))), '\s+', ' ', 'g')) as empreinte_espaces_normalises
from (values ('public.finaliser_decompte(uuid)', 5), ('public.marquer_decompte_envoye(uuid,date)', 2)) as f(signature, attendu) order by 1;
```

D48 : `ancre` doit valoir 1, `deja_branchee` faux, `purge_presente` faux, `regles_presentes` 0 ; la seconde requête dit ce que la première purge
supprimera (0 attendu : ces registres datent du 15/10).

```sql
select (length(d) - length(replace(d, $a$v_journaux := v_journaux || jsonb_build_object('signalements_support',public.purger_signalements_support());$a$, '')))
         / length($a$v_journaux := v_journaux || jsonb_build_object('signalements_support',public.purger_signalements_support());$a$) as ancre,
       position('purger_registres_relais_ia' in d) > 0 as deja_branchee,
       to_regprocedure('public.purger_registres_relais_ia()') is not null as purge_presente,
       (select count(*) from public.retention_rules where data_type in ('journal:relais_alertes_envois', 'journal:relais_urgences',
          'journal:relais_urgences_envois', 'journal:ia_appels_jour')) as regles_presentes,
       md5(regexp_replace(lower(d), '\s+', ' ', 'g')) as empreinte_espaces_normalises
  from (select pg_get_functiondef('public.appliquer_retention()'::regprocedure) as d) f;
select 'relais_alertes_envois' as registre, count(*) from public.relais_alertes_envois where jour < ((now() at time zone 'Europe/Paris')::date - interval '6 months')::date
union all select 'relais_urgences', count(*) from public.relais_urgences where statut in ('envoyee', 'quotidien', 'non_envoyee') and traitee_le < now() - interval '6 months'
union all select 'relais_urgences_envois', count(*) from public.relais_urgences_envois e
           where e.statut in ('envoye', 'abandonne') and e.commence_le < now() - interval '6 months' and not exists (select 1 from public.relais_urgences u where u.envoi_id = e.id)
union all select 'ia_appels_jour', count(*) from public.ia_appels_jour where jour < ((now() at time zone 'Europe/Paris')::date - interval '6 months')::date;
```

`empreinte_espaces_normalises` sur la base de banc d'avant le lot : `finaliser_decompte` 9027022fc044ede87ca306f6cff2a950, `marquer_decompte_envoye`
b601f6ea3ff21295ee459227e325e221, `appliquer_retention` d86e0705301f94834f0e148ff17e5b1f. Une empreinte différente en production ne bloque rien (le
nombre exact d'occurrences et l'ancre unique suffisent aux migrations) ; elle dit seulement que la fonction diffère du banc et mérite une lecture
avant la simulation.

Vérifier l'état après coup (lecture seule) : « vrai » = migrée (B), « faux » = antérieure (A).

```sql
select position('aujourdhui_paris()' in pg_get_functiondef('public.finaliser_decompte(uuid)'::regprocedure)) > 0 as restitution_au_jour_de_paris,
       position('aujourdhui_paris()' in pg_get_functiondef('public.marquer_decompte_envoye(uuid,date)'::regprocedure)) > 0 as envoi_au_jour_de_paris,
       position('purger_registres_relais_ia' in pg_get_functiondef('public.appliquer_retention()'::regprocedure)) > 0 as registres_du_15_10_purges,
       (select count(*) from public.retention_rules where data_type in ('journal:relais_alertes_envois', 'journal:relais_urgences',
          'journal:relais_urgences_envois', 'journal:ia_appels_jour')) = 4 as regles_declarees;
select version from supabase_migrations.schema_migrations where version in ('20261014850000', '20261014851000') order by 1;
```

Essais du 16/10/2026 (base de banc jetable PostgreSQL 16, construite depuis `ordre-migrations.txt` sans ce lot ; état A : empreinte md5 des 611
fonctions de `public` (définitions, droits, propriétaire), des 24 règles de conservation et des 542 valeurs par défaut ; 43 fonctions lisent
`current_date`, 0 ouverte à anon) : simulation des deux migrations dans **une seule transaction** annulée → base **identique à A** ; application
dans une seule transaction → 612 fonctions, 28 règles, valeurs par défaut inchangées, 41 fonctions lisent `current_date`, 0 ouverte à anon, état
**identique** à celui d'une base construite depuis le manifeste complet (B) ; rejeu des migrations sur B → « rien à faire » (3 fois), empreinte
inchangée ; retour de `500000` joué en premier → **refus** (il nomme `finaliser_decompte`, `marquer_decompte_envoye` et
`purger_registres_relais_ia`) ; retours joués dans un lot (`psql --single-transaction`) → refus ; simulation des retours par `sed` → base
identique à B ; retours `…851000` puis `…850000` → empreinte **identique à A** ; rejeu des retours → « rien à faire » ; marche avant → empreinte
**identique à B**. Les tests `tests/jour-de-paris-restitution.test.ts` (sept « temps », dont 23 h 30 UTC le 31 décembre = 0 h 30 le 1er janvier
à Paris), `tests/jour-de-paris-restitution-migration-rejeu.test.ts` et `tests/retention-registres-relais-ia.test.ts` (purge, critères
d'attente, règles désactivées, bascule de minuit, rejeu, ancre absente ou répétée, retour, composition avec `231000`) couvrent le reste.
Limites : base de banc ; aucun essai sur la production ; l'horloge réelle n'est jamais simulée, c'est le fuseau de la session qui l'est, ou un
instant fixe substitué à `now()` dans le corps de `aujourdhui_paris()` le temps d'une transaction de test.
