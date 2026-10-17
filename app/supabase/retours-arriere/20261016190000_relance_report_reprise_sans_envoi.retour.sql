-- Retour fonctionnel : les réservations restent durables ; aucune tentative n'est effacée.
-- La colonne et ses identifiants restent conservés pour le diagnostic et une réapplication.
drop function if exists public.liberer_relance_report_rdv(uuid,uuid);
do $retour$
declare d text;
begin
  select pg_get_functiondef('public.reserver_relance_report_rdv(uuid)'::regprocedure) into d;
  d:=replace(d,'set relance_reservee_le=now(), relance_reservation_id=gen_random_uuid() where id=d.id returning * into d;',
    'set relance_reservee_le=now() where id=d.id;');
  execute replace(d,'''demande_id'',d.id,''reservation_id'',d.relance_reservation_id,''intervention_id'',i.id',
    '''demande_id'',d.id,''intervention_id'',i.id');
end $retour$;

-- Même transaction externe que le DDL ci-dessus (psql --single-transaction).
-- Le chantier peut alors réappliquer exactement cette migration, sans historique mensonger.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'delete from supabase_migrations.schema_migrations where version=$1' using '20261016190000';
  end if;
end $historique$;
