-- Audit métier du 27/09 — révision IRL.
--
-- 1. BLOQUANT : la variation de l'IRL était appliquée deux fois dès la 2e
--    révision. Le calcul prenait le loyer DÉJÀ révisé (baux.loyer_hc) et le
--    divisait par l'indice figé à la signature (baux.irl_valeur), jamais mis à
--    jour. Base 750 €, IRL 145,17 → 148,03 → 150,00 : 764,78 € puis 790,23 €
--    au lieu de 774,96 € (15,27 €/mois de trop, et l'écart croît chaque année).
--    Wiki [[Révision annuelle IRL]] : la révision suit la variation de l'indice
--    (formule RM-3.8.2) et « chaque révision conserve l'indice utilisé »
--    (RM-3.8.7). Le loyer courant se révise donc avec l'indice de la DERNIÈRE
--    révision (revisions_loyer.irl_nouveau), à défaut avec l'indice figé au
--    bail — ce qui revient exactement à « loyer initial × IRL nouveau / IRL de
--    référence du bail ».
--
-- 2. MAJEUR : la date d'effet n'était pas liée à la date anniversaire du bail
--    (bail débuté le 15/07/2026 : révision au 01/09/2026 acceptée). Wiki
--    [[Révision annuelle IRL]] : « réviser le loyer à la date anniversaire du
--    Bail » ; le bail PDF (bail-nu.ts, bail-meuble.ts) et la lettre de révision
--    l'écrivent aussi. La date d'effet doit valoir date de début + n ans.
--
-- 3. Cohérence : une révision datée AVANT la dernière révision enregistrée ne
--    peut plus s'appliquer au loyer courant (il intègre déjà la suivante).
--
-- Idempotent : create or replace, même signature.

create or replace function public.reviser_loyer(p_bail uuid, p_irl_nouveau numeric, p_date_effet date)
 returns numeric
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v record;
  v_dpe text;
  v_reference numeric;
  v_nouveau numeric;
  v_voisine date;
  v_derniere record;
begin
  -- Verrou sur le bail : deux révisions concurrentes (double-clic, rejeu
  -- réseau) se voient au lieu de passer toutes les deux la même vérification.
  select * into v from public.baux where id = p_bail for update;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if not v.revision_irl then
    raise exception 'Ce bail n''a pas de clause de révision — aucune révision possible';
  end if;
  if v.loyer_hc is null then raise exception 'Le loyer n''est pas fixé'; end if;
  if p_date_effet is null then raise exception 'Date d''effet de la révision obligatoire'; end if;
  if p_irl_nouveau is null or p_irl_nouveau <= 0 then
    raise exception 'Indice IRL du trimestre de révision obligatoire (saisi par l''admin d''agence, RM-3.8.3)';
  end if;

  -- RM-3.8.2 : l'indice de référence est celui figé au bail à sa signature.
  if v.irl_valeur is null or v.irl_valeur <= 0 then
    raise exception 'Indice de référence absent du bail : le trimestre et la valeur de l''IRL figés à la signature (RM-3.8.2) doivent être renseignés sur le bail avant toute révision';
  end if;

  select d.classe_dpe into v_dpe
  from public.diagnostics d
  where d.lot_id = v.lot_id and d.type = 'dpe' and d.archived_at is null
  order by d.date_realisation desc limit 1;
  if v_dpe in ('F', 'G') then
    raise exception 'Révision interdite : logement classé DPE % (passoire thermique, depuis 2022)', v_dpe;
  end if;

  if current_date > (p_date_effet + interval '1 year')::date then
    raise exception 'Révision prescrite : plus d''un an s''est écoulé depuis la date d''effet (RM-3.8.5)';
  end if;

  -- La révision se demande « dans l'année QUI SUIT la date anniversaire »,
  -- jamais avant (RM-3.8.5, rejeu du 2026-09-10).
  if p_date_effet > current_date then
    raise exception 'Révision anticipée : la date d''effet du % n''est pas encore atteinte. Une révision se demande dans l''année qui suit la date anniversaire, jamais avant (RM-3.8.5)',
      to_char(p_date_effet, 'DD/MM/YYYY');
  end if;

  -- Une révision par année de bail : le message est dit ici, avant la garde de
  -- la base, pour que l'agent lise la date qui bloque.
  select r.date_effet into v_voisine
  from public.revisions_loyer r
  where r.bail_id = p_bail
    and r.date_effet > (p_date_effet - interval '1 year')
    and r.date_effet < (p_date_effet + interval '1 year')
  order by r.date_effet desc
  limit 1;
  if v_voisine is not null then
    raise exception 'Révision annuelle : ce bail a déjà été révisé au %, moins d''un an avant le % demandé. Une seule révision par année de bail (parcours 3.8, RM-3.8.5)',
      to_char(v_voisine, 'DD/MM/YYYY'), to_char(p_date_effet, 'DD/MM/YYYY');
  end if;

  -- Audit 27/09 : la révision prend effet à la date anniversaire du bail
  -- (wiki [[Révision annuelle IRL]] ; clause imprimée au bail).
  if v.date_debut is null then
    raise exception 'Le bail n''a pas de date de début : la date anniversaire de la révision ne peut pas être déterminée';
  end if;
  if not exists (
    select 1 from generate_series(1, 99) n
    where (v.date_debut + make_interval(years => n))::date = p_date_effet
  ) then
    raise exception 'Révision au % refusée : elle prend effet à une date anniversaire du bail (bail débuté le % — prochaine date anniversaire possible : %)',
      to_char(p_date_effet, 'DD/MM/YYYY'), to_char(v.date_debut, 'DD/MM/YYYY'),
      to_char((v.date_debut + make_interval(years => greatest(1,
        extract(year from age(p_date_effet, v.date_debut))::int))), 'DD/MM/YYYY');
  end if;

  -- Audit 27/09 : la référence est l'indice de la dernière révision appliquée
  -- (RM-3.8.7), sinon celui figé au bail. Le loyer courant intègre déjà cette
  -- révision : le rediviser par l'indice de signature doublerait la hausse.
  select r.date_effet, r.irl_nouveau into v_derniere
  from public.revisions_loyer r
  where r.bail_id = p_bail
  order by r.date_effet desc
  limit 1;
  if v_derniere.date_effet is not null and v_derniere.date_effet > p_date_effet then
    raise exception 'Révision au % refusée : une révision plus récente (au %) est déjà appliquée au loyer',
      to_char(p_date_effet, 'DD/MM/YYYY'), to_char(v_derniere.date_effet, 'DD/MM/YYYY');
  end if;
  v_reference := coalesce(nullif(v_derniere.irl_nouveau, 0), v.irl_valeur);

  v_nouveau := round(v.loyer_hc * p_irl_nouveau / v_reference, 2);
  insert into public.revisions_loyer
    (organization_id, bail_id, date_effet, ancien_loyer, nouveau_loyer, irl_reference, irl_nouveau)
  values (v.organization_id, p_bail, p_date_effet, v.loyer_hc, v_nouveau, v_reference, p_irl_nouveau);
  update public.baux set loyer_hc = v_nouveau, updated_at = now() where id = p_bail;
  return v_nouveau;
end;
$function$;
