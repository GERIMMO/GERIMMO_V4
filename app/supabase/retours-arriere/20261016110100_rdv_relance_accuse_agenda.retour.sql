-- D22-B compléments 16/10 : désactiver le nouveau code d'abord. Conserver les marqueurs, aucune demande effacée.
-- La réservation enrichie dépend des RPC de ce palier : son retour précède celui-ci.
do $ordre$
begin
  if to_regprocedure('public.liberer_relance_report_rdv(uuid,uuid)') is not null then
    raise exception 'Jouer d’abord le retour 20261016190000 (réservation des relances).';
  end if;
end $ordre$;
drop function if exists public.accuser_annulation_rdv(uuid);
drop function if exists public.reports_rdv_a_relancer(integer);
drop function if exists public.reserver_relance_report_rdv(uuid);
drop function if exists public.noter_relance_report_rdv(uuid,boolean);
do $retour$
declare d text;
begin
  select pg_get_functiondef('public.mes_demandes_rdv_artisan()'::regprocedure) into d;
  if position('annulation_vue_le' in d)=0 then return; end if;
  d:=replace(d,', annulation_vue_le timestamp with time zone','');
  d:=replace(d,', d.annulation_vue_le','');
  if position('annulation_vue_le' in d)>0 then raise exception 'Retour D22 accusé : définition inattendue'; end if;
  drop function public.mes_demandes_rdv_artisan();
  execute d;
end $retour$;
revoke all on function public.mes_demandes_rdv_artisan() from public,anon;
grant execute on function public.mes_demandes_rdv_artisan() to authenticated;
select public.fermer_fonctions_a_anon();

-- Même transaction externe que le DDL ci-dessus (psql --single-transaction).
-- Le chantier peut alors réappliquer exactement cette migration, sans historique mensonger.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'delete from supabase_migrations.schema_migrations where version=$1' using '20261016110100';
  end if;
end $historique$;
