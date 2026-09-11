-- (Rapatriée depuis la prod le 2026-09-10 — appliquée via MCP sans fichier dépôt.)
-- Option B (arbitrage 2026-08-01) : le rapport (PDF) de chaque diagnostic doit
-- être présent pour ACTIVER le bail — car le diagnostic est annexé au bail
-- (wiki/concepts/Diagnostic). Au dépôt, le PDF reste facultatif.
create or replace function public.activer_bail(p_bail uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_lot record;
  v_blocages text[];
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

  select * into v_lot from public.lots where id = v.lot_id;
  if v_lot.etat <> 'disponible' then
    raise exception 'Le lot doit être « disponible » pour être loué (actuel : %)', v_lot.etat;
  end if;

  v_blocages := public.lot_blocages_location(v.lot_id);
  if array_length(v_blocages, 1) > 0 then
    raise exception 'Mise en location bloquée : %', array_to_string(v_blocages, ' ; ');
  end if;

  -- Option B : rapport (PDF) obligatoire pour annexer chaque diagnostic au bail
  if exists (
    select 1 from public.diagnostics d
    where (d.lot_id = v.lot_id or d.bien_id = v_lot.bien_id)
      and d.archived_at is null
      and d.document_id is null
  ) then
    raise exception 'Rapport manquant : chaque diagnostic doit avoir son PDF pour être annexé au bail — complétez les rapports avant d''activer';
  end if;

  update public.baux set etat = 'actif', updated_at = now() where id = p_bail;
  update public.lots set etat = 'loue' where id = v.lot_id;
  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (v.organization_id, 'edl_entree', 'normale',
          'État des lieux d''entrée à réaliser',
          jsonb_build_object('bail_id', p_bail, 'lot_id', v.lot_id));
end;
$$;
