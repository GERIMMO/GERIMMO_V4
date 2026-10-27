-- Retour de 20261026213652_qualifications_diagnostics_lot.sql (PR #264 : installation gaz et électricité qualifiée par lot).
-- Écrit le 28/10 par l'audit final (COD-02) : la migration est appliquée en production depuis le 27/10 sans script de retour.
-- Remettre le code précédent avant ce retour : la fiche du lot et le dossier des diagnostics lisent et écrivent
-- `qualifications_diagnostics_lot`. Jouer d'abord `20261026214857_qualification_diagnostic_annee_installation.retour.sql`
-- (la colonne `annee_installation` part de toute façon avec la table, mais la ligne d'historique de 214857 doit être retirée
-- avant celle-ci : `migrations.yml` refuse une version déjà enregistrée).
-- Refuse tant qu'une qualification existe : la supprimer effacerait une réponse du propriétaire (« plus de quinze ans »,
-- date connue, pas de gaz), qu'il faudrait lui reposer. Retire les politiques, les deux déclencheurs (contrôle d'auteur et
-- garde d'abonnement, avec la table), la fonction `tracer_qualification_diagnostic` et la ligne d'historique.
-- Une seule instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe, qu'elle
-- ne valide jamais. Se rejoue sans effet.
do $retour_atomique$
declare
  v_qualifiees boolean;
begin
  perform set_config('lock_timeout', '10s', true);
  -- Lecture dynamique : la table peut déjà être absente (rejeu), et une requête directe serait refusée à l'analyse.
  if to_regclass('public.qualifications_diagnostics_lot') is not null then
    execute 'select exists (select 1 from public.qualifications_diagnostics_lot)' into v_qualifiees;
    if v_qualifiees then
      raise exception 'Retour refusé : des qualifications de diagnostics existent. Les conserver ou décider de leur archivage.';
    end if;
  end if;

  drop policy if exists qualifications_diagnostics_lecture on public.qualifications_diagnostics_lot;
  drop policy if exists qualifications_diagnostics_ajout on public.qualifications_diagnostics_lot;
  drop policy if exists qualifications_diagnostics_modification on public.qualifications_diagnostics_lot;
  drop trigger if exists qualifications_diagnostics_trace on public.qualifications_diagnostics_lot;
  drop table if exists public.qualifications_diagnostics_lot;
  drop function if exists public.tracer_qualification_diagnostic();

  perform pg_notify('pgrst', 'reload schema');
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261026213652';
  end if;
end;
$retour_atomique$;
