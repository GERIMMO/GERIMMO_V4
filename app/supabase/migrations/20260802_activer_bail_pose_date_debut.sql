-- L'activation est le point de départ du bail, mais activer_bail ne posait
-- jamais date_debut : un bail actif sans date de début ne peut pas générer
-- son échéancier (« Le bail n'a pas de date de début », découvert en recette).
-- La date reste modifiable au brouillon ; à défaut, l'activation fait foi.
-- (create or replace de activer_bail : version complète en prod, voir MCP ;
-- delta fonctionnel = date_debut = coalesce(date_debut, current_date) au
-- passage en actif + rattrapage des baux actifs sans date de début.)
CREATE OR REPLACE FUNCTION public.activer_bail(p_bail uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v record;
  v_lot record;
  v_blocages text[];
  v_plafond numeric;
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

  update public.baux
     set etat = 'actif',
         date_debut = coalesce(date_debut, current_date),
         updated_at = now()
   where id = p_bail;
  update public.lots set etat = 'loue' where id = v.lot_id;
  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (v.organization_id, 'edl_entree', 'normale',
          'État des lieux d''entrée à réaliser',
          jsonb_build_object('bail_id', p_bail, 'lot_id', v.lot_id));
end;
$function$
;

update public.baux
   set date_debut = coalesce(date_debut, created_at::date)
 where etat in ('actif', 'preavis', 'termine') and date_debut is null;
