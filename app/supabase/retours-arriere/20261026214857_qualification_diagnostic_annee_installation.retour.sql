-- Retour de 20261026214857_qualification_diagnostic_annee_installation.sql (PR #264 : une année d'installation connue sans
-- le jour ni le mois). Écrit le 28/10 par l'audit final (COD-02) : la migration est appliquée en production depuis le 27/10
-- sans script de retour.
-- Remettre le code précédent avant ce retour : le formulaire de qualification propose la situation « annee_connue ».
-- Refuse tant qu'une qualification porte une année (`annee_connue`) : la supprimer effacerait une réponse du propriétaire ;
-- la requalifier est une décision métier, pas un retour. Rend ensuite à la table ses deux contraintes d'avant (situations
-- sans « annee_connue », cohérence date/situation), retire la contrainte sur l'année et la colonne, et la ligne d'historique.
-- Une seule instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe, qu'elle
-- ne valide jamais. Se rejoue sans effet (« rien à faire » si la colonne est déjà absente).
do $retour_atomique$
declare
  v_annees boolean;
begin
  perform set_config('lock_timeout', '10s', true);
  if to_regclass('public.qualifications_diagnostics_lot') is null then return; end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.qualifications_diagnostics_lot'::regclass
                 and attname = 'annee_installation' and not attisdropped) then
    return;
  end if;
  execute 'select exists (select 1 from public.qualifications_diagnostics_lot where situation = ''annee_connue'' or annee_installation is not null)' into v_annees;
  if v_annees then
    raise exception 'Retour refusé : des qualifications portent une année d''installation. Les requalifier d''abord, ou les conserver.';
  end if;

  alter table public.qualifications_diagnostics_lot
    drop constraint if exists qualifications_diagnostics_annee_passee,
    drop constraint if exists qualifications_diagnostics_lot_situation_check,
    drop constraint if exists qualifications_diagnostics_date_coherente,
    drop column annee_installation,
    add constraint qualifications_diagnostics_lot_situation_check
      check (situation in ('plus_15_ans', 'date_connue', 'absente', 'inconnue')),
    add constraint qualifications_diagnostics_date_coherente check (
      (situation = 'date_connue' and date_installation is not null)
      or (situation <> 'date_connue' and date_installation is null)
    );

  perform pg_notify('pgrst', 'reload schema');
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261026214857';
  end if;
end;
$retour_atomique$;
