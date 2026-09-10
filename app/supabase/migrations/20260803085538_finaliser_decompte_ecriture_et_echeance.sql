-- (Rapatriée depuis la prod le 2026-09-10 — appliquée via MCP sans fichier dépôt.)
-- Correction : la migration des échéances était repartie d'une version
-- antérieure de finaliser_decompte et avait supprimé l'écriture comptable de
-- sortie du dépôt, ajoutée par les correctifs d'audit. Les deux sont ici :
-- l'écriture de restitution ET l'échéance de l'alerte.
create or replace function public.finaliser_decompte(p_restitution uuid)
returns numeric language plpgsql security definer set search_path to '' as $function$
declare v record; v_bail record; v_retenues numeric; v_solde numeric;
begin
  select * into v from public.restitutions where id = p_restitution;
  if v.id is null then raise exception 'Restitution introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'finalise' then raise exception 'Décompte déjà finalisé'; end if;

  select coalesce(sum(montant_retenu), 0) into v_retenues
    from public.retenues where restitution_id = p_restitution;
  v_solde := round(v.depot - v.impayes - v_retenues, 2);

  update public.restitutions
     set statut = 'finalise', solde = v_solde, date_emission = current_date
   where id = p_restitution;

  -- Le dépôt sort de la trésorerie de l'agence : la part rendue au locataire
  -- est une dépense au journal, symétrique de la recette d'encaissement.
  select * into v_bail from public.baux where id = v.bail_id;
  if v_solde > 0 then
    insert into public.ecritures (organization_id, categorie, sens, montant,
      date_piece, date_imputation, libelle, bail_id, lot_id, systeme)
    values (v.organization_id, 'depot_garantie', 'depense', v_solde,
            current_date, current_date, 'Restitution du dépôt de garantie',
            v.bail_id, v_bail.lot_id, true);
  end if;

  -- Échéance : le terme légal de restitution, compté depuis la remise des clés
  insert into public.alerts (organization_id, type, criticite, titre, details, echeance)
  values (v.organization_id,
          case when v_retenues > 0 then 'decompte_lrar' else 'decompte' end, 'normale',
          case when v_solde < 0 then 'Solde de tout compte : créance sur le locataire'
               else 'Décompte de restitution à envoyer' end,
          jsonb_build_object('restitution_id', p_restitution, 'bail_id', v.bail_id, 'solde', v_solde),
          (v.date_remise_cles + (v.delai_mois || ' month')::interval)::date);
  return v_solde;
end $function$;
