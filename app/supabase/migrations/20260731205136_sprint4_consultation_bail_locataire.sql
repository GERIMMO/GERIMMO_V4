-- (Rapatriée depuis la prod le 2026-09-10 — appliquée via MCP sans fichier dépôt.)
-- Sprint 4 — le locataire consulte SON bail signé (jamais le brouillon), RM-1.x
create or replace function public.mon_bail_locataire(p_org uuid)
returns table (
  bail_id uuid, type public.bail_type, etat public.bail_etat,
  loyer_hc numeric, charges numeric, date_debut date, date_fin date, lot_nom text
)
language sql
security definer
set search_path = ''
stable
as $$
  select b.id, b.type, b.etat, b.loyer_hc, b.charges, b.date_debut, b.date_fin, l.nom
  from public.baux b
  join public.persons p on p.id = b.locataire_principal
  join public.lots l on l.id = b.lot_id
  where b.organization_id = p_org
    and p.account_id = (select auth.uid())
    and b.etat in ('actif', 'preavis')
  order by b.created_at desc;
$$;
revoke execute on function public.mon_bail_locataire(uuid) from public, anon;
