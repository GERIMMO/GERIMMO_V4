-- C) Le dépôt de garantie doit produire une écriture au journal, à
--    l'encaissement comme à la restitution (Comptabilité 4.1/4.2, RM-2.1.3),
--    portant le bail et le lot pour permettre le rapprochement.
create or replace function public.encaisser_depot(
  p_bail uuid, p_montant numeric, p_date date, p_moyen text,
  p_versant_person uuid default null, p_versant_libelle text default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v record; v_plafond numeric; v_cumul numeric; v_mois integer; v_meuble boolean;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if p_montant is null or p_montant <= 0 then raise exception 'Montant invalide'; end if;

  -- Meublé : par le type de bail, ou par le lot lui-même (colocation meublée)
  select coalesce(l.meuble, false) into v_meuble from public.lots l where l.id = v.lot_id;
  v_mois := case when v.type = 'meuble' or v_meuble then 2 else 1 end;
  v_plafond := coalesce(v.loyer_hc, 0) * v_mois;
  if coalesce(v.depot_garantie, 0) > v_plafond then
    raise exception 'Dépôt de % € supérieur au plafond légal de % € (% mois hors charges)',
      v.depot_garantie, v_plafond, v_mois;
  end if;

  select coalesce(sum(montant), 0) into v_cumul from public.depot_encaissements where bail_id = p_bail;
  if v_cumul + p_montant > coalesce(v.depot_garantie, 0) then
    raise exception 'Encaissement (% €) dépasse le dépôt dû restant (% €)',
      p_montant, coalesce(v.depot_garantie, 0) - v_cumul;
  end if;

  insert into public.depot_encaissements
    (organization_id, bail_id, montant, date_encaissement, moyen, versant_person_id, versant_libelle)
  values (v.organization_id, p_bail, p_montant, coalesce(p_date, current_date), p_moyen,
          p_versant_person, p_versant_libelle);

  insert into public.ecritures
    (organization_id, bail_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle, systeme)
  values (v.organization_id, p_bail, v.lot_id, 'depot_garantie', 'recette', p_montant,
          coalesce(p_date, current_date), coalesce(p_date, current_date),
          'Encaissement du dépôt de garantie', true);
  return v_cumul + p_montant;
end $$;

create or replace function public.finaliser_decompte(p_restitution uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v record; v_retenues numeric; v_solde numeric; v_lot uuid;
begin
  select * into v from public.restitutions where id = p_restitution;
  if v.id is null then raise exception 'Restitution introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'finalise' then raise exception 'Décompte déjà finalisé'; end if;
  select coalesce(sum(montant_retenu), 0) into v_retenues from public.retenues where restitution_id = p_restitution;
  v_solde := round(v.depot - v.impayes - v_retenues, 2);
  update public.restitutions set statut = 'finalise', solde = v_solde, date_emission = current_date
    where id = p_restitution;

  select lot_id into v_lot from public.baux where id = v.bail_id;
  if v_solde > 0 then
    insert into public.ecritures
      (organization_id, bail_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle, systeme)
    values (v.organization_id, v.bail_id, v_lot, 'depot_garantie', 'depense', v_solde,
            current_date, current_date, 'Restitution du dépôt de garantie', true);
  end if;

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (v.organization_id,
          case when v_retenues > 0 then 'decompte_lrar' else 'decompte' end, 'normale',
          case when v_solde < 0 then 'Solde de tout compte : créance sur le locataire'
               else 'Décompte de restitution à envoyer' end,
          jsonb_build_object('restitution_id', p_restitution, 'bail_id', v.bail_id, 'solde', v_solde));
  return v_solde;
end $$;
