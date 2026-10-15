# Retours arrière des migrations des 13 et 14 octobre 2026

Ce dossier **n'est pas** un dossier de migrations. Aucun chantier ne le lit : `migrations.yml` se place dans
`app/supabase/migrations/` et n'applique que les fichiers qu'on lui nomme (aucune occurrence de `retours-arriere` dans
`.github/workflows/`). Ces scripts se jouent **à la main**, après décision du dirigeant, une fois, et se consignent.

| Fichier | Défait | Objets touchés |
|---|---|---|
| `20261013120000_correctifs_audit_13_octobre.retour.sql` | `20261013120000_correctifs_audit_13_octobre.sql` | 9 fonctions, 3 déclencheurs `diagnostic_artisan_lecture`, la contrainte `incident_evenements_type_check`, 1 ligne d'historique |
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
| `20261014302000_creneaux_non_retenus_caducs.retour.sql` | `20261014302000_creneaux_non_retenus_caducs.sql` (lot « chaîne d'incident », D21) | 2 fonctions (`choisir_creneau`, `accepter_creneau_locataire`), 1 ligne d'historique |
| `20261014301000_ecart_rendez_vous_chronologie.retour.sql` | `20261014301000_ecart_rendez_vous_chronologie.sql` (lot « chaîne d'incident », D20) | 3 fonctions (`demarrer_intervention`, `deposer_compte_rendu`, `deposer_facture_artisan`), 1 fonction supprimée (`ecart_rendez_vous`), 1 ligne d'historique |
| `20261014300000_devis_a_decider_alerte.retour.sql` | `20261014300000_devis_a_decider_alerte.sql` (lot « chaîne d'incident », D19) | 1 fonction (`deposer_devis`), 1 déclencheur et sa fonction supprimés (`fermer_alerte_devis_a_decider`), 1 ligne d'historique |
| `20261014310000_artisan_facture_numero_unique.retour.sql` | `20261014310000_artisan_facture_numero_unique.sql` (D24-B, ARC-04) | 1 bloc retiré de `artisan_externe_ecrire`, 1 index unique supprimé, 1 ligne d'historique (voir la section « Lot artisan-externe » plus bas) |
| `20261014311000_artisan_exclusion_ecritures.retour.sql` | `20261014311000_artisan_exclusion_ecritures.sql` (D25-B, ARC-08) | 1 bloc retiré de `artisan_externe_ecrire`, 1 clé retirée de `mon_activite_artisan_privee`, 1 fonction supprimée, 1 ligne d'historique |
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
| `20261014600000_devis_refus_motive.retour.sql` | voir ci-dessus | — |

**Lot « devis-revisable » et lot « fuseau-paris ».** Les fonctions `refuser_devis`, `demander_revision_devis`, `deposer_devis` (version suivante) et
`expirer_revisions_devis` citent `public.aujourdhui_paris()` : le retour de `20261014500000` (qui retire cette fonction) refuse tant qu'elles existent et les
nomme. Ordre complet si tout doit être défait : `601000`, `600000`, puis les retours du lot fuseau-paris (`504000` → `501000`), puis `500000`. Le test
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
