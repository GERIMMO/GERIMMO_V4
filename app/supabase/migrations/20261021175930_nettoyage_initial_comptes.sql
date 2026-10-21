-- Opération ponctuelle demandée par le dirigeant le 21 octobre 2026.
-- Effacement des dix comptes et de leurs dossiers, sauf le superadmin identifié.
-- Aucun déclencheur/RLS désactivé. Fichiers : retirer les octets ensuite par Storage,
-- d'après l'inventaire privé établi avant l'opération ; jamais DELETE storage.objects.
-- Simulation puis application par Migrations Supabase, sauvegarde de moins de 90 min.
-- Retour : restauration contrôlée de cette sauvegarde (un DELETE n'est pas annulable
-- après COMMIT). Aucun faux script de reconstruction de données supprimées.
create or replace function pg_temp.nettoyer_comptes_initial(
  p_superadmin uuid, p_empreinte text, p_nombre integer,
  p_organisations integer, p_artisans integer
) returns jsonb language plpgsql security invoker set search_path = '' as $purge$
declare
  v_orgs uuid[];
  v_uids uuid[];
  v_uids_a_supprimer uuid[];
  v_artisans uuid[];
  v_passe int := 0;
  v_progres boolean;
  v_n bigint;
  v_total bigint := 0;
  v_erreurs jsonb;
  v_reste_orgs int;
  v_reste_comptes int;
  v_empreinte text;
  v_proteges jsonb;
  v_apres jsonb;
  r record;
begin
  if not exists(select 1 from public.memberships where account_id=p_superadmin
    and organization_id is null and role='super_admin' and status='active') then
    raise exception 'Superadmin à conserver absent ou inactif';
  end if;
  if exists(select 1 from cron.job where jobname like 'recette-expiration-%') then
    raise exception 'Une recette est encore ouverte : attendre sa clôture';
  end if;
  -- Garde de concurrence : un nouvel inscrit change l'empreinte et fait tout refuser.
  lock table auth.users in share row exclusive mode;
  select coalesce(array_agg(id order by id),'{}'), md5(string_agg(id::text,',' order by id))
    into v_uids,v_empreinte from auth.users where id<>p_superadmin;
  if cardinality(v_uids)<>p_nombre or v_empreinte is distinct from p_empreinte then
    raise exception 'Inventaire des comptes modifié : aucune suppression';
  end if;
  if exists(select 1 from public.memberships where account_id=any(v_uids)
    and role='super_admin' and status='active') then
    raise exception 'Un autre superadmin est actif : aucune suppression';
  end if;
  v_uids_a_supprimer:=v_uids;
  select coalesce(array_agg(id),'{}') into v_orgs from public.organizations;
  if cardinality(v_orgs)<>p_organisations or exists(
    select 1 from public.memberships where organization_id=any(v_orgs)
      and not(account_id=any(v_uids))
  ) then raise exception 'Périmètre des espaces non isolé'; end if;
  select coalesce(array_agg(id),'{}') into v_artisans from public.artisans;
  if cardinality(v_artisans)<>p_artisans or exists(
    select 1 from public.artisans where account_id is not null and not(account_id=any(v_uids))
  ) then raise exception 'Périmètre artisans non isolé'; end if;

  -- Les contenus publiés et réglages globaux doivent rester strictement identiques.
  v_proteges:='{}';
  for r in select c.oid::regclass as tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and (
      c.relname in ('publications','marketing_reglages','supervision_identite','agent_missions','continuity_plan','signature_budget','ia_plafond_reglage')
      or c.relname like 'supervision_consignes%'
    )
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]''::jsonb) from %s t',r.tbl) into v_apres;
    v_proteges:=v_proteges||jsonb_build_object(r.tbl::text,v_apres);
  end loop;
  perform set_config('gerimmo.systeme','on',true);
  -- Révoquer les sessions avant l'effacement des identités ; RLS et fonctions restent en place.
  delete from auth.sessions where user_id=any(v_uids);
  -- Un report accepté forme un cycle : la demande cite le créneau retenu,
  -- et les nouveaux créneaux citent la demande. Détacher uniquement les
  -- deux extrémités appartenant aux espaces de ce passage avant la purge.
  update public.intervention_creneaux c set demande_id = null
    where c.organization_id = any(v_orgs) and exists (
      select 1 from public.intervention_demandes_rdv d
       where d.id = c.demande_id and d.organization_id = any(v_orgs)
    );

  loop
    v_passe := v_passe + 1;
    v_progres := false;
    v_erreurs := '{}'::jsonb;

    -- (a) Tables métier et registre privé de support portant `organization_id`.
    for r in
      select c.oid::regclass as tbl
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
       where n.nspname in ('public', 'support_interne') and c.relkind in ('r', 'p') and c.relname <> 'organizations'
    loop
      begin
        execute format('delete from %s where organization_id = any($1)', r.tbl) using v_orgs;
        get diagnostics v_n = row_count;
        if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
      exception when others then
        v_erreurs := v_erreurs || jsonb_build_object(r.tbl::text, sqlerrm);
      end;
    end loop;

    -- (b) Toute clé étrangère (une colonne, sans cascade) vers organizations,
    --     accounts ou auth.users, sous un autre nom de colonne.
    for r in
      select con.conrelid::regclass as tbl, att.attname as col,
             con.confrelid::regclass::text as parent
        from pg_constraint con
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
       where con.contype = 'f' and array_length(con.conkey, 1) = 1
         and con.confdeltype in ('a', 'r')
         and con.confrelid in ('public.organizations'::regclass, 'public.accounts'::regclass, 'auth.users'::regclass)
         and not (con.confrelid = 'public.organizations'::regclass and att.attname = 'organization_id')
    loop
      begin
        execute format('delete from %s where %I = any($1)', r.tbl, r.col)
          using case when r.parent in ('organizations','public.organizations') then v_orgs else v_uids end;
        get diagnostics v_n = row_count;
        if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
      exception when others then
        v_erreurs := v_erreurs || jsonb_build_object(r.tbl::text || '.' || r.col, sqlerrm);
      end;
    end loop;

    -- (c) Les tables filles SANS `organization_id` d'une table qui en porte
    --     une (ex. lignes d'une clé de répartition, équipements d'un lot).
    for r in
      select con.conrelid::regclass as tbl, att.attname as col,
             con.confrelid::regclass as parent, patt.attname as pcol
        from pg_constraint con
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
        join pg_attribute patt on patt.attrelid = con.confrelid and patt.attnum = con.confkey[1]
        join pg_class pc on pc.oid = con.confrelid
        join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = 'public'
       where con.contype = 'f' and array_length(con.conkey, 1) = 1
         and con.confdeltype in ('a', 'r')
         and exists (select 1 from pg_attribute x where x.attrelid = con.confrelid
                        and x.attname = 'organization_id' and not x.attisdropped)
         and not exists (select 1 from pg_attribute y where y.attrelid = con.conrelid
                            and y.attname = 'organization_id' and not y.attisdropped)
    loop
      begin
        execute format('delete from %s where %I in (select %I from %s where organization_id = any($1))',
                       r.tbl, r.col, r.pcol, r.parent) using v_orgs;
        get diagnostics v_n = row_count;
        if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
      exception when others then
        v_erreurs := v_erreurs || jsonb_build_object(r.tbl::text || '.' || r.col, sqlerrm);
      end;
    end loop;

    -- (c2) Registres privés de ces artisans seulement, puis la fiche.
    for r in
      select con.conrelid::regclass as tbl,att.attname as col
      from pg_constraint con join pg_attribute att on att.attrelid=con.conrelid and att.attnum=con.conkey[1]
      where con.contype='f' and con.confrelid='public.artisans'::regclass and array_length(con.conkey,1)=1
    loop
      begin
        execute format('delete from %s where %I=any($1)',r.tbl,r.col) using v_artisans;
        get diagnostics v_n=row_count;
        if v_n>0 then v_progres:=true;v_total:=v_total+v_n;end if;
      exception when others then v_erreurs:=v_erreurs||jsonb_build_object(r.tbl::text,sqlerrm);end;
    end loop;
    begin
      delete from public.artisans where id=any(v_artisans);
      get diagnostics v_n=row_count;
      if v_n>0 then v_progres:=true;v_total:=v_total+v_n;end if;
    exception when others then v_erreurs:=v_erreurs||jsonb_build_object('artisans',sqlerrm);end;

    -- (d) Les organisations, puis les comptes (cascade : accounts,
    --     adhésions, acceptations des conditions, identités, sessions).
    begin
      delete from public.organizations where id = any(v_orgs);
      get diagnostics v_n = row_count;
      if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
    exception when others then
      v_erreurs := v_erreurs || jsonb_build_object('organizations', sqlerrm);
    end;
    begin
      delete from auth.users where id = any(v_uids_a_supprimer);
      get diagnostics v_n = row_count;
      if v_n > 0 then v_progres := true; v_total := v_total + v_n; end if;
    exception when others then
      v_erreurs := v_erreurs || jsonb_build_object('auth.users', sqlerrm);
    end;

    select count(*) into v_reste_orgs from public.organizations where id = any(v_orgs);
    select count(*) into v_reste_comptes from auth.users where id = any(v_uids_a_supprimer);
    exit when v_reste_orgs = 0 and v_reste_comptes = 0 and not exists(select 1 from public.artisans where id=any(v_artisans));

    if not v_progres or v_passe >= 25 then
      raise exception 'Purge bloquée après % passe(s) : % organisation(s) et % compte(s) restent. Refus : %',
        v_passe, v_reste_orgs, v_reste_comptes, jsonb_pretty(v_erreurs)
        using hint = 'Voir « LES VERROUS DU SCHÉMA » en tête de purger.sql';
    end if;
  end loop;


  if (select count(*) from auth.users)<>1 or not exists(select 1 from auth.users where id=p_superadmin)
    or not exists(select 1 from public.memberships where account_id=p_superadmin and role='super_admin' and status='active') then
    raise exception 'Conservation du superadmin non confirmée';
  end if;
  for r in select key,value from jsonb_each(v_proteges) loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]''::jsonb) from %s t',r.key::regclass) into v_apres;
    if v_apres is distinct from r.value then raise exception 'Un contenu ou réglage protégé a changé : transaction annulée'; end if;
  end loop;
  return jsonb_build_object('comptes_supprimes',p_nombre,'organisations_supprimees',p_organisations,'artisans_supprimes',p_artisans,'superadmin_conserve',true,'lignes_supprimees',v_total);
end $purge$;

do $operation$
declare v_superadmin uuid; v_bilan jsonb;
begin
  select id into v_superadmin from auth.users where md5(id::text)='09f4641585d0fe7651ed3dba677c490e';
  if v_superadmin is null then
    raise notice 'Opération ponctuelle hors périmètre : aucune donnée touchée';
    return;
  end if;
  if (select count(*) from auth.users)=1 then
    raise notice 'Opération déjà effectuée : seul le superadmin subsiste';
    return;
  end if;
  v_bilan:=pg_temp.nettoyer_comptes_initial(v_superadmin,'b9e25f78701f6549fe780d4d313c03f2',10,4,2);
  raise notice 'Bilan du nettoyage : %',v_bilan;
end $operation$;
drop function pg_temp.nettoyer_comptes_initial(uuid,text,integer,integer,integer);
