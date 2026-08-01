-- Correctif : criticité valide (critique) pour l'alerte d'écart de versement.
create or replace function public.enregistrer_versement(p_rapport uuid, p_montant numeric, p_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select * into v from public.rapports_gestion where id = p_rapport;
  if v.id is null then raise exception 'Rapport introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  update public.rapports_gestion set versement_montant = p_montant, versement_date = p_date where id = p_rapport;
  if abs(coalesce(p_montant, 0) - v.net) > 0.01 then
    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (v.organization_id, 'ecart_versement', 'critique',
            'Écart entre le versement et le net du rapport',
            jsonb_build_object('rapport_id', p_rapport, 'net', v.net, 'verse', p_montant));
  end if;
end $$;
