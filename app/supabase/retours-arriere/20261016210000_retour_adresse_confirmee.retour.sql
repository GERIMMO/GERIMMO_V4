-- Remettre le code applicatif précédent avant ce retour, hors du lot de migrations.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;
begin;
set local lock_timeout = '10s';
drop function if exists public.autoriser_retour_adresse_confirmee(text);
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261016210000';
  end if;
end $retour_arriere$;
commit;
