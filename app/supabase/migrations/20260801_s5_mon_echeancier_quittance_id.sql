-- Ajoute l'id de quittance à l'échéancier locataire (pour lien vers la quittance).
drop function if exists public.mon_echeancier_locataire(uuid);
create function public.mon_echeancier_locataire(p_org uuid)
returns table (periode date, montant_du numeric, montant_couvert numeric, statut text, quittance_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select e.periode, e.montant_du, e.montant_couvert, e.statut,
    (select q.id from public.quittances q where q.appel_id = e.appel_id) as quittance_id
  from public.baux b
  join public.persons p on p.id = b.locataire_principal
  cross join lateral public.etat_loyers_bail(b.id) e
  where b.organization_id = p_org
    and p.account_id = (select auth.uid())
    and b.etat in ('actif', 'preavis')
  order by e.periode;
$$;
