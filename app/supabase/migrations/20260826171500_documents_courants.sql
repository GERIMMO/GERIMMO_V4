-- Revue 26/08 (passe n°1, finding 10) — le filtrage des versions remplacées
-- se faisait côté application sur une fenêtre plafonnée (Set sur remplace_id) :
-- au-delà du plafond PostgREST, des versions périmées seraient réapparues
-- comme courantes. La liste et les stats de la vue d'ensemble passent par
-- cette fonction : versions courantes uniquement, filtrées en SQL.
-- SECURITY INVOKER : la RLS de `documents` s'applique (gérants de l'agence).
-- Appliquée le 2026-08-26 sur « Gerimmo V4 » via MCP. Copie de référence.

create function public.documents_courants(p_org uuid)
returns setof public.documents
language sql stable security invoker set search_path = '' as $$
  select d.*
  from public.documents d
  where d.organization_id = p_org
    and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id);
$$;
