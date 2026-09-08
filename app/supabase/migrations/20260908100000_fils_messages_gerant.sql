-- Espace agence v6 (maquette du 08/09) : page Messages côté gestionnaire.
-- La liste des fils — une personne, son dernier message, ses non-lus — SANS
-- marquer lu (c'est messages_personne, sur la fiche, qui marque).
create function public.fils_messages_gerant(p_org uuid)
returns table (person_id uuid, nom text, prenom text, dernier text,
               dernier_le timestamptz, dernier_auteur public.message_auteur,
               non_lus integer)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nom, p.prenom,
         (select m2.texte from public.messages m2
          where m2.organization_id = p_org and m2.person_id = p.id
          order by m2.created_at desc limit 1),
         (select m2.created_at from public.messages m2
          where m2.organization_id = p_org and m2.person_id = p.id
          order by m2.created_at desc limit 1),
         (select m2.auteur from public.messages m2
          where m2.organization_id = p_org and m2.person_id = p.id
          order by m2.created_at desc limit 1),
         (select count(*)::integer from public.messages m3
          where m3.organization_id = p_org and m3.person_id = p.id
            and m3.auteur = 'locataire' and m3.lu_le is null)
  from public.persons p
  where p.organization_id = p_org
    and p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and exists (select 1 from public.messages m
                where m.organization_id = p_org and m.person_id = p.id)
  order by 5 desc;
$$;
revoke execute on function public.fils_messages_gerant(uuid) from public, anon;
