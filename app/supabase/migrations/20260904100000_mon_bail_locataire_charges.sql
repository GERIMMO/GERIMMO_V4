-- Onglet locataire « Loyer & quittances » (maquette v3) : la page affiche la
-- prochaine échéance et le régime de charges — le RPC du bail locataire doit
-- donc remonter charges_mode (provision/forfait) et jour_echeance.
drop function if exists public.mon_bail_locataire(uuid);

create function public.mon_bail_locataire(p_org uuid)
returns table (bail_id uuid, type public.bail_type, etat public.bail_etat,
               loyer_hc numeric, charges numeric, date_debut date, date_fin date,
               lot_nom text, charges_mode text, jour_echeance smallint)
language sql stable security definer set search_path = '' as $$
  select b.id, b.type, b.etat, b.loyer_hc, b.charges, b.date_debut, b.date_fin,
         l.nom, b.charges_mode, b.jour_echeance
  from public.baux b
  join public.lots l on l.id = b.lot_id
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis')
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by b.created_at desc;
$$;

revoke execute on function public.mon_bail_locataire(uuid) from public, anon;
