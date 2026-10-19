-- Âge, en minutes, de la dernière « Sauvegarde quotidienne » RÉUSSIE, et son préfixe Scaleway (une date, rien d'autre).
-- Lu par .github/workflows/migrations.yml (étape « Garde — une sauvegarde réussie récente ») avec `psql -At -f` :
-- une seule ligne `<minutes>|<prefixe>` ; `-1|` s'il n'y a aucune ligne. Ne comptent que les lignes écrites par le
-- service (account_id nul : log_tech refuse `tache_*` à un compte connecté depuis l'audit du 27/09, migration
-- 20260927141000) et sans échec (`echecs` = 0, bilan posé par sauvegarde.yml, étape « Consigner le passage dans
-- Gerimmo »). Même lecture que la page Santé : lignes sans auteur seulement. Testé par tests/migrations-garde-sauvegarde.test.ts.
select coalesce((select floor(extract(epoch from (now() - max(created_at))) / 60)::bigint
                   from public.tech_log
                  where evenement = 'tache_sauvegarde' and account_id is null and details->>'echecs' = '0'), -1)
       || '|' ||
       coalesce((select details->>'prefixe'
                   from public.tech_log
                  where evenement = 'tache_sauvegarde' and account_id is null and details->>'echecs' = '0'
                  order by created_at desc limit 1), '');
