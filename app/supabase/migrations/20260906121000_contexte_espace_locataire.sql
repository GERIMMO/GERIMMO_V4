-- Contexte de l'espace locataire pour la garde de navigation : nom de
-- l'organisation et fiche de l'appelant, y compris quand l'adhésion est
-- DÉSACTIVÉE (locataire sorti — l'espace passe en lecture, chantier D2).
-- Nécessaire car la RLS d'organizations/persons ne couvre que les adhésions
-- actives (user_org_ids), volontairement inchangée.
create function public.mon_espace_locataire(p_org uuid)
returns table (organisation_nom text, person_id uuid, nom text, prenom text, adhesion_active boolean)
language sql stable security definer set search_path = '' as $$
  select o.name, p.id, p.nom, p.prenom, (m.status = 'active')
  from public.memberships m
  join public.organizations o on o.id = m.organization_id
  left join public.persons p on p.organization_id = m.organization_id
                            and p.account_id = m.account_id
  where m.organization_id = p_org
    and m.account_id = (select auth.uid())
    and m.role = 'locataire'
    and m.status in ('active', 'inactive')
  limit 1;
$$;
revoke execute on function public.mon_espace_locataire(uuid) from public, anon;
