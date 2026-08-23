-- Recette 21/08 — l'alerte « État des lieux d'entrée à réaliser » ne disait
-- ni le lot ni le locataire : treize alertes identiques, illisibles. Le titre
-- porte désormais le contexte, et details.libelle le reprend pour les listes.
-- Reprend la définition courante d'activer_bail (plafond du dépôt, date de
-- début posée, échéance de l'alerte) — seul le bloc alerte change.

create or replace function public.activer_bail(p_bail uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v record;
  v_lot record;
  v_blocages text[];
  v_plafond numeric;
  v_locataire text;
begin
  select * into v from public.baux where id = p_bail;
  if not found then raise exception 'Bail introuvable'; end if;

  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'brouillon' then
    raise exception 'Seul un bail en brouillon peut être activé';
  end if;
  if v.locataire_principal is null then
    raise exception 'Le locataire principal est obligatoire';
  end if;
  if v.document_signe is null then
    raise exception 'Déposez le bail signé (PDF) avant activation (V0 : signature hors plateforme)';
  end if;

  if v.loyer_hc is not null and v.depot_garantie is not null then
    v_plafond := (case when v.type = 'meuble' then 2 else 1 end) * v.loyer_hc;
    if v.depot_garantie > v_plafond then
      raise exception 'Dépôt de garantie trop élevé : maximum % mois de loyer hors charges (soit % €)',
        (case when v.type = 'meuble' then 2 else 1 end), v_plafond;
    end if;
  end if;

  select * into v_lot from public.lots where id = v.lot_id;
  if v_lot.etat <> 'disponible' then
    raise exception 'Le lot doit être « disponible » pour être loué (actuel : %)', v_lot.etat;
  end if;

  v_blocages := public.lot_blocages_location(v.lot_id);
  if array_length(v_blocages, 1) > 0 then
    raise exception 'Mise en location bloquée : %', array_to_string(v_blocages, ' ; ');
  end if;

  select trim(coalesce(prenom, '') || ' ' || nom) into v_locataire
  from public.persons where id = v.locataire_principal;

  update public.baux
     set etat = 'actif',
         date_debut = coalesce(date_debut, current_date),
         updated_at = now()
   where id = p_bail;
  update public.lots set etat = 'loue' where id = v.lot_id;
  -- Échéance : l'état des lieux se fait à la remise des clés, donc à la prise d'effet
  insert into public.alerts (organization_id, type, criticite, titre, details, echeance)
  values (v.organization_id, 'edl_entree', 'normale',
          format('État des lieux d''entrée — %s · %s',
                 v_lot.nom, coalesce(nullif(v_locataire, ''), 'locataire')),
          jsonb_build_object('bail_id', p_bail, 'lot_id', v.lot_id,
                             'person_id', v.locataire_principal,
                             'libelle', format('%s · %s', v_lot.nom,
                                               coalesce(nullif(v_locataire, ''), 'locataire'))),
          coalesce(v.date_debut, current_date));
end;
$$;
