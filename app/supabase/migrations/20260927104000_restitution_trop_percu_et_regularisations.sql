-- Audit métier du 27/09 — le décompte final de sortie oubliait deux créances.
--
-- 1. TROP-PERÇU DE LOYER PERDU. montants_reels_bail ramenait à 0 l'excédent
--    encaissé (« il relève du solde de tout compte »), mais aucun solde de tout
--    compte n'existe hors du décompte de restitution : dernier appel 700 €,
--    1 400 € versés, dépôt 650 € → « solde à restituer 650 € » au lieu de
--    1 350 €. Wiki [[Solde de tout compte]] (rubrique « Trop-perçu éventuel —
--    dû au locataire ») et RM-3.5.1.
--
-- 2. SOLDE DE RÉGULARISATION IGNORÉ. Ni appelé, ni remboursé, ni repris à la
--    sortie, alors que le décompte imprimait « Impayés imputés (loyers,
--    charges, régularisations) ». Wiki [[Régularisation des charges]] : le
--    solde est « intégré au Solde de tout compte si le locataire est parti ».
--    regularisations_charges.ecart = provisions − réel : un écart positif est
--    dû AU locataire, un écart négatif est dû PAR lui.
--
-- Correction (version la plus simple qui dise vrai, à la sortie) :
--    net = appelé + compléments de régularisation − trop-perçus de
--          régularisation − encaissé
--    impayes    = max(net, 0)   (dette du locataire, imputée sur le dépôt)
--    trop_percu = max(−net, 0)  (créance du locataire, restituée avec le dépôt)
--    solde      = dépôt − impayés + trop-perçu − retenues
-- restitutions.trop_percu garde le montant arrêté, comme impayes.
-- À la finalisation, la part du solde qui rembourse un trop-perçu est écrite
-- au journal à part (« Restitution d'un trop-perçu »), le reste en
-- « depot_garantie » comme avant.
--
-- Ce qui n'est PAS fait ici (voir le rapport) : l'appel complémentaire ou
-- l'avoir d'une régularisation EN COURS de bail (wiki : « appel complémentaire
-- ou avoir ») — le reste dû courant, les relances et le rapport ne le voient
-- pas encore.
--
-- 3. DÉLAI DE RESTITUTION (mineur) : « conforme » coché malgré des écarts au
--    comparatif d'EDL donnait 1 mois au lieu de 2 (RM-2.4.2). Refusé.
--
-- Changer le type de retour impose drop/create : droits réappliqués à la fin.

alter table public.restitutions add column if not exists trop_percu numeric not null default 0;
comment on column public.restitutions.trop_percu is
  'Créance du locataire arrêtée avec les montants (avance de loyers, trop-perçu de régularisation) : restituée avec le dépôt.';

drop function if exists public.montants_restitution_a_jour(uuid);
drop function if exists public.montants_reels_bail(uuid);

create function public.montants_reels_bail(p_bail uuid)
 returns table(depot numeric, impayes numeric, trop_percu numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with net as (
    select
      coalesce((select sum(montant_du) from public.appels_loyer where bail_id = p_bail), 0)
      -- ecart = provisions − réel : un écart négatif est un complément dû par
      -- le locataire, un écart positif un trop-perçu qui lui revient.
      - coalesce((select sum(ecart) from public.regularisations_charges where bail_id = p_bail), 0)
      - coalesce((select sum(montant) from public.encaissements where bail_id = p_bail), 0) as solde
  )
  select
    -- Le dépôt à restituer est celui qui a été ENCAISSÉ (audit 09/09)
    coalesce((select sum(montant) from public.depot_encaissements where bail_id = p_bail), 0),
    round(greatest(0, net.solde), 2),
    round(greatest(0, - net.solde), 2)
  from net;
$function$;
revoke execute on function public.montants_reels_bail(uuid) from public, anon, authenticated;
grant execute on function public.montants_reels_bail(uuid) to service_role;

create function public.montants_restitution_a_jour(p_bail uuid)
 returns table(depot numeric, impayes numeric, trop_percu numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select m.depot, m.impayes, m.trop_percu
  from public.baux b
  cross join lateral public.montants_reels_bail(b.id) m
  where b.id = p_bail
    and b.organization_id in (select public.org_ids_avec_roles(
          array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and not public.bail_hors_portefeuille(b.organization_id, b.id);
$function$;
revoke execute on function public.montants_restitution_a_jour(uuid) from public, anon;
grant execute on function public.montants_restitution_a_jour(uuid) to authenticated, service_role;

create or replace function public.rafraichir_montants_restitution(p_restitution uuid)
 returns numeric
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v record; v_m record;
begin
  -- `for update` : le contrôle de statut ci-dessous n'a de valeur que si la
  -- ligne ne peut pas être finalisée entre cette lecture et l'écriture.
  select * into v from public.restitutions where id = p_restitution for update;
  if v.id is null then raise exception 'Restitution introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'finalise' then
    raise exception 'Décompte finalisé — les montants n''y bougent plus ; une correction passe par un décompte rectificatif';
  end if;

  select * into v_m from public.montants_reels_bail(v.bail_id);
  update public.restitutions
     set depot = v_m.depot, impayes = v_m.impayes, trop_percu = v_m.trop_percu,
         montants_arretes_le = now()
   where id = p_restitution;
  return v_m.impayes;
end $function$;

create or replace function public.demarrer_restitution(p_bail uuid, p_date_remise date, p_conforme boolean)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v record; v_m record; v_sans_edl boolean; v_id uuid; v_ecarts integer;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;

  v_sans_edl := not exists (
    select 1 from public.etats_des_lieux e
    where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe'
  );
  -- Audit 27/09 — RM-2.4.2 (wiki « Restitution du dépôt de garantie ») : le
  -- délai d'un mois suppose une sortie conforme à l'entrée. La case cochée à
  -- la main ne peut plus contredire le comparatif d'EDL qui relève des écarts.
  -- Le comparatif ne vaut que si les deux états des lieux sont signés (sinon
  -- toutes les lignes de l'entrée ressortent en « écart ») — même condition
  -- que l'écran (comparatifDisponible).
  if p_conforme
     and exists (select 1 from public.etats_des_lieux e
                  where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe')
     and exists (select 1 from public.etats_des_lieux e
                  where e.bail_id = p_bail and e.type = 'sortie' and e.etat = 'signe') then
    select count(*) into v_ecarts from public.comparatif_edl(p_bail) c where c.ecart;
    if v_ecarts > 0 then
      raise exception 'Sortie non conforme : le comparatif d''état des lieux relève % écart(s) entre l''entrée et la sortie — le délai de restitution est de 2 mois (RM-2.4.2)', v_ecarts;
    end if;
  end if;
  select * into v_m from public.montants_reels_bail(p_bail);

  insert into public.restitutions
    (organization_id, bail_id, date_remise_cles, delai_mois, depot, impayes, trop_percu,
     sans_edl_entree, montants_arretes_le)
  values (v.organization_id, p_bail, p_date_remise, case when p_conforme then 1 else 2 end,
          v_m.depot, v_m.impayes, v_m.trop_percu, v_sans_edl, now())
  on conflict (bail_id) do update
    set date_remise_cles = excluded.date_remise_cles, delai_mois = excluded.delai_mois,
        depot = excluded.depot, impayes = excluded.impayes, trop_percu = excluded.trop_percu,
        sans_edl_entree = excluded.sans_edl_entree,
        montants_arretes_le = excluded.montants_arretes_le
    where public.restitutions.statut = 'en_cours'
  returning id into v_id;
  if v_id is null then raise exception 'Restitution déjà finalisée pour ce bail'; end if;
  return v_id;
end $function$;

create or replace function public.finaliser_decompte(p_restitution uuid)
 returns numeric
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v record; v_retenues numeric; v_solde numeric; v_lot uuid;
        v_part_trop numeric; v_part_depot numeric;
begin
  select * into v from public.restitutions where id = p_restitution for update;
  if v.id is null then raise exception 'Restitution introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'finalise' then raise exception 'Décompte déjà finalisé'; end if;
  select coalesce(sum(montant_retenu), 0) into v_retenues from public.retenues where restitution_id = p_restitution;
  -- Audit 27/09 : le trop-perçu arrêté revient au locataire avec le dépôt.
  v_solde := round(v.depot - v.impayes + coalesce(v.trop_percu, 0) - v_retenues, 2);
  update public.restitutions set statut = 'finalise', solde = v_solde, date_emission = current_date
    where id = p_restitution;

  select lot_id into v_lot from public.baux where id = v.bail_id;
  if v_solde > 0 then
    -- La part qui rembourse un trop-perçu n'est pas un mouvement de dépôt :
    -- elle s'écrit à part, le reste sort du dépôt comme avant.
    v_part_trop := least(coalesce(v.trop_percu, 0), v_solde);
    v_part_depot := v_solde - v_part_trop;
    if v_part_depot > 0 then
      insert into public.ecritures
        (organization_id, bail_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle, systeme)
      values (v.organization_id, v.bail_id, v_lot, 'depot_garantie', 'depense', v_part_depot,
              current_date, current_date, 'Restitution du dépôt de garantie', true);
    end if;
    if v_part_trop > 0 then
      insert into public.ecritures
        (organization_id, bail_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle, systeme)
      values (v.organization_id, v.bail_id, v_lot, 'trop_percu_restitue', 'depense', v_part_trop,
              current_date, current_date, 'Restitution d''un trop-perçu au locataire (solde de tout compte)', true);
    end if;
  end if;

  perform public.fermer_alertes_origine(v.organization_id, 'restitution', p_restitution,
    'Décompte finalisé', array['restitution_echeance']);

  insert into public.alerts (organization_id, type, criticite, titre, details, echeance)
  values (v.organization_id,
          case when v_retenues > 0 then 'decompte_lrar' else 'decompte' end, 'normale',
          case when v_solde < 0 then 'Solde de tout compte : créance sur le locataire'
               else 'Décompte de restitution à envoyer' end,
          jsonb_build_object('restitution_id', p_restitution, 'bail_id', v.bail_id, 'solde', v_solde),
          public.restitution_date_limite(v.date_remise_cles, v.delai_mois));
  return v_solde;
end $function$;

-- L'espace locataire lit le même décompte : le trop-perçu y apparaît aussi.
drop function if exists public.ma_restitution_locataire(uuid);
create function public.ma_restitution_locataire(p_org uuid)
 returns table(statut text, date_remise_cles date, delai_mois integer, depot numeric, impayes numeric, solde numeric, date_emission date, sans_edl_entree boolean, trop_percu numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select r.statut, r.date_remise_cles, r.delai_mois, r.depot,
         case when r.statut = 'finalise' then r.impayes end,
         case when r.statut = 'finalise' then r.solde end,
         r.date_emission, r.sans_edl_entree,
         case when r.statut = 'finalise' then r.trop_percu end
  from public.restitutions r
  where r.organization_id = p_org
    and r.bail_id = public.mon_dernier_bail_locataire(p_org);
$function$;
revoke execute on function public.ma_restitution_locataire(uuid) from public, anon;
grant execute on function public.ma_restitution_locataire(uuid) to authenticated, service_role;

select public.fermer_fonctions_a_anon();
