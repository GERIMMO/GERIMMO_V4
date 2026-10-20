-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- Remettre le code de confirmation antérieur avant ce retour, hors du lot de
-- migrations. Seuls les compteurs temporaires sont supprimés, aucun compte Auth.

set local lock_timeout = '10s';
drop function if exists public.autoriser_confirmation_auth(text, text, text, text);
drop table if exists public.tentatives_confirmation_auth;
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261016150000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
