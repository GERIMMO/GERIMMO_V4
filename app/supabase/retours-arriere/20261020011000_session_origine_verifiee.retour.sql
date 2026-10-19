-- Remettre le proxy précédent avant ce retour ; aucune session Auth n'est supprimée.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction.';
  end if;
end $retour_arriere$;
begin;
set local lock_timeout = '10s';
drop function if exists public.ma_session_active();
delete from supabase_migrations.schema_migrations where version = '20261020011000';
commit;
