-- Correctif : le prorata ne s'appliquait qu'au mois d'ENTRÉE. Un locataire
-- partant en cours de mois était facturé le mois plein (surfacturation).
-- Le mois de sortie est désormais proratisé du 1er au jour de fin inclus ;
-- un bail qui entre ET sort dans le même mois cumule les deux bornes.
create or replace function public.generer_appels_loyer(p_bail uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_mois date;
  v_fin date;
  v_coeff numeric;
  v_jours_mois int;
  v_premier int;   -- premier jour facturé du mois
  v_dernier int;   -- dernier jour facturé du mois
  v_crees int := 0;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat not in ('actif', 'preavis', 'termine') then
    raise exception 'Les appels de loyer ne se génèrent que sur un bail actif';
  end if;
  if v.date_debut is null then raise exception 'Le bail n''a pas de date de début'; end if;

  v_mois := date_trunc('month', v.date_debut)::date;
  v_fin := least(
    date_trunc('month', current_date)::date,
    coalesce(date_trunc('month', v.date_fin)::date, date_trunc('month', current_date)::date)
  );

  while v_mois <= v_fin loop
    if not exists (select 1 from public.appels_loyer a where a.bail_id = p_bail and a.periode = v_mois) then
      v_jours_mois := extract(day from (v_mois + interval '1 month' - interval '1 day'))::int;

      -- Bornes de facturation dans le mois : entrée en cours de mois et/ou
      -- sortie en cours de mois réduisent la période due.
      v_premier := case
        when v_mois = date_trunc('month', v.date_debut)::date then extract(day from v.date_debut)::int
        else 1 end;
      v_dernier := case
        when v.date_fin is not null and v_mois = date_trunc('month', v.date_fin)::date
          then extract(day from v.date_fin)::int
        else v_jours_mois end;

      if v_premier = 1 and v_dernier = v_jours_mois then
        v_coeff := 1;
      else
        v_coeff := round(greatest(0, v_dernier - v_premier + 1)::numeric / v_jours_mois, 4);
      end if;

      insert into public.appels_loyer
        (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance, prorata)
      values (
        v.organization_id, p_bail, v_mois,
        round(coalesce(v.loyer_hc, 0) * v_coeff, 2),
        round(coalesce(v.charges, 0) * v_coeff, 2),
        round((coalesce(v.loyer_hc, 0) + coalesce(v.charges, 0)) * v_coeff, 2),
        (v_mois + (coalesce(v.jour_echeance, 1) - 1) * interval '1 day')::date,
        v_coeff < 1
      );
      v_crees := v_crees + 1;
    end if;
    v_mois := (v_mois + interval '1 month')::date;
  end loop;
  return v_crees;
end;
$$;
