-- Audit 09/09 (P2) : « 1 quittance(s) émise(s) » mentait quand le document
-- produit était un reçu partiel. La fonction détaille désormais ce qu'elle a
-- réellement fait : quittances (mois soldés) et reçus (paiements partiels)
-- créés ou mis à jour. Le retour change de forme (integer → une ligne à deux
-- compteurs), d'où le drop. L'idempotence ne bouge pas : un document au plus
-- par appel (contrainte unique sur appel_id + mise à jour en place).
drop function public.emettre_quittances(uuid);

create function public.emettre_quittances(p_bail uuid)
returns table (nb_quittances integer, nb_recus integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare v_org uuid; v_quittances int := 0; v_recus int := 0; r record; v_maj int;
begin
  select organization_id into v_org from public.baux where id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  for r in
    select e.appel_id, e.montant_du, e.montant_couvert, e.statut
    from public.etat_loyers_bail(p_bail) e
    where e.statut in ('paye', 'partiel')
  loop
    if exists (select 1 from public.quittances q where q.appel_id = r.appel_id) then
      -- Reçu existant : promu en quittance si le mois est soldé, ou mis à
      -- jour si un nouveau partiel a augmenté le montant couvert
      update public.quittances q
         set est_quittance = (r.statut = 'paye'),
             montant = case when r.statut = 'paye' then r.montant_du else r.montant_couvert end,
             date_emission = current_date,
             email_envoye_at = null
       where q.appel_id = r.appel_id
         and (q.est_quittance is distinct from (r.statut = 'paye')
              or q.montant is distinct from
                 case when r.statut = 'paye' then r.montant_du else r.montant_couvert end);
      get diagnostics v_maj = row_count;
      if r.statut = 'paye' then v_quittances := v_quittances + v_maj;
      else v_recus := v_recus + v_maj;
      end if;
    else
      insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant)
      values (v_org, p_bail, r.appel_id, r.statut = 'paye',
              case when r.statut = 'paye' then r.montant_du else r.montant_couvert end);
      if r.statut = 'paye' then v_quittances := v_quittances + 1;
      else v_recus := v_recus + 1;
      end if;
    end if;
  end loop;
  return query select v_quittances, v_recus;
end $function$;
revoke execute on function public.emettre_quittances(uuid) from public, anon;
