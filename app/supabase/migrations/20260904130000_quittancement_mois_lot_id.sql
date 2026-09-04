-- Le quittancement du mois se filtre sur « mon portefeuille » (RM-18.1.3) :
-- la ligne doit porter l'id du lot, pas seulement son nom.
drop function if exists public.quittancement_mois(uuid, date);

create function public.quittancement_mois(p_org uuid, p_mois date)
returns table (
  bail_id uuid, appel_id uuid, lot_id uuid, lot_nom text, locataire text,
  montant_du numeric, montant_couvert numeric, statut text,
  quittance_id uuid, est_quittance boolean, email_envoye_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id, e.appel_id, l.id, l.nom,
    nullif(trim(coalesce(p.prenom || ' ', '') || coalesce(p.nom, '')), ''),
    e.montant_du, e.montant_couvert, e.statut,
    q.id, q.est_quittance, q.email_envoye_at
  from public.baux b
  join public.lots l on l.id = b.lot_id
  left join public.persons p on p.id = b.locataire_principal
  cross join lateral public.etat_loyers_bail(b.id) e
  left join public.quittances q on q.appel_id = e.appel_id
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis')
    and e.periode = date_trunc('month', p_mois)::date
    and b.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  order by 5 nulls last, 4;
$$;
revoke execute on function public.quittancement_mois(uuid, date) from public, anon;
