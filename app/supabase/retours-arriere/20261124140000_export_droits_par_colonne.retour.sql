-- RETOUR ARRIÈRE de 20261124140000_export_droits_par_colonne.sql (décisions du 24/11/2026, lot D1 seconde reprise, C1).
--
-- RÉINTRODUIT le défaut corrigé : tant que 20261124120000 est en place, l'export complet d'un espace ne contient plus
-- la table `artisan_evaluations` (les notes données aux artisans). À ne jouer que pour revenir à l'état d'avant ce lot.
-- `lignes_lisibles_par` retrouve sa définition de 20261024130000, recopiée ci-dessous à l'identique.
-- Aucune donnée n'est modifiée ni supprimée. Aucune règle de lecture n'est touchée. Rejouable.
create or replace function public.lignes_lisibles_par(p_table regclass, p_filtre text, p_valeur uuid, p_compte uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_role text := current_setting('request.jwt.claim.role', true);
  v_cols text;
  v_permissives text;
  v_restrictives text;
  v_rls boolean;
  v_nom text;
  v_res jsonb;
begin
  if p_table is null or p_compte is null or p_filtre is null then return '[]'::jsonb; end if;
  if not pg_catalog.has_table_privilege('authenticated', p_table, 'SELECT') then return '[]'::jsonb; end if;
  select pg_catalog.quote_ident(c.relname) into v_nom from pg_catalog.pg_class c where c.oid = p_table;
  select string_agg(format('%s.%I', v_nom, a.attname), ', ' order by a.attnum) into v_cols
    from pg_catalog.pg_attribute a
   where a.attrelid = p_table and a.attnum > 0 and not a.attisdropped
     and pg_catalog.has_column_privilege('authenticated', p_table, a.attnum, 'SELECT');
  if v_cols is null then return '[]'::jsonb; end if;
  select c.relrowsecurity into v_rls from pg_catalog.pg_class c where c.oid = p_table;
  if v_rls then
    select string_agg('(' || coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), 'true') || ')', ' or ')
             filter (where p.polpermissive),
           string_agg('(' || coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), 'true') || ')', ' and ')
             filter (where not p.polpermissive)
      into v_permissives, v_restrictives
      from pg_catalog.pg_policy p
     where p.polrelid = p_table and p.polcmd in ('r', '*')
       and (0::oid = any(p.polroles) or 'authenticated'::regrole::oid = any(p.polroles));
    if v_permissives is null then return '[]'::jsonb; end if;
  end if;
  perform pg_catalog.set_config('request.jwt.claims',
    jsonb_build_object('sub', p_compte, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  if v_sub is not null then perform pg_catalog.set_config('request.jwt.claim.sub', p_compte::text, true); end if;
  if v_role is not null then perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true); end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), ''[]''::jsonb) from (select %s from %s where (%s) and (%s) and (%s)) x',
                 v_cols, p_table, replace(p_filtre, '$T', v_nom), coalesce(v_permissives, 'true'), coalesce(v_restrictives, 'true'))
    into v_res using p_valeur;
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  if v_sub is not null then perform pg_catalog.set_config('request.jwt.claim.sub', v_sub, true); end if;
  if v_role is not null then perform pg_catalog.set_config('request.jwt.claim.role', v_role, true); end if;
  return v_res;
exception when others then
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  if v_sub is not null then perform pg_catalog.set_config('request.jwt.claim.sub', v_sub, true); end if;
  if v_role is not null then perform pg_catalog.set_config('request.jwt.claim.role', v_role, true); end if;
  raise;
end $$;
revoke all on function public.lignes_lisibles_par(regclass, text, uuid, uuid) from public, anon, authenticated, service_role;
delete from supabase_migrations.schema_migrations where version = '20261124140000';
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
