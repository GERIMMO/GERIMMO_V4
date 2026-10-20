-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- Remettre le code applicatif précédent avant ce retour, hors du lot de migrations.

set local lock_timeout = '10s';
drop function if exists public.autoriser_retour_adresse_confirmee(text);
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261016210000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
