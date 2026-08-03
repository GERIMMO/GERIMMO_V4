-- A-01 / A-02 — prorata du premier loyer.
--
-- Le coefficient était arrondi à 4 décimales AVANT d'être appliqué :
-- round(20/31, 4) = 0,6452, puis 780 × 0,6452 = 503,26 € au lieu de 503,23 €.
-- Trois centimes d'écart systématique sur toute entrée en cours de mois.
--
-- Et « montant_du » était calculé à part, sur le total : 870 × 0,6452 = 561,32,
-- alors que les deux lignes affichées font 503,26 + 58,07 = 561,33. Le montant
-- dû ne valait pas la somme de ses composantes — incohérence visible sur la
-- quittance, qui détaille loyer et charges.
--
-- Correction : plus de coefficient intermédiaire. Un seul arrondi, à la fin, sur
-- chaque composante ; et le montant dû EST la somme des composantes arrondies.

create or replace function public.generer_appels_loyer(p_bail uuid)
returns integer language plpgsql security definer set search_path to '' as $function$
declare
  v record;
  v_mois date;
  v_fin date;
  v_jours_mois int;
  v_jours_dus int;
  v_premier int;   -- premier jour facturé du mois
  v_dernier int;   -- dernier jour facturé du mois
  v_loyer numeric;
  v_charges numeric;
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
      v_jours_dus := greatest(0, v_dernier - v_premier + 1);

      -- Un seul arrondi, à la fin, sur chaque composante.
      if v_jours_dus = v_jours_mois then
        v_loyer := round(coalesce(v.loyer_hc, 0), 2);
        v_charges := round(coalesce(v.charges, 0), 2);
      else
        v_loyer := round(coalesce(v.loyer_hc, 0) * v_jours_dus / v_jours_mois, 2);
        v_charges := round(coalesce(v.charges, 0) * v_jours_dus / v_jours_mois, 2);
      end if;

      insert into public.appels_loyer
        (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance, prorata)
      values (
        v.organization_id, p_bail, v_mois, v_loyer, v_charges,
        v_loyer + v_charges,   -- le total EST la somme des lignes affichées
        (v_mois + (coalesce(v.jour_echeance, 1) - 1) * interval '1 day')::date,
        v_jours_dus < v_jours_mois
      );
      v_crees := v_crees + 1;
    end if;
    v_mois := (v_mois + interval '1 month')::date;
  end loop;
  return v_crees;
end;
$function$;
