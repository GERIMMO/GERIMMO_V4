-- RETOUR ARRIÈRE de 20261122100000 (les inscriptions dans l'e-mail de 5 h du relais).
-- Remettre d'abord le code précédent du relais : sinon le comptage sera signalé chaque matin comme illisible.
-- Retire seulement la fonction de comptage et sa version ; aucun espace, aucun bien, aucun bail n'est touché.
-- Transaction externe obligatoire.
set local lock_timeout = '10s';
drop function if exists public.inscriptions_relais();
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261122100000';
  end if;
end $historique$;
notify pgrst, 'reload schema';
