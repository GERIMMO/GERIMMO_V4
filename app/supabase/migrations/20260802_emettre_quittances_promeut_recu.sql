-- Découvert en recette : un reçu partiel bloquait définitivement la quittance
-- du mois. Promu en quittance quand l'appel est soldé (montant complet, date
-- du jour, envoi email remis à zéro : le document change de nature).
CREATE OR REPLACE FUNCTION public.emettre_quittances(p_bail uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_crees int := 0; r record; v_maj int;
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
      v_crees := v_crees + v_maj;
    else
      insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant)
      values (v_org, p_bail, r.appel_id, r.statut = 'paye',
              case when r.statut = 'paye' then r.montant_du else r.montant_couvert end);
      v_crees := v_crees + 1;
    end if;
  end loop;
  return v_crees;
end $function$
;
