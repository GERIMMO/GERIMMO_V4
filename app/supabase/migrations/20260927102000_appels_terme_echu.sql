-- Audit métier du 27/09 — le loyer « à terme échu » était appelé comme
-- « à échoir ».
--
-- L'échéance valait toujours « 1er du mois + jour d'échéance − 1 », quel que
-- soit baux.paiement_echeance. Un bail à terme échu (le bail PDF l'imprime :
-- bail-nu.ts, bail-meuble.ts) voyait le loyer de septembre dû le 05/09 : alerte
-- d'impayé dès le 06/09, relance automatique dès le 10/09, pour un loyer que
-- le bail ne rend exigible qu'une fois la période écoulée.
-- Wiki [[Période de loyer]] (échéancier paramétré « à échoir / terme échu »)
-- et [[Quittancement des loyers]] (module 3).
--
-- Correction : à terme échu, l'échéance du terme du mois M tombe le jour
-- d'échéance du mois M+1 (le terme est payé après la période). À échoir :
-- inchangé. Les appels déjà générés ne sont pas réécrits (voir le rapport).
--
-- Idempotent : create or replace, même signature (les droits restent ceux de
-- 20260911200000 : réservée à la tâche planifiée).

create or replace function public.generer_appels_loyer_interne(p_bail uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        -- Audit 27/09 : à terme échu, le terme du mois se paie le mois suivant.
        ((case when v.paiement_echeance = 'echu' then v_mois + interval '1 month' else v_mois end)::date
          + (coalesce(v.jour_echeance, 1) - 1) * interval '1 day')::date,
        v_jours_dus < v_jours_mois
      );
      v_crees := v_crees + 1;
    end if;
    v_mois := (v_mois + interval '1 month')::date;
  end loop;
  return v_crees;
end;
$function$

;
