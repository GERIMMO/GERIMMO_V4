-- Simulation du 14/09 : authenticated conserve TRUNCATE sur incidents.
-- Ce privilège ignore les RLS ; aucun parcours client ne doit vider une
-- table entière. Retrait sur toutes les tables métier, sans toucher aux
-- lignes, aux droits SELECT/INSERT/UPDATE/DELETE ni aux RPC existantes.
-- À jouer AVANT les trois migrations portefeuille du 13/09, non appliquées.
-- Référence : https://www.postgresql.org/docs/current/ddl-rowsecurity.html
do $$
declare t record;
begin
  for t in select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  loop
    execute format('revoke truncate on table public.%I from public, anon, authenticated', t.relname);
  end loop;
end $$;

-- Retirer également le défaut, global ou propre au schéma. Un défaut global
-- ne peut pas être annulé par une révocation limitée au schéma public.
-- Certains défauts appartiennent à supabase_admin (non administrable par le
-- rôle des migrations) : signaler cette limite, sans masquer un droit actuel.
do $$
declare r record;
begin
  for r in select distinct pg_get_userbyid(d.defaclrole) proprio,
      d.defaclnamespace = 0 global
    from pg_default_acl d
    left join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclobjtype = 'r' and (d.defaclnamespace = 0 or n.nspname = 'public')
      and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole)
      and a.privilege_type = 'TRUNCATE'
  loop
    begin
      execute format('alter default privileges for role %I %s revoke truncate on tables from public, anon, authenticated',
        r.proprio, case when r.global then '' else 'in schema public' end);
    exception when insufficient_privilege then
      raise warning 'Défaut TRUNCATE du rôle % non modifiable : les nouvelles tables doivent révoquer ce droit explicitement.', r.proprio;
    end;
  end loop;
end $$;

-- Inclut les droits hérités : une survivance fait annuler tout le lot.
do $$
declare restes text;
begin
  select string_agg(c.relname || '/' || r.nom, ', ') into restes
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) r(nom)
  where n.nspname = 'public' and c.relkind in ('r','p')
    and has_table_privilege(r.nom, c.oid, 'TRUNCATE');
  if restes is not null then
    raise exception 'TRUNCATE client encore présent : %', restes;
  end if;
end $$;
