-- Rétablit la sélection des pièces du bail antérieure à la mission 9.
create or replace function public.pieces_bail_locataire()
returns table (document_id uuid, organization_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select x.document_id, b.organization_id
  from public.baux b
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  cross join lateral (values (b.document_signe), (b.reglement_copropriete)) as x(document_id)
  where x.document_id is not null
    and b.etat in ('actif', 'preavis')
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status = 'active')
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'));
$$;
