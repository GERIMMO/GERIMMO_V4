-- Précontrôle du formulaire sous le même verrou que la création atomique.
-- Le dossier trouvé doit être lisible par l’utilisateur via la RLS de biens.
create function public.creer_bien_verifie(p_org uuid, p_creation uuid, p_saisie jsonb, p_distinct_de uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existant uuid;
begin
  if auth.uid() is null or not exists (select from public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]) o where o=p_org) then
    raise exception 'Accès refusé.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_org::text));
  if not exists(select from public.biens where organization_id=p_org and created_by=auth.uid() and creation_cle=p_creation) then
    select b.id into existant from public.biens b
    where b.organization_id=p_org and b.archived_at is null
      and lower(btrim(b.nom))=lower(btrim(p_saisie->>'nom'))
      and lower(btrim(b.address_line1))=lower(btrim(p_saisie->>'address_line1'))
      and lower(btrim(coalesce(b.address_line2,'')))=lower(btrim(coalesce(p_saisie->>'address_line2','')))
      and btrim(b.postal_code)=btrim(p_saisie->>'postal_code')
      and lower(btrim(b.city))=lower(btrim(p_saisie->>'city'))
    order by b.created_at,b.id limit 1;
    if existant is not null and existant is distinct from p_distinct_de then
      return jsonb_build_object('doublon_id',existant);
    end if;
  end if;
  return public.creer_bien_complet(p_org,p_creation,p_saisie);
end $$;
revoke all on function public.creer_bien_verifie(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.creer_bien_verifie(uuid,uuid,jsonb,uuid) to authenticated;
