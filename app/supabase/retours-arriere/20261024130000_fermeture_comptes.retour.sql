-- Retour de 20261024130000 (conformité V1, lot 1E : fermeture des comptes, inactivité, export complet). Remettre
-- d'abord le code précédent : /admin/donnees (fermetures programmées), la route /agence/[orgId]/export-complet, la
-- section « Archive complète » de /compte/donnees et les suites de la mission « purge » appellent les objets retirés ici.
-- À jouer AVANT le retour de 20261024090000 (la garde de suppression lit `archives_comptes`).
--
-- Ce qui est défait :
--  · la tâche pg_cron « fermetures-comptes » et sa ligne dans `supervision_taches_arret` ;
--  · le déclencheur `accounts_garde_archive` (garde de suppression des comptes payants sans archive) et sa fonction ;
--  · toutes les fonctions de la migration (simulation, programmation, annulation, gel, effacement, exécution,
--    inactivité, réapplication, suites, export) ;
--  · les tables `effacements_a_reappliquer`, `fermetures_comptes`, `avertissements_inactivite` et `exports_complets`,
--    SEULEMENT SI ELLES SONT VIDES. Une table qui porte une ligne est CONSERVÉE telle quelle (droits et politiques
--    compris) : trace des demandes et de leur traitement, registre à rejouer après restauration ; leur sort revient au
--    dirigeant. Le script dit ce qu'il garde ;
--  · la colonne `accounts.efface_le`, seulement si aucun compte ne la porte (sinon conservée : comptes neutralisés).
-- Ce qui est conservé : le compartiment privé `exports-complets` (vide ou non ; un compartiment se retire par l'API
-- Storage, jamais par une suppression SQL), les archives de `archives_comptes` (lot 1A), les lignes d'audit déjà écrites.
--
-- Une seule instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe,
-- qu'elle ne valide jamais. Rejouée, elle ne fait rien de plus. Hors de la chaîne « Ordre complet » du LISEZ-MOI (la
-- migration ne cite pas `aujourdhui_paris()`). La marche avant se rejoue ensuite sans rien perdre.
do $retour_atomique$
declare
  v_n bigint;
  v_garde text[] := '{}';
begin
  perform set_config('lock_timeout', '10s', true);

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

  -- 2. La garde de suppression des comptes.
  drop trigger if exists accounts_garde_archive on public.accounts;
  drop function if exists public.accounts_garde_archive();

  -- 3. Les fonctions.
  drop function if exists public.fermetures_comptes_quotidiennes();
  drop function if exists public.executer_fermeture_compte(uuid);
  drop function if exists public.reappliquer_effacements(jsonb);
  drop function if exists public.effacer_compte_ferme(uuid, uuid);
  drop function if exists public.effacer_organisation_fermeture(uuid);
  drop function if exists public.archiver_compte_ferme(uuid);
  drop function if exists public.gardes_effacement(boolean);
  drop function if exists public.programmer_fermeture_compte(uuid, text, text, uuid, uuid, jsonb, date, timestamptz);
  drop function if exists public.annuler_fermeture_compte(uuid, text);
  drop function if exists public.geler_fermeture_compte(uuid, text);
  drop function if exists public.simuler_fermeture_compte(uuid, uuid);
  drop function if exists public.references_hors_perimetre(uuid, uuid[]);
  drop function if exists public.sauvegarde_du_jour_reussie();
  drop function if exists public.comptes_inactifs_a_prevenir(text, integer);
  drop function if exists public.avertissement_inactivite_envoye(uuid, text, timestamptz, date);
  drop function if exists public.activite_compte(uuid);
  drop function if exists public.abonnement_de_fermeture(uuid);
  drop function if exists public.organisations_du_seul_titulaire(uuid);
  drop function if exists public.organisation_a_paye(uuid);
  drop function if exists public.empreinte_adresse(text);
  drop function if exists public.fermetures_suites_a_faire(integer);
  drop function if exists public.fermeture_suites_faites(uuid, bigint, text, boolean);
  drop function if exists public.demander_export_complet(uuid);
  drop function if exists public.prendre_export_complet(uuid);
  drop function if exists public.terminer_export_complet(uuid, text, bigint, text, integer, integer, uuid[], text);
  drop function if exists public.export_complet_telecharge(uuid, uuid);
  drop function if exists public.exports_complets_a_supprimer(integer);
  drop function if exists public.export_complet_supprime(uuid);
  drop function if exists public.export_complet_donnees(uuid);
  drop function if exists public.export_complet_compte(uuid);

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

  -- 5. La colonne d'effacement, seulement si aucun compte ne la porte.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'accounts' and column_name = 'efface_le') then
    execute 'select count(*) from public.accounts where efface_le is not null' into v_n;
    if v_n = 0 then alter table public.accounts drop column efface_le; else v_garde := array_append(v_garde, 'accounts.efface_le'); end if;
  end if;

  if cardinality(v_garde) > 0 then
    raise notice 'Conservé (porte des données, décision du dirigeant requise) : %', array_to_string(v_garde, ', ');
  end if;

  delete from supabase_migrations.schema_migrations where version = '20261024130000';
end $retour_atomique$;
