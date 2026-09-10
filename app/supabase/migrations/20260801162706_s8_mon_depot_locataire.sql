-- (Rapatriée depuis la prod le 2026-09-10 — appliquée via MCP sans fichier dépôt.)
-- RM-2.6.1 : le locataire voit le montant et la date d'encaissement de son
-- dépôt dès l'encaissement (jamais les retenues envisagées, RM-2.6.2).
create or replace function public.mon_depot_locataire(p_org uuid)
returns table (depot_du numeric, encaisse numeric, derniere_date date)
language sql stable security definer set search_path = '' as $$
  select coalesce(b.depot_garantie, 0),
         coalesce((select sum(d.montant) from public.depot_encaissements d where d.bail_id = b.id), 0),
         (select max(d.date_encaissement) from public.depot_encaissements d where d.bail_id = b.id)
  from public.baux b
  join public.persons p on p.id = b.locataire_principal
  where b.organization_id = p_org
    and p.account_id = (select auth.uid())
    and b.etat in ('actif', 'preavis')
  order by b.created_at desc
  limit 1;
$$;
