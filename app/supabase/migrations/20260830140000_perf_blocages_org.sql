-- Performance (30/08) : les écrans Tableau de bord, Parc et Bien appelaient
-- lot_blocages_location une fois par lot en préparation (N allers-retours).
-- Une seule fonction rend les blocages de tous les lots en préparation de
-- l'organisation (ou d'un bien). Même droits : fonction invoker, la RLS des
-- lots s'applique.
create function public.lots_blocages_location(p_org uuid, p_bien uuid default null)
returns table (lot_id uuid, blocages text[])
language sql
stable
set search_path = ''
as $$
  select l.id, public.lot_blocages_location(l.id)
  from public.lots l
  where l.organization_id = p_org
    and l.etat = 'brouillon'
    and (p_bien is null or l.bien_id = p_bien);
$$;
revoke execute on function public.lots_blocages_location(uuid, uuid) from public, anon;
