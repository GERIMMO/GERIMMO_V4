-- Remettre le code précédent ; ne supprime aucun encaissement ni écriture comptable.
begin;
set local lock_timeout = '10s';
do $$ begin
  if exists (select 1 from public.receptions_loyers_signalees) then
    raise exception 'Retour refusé : des déclarations de loyers existent. Les conserver ou décider de leur archivage.';
  end if;
end $$;
drop function if exists public.declarer_reception_loyer(uuid,uuid,text,numeric,date,text,uuid,numeric);
drop function if exists public.rappels_loyers_proprietaire(uuid);
drop table if exists public.receptions_loyers_signalees;
delete from supabase_migrations.schema_migrations where version = '20261026090335';
commit;
