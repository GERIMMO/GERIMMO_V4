-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- Remettre le code précédent avant ce retour. Historique et consommations conservés.
set local lock_timeout='10s';
drop function if exists public.abandonner_preparation_signature(uuid,uuid);
delete from supabase_migrations.schema_migrations where version='20261020011556';
$instructions_retour$;
end $retour_atomique$;
