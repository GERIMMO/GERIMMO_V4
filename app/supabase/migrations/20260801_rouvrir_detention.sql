-- Rouvrir une détention close par erreur (clore accidentel). Garde-fou : la
-- somme des quote-parts actives ne doit pas dépasser 100 % (RM-0.2.1). L'action
-- est tracée et horodatée dans audit_log.
create function public.rouvrir_detention(p_detention uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lot uuid;
  v_qp numeric;
  v_somme numeric;
begin
  select organization_id, lot_id, quote_part into v_org, v_lot, v_qp
  from public.detentions where id = p_detention;
  if v_org is null then raise exception 'Détention introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;

  select coalesce(sum(quote_part), 0) into v_somme
  from public.detentions
  where lot_id = v_lot and date_fin is null and id <> p_detention;
  if v_somme + v_qp > 100 then
    raise exception 'Réouverture impossible : la somme des quote-parts dépasserait 100 pourcents (RM-0.2.1)';
  end if;

  update public.detentions set date_fin = null
  where id = p_detention and date_fin is not null;

  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), v_org, 'detention_rouverte',
          jsonb_build_object('detention_id', p_detention, 'lot_id', v_lot));
end;
$$;
revoke execute on function public.rouvrir_detention(uuid) from public, anon;
