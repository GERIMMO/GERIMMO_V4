-- La gestion locative reste nationale. Seules les NOUVELLES mises en relation
-- du réseau sont conditionnées par une ouverture explicite commune × métier.
-- Les coordonnées postales historiques, carnets et dossiers sont conservés.
alter table public.biens add column commune_insee text references public.reseau_communes(code);
create index biens_commune_insee_idx on public.biens(commune_insee);
alter table public.incident_sollicitations add column origine_reseau text not null default 'historique' check(origine_reseau in ('historique','carnet','reseau'));
alter table public.incident_sollicitations add column commune_reseau text references public.reseau_communes(code);
create index incident_sollicitations_commune_reseau_idx on public.incident_sollicitations(commune_reseau);

create table public.reseau_ouvertures (
 commune_code text not null references public.reseau_communes(code),
 metier public.artisan_metier not null,
 ouverte boolean not null default false,
 decide_par uuid references public.accounts(id),
 decide_le timestamptz not null default now(),
 primary key(commune_code,metier)
);
create index reseau_ouvertures_decide_par_idx on public.reseau_ouvertures(decide_par);
create table public.reseau_artisan_communes (
 artisan_id uuid not null,
 metier public.artisan_metier not null,
 commune_code text not null references public.reseau_communes(code),
 rattache_par uuid references public.accounts(id),
 rattache_le timestamptz not null default now(),
 primary key(artisan_id,metier,commune_code),
 foreign key(artisan_id,metier) references public.artisan_metiers(artisan_id,metier) on delete cascade
);
create index reseau_artisan_communes_zone_idx on public.reseau_artisan_communes(commune_code,metier);
create index reseau_artisan_communes_auteur_idx on public.reseau_artisan_communes(rattache_par);
create table public.reseau_interets (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.accounts(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 bien_id uuid not null,
 commune_code text not null references public.reseau_communes(code),
 metier public.artisan_metier not null,
 cree_le timestamptz not null default now(),
 foreign key(bien_id,organization_id) references public.biens(id,organization_id) on delete cascade,
 unique(account_id,bien_id,commune_code,metier)
);
create index reseau_interets_org_idx on public.reseau_interets(organization_id);
create index reseau_interets_bien_idx on public.reseau_interets(bien_id,organization_id);
create index reseau_interets_zone_idx on public.reseau_interets(commune_code,metier);
do $$ declare t text; begin
 foreach t in array array['reseau_ouvertures','reseau_artisan_communes','reseau_interets'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy supervision on public.%I for select to authenticated using ((select public.is_super_admin()))',t);
 end loop;
end $$;
create policy mes_communes on public.reseau_artisan_communes for select to authenticated
 using (artisan_id=(select public.mon_artisan_id()));
create policy mon_interet on public.reseau_interets for select to authenticated
 using (account_id=(select auth.uid()) and organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
 and not public.bien_hors_portefeuille(organization_id,bien_id));

-- Une correction de voie/ville/code postal invalide l'ancienne confirmation.
-- Aucune affectation déduite automatiquement d'un code postal.
create function public.reseau_nom_commune(p_nom text) returns text
language sql immutable set search_path='' as $$
 select regexp_replace(lower(translate(coalesce(p_nom,''),'ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸàâäçéèêëîïôöùûüÿ','AAACEEEEIIOOUUUYaaaceeeeiioouuuy')),'[^a-z0-9]','','g');
$$;
revoke all on function public.reseau_nom_commune(text) from public,anon,authenticated;
create function public.reseau_controler_commune_bien() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.address_line1,new.postal_code,new.city) is distinct from (old.address_line1,old.postal_code,old.city) then
  new.commune_insee:=null;
 end if;
 if new.commune_insee is not null and not exists (
  select 1 from public.reseau_communes c where c.code=new.commune_insee and new.postal_code=any(c.codes_postaux)
   and public.reseau_nom_commune(c.nom)=public.reseau_nom_commune(new.city)
   and length(trim(coalesce(new.address_line1,'')))>0 and length(trim(coalesce(new.city,'')))>0
 ) then raise exception 'Complétez l’adresse du bien et choisissez une commune correspondant à son code postal.'; end if;
 return new;
end $$;
revoke all on function public.reseau_controler_commune_bien() from public,anon,authenticated;
create trigger reseau_commune_bien before insert or update on public.biens
 for each row execute function public.reseau_controler_commune_bien();

create function public.reseau_verifier_acces_bien(p_org uuid,p_bien uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not (p_org in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
  or public.bien_hors_portefeuille(p_org,p_bien)
  or not exists(select 1 from public.biens b where b.id=p_bien and b.organization_id=p_org)
 then raise exception 'Accès refusé à ce bien.'; end if;
end $$;
revoke all on function public.reseau_verifier_acces_bien(uuid,uuid) from public,anon,authenticated;

create function public.reseau_confirmer_commune(p_org uuid,p_bien uuid,p_commune text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Accès refusé.' using errcode='42501'; end if;
 perform public.reseau_verifier_acces_bien(p_org,p_bien);
 if not exists(select 1 from public.reseau_communes where code=p_commune) then raise exception 'Choisissez une commune proposée.'; end if;
 update public.biens set commune_insee=p_commune where id=p_bien and organization_id=p_org;
end $$;
revoke all on function public.reseau_confirmer_commune(uuid,uuid,text) from public,anon;
grant execute on function public.reseau_confirmer_commune(uuid,uuid,text) to authenticated;

create function public.reseau_contact_personnel(p_org uuid,p_artisan uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.artisan_agences aa where aa.organization_id=p_org and aa.artisan_id=p_artisan and aa.statut='actif' and aa.blacklist_le is null);
$$;
revoke all on function public.reseau_contact_personnel(uuid,uuid) from public,anon,authenticated;

-- Un contact déjà connu peut aussi être proposé par le réseau dans une
-- NOUVELLE commune. Son vieux secteur postal ne doit pas annuler cette offre.
create function public.reseau_contact_dans_zone(p_org uuid,p_artisan uuid,p_cp text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.reseau_contact_personnel(p_org,p_artisan) and (p_cp is null or exists(
  select 1 from public.artisan_zones z where z.artisan_id=p_artisan and z.code_postal=p_cp));
$$;
revoke all on function public.reseau_contact_dans_zone(uuid,uuid,text) from public,anon,authenticated;

create function public.reseau_artisan_eligible(p_artisan uuid,p_commune text,p_metier public.artisan_metier) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.artisans a join public.reseau_artisan_communes z on z.artisan_id=a.id
  where a.id=p_artisan and z.commune_code=p_commune and z.metier=p_metier
   and a.statut_plateforme='valide' and a.siret_etat='verifie' and a.visibilite='publique'
   and a.blacklist_globale_le is null and a.account_id is not null);
$$;
revoke all on function public.reseau_artisan_eligible(uuid,text,public.artisan_metier) from public,anon,authenticated;

create function public.reseau_disponibilite(p_org uuid,p_bien uuid,p_metier public.artisan_metier,p_nature public.nature_travaux default 'entretien_courant')
returns table(etat text,commune_code text,commune_nom text,nb_artisans bigint,nb_contacts bigint,interet_enregistre boolean)
language plpgsql stable security definer set search_path='' as $$
declare b record; ouverte boolean; n bigint; contacts bigint;
begin
 perform public.reseau_verifier_acces_bien(p_org,p_bien);
 if p_metier is null or p_nature is null then raise exception 'Choisissez un métier et la nature des travaux.'; end if;
 select bi.*,c.nom as commune_nom,c.codes_postaux into b from public.biens bi left join public.reseau_communes c on c.code=bi.commune_insee where bi.id=p_bien;
 select count(*) into contacts from public.artisans a where public.reseau_contact_personnel(p_org,a.id)
  and public.artisan_affectable(a.id,p_org,p_metier,p_nature,b.postal_code);
 if b.commune_insee is null or b.postal_code is null or not(b.postal_code=any(b.codes_postaux))
  or length(trim(coalesce(b.address_line1,'')))=0 or length(trim(coalesce(b.city,'')))=0 then
  return query select 'adresse_incomplete'::text,null::text,null::text,0::bigint,contacts,false; return;
 end if;
 select o.ouverte into ouverte from public.reseau_ouvertures o where o.commune_code=b.commune_insee and o.metier=p_metier;
 select count(*) into n from public.artisans a where public.reseau_artisan_eligible(a.id,b.commune_insee,p_metier)
  and public.artisan_affectable(a.id,p_org,p_metier,p_nature,null);
 return query select case when not coalesce(ouverte,false) then 'fermee' when n=0 then 'sans_artisan' else 'ouverte' end,
  b.commune_insee,b.commune_nom,case when coalesce(ouverte,false) then n else 0::bigint end,contacts,
  exists(select 1 from public.reseau_interets ri where ri.account_id=auth.uid() and ri.bien_id=p_bien and ri.commune_code=b.commune_insee and ri.metier=p_metier);
end $$;
revoke all on function public.reseau_disponibilite(uuid,uuid,public.artisan_metier,public.nature_travaux) from public,anon;
grant execute on function public.reseau_disponibilite(uuid,uuid,public.artisan_metier,public.nature_travaux) to authenticated;

create function public.reseau_signaler_interet(p_org uuid,p_bien uuid,p_metier public.artisan_metier,p_nature public.nature_travaux default 'entretien_courant') returns boolean
language plpgsql security definer set search_path='' as $$
declare d record; n integer;
begin
 perform public.reseau_verifier_acces_bien(p_org,p_bien);
 perform 1 from public.biens where id=p_bien for share;
 select * into d from public.reseau_disponibilite(p_org,p_bien,p_metier,p_nature);
 if d.etat='adresse_incomplete' then raise exception 'Complétez l’adresse du bien et confirmez sa commune avant de signaler votre intérêt.'; end if;
 if d.etat='ouverte' then raise exception 'Le réseau est disponible : consultez les artisans proposés pour ce bien.'; end if;
 insert into public.reseau_interets(account_id,organization_id,bien_id,commune_code,metier)
 values(auth.uid(),p_org,p_bien,d.commune_code,p_metier) on conflict(account_id,bien_id,commune_code,metier) do nothing;
 get diagnostics n=row_count;
 return n=1;
end $$;
revoke all on function public.reseau_signaler_interet(uuid,uuid,public.artisan_metier,public.nature_travaux) from public,anon;
grant execute on function public.reseau_signaler_interet(uuid,uuid,public.artisan_metier,public.nature_travaux) to authenticated;

create function public.reseau_rattacher_artisan(p_artisan uuid,p_communes text[],p_metier public.artisan_metier,p_rattacher boolean) returns void
language plpgsql security definer set search_path='' as $$
declare c text;
begin
 if not public.is_super_admin() then raise exception 'Accès réservé à la supervision.'; end if;
 if p_metier is null or p_rattacher is null or coalesce(cardinality(p_communes),0) not between 1 and 1000 then raise exception 'Choisissez un métier et au moins une commune (1 000 maximum).'; end if;
 if not exists(select 1 from public.artisan_metiers where artisan_id=p_artisan and metier=p_metier) then raise exception 'Ce métier ne figure pas sur la fiche de l’artisan.'; end if;
 foreach c in array p_communes loop
  if c is null or not exists(select 1 from public.reseau_communes where code=c) then raise exception 'Commune inconnue.'; end if;
  if p_rattacher then
   insert into public.reseau_artisan_communes(artisan_id,metier,commune_code,rattache_par) values(p_artisan,p_metier,c,auth.uid()) on conflict do nothing;
  else delete from public.reseau_artisan_communes where artisan_id=p_artisan and metier=p_metier and commune_code=c;
  end if;
 end loop;
 insert into public.audit_log(account_id,action,details) values(auth.uid(),'reseau_artisan_zones',jsonb_build_object('artisan',p_artisan,'communes',p_communes,'metier',p_metier,'rattache',p_rattacher));
end $$;
revoke all on function public.reseau_rattacher_artisan(uuid,text[],public.artisan_metier,boolean) from public,anon;
grant execute on function public.reseau_rattacher_artisan(uuid,text[],public.artisan_metier,boolean) to authenticated;

create function public.reseau_regler_ouverture(p_communes text[],p_metier public.artisan_metier,p_ouverte boolean,p_confirmation boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare c text; avant boolean;
begin
 if not public.is_super_admin() then raise exception 'Accès réservé à la supervision.'; end if;
 if p_metier is null or p_ouverte is null or coalesce(cardinality(p_communes),0) not between 1 and 1000 then raise exception 'Choisissez un métier et au moins une commune (1 000 maximum).'; end if;
 if p_ouverte and p_confirmation is distinct from true then raise exception 'Confirmez explicitement l’ouverture de ce métier dans les communes choisies.'; end if;
 -- Ordre stable pour les décisions groupées concurrentes.
 for c in select distinct unnest(p_communes) order by 1 loop
  if c is null or not exists(select 1 from public.reseau_communes where code=c) then raise exception 'Commune inconnue.'; end if;
  insert into public.reseau_ouvertures(commune_code,metier) values(c,p_metier) on conflict do nothing;
  select ouverte into avant from public.reseau_ouvertures where commune_code=c and metier=p_metier for update;
  if p_ouverte then
   perform 1 from public.artisans a join public.reseau_artisan_communes z on z.artisan_id=a.id
    where z.commune_code=c and z.metier=p_metier and public.reseau_artisan_eligible(a.id,c,p_metier)
    order by a.id for share of a,z;
   if not found then
    raise exception 'Ouverture impossible pour la commune % : aucun artisan validé, public et disposant d’un compte n’y est rattaché pour ce métier.',c;
   end if;
  end if;
  update public.reseau_ouvertures set ouverte=p_ouverte,decide_par=auth.uid(),decide_le=clock_timestamp() where commune_code=c and metier=p_metier;
  insert into public.audit_log(account_id,action,details) values(auth.uid(),'reseau_ouverture',jsonb_build_object('commune',c,'metier',p_metier,'avant',avant,'ouverte',p_ouverte));
 end loop;
end $$;
revoke all on function public.reseau_regler_ouverture(text[],public.artisan_metier,boolean,boolean) from public,anon;
grant execute on function public.reseau_regler_ouverture(text[],public.artisan_metier,boolean,boolean) to authenticated;

-- L'ancien annuaire sans bien devient une lecture du carnet uniquement.
-- Le réseau se consulte par une RPC qui déduit la commune DU BIEN autorisé.
alter function public.artisans_affectables(uuid,public.artisan_metier,public.nature_travaux,text) rename to artisans_affectables_interne;
revoke all on function public.artisans_affectables_interne(uuid,public.artisan_metier,public.nature_travaux,text) from public,anon,authenticated,service_role;
create function public.artisans_affectables(p_org uuid,p_metier public.artisan_metier,p_nature public.nature_travaux,p_code_postal text default null)
returns table(artisan_id uuid,raison_sociale text,telephone text,email text,rattache boolean,note_publiee numeric,nb_evaluations integer,publiable boolean,decennale_valide boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not(p_org in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé.' using errcode='42501'; end if;
 return query select x.* from public.artisans_affectables_interne(p_org,p_metier,p_nature,p_code_postal) x where public.reseau_contact_personnel(p_org,x.artisan_id);
end $$;
revoke all on function public.artisans_affectables(uuid,public.artisan_metier,public.nature_travaux,text) from public,anon;
grant execute on function public.artisans_affectables(uuid,public.artisan_metier,public.nature_travaux,text) to authenticated;

create function public.artisans_disponibles_bien(p_org uuid,p_bien uuid,p_metier public.artisan_metier,p_nature public.nature_travaux)
returns table(artisan_id uuid,raison_sociale text,telephone text,email text,rattache boolean,note_publiee numeric,nb_evaluations integer,publiable boolean,decennale_valide boolean)
language plpgsql stable security definer set search_path='' as $$
declare d record; cp text;
begin
 perform public.reseau_verifier_acces_bien(p_org,p_bien);
 select * into d from public.reseau_disponibilite(p_org,p_bien,p_metier,p_nature);
 select postal_code into cp from public.biens where id=p_bien;
 return query select a.id,a.raison_sociale,a.telephone,a.email,public.reseau_contact_dans_zone(p_org,a.id,cp),n.note_publiee,n.nb_evaluations,n.publiable,public.artisan_decennale_valide(a.id)
 from public.artisans a cross join lateral public.artisan_note(a.id) n
 where (public.reseau_contact_personnel(p_org,a.id) and public.artisan_affectable(a.id,p_org,p_metier,p_nature,cp))
  or (d.etat='ouverte' and public.reseau_artisan_eligible(a.id,d.commune_code,p_metier) and public.artisan_affectable(a.id,p_org,p_metier,p_nature,null))
 order by n.note_publiee desc nulls last,a.raison_sociale,a.id;
end $$;
revoke all on function public.artisans_disponibles_bien(uuid,uuid,public.artisan_metier,public.nature_travaux) from public,anon;
grant execute on function public.artisans_disponibles_bien(uuid,uuid,public.artisan_metier,public.nature_travaux) to authenticated;

-- On conserve les gardes métier et de portefeuille déjà testées dans le socle.
alter function public.ouvrir_consultation(uuid,uuid,public.artisan_metier,public.nature_travaux,boolean,integer) rename to ouvrir_consultation_interne;
revoke all on function public.ouvrir_consultation_interne(uuid,uuid,public.artisan_metier,public.nature_travaux,boolean,integer) from public,anon,authenticated,service_role;
create function public.ouvrir_consultation(p_org uuid,p_incident uuid,p_metier public.artisan_metier,p_nature public.nature_travaux,p_devis_unique_assume boolean default false,p_validite_jours integer default 30)
returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid; b uuid; d record;
begin
 if auth.uid() is null then raise exception 'Accès refusé.' using errcode='42501'; end if;
 v:=public.ouvrir_consultation_interne(p_org,p_incident,p_metier,p_nature,p_devis_unique_assume,p_validite_jours);
 select l.bien_id into b from public.incidents i join public.lots l on l.id=i.lot_id where i.id=p_incident and i.organization_id=p_org;
 select * into d from public.reseau_disponibilite(p_org,b,p_metier,p_nature);
 if d.nb_contacts=0 and d.etat<>'ouverte' then
  if d.etat='adresse_incomplete' then raise exception 'Complétez l’adresse du bien et confirmez sa commune avant de rechercher un artisan du réseau.'; end if;
  if d.etat='sans_artisan' then raise exception 'Aucun artisan du réseau n’est actuellement disponible pour ce métier et ces travaux dans cette zone.'; end if;
  raise exception 'Le réseau d’artisans Gerimmo n’est pas encore disponible pour ce métier dans cette zone.';
 end if;
 return v;
end $$;
revoke all on function public.ouvrir_consultation(uuid,uuid,public.artisan_metier,public.nature_travaux,boolean,integer) from public,anon;
grant execute on function public.ouvrir_consultation(uuid,uuid,public.artisan_metier,public.nature_travaux,boolean,integer) to authenticated;

alter function public.solliciter_artisan(uuid,uuid,uuid) rename to solliciter_artisan_interne;
revoke all on function public.solliciter_artisan_interne(uuid,uuid,uuid) from public,anon,authenticated,service_role;
-- Pour le réseau, la commune explicite remplace le filtre postal historique.
-- Le carnet personnel conserve ce dernier, sans changement de son parcours.
do $$ declare s text; begin
 s:=pg_get_functiondef('public.solliciter_artisan_interne(uuid,uuid,uuid)'::regprocedure);
 if position('c.nature_travaux, v_code_postal)' in s)=0 then raise exception 'Socle de sollicitation inattendu : migration interrompue.'; end if;
 s:=replace(s,'c.nature_travaux, v_code_postal)','c.nature_travaux, case when public.reseau_contact_dans_zone(p_org,p_artisan,v_code_postal) then v_code_postal else null end)');
 execute s;
end $$;
create function public.solliciter_artisan(p_org uuid,p_consultation uuid,p_artisan uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare c record; b record; autorisee boolean; contact boolean; v uuid; code_commune text;
begin
 if public.consultation_hors_portefeuille(p_org,p_consultation) then raise exception 'Ce dossier est hors de votre portefeuille' using errcode='42501'; end if;
 if auth.uid() is null or not(p_org in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé.' using errcode='42501'; end if;
 select * into c from public.incident_consultations where id=p_consultation and organization_id=p_org for update;
 if not found then raise exception 'Mise en concurrence introuvable.'; end if;
 select bi.* into b from public.incidents i join public.lots l on l.id=i.lot_id join public.biens bi on bi.id=l.bien_id where i.id=c.incident_id for share of bi;
 contact:=public.reseau_contact_dans_zone(p_org,p_artisan,b.postal_code);
 if not contact then
  if b.commune_insee is null then raise exception 'Complétez l’adresse du bien et confirmez sa commune.'; end if;
  select ouverte into autorisee from public.reseau_ouvertures where commune_code=b.commune_insee and metier=c.metier for share;
  if not coalesce(autorisee,false) then raise exception 'Le réseau d’artisans Gerimmo n’est pas encore disponible pour ce métier dans cette zone.'; end if;
  perform 1 from public.artisans where id=p_artisan for share;
  perform 1 from public.reseau_artisan_communes where artisan_id=p_artisan and commune_code=b.commune_insee and metier=c.metier for share;
  if not public.reseau_artisan_eligible(p_artisan,b.commune_insee,c.metier) then raise exception 'Cet artisan du réseau n’est plus disponible pour ce métier dans cette commune. Aucun professionnel n’a été sollicité.'; end if;
  code_commune:=b.commune_insee;
 end if;
 v:=public.solliciter_artisan_interne(p_org,p_consultation,p_artisan);
 update public.incident_sollicitations set origine_reseau=case when contact then 'carnet' else 'reseau' end,
  commune_reseau=code_commune where id=v;
 return v;
end $$;
revoke all on function public.solliciter_artisan(uuid,uuid,uuid) from public,anon;
grant execute on function public.solliciter_artisan(uuid,uuid,uuid) to authenticated;

-- Fermer l'annuaire global direct sans retirer les contacts ou l'historique.
create or replace function public.artisan_lisible(p_artisan uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.artisans a where a.id=p_artisan and (
  a.account_id=auth.uid() or public.is_super_admin()
  or exists(select 1 from public.artisan_agences aa where aa.artisan_id=a.id and aa.organization_id in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
  or exists(select 1 from public.incident_sollicitations s where s.artisan_id=a.id and s.organization_id in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[])) and not public.incident_hors_portefeuille(s.organization_id,s.incident_id))
 ));
$$;

comment on table public.reseau_interets is 'Manifestations d’intérêt sans intervention, destinataire, notification ni promesse de délai.';
comment on table public.reseau_ouvertures is 'Décisions explicites du super administrateur. Aucune ouverture créée par l’inscription ou la validation d’un artisan.';

create function public.reseau_pilotage(p_departement text,p_metier public.artisan_metier)
returns table(commune_code text,nom text,ouverte boolean,preparee boolean,artisans bigint,eligibles bigint,interets bigint,biens_interesses bigint,demandes bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_super_admin() then raise exception 'Accès réservé à la supervision.'; end if;
 return query select c.code,c.nom,coalesce(o.ouverte,false),o.commune_code is not null,
  (select count(*) from public.reseau_artisan_communes z where z.commune_code=c.code and z.metier=p_metier),
  (select count(*) from public.reseau_artisan_communes z where z.commune_code=c.code and z.metier=p_metier and public.reseau_artisan_eligible(z.artisan_id,c.code,p_metier)),
  (select count(*) from public.reseau_interets i where i.commune_code=c.code and i.metier=p_metier),
  (select count(distinct i.bien_id) from public.reseau_interets i where i.commune_code=c.code and i.metier=p_metier),
  (select count(*) from public.incident_sollicitations s join public.incident_consultations cc on cc.id=s.consultation_id where s.origine_reseau='reseau' and s.commune_reseau=c.code and cc.metier=p_metier)
 from public.reseau_communes c left join public.reseau_ouvertures o on o.commune_code=c.code and o.metier=p_metier
 where c.departement=p_departement order by c.nom,c.code;
end $$;
revoke all on function public.reseau_pilotage(text,public.artisan_metier) from public,anon;
grant execute on function public.reseau_pilotage(text,public.artisan_metier) to authenticated;

create function public.reseau_etats_bien(p_org uuid,p_bien uuid)
returns table(metier public.artisan_metier,nature public.nature_travaux,etat text,commune_code text,commune_nom text,nb_artisans bigint,nb_contacts bigint,interet_enregistre boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.reseau_verifier_acces_bien(p_org,p_bien);
 return query select m,n,d.* from unnest(enum_range(null::public.artisan_metier)) m
 cross join unnest(enum_range(null::public.nature_travaux)) n
 cross join lateral public.reseau_disponibilite(p_org,p_bien,m,n) d;
end $$;
revoke all on function public.reseau_etats_bien(uuid,uuid) from public,anon;
grant execute on function public.reseau_etats_bien(uuid,uuid) to authenticated;

-- Repose les gardes existantes sur la nouvelle table rattachée à une organisation.
select public.poser_gardes_abonnement();

-- La demande locale se repère aussi à l'échelle nationale : aucun département
-- ne doit rester invisible simplement parce que le filtre initial est le 91.
create function public.reseau_interets_pilotage(p_offset integer default 0,p_limite integer default 30)
returns table(commune_code text,commune_nom text,departement text,metier public.artisan_metier,interets bigint,biens_interesses bigint,dernier_interet timestamptz,total_groupes bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_super_admin() then raise exception 'Accès réservé à la supervision.'; end if;
 if p_offset is null or p_offset<0 or p_offset>1000000 or p_limite is null or p_limite not between 1 and 100 then raise exception 'Pagination invalide.'; end if;
 return query select i.commune_code,c.nom,c.departement,i.metier,count(*),count(distinct i.bien_id),max(i.cree_le),count(*) over()
 from public.reseau_interets i join public.reseau_communes c on c.code=i.commune_code
 group by i.commune_code,c.nom,c.departement,i.metier
 order by count(*) desc,max(i.cree_le) desc,i.commune_code,i.metier offset p_offset limit p_limite;
end $$;
revoke all on function public.reseau_interets_pilotage(integer,integer) from public,anon;
grant execute on function public.reseau_interets_pilotage(integer,integer) to authenticated;
