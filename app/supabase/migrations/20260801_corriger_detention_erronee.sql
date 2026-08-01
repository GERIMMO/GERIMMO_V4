-- Correction d'une détention ERRONÉE : suppression autorisée uniquement si le lot
-- n'a jamais eu de bail (rien d'historique ne repose dessus). Sinon RM-0.2.4
-- s'applique : on clôt (date de fin), on ne supprime pas.
create function public.supprimer_detention(p_detention uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lot uuid;
begin
  select organization_id, lot_id into v_org, v_lot
  from public.detentions where id = p_detention;
  if v_org is null then raise exception 'Détention introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if exists (select 1 from public.baux where lot_id = v_lot) then
    raise exception 'Ce lot a un bail : la détention a une valeur historique — clôturez-la (date de fin) au lieu de la supprimer (RM-0.2.4)';
  end if;
  delete from public.detentions where id = p_detention;
end;
$$;
revoke execute on function public.supprimer_detention(uuid) from public, anon;
