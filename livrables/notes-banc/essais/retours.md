# Essai « retours » (niveau 2) — 89cb87ff contre 81740dec, banc local, 25/11/2026
Verdict : RÉUSSI AVEC RÉSERVES. Les 52 retours passent et aucune ligne n'est perdue. Mais 11 retours laissent leur version au registre (rejeu refusé), et 2 restes ne sont pas écrits dans le LISEZ-MOI. Rien en production, aucun envoi (push), bases et arbres supprimés. Preuves : essais/retours/ (outils/, journal-retours/bilan.txt, instantanes/, rejeu-*/sortie.log).
## Vérifié (commande et sortie)
1. Base : bootstrap + 524 migrations de 81740dec + seed.sql. Les jeux phase 3 baux, loyers, colocation, dépôt-sortie et impayés passent sur l'ancien schéma (36 263 lignes ; charges-travaux seulement après le lot).
   Puis les 52 en UN lot, par une copie mot pour mot du bloc « Appliquer » de migrations.yml (seuls l'URL et le dossier de travail changent) : simulation « tout a été joué puis annulé », puis application (code 0).
2. Nouveautés exercées : bail coché « mariés ou pacsés » du 01/03/2020 avec départ (fin de solidarité vide) ; régularisation 2021 confirmée (−1 450) ; accords avec et sans empreinte ; relance à la main consignée, avec un e-mail clos et un en file ; type de vendeur et décision « sans médiateur ».
3. Les 52 retours sont joués un par un : `psql "$URL" -v ON_ERROR_STOP=1 -f <fichier>`, dans l'ordre du plan (inverse du manifeste). Tous réussissent (code 0).
   La chaîne « Ordre complet » (LISEZ-MOI, lignes 647 à 680) ne nomme que 23 des 52 retours ; ces 23 gardent son ordre dans la liste du plan.
   Variante (les 23 d'abord, dans l'ordre littéral de la chaîne, puis les 29 autres) : 52/52, même schéma.
4. Schéma comparé à 81740dec (pg_dump -s, comparé objet par objet).
   Restent : 5 tables (artisan_absences, artisan_semaine_type, artisan_lignes_devis, avenants_bail, intervention_rdv_manques), 14 colonnes sur 8 tables (baux.locataires_epoux_pacses, bail_personnes.entree_apres_signature, revisions_loyer.premier_terme et irl_reference_trimestre, intervention_factures.refus*/relance*, etc.) et la valeur document_type « notice_information ».
   Chacun de ces restes est écrit dans la ligne de son retour au LISEZ-MOI.
   NON écrits :
   - (a) retour 20261122190000 : verifier_gerant_avenant_bail(uuid,uuid) reste (exécutable par authenticated), avec la règle avenants_bail_lecture. Le LISEZ-MOI dit « quatre fonctions » ; la migration en crée cinq.
   - (b) retour 20261122234000 : le commentaire de edl_lignes.photo_document_id reste.
   Différences de forme seulement : ordre des droits de 4 fonctions (mêmes droits) ; noms d'index fk_<md5(oid)> (artefact du banc ; sans leur nom, seuls diffèrent les index des tables et colonnes gardées).
5. Registre après retours : 11 versions restent (20261125101500, 103000, 104000, 105000, 106000, 111000, 140000, 151000, 152000, 153000, 154000). Le plan § 5.4 le dit, le LISEZ-MOI non.
   Rejeu par migrations.yml : REFUSÉ, avec « ✗ 20261125101500_conge_textes_officiels_t1.sql : la version 20261125101500 est déjà enregistrée en base. » (code 1).
   Après « delete » à la main de ces 11 lignes : simulation et application réussies, schéma identique au schéma migré d'origine (6 212 objets, 0 écart), données inchangées.
6. Données (233 tables, nombre de lignes et md5 sur les colonnes de 81740dec, avant et après retours) : aucune ligne perdue (baux 18, appels 108, encaissements 102, quittances 101, documents 42, comptes 18).
   Trois contenus changent, et c'est écrit : e-mail en file → « a_verifier » (110000) ; typeVendeur effacé (106000) ; plancher archive:facture 120 → 72 mois, durée gardée à 120 (103000).
7. Plan § 5.4, jamais essayé jusqu'ici : « begin; \i ×52; rollback; » passe sans rien garder ; --single-transaction ×52 passe, avec le même schéma.
   Avec la commande prescrite, 20261122100000 affiche « WARNING: SET LOCAL can only be used in transaction blocks » : son verrou ne s'applique pas, alors que le fichier exige une transaction externe.
## Supposé (non vérifié)
- Production : pooler, rôle non superutilisateur, verrous sous charge, volume réel, registre réel (non lu).
- Ancien code 81740dec sur la base revenue : non essayé.
- Données d'essai petites, en partie posées en direct. pg_cron est simulé, mais aucun des 52 fichiers ne l'utilise (vérifié).
