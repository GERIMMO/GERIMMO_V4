-- Publications organiques réautorisées par la supervision, 25 septembre 2026.
-- Les campagnes payantes et les développements ne reçoivent aucun nouvel accord.
alter table public.marketing_reglages add column diffusion_version smallint not null default 0;
update public.marketing_reglages set actif=true,publication_automatique=true,diffusion_version=1,
 publications_semaine=2,jours_semaine=array[2,5]::smallint[],modifie_le=now() where singleton;
alter table public.publications
 add column marketing_jour date,
 add column veille_source_id uuid references public.regulatory_watch(id),
 add column image_empreinte text check(image_empreinte is null or image_empreinte ~ '^[a-f0-9]{64}$'),
 add column image_essais smallint not null default 0,
 add column image_en_cours_le timestamptz,
 add column facebook_envoi_demarre_le timestamptz;
create unique index publications_marketing_jour_unique on public.publications(marketing_jour) where marketing_jour is not null;
create unique index publications_veille_source_unique on public.publications(veille_source_id);
create unique index publications_image_unique on public.publications(image_empreinte) where image_empreinte is not null;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('marketing-visuels','marketing-visuels',true,10000000,array['image/jpeg']) on conflict(id) do nothing;
-- Seul le serveur dépose ces illustrations publiques ; aucun document utilisateur.
create function public.reserver_visuel_marketing(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Réservé au traitement marketing'; end if;
 update public.publications set image_essais=image_essais+1,image_en_cours_le=now()
 where id=p_id and marketing_jour is not null and statut in ('brouillon','planifiee') and image_empreinte is null
 and image_essais<2 and (image_en_cours_le is null or image_en_cours_le<now()-interval '5 minutes')
 and exists(select from public.marketing_reglages where singleton and actif);
 return found;
end $$;
revoke all on function public.reserver_visuel_marketing(uuid) from public,anon,authenticated;
grant execute on function public.reserver_visuel_marketing(uuid) to service_role;
-- Réservation durable commune à la diffusion manuelle et automatique.
-- Une réponse Meta perdue reste à vérifier, sans nouvel envoi aveugle.
create function public.reserver_diffusion_facebook(p_id uuid,p_automatique boolean default false) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_automatique then
  perform pg_catalog.pg_advisory_xact_lock(20260925,13);
  if (select auth.role()) is distinct from 'service_role' then raise exception 'Réservé au traitement marketing'; end if;
  if not exists(select from public.marketing_reglages where singleton and actif and publication_automatique and diffusion_version=1) then return false; end if;
   if (select count(*) from public.publications where marketing_jour is not null and facebook_envoi_demarre_le>=date_trunc('week',now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')>=2 then return false; end if;
 elsif (select auth.uid()) is null or public.is_permanent_super_admin() is not true then raise exception 'Accès réservé à la supervision'; end if;
 update public.publications set facebook_envoi_demarre_le=now(),facebook_erreur='Envoi engagé : si la confirmation manque, vérifiez Facebook avant toute nouvelle tentative.'
 where id=p_id and statut='publiee' and facebook_post_id is null and facebook_envoi_demarre_le is null
 and (not p_automatique or (marketing_jour is not null and image_empreinte is not null and facebook_image_url is not null));
 return found;
end $$;
revoke all on function public.reserver_diffusion_facebook(uuid,boolean) from public,anon;
grant execute on function public.reserver_diffusion_facebook(uuid,boolean) to authenticated,service_role;
create function public.publier_article_automatique(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Réservé au traitement marketing'; end if;
 update public.publications p set statut='publiee',publie_le=coalesce(publie_le,now())
 where p.id=p_id and p.marketing_jour is not null and p.statut in ('brouillon','planifiee','publiee')
 and p.image_empreinte is not null and p.facebook_image_url is not null
 and exists(select from public.marketing_reglages where singleton and actif and publication_automatique and diffusion_version=1)
 and not exists(select from public.regulatory_watch v where v.id=p.veille_source_id and v.statut='ecarte');
 return found;
end $$;
revoke all on function public.publier_article_automatique(uuid) from public,anon,authenticated;
grant execute on function public.publier_article_automatique(uuid) to service_role;

-- ON CONFLICT(publication_id) doit pouvoir inférer l’index sans prédicat.
drop index public.marketing_campagnes_publication_unique;
create unique index marketing_campagnes_publication_unique on public.marketing_campagnes(publication_id);
