create or replace function public.artisan_creer_ou_rattacher(
  p_org uuid, p_raison_sociale text, p_siret text, p_telephone text,
  p_email text, p_metiers public.artisan_metier[], p_codes_postaux text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_artisan uuid;
  v record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if exists (select 1 from public.organizations where id = p_org and type = 'proprietaire_direct') then
    raise exception 'L’ajout d’artisans est réservé aux agences';
  end if;
  if coalesce(array_length(p_metiers, 1), 0) = 0 then
    raise exception 'Choisissez au moins un métier — un artisan n''est proposé que dans son métier';
  end if;

  select * into v from public.artisans a where a.siret = trim(p_siret);
  if found then
    -- RM-A1.9 : un SIRET non vérifié n'est utilisable que par l'agence qui l'a
    -- créé. Une autre agence ne se rattache qu'à un profil public.
    if not (v.visibilite = 'publique' or v.cree_par_organization_id = p_org
            or exists (select 1 from public.artisan_agences aa
                       where aa.artisan_id = v.id and aa.organization_id = p_org)) then
      raise exception 'Ce SIRET est déjà enregistré par une autre agence et son profil n''est pas public — demandez à l''artisan de se rendre visible';
    end if;
    v_artisan := v.id;
  else
    insert into public.artisans
      (raison_sociale, siret, telephone, email, cree_par_organization_id)
    values (trim(p_raison_sociale), trim(p_siret), trim(p_telephone),
            nullif(trim(coalesce(p_email, '')), ''), p_org)
    returning id into v_artisan;

    insert into public.artisan_metiers (artisan_id, metier)
    select v_artisan, unnest(p_metiers) on conflict do nothing;
    insert into public.artisan_zones (artisan_id, code_postal)
    select v_artisan, trim(unnest(coalesce(p_codes_postaux, array[]::text[])))
    on conflict do nothing;
  end if;

  insert into public.artisan_agences (organization_id, artisan_id, created_by)
  values (p_org, v_artisan, (select auth.uid()))
  on conflict (organization_id, artisan_id) do nothing;

  return v_artisan;
end;
$$;
revoke execute on function public.artisan_creer_ou_rattacher(uuid, text, text, text, text, public.artisan_metier[], text[]) from public, anon;
