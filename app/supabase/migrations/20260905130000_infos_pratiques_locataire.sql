-- « Votre logement, mode d'emploi » (maquette v10) : les infos pratiques du
-- bien existent déjà côté agence (bien_infos_pratiques) — ce RPC les ouvre au
-- locataire du bien.
create function public.mes_infos_pratiques_locataire(p_org uuid)
returns table (sortie_poubelles text, local_poubelles text, gardien text,
               travaux text, stationnement text, autres text)
language sql stable security definer set search_path = '' as $$
  select i.sortie_poubelles, i.local_poubelles, i.gardien, i.travaux,
         i.stationnement, i.autres
  from public.bien_infos_pratiques i
  where i.bien_id in (
    select l.bien_id from public.baux b
    join public.lots l on l.id = b.lot_id
    where b.organization_id = p_org and b.etat in ('actif', 'preavis')
      and exists (
        select 1 from public.persons p
        where p.organization_id = p_org and p.account_id = (select auth.uid())
          and (p.id = b.locataire_principal
               or exists (select 1 from public.bail_personnes bp
                          where bp.bail_id = b.id and bp.person_id = p.id
                            and bp.role = 'colocataire'))))
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status = 'active')
  limit 1;
$$;
revoke execute on function public.mes_infos_pratiques_locataire(uuid) from public, anon;
