-- Remettre d’abord le code précédent du relais : sinon le compteur sera signalé comme illisible.
-- Transaction externe obligatoire ; aucun effacement d’inscription ou de compte.
set local lock_timeout = '10s';
drop function if exists public.agences_en_attente_relais();
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version='20261021133650';
  end if;
end $historique$;
