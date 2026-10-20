-- D11-A : gabarits compatibles avec les parcours existants, sans déplacer de pièce.
create or replace function public.ged_depot_artisan_autorise(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and public.mon_artisan_id() is not null and coalesce((
   (p_path ~ '^artisans/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
     and split_part(p_path,'/',2)=public.mon_artisan_id()::text)
   or (p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'
     and split_part(p_path,'/',1) in (select o::text from public.orgs_de_mes_missions() o))
   or (p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/factures-artisan/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
     and exists(select 1 from public.dossiers_de_mes_factures_a_deposer() d where p_path like d||'%'))
   or (p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/devis-gerimmo/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
     and exists(select 1 from public.artisan_devis_preparations p
       join public.incident_sollicitations s on s.id=p.sollicitation_id
       where p.artisan_id=public.mon_artisan_id() and s.artisan_id=p.artisan_id
       and p.statut='valide' and p.pdf_path=p_path
       and s.organization_id::text=split_part(p_path,'/',1)
       and s.statut::text in ('envoyee','revision_demandee')))
 ), false);
$$;
revoke all on function public.ged_depot_artisan_autorise(text) from public,anon;
grant execute on function public.ged_depot_artisan_autorise(text) to authenticated,service_role;

create or replace function public.ged_depot_locataire_autorise(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null
 and split_part(p_path,'/',1) in (select o::text from public.org_ids_avec_roles(array['locataire']::public.membership_role[]) o)
 and coalesce((
   p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
   or (p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/incidents-reprise/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'
     and exists(select 1 from public.depots_photos_incident d where d.storage_path=p_path
       and d.account_id=auth.uid() and d.organization_id::text=split_part(p_path,'/',1)
       and d.etat='en_attente'))
 ), false);
$$;
revoke all on function public.ged_depot_locataire_autorise(text) from public,anon;
grant execute on function public.ged_depot_locataire_autorise(text) to authenticated,service_role;

drop policy if exists ged_insert_artisan on storage.objects;
create policy ged_insert_artisan on storage.objects for insert to authenticated
 with check (bucket_id='documents' and public.ged_depot_artisan_autorise(name));
drop policy if exists ged_insert_locataire on storage.objects;
create policy ged_insert_locataire on storage.objects for insert to authenticated
 with check (bucket_id='documents' and public.ged_depot_locataire_autorise(name));
select public.fermer_fonctions_a_anon();
