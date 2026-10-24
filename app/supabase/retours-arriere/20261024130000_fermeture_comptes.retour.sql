-- Retour de 20261024130000 (conformité V1, lot 1E : fermeture des comptes, inactivité, export complet). Remettre
-- d'abord le code précédent : /admin/donnees (fermetures programmées), la route /agence/[orgId]/export-complet, la
-- section « Archive complète » de /compte/donnees et les suites de la mission « purge » appellent les objets retirés ici.
-- À jouer AVANT le retour de 20261024090000 (la garde de suppression lit `archives_comptes`).
--
-- REFUS d'abord (relecture du 24/10, M7) : tant qu'une fermeture programmée a posé un arrêt chez Stripe (fin de
-- période ou date d'arrêt) ou qu'un remboursement reste dû, le retour s'arrête sans rien défaire. Sinon la souscription
-- s'arrêterait à la date prévue sans effacement ni remboursement. Annuler ces fermetures depuis /admin/donnees (l'arrêt
-- est levé chez Stripe) et laisser la mission « purge » faire les remboursements dus, puis rejouer le retour.
--
-- Ce qui est défait :
--  · la tâche pg_cron « fermetures-comptes » et sa ligne dans `supervision_taches_arret` ;
--  · le déclencheur `accounts_garde_archive` (garde de suppression des comptes payants sans archive) et sa fonction ;
--  · le déclencheur `memberships_archiver_preuve` (preuve archivée au retrait d'une adhésion) et sa fonction ;
--  · la procédure de nuit et toutes les fonctions de la migration (simulation, programmation, annulation, gel,
--    effacement, exécution, inactivité, réapplication, suites, remboursements, clients Stripe, export) ;
--  · les tables `effacements_a_reappliquer`, `fermetures_comptes`, `avertissements_inactivite`, `exports_complets` et
--    `clients_stripe_supprimes`, SEULEMENT SI ELLES SONT VIDES. Une table qui porte une ligne est CONSERVÉE telle quelle
--    (droits et politiques compris) : trace des demandes et de leur traitement, registre à rejouer après restauration ;
--    leur sort revient au dirigeant. Le script dit ce qu'il garde ;
--  · la colonne `accounts.efface_le`, seulement si aucun compte ne la porte (sinon conservée : comptes neutralisés) ;
--  · la colonne `artisan_reglements.facture_gerimmo_effacee` et la contrainte qui l'accepte, seulement si aucun
--    règlement n'a été détaché (la contrainte d'origine est alors reposée) ; sinon conservées ;
--  · l'obligation (not null) des deux espaces d'un parrainage, reposée seulement si aucun parrainage n'est détaché.
-- Ce qui est conservé : le compartiment privé `exports-complets` (vide ou non ; un compartiment se retire par l'API
-- Storage, jamais par une suppression SQL), les archives de `archives_comptes` (lot 1A), les lignes d'audit déjà écrites.
--
-- Une seule instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe,
-- qu'elle ne valide jamais. Rejouée, elle ne fait rien de plus. Joué dans la chaîne « Ordre complet » du LISEZ-MOI, bien que la
-- migration ne cite pas `aujourdhui_paris()` (retours du plan de conformité du 24/10, ordre inverse du manifeste : 140000,
-- 130000, 120000, 110000, 100000, 090000). La marche avant se rejoue ensuite sans rien perdre.
do $retour_atomique$
declare
  v_n bigint;
  v_garde text[] := '{}';
  v_stripe bigint := 0;
  v_dus bigint := 0;
begin
  perform set_config('lock_timeout', '10s', true);

  -- Finitions du 24/10 (relecture transverse, point 4) : jamais hors de son ordre. Tant qu'une migration plus récente
  -- du plan de conformité (jusqu'à 20261024140000) est inscrite, son retour passe d'abord ; joué seul, celui-ci
  -- réussissait et cassait les purges de nuit, qui citent encore ce qu'il retire.
  if to_regclass('supabase_migrations.schema_migrations') is not null
     and exists (select 1 from supabase_migrations.schema_migrations
                  where left(version, 14) > '20261024130000' and left(version, 14) <= '20261024140000') then
    raise exception 'Retour 20261024130000 refusé : migration(s) plus récente(s) du plan de conformité encore inscrite(s) (%) ; jouer d''abord leur retour, dans l''ordre inverse (140000, 130000, 120000, 110000, 100000, 090000)',
      (select string_agg(version, ', ' order by version) from supabase_migrations.schema_migrations
        where left(version, 14) > '20261024130000' and left(version, 14) <= '20261024140000') using errcode = '55000';
  end if;

  -- 0. Refus : arrêt Stripe posé par une fermeture programmée, ou remboursement dû.
  if to_regclass('public.fermetures_comptes') is not null then
    execute $q$select count(*) from public.fermetures_comptes
                where statut = 'programmee' and coalesce((abonnement ->> 'vivante')::boolean, false)$q$ into v_stripe;
    if exists (select 1 from information_schema.columns where table_schema = 'public'
                and table_name = 'fermetures_comptes' and column_name = 'remboursement_repartition') then
      execute $q$select count(*) from public.fermetures_comptes
                  where choix = 'j14_prorata' and coalesce(remboursement_prevu_cents, 0) > 0 and rembourse_le is null
                    and (statut <> 'annulee' or annulee_le >= (effacement_prevu_le::timestamp at time zone 'Europe/Paris'))$q$ into v_dus;
    end if;
    if v_stripe > 0 or v_dus > 0 then
      raise exception 'Retour refusé : % fermeture(s) programmée(s) ont posé un arrêt chez Stripe, % remboursement(s) restent à faire. Annuler ces fermetures depuis /admin/donnees (l''arrêt est levé), laisser la mission « purge » rembourser, puis rejouer le retour.',
        v_stripe, v_dus using errcode = '55000';
    end if;
  end if;

  -- 1. La tâche planifiée.
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job where jobname = 'fermetures-comptes') then
      if to_regprocedure('cron.unschedule(text)') is not null then
        perform cron.unschedule('fermetures-comptes');
      else
        delete from cron.job where jobname = 'fermetures-comptes';
      end if;
    end if;
  end if;
  delete from public.supervision_taches_arret where tache = 'fermetures-comptes';

  -- 2. Les gardes de suppression des comptes et d'archivage au retrait d'une adhésion.
  drop trigger if exists accounts_garde_archive on public.accounts;
  drop function if exists public.accounts_garde_archive();
  drop trigger if exists memberships_archiver_preuve on public.memberships;
  drop function if exists public.memberships_archiver_preuve();

  -- 3. La procédure et les fonctions (signatures actuelles et d'avant les relectures du 24/10).
  drop procedure if exists public.fermetures_comptes_nuit();
  drop function if exists public.fermetures_comptes_quotidiennes();
  drop function if exists public.fermetures_comptes_programmer_inactifs();
  drop function if exists public.fermetures_comptes_menage();
  drop function if exists public.executer_fermeture_isolee(uuid);
  drop function if exists public.executer_fermeture_compte(uuid);
  drop function if exists public.reappliquer_effacements(jsonb);
  drop function if exists public.effacer_compte_ferme(uuid, uuid);
  drop function if exists public.effacer_organisation_fermeture(uuid, uuid);
  drop function if exists public.effacer_organisation_fermeture(uuid);
  drop function if exists public.archiver_compte_ferme(uuid);
  drop function if exists public.archiver_preuve_compte(uuid, uuid);
  drop function if exists public.gardes_effacement(boolean);
  drop function if exists public.programmer_fermeture_compte(uuid, text, text, uuid, uuid, jsonb, date, timestamptz, jsonb);
  drop function if exists public.programmer_fermeture_compte(uuid, text, text, uuid, uuid, jsonb, date, timestamptz);
  drop function if exists public.annuler_fermeture_compte(uuid, text);
  drop function if exists public.geler_fermeture_compte(uuid, text);
  drop function if exists public.simuler_fermeture_compte(uuid, uuid);
  drop function if exists public.references_hors_perimetre(uuid, uuid[]);
  drop function if exists public.sauvegarde_du_jour_reussie();
  drop function if exists public.comptes_inactifs_a_prevenir(text, integer);
  drop function if exists public.avertissement_inactivite_envoye(uuid, text, timestamptz, date);
  drop function if exists public.activite_compte(uuid);
  drop function if exists public.abonnement_de_fermeture(uuid, boolean);
  drop function if exists public.abonnement_de_fermeture(uuid);
  drop function if exists public.souscriptions_laissees(uuid, boolean);
  drop function if exists public.organisations_du_seul_titulaire(uuid);
  drop function if exists public.organisations_effacees_par(uuid, boolean);
  drop function if exists public.organisation_a_paye(uuid);
  drop function if exists public.empreinte_adresse(text);
  drop function if exists public.lignes_lisibles_par(regclass, text, uuid, uuid);
  drop function if exists public.fermetures_suites_a_faire(integer);
  drop function if exists public.fermeture_suites_faites(uuid, bigint, text, boolean);
  drop function if exists public.fermetures_remboursements_dus(integer);
  drop function if exists public.fermeture_remboursement_fait(uuid, jsonb);
  drop function if exists public.fermeture_remboursement_fait(uuid, jsonb, text);
  drop function if exists public.fermeture_programmee_de(uuid);
  drop function if exists public.clients_stripe_au_terme(integer);
  drop function if exists public.client_stripe_supprime(text);
  drop function if exists public.demander_export_complet(uuid);
  drop function if exists public.prendre_export_complet(uuid);
  drop function if exists public.terminer_export_complet(uuid, text, bigint, text, integer, integer, uuid[], text);
  drop function if exists public.export_complet_telecharge(uuid, uuid);
  drop function if exists public.exports_complets_a_supprimer(integer);
  drop function if exists public.export_complet_supprime(uuid);
  drop function if exists public.export_complet_donnees(uuid, uuid);
  drop function if exists public.export_complet_donnees(uuid);
  drop function if exists public.export_complet_fichiers(uuid);
  drop function if exists public.export_complet_compte(uuid);
  drop function if exists public.export_artisan_plateforme();

  -- 4. Les tables, seulement vides.
  if to_regclass('public.effacements_a_reappliquer') is not null then
    execute 'select count(*) from public.effacements_a_reappliquer' into v_n;
    if v_n = 0 then drop table public.effacements_a_reappliquer; else v_garde := array_append(v_garde, 'effacements_a_reappliquer'); end if;
  end if;
  if to_regclass('public.fermetures_comptes') is not null then
    execute 'select count(*) from public.fermetures_comptes' into v_n;
    if v_n = 0 and to_regclass('public.effacements_a_reappliquer') is null then
      drop table public.fermetures_comptes;
    else
      v_garde := array_append(v_garde, 'fermetures_comptes');
    end if;
  end if;
  if to_regclass('public.avertissements_inactivite') is not null then
    execute 'select count(*) from public.avertissements_inactivite' into v_n;
    if v_n = 0 then drop table public.avertissements_inactivite; else v_garde := array_append(v_garde, 'avertissements_inactivite'); end if;
  end if;
  if to_regclass('public.exports_complets') is not null then
    execute 'select count(*) from public.exports_complets' into v_n;
    if v_n = 0 then drop table public.exports_complets; else v_garde := array_append(v_garde, 'exports_complets'); end if;
  end if;
  if to_regclass('public.clients_stripe_supprimes') is not null then
    execute 'select count(*) from public.clients_stripe_supprimes' into v_n;
    if v_n = 0 then drop table public.clients_stripe_supprimes; else v_garde := array_append(v_garde, 'clients_stripe_supprimes'); end if;
  end if;

  -- 4 bis. Le registre privé des artisans : la contrainte d'origine reposée si aucun règlement n'a été détaché.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'artisan_reglements' and column_name = 'facture_gerimmo_effacee') then
    execute 'select count(*) from public.artisan_reglements where facture_gerimmo_effacee is not null' into v_n;
    if v_n = 0 then
      alter table public.artisan_reglements drop constraint if exists artisan_reglements_facture_ou_trace;
      alter table public.artisan_reglements drop constraint if exists artisan_reglements_facture_effacee_objet;
      alter table public.artisan_reglements drop column facture_gerimmo_effacee;
      if not exists (select 1 from pg_constraint where conrelid = 'public.artisan_reglements'::regclass and conname = 'artisan_reglements_check') then
        alter table public.artisan_reglements add constraint artisan_reglements_check
          check (num_nonnulls(facture_gerimmo_id, facture_externe_id) = 1);
      end if;
    else
      v_garde := array_append(v_garde, 'artisan_reglements.facture_gerimmo_effacee');
    end if;
  end if;

  -- 4 ter. Les parrainages : les deux espaces redeviennent obligatoires si aucun parrainage n'est détaché.
  if exists (select 1 from public.parrainages where parrain_organization_id is null or filleul_organization_id is null) then
    v_garde := array_append(v_garde, 'parrainages (espaces facultatifs)');
  else
    alter table public.parrainages alter column parrain_organization_id set not null;
    alter table public.parrainages alter column filleul_organization_id set not null;
  end if;

  -- 5. La colonne d'effacement, seulement si aucun compte ne la porte.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'accounts' and column_name = 'efface_le') then
    execute 'select count(*) from public.accounts where efface_le is not null' into v_n;
    if v_n = 0 then alter table public.accounts drop column efface_le; else v_garde := array_append(v_garde, 'accounts.efface_le'); end if;
  end if;

  if cardinality(v_garde) > 0 then
    raise notice 'Conservé (porte des données, décision du dirigeant requise) : %', array_to_string(v_garde, ', ');
  end if;

  delete from supabase_migrations.schema_migrations where left(version, 14) = '20261024130000';  -- les deux formes : production (14 chiffres) et CI (nom du fichier)
end $retour_atomique$;
