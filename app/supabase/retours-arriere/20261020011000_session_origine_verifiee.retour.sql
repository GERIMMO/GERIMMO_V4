-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- Remettre le proxy précédent avant ce retour ; aucune session Auth n'est supprimée.

set local lock_timeout = '10s';
drop function if exists public.ma_session_active();
delete from supabase_migrations.schema_migrations where version = '20261020011000';
$instructions_retour$;
end $retour_atomique$;
