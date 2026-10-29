-- Consommations : collecte explicitement attribuée, contrats et factures privés.
-- Aucune écriture comptable ni régularisation locative n'est créée par ce module.
create schema if not exists consommations_interne;
revoke all on schema consommations_interne from public, anon;
grant usage on schema consommations_interne to authenticated;

create table if not exists public.compteurs_consommation (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 bien_id uuid not null, lot_id uuid, type text not null check(type in('eau_froide','eau_chaude','electricite','gaz','chauffage')),
 unite text not null check(unite in('m3','kwh')), libelle text not null check(length(trim(libelle)) between 1 and 120),
 numero text check(length(numero)<=120), emplacement text check(length(emplacement)<=500),
 index_initial numeric(15,3) not null check(index_initial>=0), date_index_initial date not null,
 periodicite_mois smallint not null default 1 check(periodicite_mois in(1,2,3,6,12)),
 prochaine_demande date not null, bail_referent uuid, personne_referente uuid,
 actif boolean not null default true, created_at timestamptz not null default now(),
 unique(id,organization_id),
 foreign key(bien_id,organization_id) references public.biens(id,organization_id),
 foreign key(lot_id,organization_id) references public.lots(id,organization_id),
 foreign key(bail_referent,organization_id) references public.baux(id,organization_id),
 foreign key(personne_referente,organization_id) references public.persons(id,organization_id),
 check((bail_referent is null)=(personne_referente is null)),
 check(bail_referent is null or lot_id is not null),
 check((type in('eau_froide','eau_chaude') and unite='m3') or (type in('electricite','chauffage') and unite='kwh') or type='gaz'),
 check(prochaine_demande>date_index_initial)
);
create index if not exists compteurs_conso_org on public.compteurs_consommation(organization_id,bien_id);
create index if not exists compteurs_conso_lot on public.compteurs_consommation(lot_id);
create index if not exists compteurs_conso_bail on public.compteurs_consommation(bail_referent);
create index if not exists compteurs_conso_personne on public.compteurs_consommation(personne_referente);

create table if not exists public.demandes_releves (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 compteur_id uuid not null, bail_id uuid not null, personne_id uuid not null, echeance date not null,
 statut text not null default 'attendue' check(statut in('attendue','recu','annulee')),
 created_at timestamptz not null default now(), unique(compteur_id,echeance), unique(id,organization_id),
 foreign key(compteur_id,organization_id) references public.compteurs_consommation(id,organization_id),
 foreign key(bail_id,organization_id) references public.baux(id,organization_id),
 foreign key(personne_id,organization_id) references public.persons(id,organization_id)
);
create index if not exists demandes_releves_org on public.demandes_releves(organization_id,statut);
create index if not exists demandes_releves_personne on public.demandes_releves(personne_id);
create index if not exists demandes_releves_bail on public.demandes_releves(bail_id);
create table if not exists public.releves_consommation (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 compteur_id uuid not null, demande_id uuid unique, date_releve date not null,
 index_releve numeric(15,3) not null check(index_releve>=0), photo_document_id uuid,
 created_at timestamptz not null default now(),
 foreign key(compteur_id,organization_id) references public.compteurs_consommation(id,organization_id),
 foreign key(demande_id,organization_id) references public.demandes_releves(id,organization_id),
 foreign key(photo_document_id,organization_id) references public.documents(id,organization_id),
 unique(compteur_id,date_releve)
);
create index if not exists releves_conso_org on public.releves_consommation(organization_id);
create index if not exists releves_conso_photo on public.releves_consommation(photo_document_id);

create table if not exists public.contrats_fourniture (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 bien_id uuid not null, lot_id uuid, fournisseur text not null check(length(trim(fournisseur)) between 1 and 150),
 categorie text not null check(categorie in('eau','electricite_commune','electricite_privative','gaz','chauffage','internet','assurance','entretien','teom','autre')),
 reference text check(length(reference)<=150), montant_cents bigint check(montant_cents between 0 and 99999999999),
 periodicite_mois smallint not null default 1 check(periodicite_mois in(1,2,3,6,12)), echeance date,
 preavis_jours smallint not null default 30 check(preavis_jours between 0 and 366),
 actif boolean not null default true, created_at timestamptz not null default now(), unique(id,organization_id),
 foreign key(bien_id,organization_id) references public.biens(id,organization_id),
 foreign key(lot_id,organization_id) references public.lots(id,organization_id)
);
create index if not exists contrats_fourniture_org on public.contrats_fourniture(organization_id,bien_id);
create index if not exists contrats_fourniture_lot on public.contrats_fourniture(lot_id);
create table if not exists public.factures_fourniture (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 contrat_id uuid not null, document_id uuid not null, reference text not null check(length(trim(reference)) between 1 and 150),
 periode_debut date not null, periode_fin date not null, total_cents bigint not null check(total_cents between 0 and 99999999999),
 frais_fixes_cents bigint not null default 0 check(frais_fixes_cents>=0), frais_gestion_cents bigint not null default 0 check(frais_gestion_cents>=0), consommation numeric(15,3) check(consommation>=0),
 date_echeance date, payee_le date, created_at timestamptz not null default now(),
 unite_consommation text check(unite_consommation in('m3','kwh')),
 foreign key(contrat_id,organization_id) references public.contrats_fourniture(id,organization_id),
 foreign key(document_id,organization_id) references public.documents(id,organization_id),
 unique(contrat_id,reference), unique(document_id), check(periode_fin>=periode_debut), check(frais_fixes_cents<=total_cents), check(frais_gestion_cents<=total_cents)
);
create index if not exists factures_fourniture_org on public.factures_fourniture(organization_id);
alter table public.factures_fourniture add column if not exists unite_consommation text check(unite_consommation in('m3','kwh'));

create table if not exists public.depots_photos_releve (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 demande_id uuid not null, account_id uuid not null references public.accounts(id),
 empreinte text not null check(empreinte~'^[0-9a-f]{64}$'), mime text not null check(mime in('image/jpeg','image/png')),
 taille bigint not null check(taille between 1 and 10485760), storage_path text not null unique,
 document_id uuid, created_at timestamptz not null default now(),
 unique(demande_id,account_id,empreinte),
 foreign key(demande_id,organization_id) references public.demandes_releves(id,organization_id),
 foreign key(document_id,organization_id) references public.documents(id,organization_id)
);
create index if not exists depots_releve_org on public.depots_photos_releve(organization_id);
create index if not exists depots_releve_account on public.depots_photos_releve(account_id);
create index if not exists depots_releve_document on public.depots_photos_releve(document_id);

-- Toutes les autorisations dérivent de l'identité serveur, jamais d'un rôle fourni par l'écran.
create or replace function consommations_interne.gerant(p_org uuid,p_bien uuid,p_lot uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and p_org in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
 and not public.bien_hors_portefeuille(p_org,p_bien)
 and (p_lot is null or not public.lot_hors_portefeuille(p_org,p_lot));
$$;
revoke all on function consommations_interne.gerant(uuid,uuid,uuid) from public,anon;
grant execute on function consommations_interne.gerant(uuid,uuid,uuid) to authenticated;

create or replace function consommations_interne.ma_demande(p_demande uuid,p_agir boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.demandes_releves d
  join public.persons p on p.id=d.personne_id and p.organization_id=d.organization_id and p.account_id=auth.uid()
  join public.memberships m on m.account_id=auth.uid() and m.organization_id=d.organization_id and m.role='locataire'
  join public.baux b on b.id=d.bail_id and b.organization_id=d.organization_id
  join public.compteurs_consommation c on c.id=d.compteur_id and c.organization_id=d.organization_id
  where d.id=p_demande and m.status in('active','inactive')
  and (not p_agir or (m.status='active' and b.etat in('actif','preavis') and c.actif and d.statut='attendue'
    and c.bail_referent=d.bail_id and c.personne_referente=d.personne_id and b.date_debut<=public.aujourdhui_paris()
    and not public.est_traversee_organisation(d.organization_id)
    and (b.locataire_principal=p.id or exists(select 1 from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=p.id and bp.role='colocataire'))))
 );
$$;
revoke all on function consommations_interne.ma_demande(uuid,boolean) from public,anon;
grant execute on function consommations_interne.ma_demande(uuid,boolean) to authenticated;

-- Intégrité entre bâtiment, lot, bail et destinataire ; impossible de changer le passé d'un compteur.
create or replace function consommations_interne.garder_rattachement()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.lot_id is not null and not exists(select 1 from public.lots l where l.id=new.lot_id and l.bien_id=new.bien_id and l.organization_id=new.organization_id) then
  raise exception 'Le logement ne correspond pas au bâtiment'; end if;
 if tg_table_name='compteurs_consommation' then
  if new.actif and new.bail_referent is not null and not exists(select 1 from public.baux b where b.id=new.bail_referent and b.lot_id=new.lot_id and b.organization_id=new.organization_id and b.etat in('actif','preavis') and (b.locataire_principal=new.personne_referente or exists(select 1 from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=new.personne_referente and bp.role='colocataire'))) then
   raise exception 'Choisissez un locataire du bail en cours de ce logement'; end if;
  if tg_op='UPDATE' and (exists(select 1 from public.demandes_releves d where d.compteur_id=old.id) or exists(select 1 from public.releves_consommation r where r.compteur_id=old.id))
    and (new.organization_id,new.bien_id,new.lot_id,new.type,new.unite,new.index_initial,new.date_index_initial)
    is distinct from (old.organization_id,old.bien_id,old.lot_id,old.type,old.unite,old.index_initial,old.date_index_initial) then
   raise exception 'Ce compteur a un historique : archivez-le et créez son remplacement'; end if;
 end if;
 if tg_op='UPDATE' and new.organization_id<>old.organization_id then raise exception 'Le dossier ne peut pas changer d’organisation'; end if;
 return new;
end $$;
revoke all on function consommations_interne.garder_rattachement() from public,anon,authenticated;
drop trigger if exists conso_rattachement on public.compteurs_consommation;
create trigger conso_rattachement before insert or update on public.compteurs_consommation for each row execute function consommations_interne.garder_rattachement();
drop trigger if exists conso_rattachement on public.contrats_fourniture;
create trigger conso_rattachement before insert or update on public.contrats_fourniture for each row execute function consommations_interne.garder_rattachement();

do $$ declare t text; begin
 foreach t in array array['compteurs_consommation','contrats_fourniture','factures_fourniture','demandes_releves','releves_consommation','depots_photos_releve'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('drop trigger if exists diagnostic_artisan_lecture on public.%I',t);
  execute format('create trigger diagnostic_artisan_lecture before insert or update or delete on public.%I for each row execute function public.refuser_mutation_diagnostic_artisan()',t);
  execute format('drop trigger if exists traversee_lecture_seule on public.%I',t);
  execute format('create trigger traversee_lecture_seule before insert or update or delete on public.%I for each row execute function support_interne.garder_ecriture_traversee()',t);
 end loop;
 foreach t in array array['compteurs_consommation','contrats_fourniture'] loop
  execute format('grant insert,update on public.%I to authenticated',t);
  execute format('drop policy if exists conso_gerant on public.%I',t);
  execute format('create policy conso_gerant on public.%I for all to authenticated using(consommations_interne.gerant(organization_id,bien_id,lot_id)) with check(consommations_interne.gerant(organization_id,bien_id,lot_id))',t);
 end loop;
end $$;
grant insert,update on public.factures_fourniture to authenticated;
drop policy if exists conso_gerant on public.factures_fourniture;
create policy conso_gerant on public.factures_fourniture for all to authenticated
 using(exists(select 1 from public.contrats_fourniture c where c.id=contrat_id and c.organization_id=factures_fourniture.organization_id))
 with check(exists(select 1 from public.contrats_fourniture c where c.id=contrat_id and c.organization_id=factures_fourniture.organization_id));
drop policy if exists conso_lecture on public.demandes_releves;
create policy conso_lecture on public.demandes_releves for select to authenticated
 using(consommations_interne.ma_demande(id,false) or exists(select 1 from public.compteurs_consommation c where c.id=compteur_id));
drop policy if exists conso_lecture on public.releves_consommation;
create policy conso_lecture on public.releves_consommation for select to authenticated
 using(consommations_interne.ma_demande(demande_id,false) or exists(select 1 from public.compteurs_consommation c where c.id=compteur_id));
drop policy if exists conso_lecture on public.depots_photos_releve;
create policy conso_lecture on public.depots_photos_releve for select to authenticated
 using(account_id=auth.uid() and consommations_interne.ma_demande(demande_id,false));

create or replace function consommations_interne.synchroniser(p_org uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_compteur public.compteurs_consommation; n integer:=0; nb integer; prochain date;
begin
 if auth.uid() is null or p_org not in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[])) or public.est_traversee_organisation(p_org) then raise exception 'Accès refusé' using errcode='42501'; end if;
 -- Les anciennes demandes non remplies ne restent pas des tâches d'un occupant parti.
 update public.demandes_releves d set statut='annulee'
 from public.compteurs_consommation c,public.baux b
 where d.compteur_id=c.id and d.bail_id=b.id and d.organization_id=p_org and d.statut='attendue'
  and consommations_interne.gerant(c.organization_id,c.bien_id,c.lot_id)
  and (not c.actif or b.etat not in('actif','preavis') or c.bail_referent is distinct from d.bail_id or c.personne_referente is distinct from d.personne_id);
 for v_compteur in select * from public.compteurs_consommation x where x.organization_id=p_org and x.actif and x.prochaine_demande<=public.aujourdhui_paris() and consommations_interne.gerant(x.organization_id,x.bien_id,x.lot_id) for update loop
  if v_compteur.bail_referent is null or not exists(select 1 from public.baux b join public.persons p on p.id=v_compteur.personne_referente join public.memberships m on m.account_id=p.account_id and m.organization_id=p_org and m.role='locataire' and m.status='active' where b.id=v_compteur.bail_referent and b.etat in('actif','preavis') and (b.locataire_principal=p.id or exists(select 1 from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=p.id and bp.role='colocataire'))) then continue; end if;
  -- Une seule tâche ouverte par compteur ; ne crée pas douze demandes lors d'une reprise après absence.
  if not exists(select 1 from public.demandes_releves d where d.compteur_id=v_compteur.id and d.statut='attendue') then
   insert into public.demandes_releves(organization_id,compteur_id,bail_id,personne_id,echeance)
    values(p_org,v_compteur.id,v_compteur.bail_referent,v_compteur.personne_referente,v_compteur.prochaine_demande) on conflict(compteur_id,echeance) do nothing;
   get diagnostics nb=row_count; n:=n+nb;
  end if;
  prochain:=v_compteur.prochaine_demande;
  while prochain<=public.aujourdhui_paris() loop prochain:=(prochain+make_interval(months=>v_compteur.periodicite_mois))::date; end loop;
  update public.compteurs_consommation set prochaine_demande=prochain where id=v_compteur.id;
 end loop;
 return n;
end $$;
revoke all on function consommations_interne.synchroniser(uuid) from public,anon;
grant execute on function consommations_interne.synchroniser(uuid) to authenticated;
create or replace function public.synchroniser_demandes_releves(p_org uuid) returns integer language sql security invoker set search_path='' as $$ select consommations_interne.synchroniser(p_org); $$;
revoke all on function public.synchroniser_demandes_releves(uuid) from public,anon;
grant execute on function public.synchroniser_demandes_releves(uuid) to authenticated;

create or replace function consommations_interne.mes_releves(p_org uuid)
returns table(demande_id uuid,compteur_id uuid,libelle text,type text,unite text,numero text,emplacement text,lot_nom text,echeance date,statut text,index_precedent numeric,date_precedente date,index_releve numeric,date_releve date,photo_document_id uuid,peut_repondre boolean)
language sql stable security definer set search_path='' as $$
 select d.id,c.id,c.libelle,c.type,c.unite,c.numero,c.emplacement,l.nom,d.echeance,d.statut,
 coalesce(prec.index_releve,c.index_initial),coalesce(prec.date_releve,c.date_index_initial),r.index_releve,r.date_releve,r.photo_document_id,consommations_interne.ma_demande(d.id,true)
 from public.demandes_releves d join public.compteurs_consommation c on c.id=d.compteur_id
 join public.lots l on l.id=c.lot_id left join public.releves_consommation r on r.demande_id=d.id
 left join lateral(select x.index_releve,x.date_releve from public.releves_consommation x join public.demandes_releves dx on dx.id=x.demande_id where x.compteur_id=c.id and x.demande_id<>d.id and dx.personne_id=d.personne_id and x.date_releve<coalesce(r.date_releve,'infinity'::date) order by x.date_releve desc limit 1) prec on true
 where d.organization_id=p_org and consommations_interne.ma_demande(d.id,false)
 order by (d.statut='attendue') desc,d.echeance desc;
$$;
revoke all on function consommations_interne.mes_releves(uuid) from public,anon;
grant execute on function consommations_interne.mes_releves(uuid) to authenticated;
create or replace function public.mes_releves_consommation(p_org uuid)
returns table(demande_id uuid,compteur_id uuid,libelle text,type text,unite text,numero text,emplacement text,lot_nom text,echeance date,statut text,index_precedent numeric,date_precedente date,index_releve numeric,date_releve date,photo_document_id uuid,peut_repondre boolean)
language sql stable security invoker set search_path='' as $$ select * from consommations_interne.mes_releves(p_org); $$;
revoke all on function public.mes_releves_consommation(uuid) from public,anon;
grant execute on function public.mes_releves_consommation(uuid) to authenticated;

create or replace function consommations_interne.soumettre(p_demande uuid,p_index numeric,p_date date,p_photo uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.demandes_releves; c public.compteurs_consommation; r public.releves_consommation; v_index numeric; v_date date; v_id uuid;
begin
 if not consommations_interne.ma_demande(p_demande,false) then raise exception 'Accès refusé' using errcode='42501'; end if;
 select * into d from public.demandes_releves where id=p_demande;
 select * into c from public.compteurs_consommation where id=d.compteur_id for update;
 select * into d from public.demandes_releves where id=p_demande for update;
 select * into r from public.releves_consommation where demande_id=d.id;
 if found then
  if r.index_releve=p_index and r.date_releve=p_date and r.photo_document_id is not distinct from p_photo then return r.id; end if;
  raise exception 'Un relevé est déjà enregistré. Contactez le propriétaire pour corriger une erreur.';
 end if;
 if not consommations_interne.ma_demande(p_demande,true) then raise exception 'Cette demande ne peut plus être remplie' using errcode='42501'; end if;
 if p_index is null or p_index<0 or p_index>=1000000000000 or p_index<>round(p_index,3) or p_index::text in('NaN','Infinity','-Infinity') then raise exception 'Index invalide : trois décimales au maximum'; end if;
 select x.index_releve,x.date_releve into v_index,v_date from public.releves_consommation x where x.compteur_id=c.id order by x.date_releve desc limit 1;
 v_index:=coalesce(v_index,c.index_initial); v_date:=coalesce(v_date,c.date_index_initial);
 if p_date is null or p_date<=v_date or p_date>public.aujourdhui_paris() then raise exception 'La date doit suivre le précédent relevé, sans être dans le futur'; end if;
 if exists(select 1 from public.baux b where b.id=d.bail_id and p_date<b.date_debut) then raise exception 'Le relevé doit être daté pendant votre occupation'; end if;
 if p_index<v_index then raise exception 'Index inférieur au précédent : vérifiez le compteur ou signalez son remplacement'; end if;
 if p_photo is not null and not exists(select 1 from public.depots_photos_releve p where p.demande_id=d.id and p.account_id=auth.uid() and p.document_id=p_photo) then raise exception 'Cette photo ne correspond pas à votre relevé'; end if;
 insert into public.releves_consommation(organization_id,compteur_id,demande_id,date_releve,index_releve,photo_document_id)
 values(d.organization_id,c.id,d.id,p_date,p_index,p_photo) returning id into v_id;
 update public.demandes_releves set statut='recu' where id=d.id;
 return v_id;
end $$;
revoke all on function consommations_interne.soumettre(uuid,numeric,date,uuid) from public,anon;
grant execute on function consommations_interne.soumettre(uuid,numeric,date,uuid) to authenticated;
create or replace function public.soumettre_releve_consommation(p_demande uuid,p_index numeric,p_date date,p_photo uuid default null)
returns uuid language sql security invoker set search_path='' as $$ select consommations_interne.soumettre(p_demande,p_index,p_date,p_photo); $$;
revoke all on function public.soumettre_releve_consommation(uuid,numeric,date,uuid) from public,anon;
grant execute on function public.soumettre_releve_consommation(uuid,numeric,date,uuid) to authenticated;

-- Photo facultative : réservation nominative, bucket GED privé, puis preuve d'existence avant le lien.
create or replace function consommations_interne.preparer_photo(p_demande uuid,p_empreinte text,p_mime text,p_taille bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.demandes_releves; v public.depots_photos_releve; v_id uuid:=gen_random_uuid();
begin
 if not consommations_interne.ma_demande(p_demande,false) then raise exception 'Accès refusé' using errcode='42501'; end if;
 select * into d from public.demandes_releves where id=p_demande for update;
 if p_empreinte is null or p_empreinte!~'^[0-9a-f]{64}$' or p_mime is null or p_mime not in('image/jpeg','image/png') or p_taille is null or p_taille not between 1 and 10485760 then raise exception 'Photo invalide (JPEG ou PNG, 10 Mo maximum)'; end if;
 select * into v from public.depots_photos_releve where demande_id=p_demande and account_id=auth.uid() and empreinte=p_empreinte;
 if found then
  if v.mime<>p_mime or v.taille<>p_taille then raise exception 'Photo différente du dépôt initial'; end if;
  return to_jsonb(v);
 end if;
 if not consommations_interne.ma_demande(p_demande,true) then raise exception 'Cette demande ne peut plus recevoir de photo' using errcode='42501'; end if;
 if (select count(*) from public.depots_photos_releve where demande_id=p_demande)>10 then raise exception 'Trop de tentatives de photo pour ce relevé'; end if;
 insert into public.depots_photos_releve(id,organization_id,demande_id,account_id,empreinte,mime,taille,storage_path)
 values(v_id,d.organization_id,d.id,auth.uid(),p_empreinte,p_mime,p_taille,d.organization_id::text||'/releves/'||v_id::text||case when p_mime='image/png' then '.png' else '.jpg' end) returning * into v;
 return to_jsonb(v);
end $$;
revoke all on function consommations_interne.preparer_photo(uuid,text,text,bigint) from public,anon;
grant execute on function consommations_interne.preparer_photo(uuid,text,text,bigint) to authenticated;
create or replace function public.preparer_photo_releve(p_demande uuid,p_empreinte text,p_mime text,p_taille bigint)
returns jsonb language sql security invoker set search_path='' as $$ select consommations_interne.preparer_photo(p_demande,p_empreinte,p_mime,p_taille); $$;
revoke all on function public.preparer_photo_releve(uuid,text,text,bigint) from public,anon;
grant execute on function public.preparer_photo_releve(uuid,text,text,bigint) to authenticated;

create or replace function consommations_interne.photo_autorisee(p_path text,p_depot boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.depots_photos_releve p
 where p.storage_path=p_path and p.account_id=auth.uid() and consommations_interne.ma_demande(p.demande_id,p_depot)
 and (not p_depot or p.document_id is null));
$$;
revoke all on function consommations_interne.photo_autorisee(text,boolean) from public,anon;
grant execute on function consommations_interne.photo_autorisee(text,boolean) to authenticated;
drop policy if exists releve_photo_depot on storage.objects;
create policy releve_photo_depot on storage.objects for insert to authenticated
 with check(bucket_id='documents' and consommations_interne.photo_autorisee(name,true));
drop policy if exists releve_photo_lecture on storage.objects;
create policy releve_photo_lecture on storage.objects for select to authenticated
 using(bucket_id='documents' and consommations_interne.photo_autorisee(name,false));

create or replace function consommations_interne.finaliser_photo(p_depot uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.depots_photos_releve; d public.demandes_releves; v_doc uuid;
begin
 select * into v from public.depots_photos_releve where id=p_depot and account_id=auth.uid() for update;
 if not found or not consommations_interne.ma_demande(v.demande_id,false) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if v.document_id is not null then return v.document_id; end if;
 if not consommations_interne.ma_demande(v.demande_id,true) then raise exception 'Cette demande est fermée'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='documents' and o.name=v.storage_path
  and coalesce(nullif(to_jsonb(o)->>'owner_id',''),to_jsonb(o)->>'owner')=auth.uid()::text
  and (o.metadata->>'size')::bigint=v.taille and o.metadata->>'mimetype'=v.mime) then raise exception 'La photo n’est pas encore enregistrée. Réessayez le dépôt.'; end if;
 select * into d from public.demandes_releves where id=v.demande_id;
 insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,deposited_by)
 values(v.organization_id,'autre','Photo de relevé de compteur',v.storage_path,v.mime,v.taille,v.empreinte,auth.uid()) returning id into v_doc;
 insert into public.document_liens(organization_id,document_id,entite,entite_id)
 values(v.organization_id,v_doc,'personne',d.personne_id), (v.organization_id,v_doc,'lot',(select lot_id from public.compteurs_consommation where id=d.compteur_id));
 update public.depots_photos_releve set document_id=v_doc where id=v.id;
 return v_doc;
end $$;
revoke all on function consommations_interne.finaliser_photo(uuid) from public,anon;
grant execute on function consommations_interne.finaliser_photo(uuid) to authenticated;
create or replace function public.finaliser_photo_releve(p_depot uuid) returns uuid language sql security invoker set search_path='' as $$ select consommations_interne.finaliser_photo(p_depot); $$;
revoke all on function public.finaliser_photo_releve(uuid) from public,anon;
grant execute on function public.finaliser_photo_releve(uuid) to authenticated;

create or replace function consommations_interne.releve_gerant(p_org uuid,p_compteur uuid,p_index numeric,p_date date)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.compteurs_consommation; v_index numeric; v_suivant numeric; v_id uuid; v_demande uuid;
begin
 select * into c from public.compteurs_consommation where id=p_compteur and organization_id=p_org for update;
 if not found or not consommations_interne.gerant(c.organization_id,c.bien_id,c.lot_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if not c.actif then raise exception 'Ce compteur est archivé'; end if;
 select id into v_id from public.releves_consommation where compteur_id=c.id and date_releve=p_date and index_releve=p_index;
 if found then return v_id; end if;
 if p_index is null or p_index<0 or p_index>=1000000000000 or p_index<>round(p_index,3) or p_index::text in('NaN','Infinity','-Infinity') then raise exception 'Index invalide'; end if;
 if p_date is null or p_date<=c.date_index_initial or p_date>public.aujourdhui_paris() then raise exception 'Date du relevé invalide'; end if;
 if exists(select 1 from public.releves_consommation x where x.compteur_id=c.id and x.date_releve=p_date) then raise exception 'Un relevé différent existe déjà à cette date'; end if;
 select x.index_releve into v_index from public.releves_consommation x where x.compteur_id=c.id and x.date_releve<p_date order by x.date_releve desc limit 1;
 v_index:=coalesce(v_index,c.index_initial);
 select x.index_releve into v_suivant from public.releves_consommation x where x.compteur_id=c.id and x.date_releve>p_date order by x.date_releve limit 1;
 if p_index<v_index then raise exception 'Index inférieur au précédent'; end if;
 if v_suivant is not null and p_index>v_suivant then raise exception 'Index supérieur au relevé suivant : vérifiez le relevé historique'; end if;
 select d.id into v_demande from public.demandes_releves d where d.compteur_id=c.id and d.statut='attendue' and d.echeance<=p_date
  and d.bail_id=c.bail_referent and d.personne_id=c.personne_referente order by d.echeance limit 1 for update;
 insert into public.releves_consommation(organization_id,compteur_id,demande_id,date_releve,index_releve)
 values(p_org,c.id,v_demande,p_date,p_index) returning id into v_id;
 if v_demande is not null then update public.demandes_releves set statut='recu' where id=v_demande; end if;
 return v_id;
end $$;
revoke all on function consommations_interne.releve_gerant(uuid,uuid,numeric,date) from public,anon;
grant execute on function consommations_interne.releve_gerant(uuid,uuid,numeric,date) to authenticated;
create or replace function public.enregistrer_releve_compteur(p_org uuid,p_compteur uuid,p_index numeric,p_date date)
returns uuid language sql security invoker set search_path='' as $$ select consommations_interne.releve_gerant(p_org,p_compteur,p_index,p_date); $$;
revoke all on function public.enregistrer_releve_compteur(uuid,uuid,numeric,date) from public,anon;
grant execute on function public.enregistrer_releve_compteur(uuid,uuid,numeric,date) to authenticated;

-- Préparation contrôlable : les centimes se calculent en base, jamais depuis les montants annoncés par le navigateur.
create table if not exists public.repartitions_fourniture (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 facture_id uuid not null unique references public.factures_fourniture(id),
 statut text not null default 'brouillon' check(statut in('brouillon','validee')),
 motif text not null check(length(trim(motif)) between 8 and 2000), lignes jsonb not null,
 total_recuperable_cents bigint not null check(total_recuperable_cents>=0),
 total_proprietaire_cents bigint not null check(total_proprietaire_cents>=0), source jsonb not null,
 created_by uuid not null references public.accounts(id), created_at timestamptz not null default now(),
 validee_le timestamptz, validee_par uuid references public.accounts(id),
 check((statut='validee')=(validee_le is not null and validee_par is not null))
);
create index if not exists repartition_fourniture_org on public.repartitions_fourniture(organization_id);
create index if not exists repartition_fourniture_created_by on public.repartitions_fourniture(created_by);
create index if not exists repartition_fourniture_validee_par on public.repartitions_fourniture(validee_par);
alter table public.repartitions_fourniture enable row level security;
revoke all on public.repartitions_fourniture from anon,authenticated;
grant select on public.repartitions_fourniture to authenticated;
drop policy if exists repartition_fourniture_lecture on public.repartitions_fourniture;
create policy repartition_fourniture_lecture on public.repartitions_fourniture for select to authenticated
 using(exists(select 1 from public.factures_fourniture f where f.id=facture_id));
drop trigger if exists traversee_lecture_seule on public.repartitions_fourniture;
create trigger traversee_lecture_seule before insert or update or delete on public.repartitions_fourniture for each row execute function support_interne.garder_ecriture_traversee();
drop trigger if exists diagnostic_artisan_lecture on public.repartitions_fourniture;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.repartitions_fourniture for each row execute function public.refuser_mutation_diagnostic_artisan();

-- La validation porte sur le décompte vu, pas seulement sur son identifiant réutilisé.
alter table public.repartitions_fourniture add column if not exists empreinte text;
create or replace function consommations_interne.empreinte_repartition(p_lignes jsonb,p_source jsonb,p_recuperable bigint,p_proprietaire bigint,p_motif text)
returns text language sql immutable security invoker set search_path='' as $$
 select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_array(p_lignes,p_source,p_recuperable,p_proprietaire,p_motif)::text,'UTF8')),'hex');
$$;
revoke all on function consommations_interne.empreinte_repartition(jsonb,jsonb,bigint,bigint,text) from public,anon,authenticated;
create or replace function consommations_interne.garder_empreinte_repartition()
returns trigger language plpgsql security definer set search_path='' as $$ begin
 new.empreinte:=consommations_interne.empreinte_repartition(new.lignes,new.source,new.total_recuperable_cents,new.total_proprietaire_cents,new.motif);
 return new;
end $$;
revoke all on function consommations_interne.garder_empreinte_repartition() from public,anon,authenticated;
drop trigger if exists conso_empreinte_repartition on public.repartitions_fourniture;
create trigger conso_empreinte_repartition before insert or update on public.repartitions_fourniture for each row execute function consommations_interne.garder_empreinte_repartition();
update public.repartitions_fourniture set empreinte=consommations_interne.empreinte_repartition(lignes,source,total_recuperable_cents,total_proprietaire_cents,motif) where empreinte is null;
alter table public.repartitions_fourniture alter column empreinte set not null;

drop function if exists public.preparer_repartition_fourniture(uuid,jsonb,text);
drop function if exists consommations_interne.preparer_repartition(uuid,jsonb,text);
drop function if exists public.preparer_repartition_fourniture(uuid,jsonb,text,text);
drop function if exists consommations_interne.preparer_repartition(uuid,jsonb,text,text);
create or replace function consommations_interne.preparer_repartition(p_facture uuid,p_parts jsonb,p_motif text,p_mode text default 'cle',p_reglages jsonb default '{}')
returns uuid language plpgsql security definer set search_path='' as $$
declare f public.factures_fourniture; c public.contrats_fourniture; b public.baux; p record; compteur public.compteurs_consommation; v_source jsonb; v_lignes jsonb; v_parts jsonb:='[]'::jsonb;
 v_somme numeric; v_somme_fixe numeric; v_reparti bigint; v_recuperable bigint; v_id uuid; v_variable bigint; v_fixe bigint; v_ancien numeric; v_nouveau numeric; v_poids numeric; v_debut date; v_fin date;
begin
 select * into f from public.factures_fourniture where id=p_facture for update;
 select * into c from public.contrats_fourniture where id=f.contrat_id;
 if f.id is null or not consommations_interne.gerant(c.organization_id,c.bien_id,c.lot_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if exists(select 1 from public.repartitions_fourniture r where r.facture_id=f.id and r.statut='validee') then raise exception 'Cette facture a déjà une répartition validée'; end if;
 if p_motif is null or length(trim(p_motif)) not between 8 and 2000 then raise exception 'Expliquez la clé de répartition et ses justificatifs'; end if;
 if p_mode is null or p_mode not in('cle','consommations') then raise exception 'Mode de répartition invalide'; end if;
 if p_reglages is null or jsonb_typeof(p_reglages)<>'object' or p_reglages-array['mode_interface','colocation']<>'{}'::jsonb
 or (p_reglages ? 'mode_interface' and coalesce(p_reglages->>'mode_interface','') not in('cle','egales','consommations'))
 or (p_reglages->>'colocation' is not null and p_reglages->>'colocation' not in('egales','surfaces')) then raise exception 'Réglages de répartition invalides'; end if;
 if p_parts is null or jsonb_typeof(p_parts)<>'array' or jsonb_array_length(p_parts) not between 1 and 500 then raise exception 'Répartition vide ou trop grande'; end if;
 if exists(select 1 from jsonb_to_recordset(p_parts) as x(lot_id uuid,bail_id uuid,poids numeric,recuperable boolean) where x.lot_id is null or x.poids is null or x.poids<=0 or x.poids>1000000000 or x.poids<>trunc(x.poids) or x.recuperable is null) then raise exception 'Chaque ligne doit avoir un logement, un poids entier positif et une qualification'; end if;
 if p_mode='cle' and exists(select 1 from jsonb_to_recordset(p_parts) as x(lot_id uuid,bail_id uuid) group by x.lot_id,x.bail_id having count(*)>1) then raise exception 'Une même occupation apparaît deux fois'; end if;
 if exists(select 1 from jsonb_to_recordset(p_parts) as x(poids_fixe numeric) where x.poids_fixe is not null and (x.poids_fixe<0 or x.poids_fixe>1000000000 or x.poids_fixe<>trunc(x.poids_fixe))) then raise exception 'Clé de frais fixes invalide'; end if;
 if p_mode='consommations' and (f.consommation is null or f.consommation<=0 or c.categorie not in('eau','electricite_commune','gaz','chauffage')) then raise exception 'Une consommation facturée positive et une fourniture collective sont nécessaires'; end if;
 if p_mode='consommations' then
  if exists(select 1 from jsonb_to_recordset(p_parts) as x(periode_debut date,periode_fin date)
   where extract(year from coalesce(x.periode_debut,f.periode_debut))<>extract(year from (coalesce(x.periode_fin,f.periode_fin)-1))) then
   raise exception 'La facture traverse plusieurs années : ajoutez le relevé du 1er janvier de chaque année concernée, puis recalculez la répartition.';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_parts) as x(compteur_id uuid,periode_debut date,periode_fin date,fraction_numerateur numeric,fraction_denominateur numeric)
   where x.compteur_id is null or (x.periode_debut is null)<>(x.periode_fin is null)
    or coalesce(x.periode_debut,f.periode_debut)<f.periode_debut or coalesce(x.periode_fin,f.periode_fin)>f.periode_fin
    or coalesce(x.periode_debut,f.periode_debut)>=coalesce(x.periode_fin,f.periode_fin)
    or (x.fraction_numerateur is null)<>(x.fraction_denominateur is null)
    or coalesce(x.fraction_numerateur,1)<0 or coalesce(x.fraction_numerateur,1)>coalesce(x.fraction_denominateur,1)
    or coalesce(x.fraction_numerateur,1)<>trunc(coalesce(x.fraction_numerateur,1))
    or coalesce(x.fraction_denominateur,1)<1 or coalesce(x.fraction_denominateur,1)>10000
    or coalesce(x.fraction_denominateur,1)<>trunc(coalesce(x.fraction_denominateur,1))
    or mod(10000,nullif(coalesce(x.fraction_denominateur,1),0))<>0) then raise exception 'Segments ou fractions de consommation invalides'; end if;
  if exists(select 1 from jsonb_to_recordset(p_parts) as x(compteur_id uuid,bail_id uuid,periode_debut date,periode_fin date)
   group by x.compteur_id,x.bail_id,coalesce(x.periode_debut,f.periode_debut),coalesce(x.periode_fin,f.periode_fin) having count(*)>1) then raise exception 'Une occupation est comptée deux fois dans le même segment'; end if;
  if exists(select 1 from jsonb_to_recordset(p_parts) as x(compteur_id uuid,periode_debut date,periode_fin date,fraction_numerateur numeric,fraction_denominateur numeric)
   group by x.compteur_id,coalesce(x.periode_debut,f.periode_debut),coalesce(x.periode_fin,f.periode_fin)
   having count(distinct coalesce(x.fraction_denominateur,1))<>1 or sum(coalesce(x.fraction_numerateur,1))<>max(coalesce(x.fraction_denominateur,1))
    or (count(*)>1 and p_reglages->>'colocation' is null)) then raise exception 'Les parts doivent couvrir la totalité du segment avec une clé de colocation confirmée'; end if;
  if exists(with segments as (
   select distinct x.compteur_id,coalesce(x.periode_debut,f.periode_debut) as debut,coalesce(x.periode_fin,f.periode_fin) as fin
   from jsonb_to_recordset(p_parts) as x(compteur_id uuid,periode_debut date,periode_fin date)
  ), suite as (select *,lag(fin) over(partition by compteur_id order by debut,fin) as fin_precedente from segments)
  select 1 from suite group by compteur_id having min(debut)<>f.periode_debut or max(fin)<>f.periode_fin or bool_or(fin_precedente is not null and fin_precedente<>debut)) then raise exception 'Les segments doivent couvrir exactement la facture, sans chevauchement ni période manquante'; end if;
 end if;
 v_source:=jsonb_build_object('facture',to_jsonb(f),'contrat',to_jsonb(c),'baux','[]'::jsonb,'mode',p_mode,'reglages',p_reglages,'compteurs','[]'::jsonb);
 for p in select * from jsonb_to_recordset(p_parts) as x(lot_id uuid,bail_id uuid,poids numeric,poids_fixe numeric,compteur_id uuid,recuperable boolean,periode_debut date,periode_fin date,fraction_numerateur numeric,fraction_denominateur numeric) loop
  if not exists(select 1 from public.lots l where l.id=p.lot_id and l.organization_id=f.organization_id and l.bien_id=c.bien_id and (c.lot_id is null or l.id=c.lot_id) and not public.lot_hors_portefeuille(f.organization_id,l.id)) then raise exception 'Logement hors du contrat'; end if;
  if p.recuperable and p.bail_id is null then raise exception 'La part locataire nécessite le bail concerné'; end if;
  if p.bail_id is not null then
   select * into b from public.baux where id=p.bail_id and lot_id=p.lot_id and organization_id=f.organization_id and date_debut<=f.periode_fin and (date_fin is null or date_fin>=f.periode_debut) and etat in('actif','preavis','termine') for share;
   if not found then raise exception 'Bail incompatible avec le logement ou la période facturée'; end if;
   if p.recuperable and b.charges_mode is distinct from 'provision' then raise exception 'Ce bail ne prévoit pas de provisions régularisables'; end if;
   v_source:=jsonb_set(v_source,'{baux}',(v_source->'baux')||jsonb_build_array(to_jsonb(b)));
  end if;
  if p.recuperable and c.categorie in('electricite_privative','assurance','internet','autre') then raise exception 'Cette dépense reste au propriétaire : aucune récupération automatique'; end if;
  v_poids:=p.poids;
  v_debut:=coalesce(p.periode_debut,f.periode_debut); v_fin:=coalesce(p.periode_fin,f.periode_fin);
  if p_mode='consommations' then
   if p.bail_id is not null and (b.date_debut>v_debut or (b.date_fin is not null and b.date_fin<v_fin)) then raise exception 'Le bail ne couvre pas ce segment : vérifiez le relevé d’entrée ou de sortie'; end if;
   select * into compteur from public.compteurs_consommation x where x.id=p.compteur_id and x.organization_id=f.organization_id and x.lot_id=p.lot_id and
    ((c.categorie='eau' and x.type in('eau_froide','eau_chaude')) or (c.categorie='electricite_commune' and x.type='electricite') or (c.categorie='gaz' and x.type='gaz') or (c.categorie='chauffage' and x.type='chauffage')) for share;
   if not found then raise exception 'Compteur absent ou incompatible avec cette fourniture'; end if;
   if compteur.unite is distinct from coalesce(f.unite_consommation,case when c.categorie='eau' then 'm3' when c.categorie in('electricite_commune','chauffage') then 'kwh' end) then raise exception 'Confirmez l’unité de la facture : aucune conversion m³/kWh implicite'; end if;
   select coalesce((select r.index_releve from public.releves_consommation r where r.compteur_id=compteur.id and r.date_releve=v_debut),case when compteur.date_index_initial=v_debut then compteur.index_initial end),
          (select r.index_releve from public.releves_consommation r where r.compteur_id=compteur.id and r.date_releve=v_fin)
    into v_ancien,v_nouveau;
   if v_ancien is null or v_nouveau is null then raise exception 'Relevés aux dates exactes manquants : aucune consommation estimée ne peut être facturée automatiquement'; end if;
   if v_nouveau<v_ancien then raise exception 'Index décroissant : vérifiez le compteur'; end if;
   v_poids:=(v_nouveau-v_ancien)*1000*coalesce(p.fraction_numerateur,1)/coalesce(p.fraction_denominateur,1);
   v_source:=jsonb_set(v_source,'{compteurs}',(v_source->'compteurs')||jsonb_build_array(jsonb_build_object('id',compteur.id,'debut',v_ancien,'fin',v_nouveau,'unite',compteur.unite,'periode_debut',v_debut,'periode_fin',v_fin)));
  end if;
  v_parts:=v_parts||jsonb_build_array(jsonb_build_object('lot_id',p.lot_id,'bail_id',p.bail_id,'poids',v_poids,'poids_fixe',coalesce(p.poids_fixe,p.poids),'compteur_id',p.compteur_id,'recuperable',p.recuperable,'periode_debut',v_debut,'periode_fin',v_fin,'fraction_numerateur',coalesce(p.fraction_numerateur,1),'fraction_denominateur',coalesce(p.fraction_denominateur,1)));
 end loop;
 select sum(x.poids),sum(x.poids_fixe) into v_somme,v_somme_fixe from jsonb_to_recordset(v_parts) as x(poids numeric,poids_fixe numeric);
 -- TEOM : les frais de gestion sont toujours exclus. Ailleurs aussi, une ligne identifiée comme frais de gestion reste propriétaire.
 if f.frais_fixes_cents+f.frais_gestion_cents>f.total_cents then raise exception 'Les frais dépassent le montant de la facture'; end if;
 v_fixe:=f.frais_fixes_cents;
 if v_fixe>0 and v_somme_fixe<=0 then raise exception 'La clé des frais fixes doit avoir au moins une part positive'; end if;
 v_variable:=f.total_cents-f.frais_gestion_cents-v_fixe;
 v_reparti:=v_variable;
 if p_mode='consommations' then
  if v_somme>f.consommation*1000 then raise exception 'Les relevés dépassent la consommation générale : vérifiez la facture et les compteurs'; end if;
  v_reparti:=floor(v_variable*v_somme/(f.consommation*1000));
 end if;
 v_source:=v_source||jsonb_build_object('ecart_non_reparti_cents',v_variable-v_reparti,'frais_gestion_cents',f.frais_gestion_cents);
 with brut as (
  select x.*,coalesce(floor(v_reparti*x.poids/nullif(v_somme,0)),0)::bigint as plancher,coalesce(mod(v_reparti*x.poids,nullif(v_somme,0)),0) as reste,
   coalesce(floor(v_fixe*x.poids_fixe/nullif(v_somme_fixe,0)),0)::bigint as plancher_fixe,coalesce(mod(v_fixe*x.poids_fixe,nullif(v_somme_fixe,0)),0) as reste_fixe
  from jsonb_to_recordset(v_parts) as x(lot_id uuid,bail_id uuid,poids numeric,poids_fixe numeric,compteur_id uuid,recuperable boolean,periode_debut date,periode_fin date,fraction_numerateur numeric,fraction_denominateur numeric)
 ), classes as (
  select *,row_number() over(order by reste desc,lot_id,periode_debut,periode_fin,bail_id nulls last) as rang,sum(plancher) over() as distribue,
   row_number() over(order by reste_fixe desc,lot_id,periode_debut,periode_fin,bail_id nulls last) as rang_fixe,sum(plancher_fixe) over() as distribue_fixe from brut
 ), lignes as (
  select lot_id,bail_id,poids,poids_fixe,compteur_id,recuperable,periode_debut,periode_fin,fraction_numerateur,fraction_denominateur,
    plancher+case when rang<=v_reparti-distribue then 1 else 0 end as variable_cents,
    plancher_fixe+case when rang_fixe<=v_fixe-distribue_fixe then 1 else 0 end as fixe_cents,
    plancher+case when rang<=v_reparti-distribue then 1 else 0 end+plancher_fixe+case when rang_fixe<=v_fixe-distribue_fixe then 1 else 0 end as montant_cents from classes
 )
 select jsonb_agg(to_jsonb(lignes) order by lot_id,periode_debut,bail_id),coalesce(sum(montant_cents) filter(where recuperable),0) into v_lignes,v_recuperable from lignes;
 insert into public.repartitions_fourniture(organization_id,facture_id,motif,lignes,total_recuperable_cents,total_proprietaire_cents,source,created_by)
 values(f.organization_id,f.id,trim(p_motif),v_lignes,v_recuperable,f.total_cents-v_recuperable,v_source,auth.uid())
 on conflict(facture_id) do update set motif=excluded.motif,lignes=excluded.lignes,total_recuperable_cents=excluded.total_recuperable_cents,total_proprietaire_cents=excluded.total_proprietaire_cents,source=excluded.source,created_by=excluded.created_by,created_at=now()
 returning id into v_id;
 return v_id;
end $$;
revoke all on function consommations_interne.preparer_repartition(uuid,jsonb,text,text,jsonb) from public,anon;
grant execute on function consommations_interne.preparer_repartition(uuid,jsonb,text,text,jsonb) to authenticated;
create or replace function public.preparer_repartition_fourniture(p_facture uuid,p_parts jsonb,p_motif text,p_mode text default 'cle',p_reglages jsonb default '{}')
returns uuid language sql security invoker set search_path='' as $$ select consommations_interne.preparer_repartition(p_facture,p_parts,p_motif,p_mode,p_reglages); $$;
revoke all on function public.preparer_repartition_fourniture(uuid,jsonb,text,text,jsonb) from public,anon;
grant execute on function public.preparer_repartition_fourniture(uuid,jsonb,text,text,jsonb) to authenticated;

drop function if exists public.valider_repartition_fourniture(uuid);
drop function if exists consommations_interne.valider_repartition(uuid);
create or replace function consommations_interne.valider_repartition(p_repartition uuid,p_empreinte_attendue text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.repartitions_fourniture; f public.factures_fourniture; c public.contrats_fourniture; b jsonb; compteur public.compteurs_consommation; v_ancien numeric; v_nouveau numeric;
begin
 select * into r from public.repartitions_fourniture where id=p_repartition;
 select * into f from public.factures_fourniture where id=r.facture_id for update;
 select * into c from public.contrats_fourniture where id=f.contrat_id for share;
 if r.id is null or not consommations_interne.gerant(c.organization_id,c.bien_id,c.lot_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 select * into r from public.repartitions_fourniture where id=p_repartition for update;
 if p_empreinte_attendue is distinct from r.empreinte then raise exception 'Le décompte a été recalculé depuis votre lecture. Rechargez et vérifiez la nouvelle version avant de la valider.'; end if;
 if r.statut='validee' then return r.id; end if;
 if r.source->>'mode'='consommations' and exists(select 1 from jsonb_to_recordset(r.lignes) as x(periode_debut date,periode_fin date)
  where extract(year from coalesce(x.periode_debut,f.periode_debut))<>extract(year from (coalesce(x.periode_fin,f.periode_fin)-1))) then
  raise exception 'Le décompte traverse plusieurs années sans relevé au 1er janvier : ajoutez les relevés puis préparez à nouveau la répartition avant validation.';
 end if;
 if to_jsonb(f)<>r.source->'facture' or to_jsonb(c)<>r.source->'contrat' then raise exception 'La facture ou le contrat a changé : préparez à nouveau la répartition'; end if;
 for b in select value from jsonb_array_elements(r.source->'baux') loop
  perform 1 from public.baux x where x.id=(b->>'id')::uuid for share;
  if not exists(select 1 from public.baux x where x.id=(b->>'id')::uuid and to_jsonb(x)=b) then raise exception 'Un bail a changé : préparez à nouveau la répartition'; end if;
 end loop;
 for b in select value from jsonb_array_elements(coalesce(r.source->'compteurs','[]'::jsonb)) loop
  select * into compteur from public.compteurs_consommation x where x.id=(b->>'id')::uuid for share;
  select coalesce((select x.index_releve from public.releves_consommation x where x.compteur_id=compteur.id and x.date_releve=coalesce((b->>'periode_debut')::date,f.periode_debut)),case when compteur.date_index_initial=coalesce((b->>'periode_debut')::date,f.periode_debut) then compteur.index_initial end),
   (select x.index_releve from public.releves_consommation x where x.compteur_id=compteur.id and x.date_releve=coalesce((b->>'periode_fin')::date,f.periode_fin)) into v_ancien,v_nouveau;
  if compteur.id is null or compteur.unite is distinct from b->>'unite' or v_ancien is distinct from (b->>'debut')::numeric or v_nouveau is distinct from (b->>'fin')::numeric then raise exception 'Un relevé a changé : préparez à nouveau la répartition'; end if;
 end loop;
 update public.repartitions_fourniture set statut='validee',validee_le=now(),validee_par=auth.uid() where id=r.id;
 return r.id;
end $$;
revoke all on function consommations_interne.valider_repartition(uuid,text) from public,anon;
grant execute on function consommations_interne.valider_repartition(uuid,text) to authenticated;
create or replace function public.valider_repartition_fourniture(p_repartition uuid,p_empreinte_attendue text)
returns uuid language sql security invoker set search_path='' as $$ select consommations_interne.valider_repartition(p_repartition,p_empreinte_attendue); $$;
revoke all on function public.valider_repartition_fourniture(uuid,text) from public,anon;
grant execute on function public.valider_repartition_fourniture(uuid,text) to authenticated;

create or replace function consommations_interne.garder_facture()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.documents d where d.id=new.document_id and d.organization_id=new.organization_id and d.purged_at is null and (not public.est_agent_restreint(new.organization_id) or public.document_dans_portefeuille(new.organization_id,d.id))) then raise exception 'Justificatif indisponible dans ce dossier'; end if;
 if tg_op='UPDATE' and exists(select 1 from public.repartitions_fourniture r where r.facture_id=old.id and r.statut='validee') and
 (to_jsonb(new)-'payee_le') is distinct from (to_jsonb(old)-'payee_le') then raise exception 'La répartition est validée : les données de cette facture sont figées'; end if;
 if tg_op='UPDATE' and new.organization_id<>old.organization_id then raise exception 'Changement d’organisation interdit'; end if;
 return new;
end $$;
revoke all on function consommations_interne.garder_facture() from public,anon,authenticated;
drop trigger if exists conso_facture on public.factures_fourniture;
create trigger conso_facture before insert or update on public.factures_fourniture for each row execute function consommations_interne.garder_facture();

-- La ronde quotidienne reprend les échéances sans dépendre d'une visite du propriétaire.
-- Point d'entrée accordé au seul service_role ; les appelants authentifiés gardent leur RPC limitée à leur portefeuille.
create or replace function consommations_interne.planifier()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_compteur public.compteurs_consommation; prochain date; nb integer; cree integer:=0; annulees integer:=0;
 contexte_avant text:=current_setting('gerimmo.systeme',true);
begin
 -- La clôture des anciennes demandes reste une maintenance sur un espace fermé.
 -- Seules les organisations autorisées ci-dessous reçoivent de nouvelles demandes.
 perform public.tache_systeme();
 perform pg_advisory_xact_lock(hashtextextended('consommations:ronde',28143735));
 update public.demandes_releves d set statut='annulee' from public.compteurs_consommation c,public.baux b
 where d.compteur_id=c.id and d.bail_id=b.id and d.statut='attendue'
 and (not c.actif or b.etat not in('actif','preavis') or c.bail_referent is distinct from d.bail_id or c.personne_referente is distinct from d.personne_id
 or not exists(select 1 from public.persons p join public.memberships m on m.account_id=p.account_id and m.organization_id=d.organization_id and m.role='locataire' and m.status='active' where p.id=d.personne_id));
 get diagnostics annulees=row_count;
 for v_compteur in select x.* from public.compteurs_consommation x join public.organizations o on o.id=x.organization_id
 where x.actif and o.status in('active','essai') and public.org_ecriture_ouverte(x.organization_id) and x.prochaine_demande<=public.aujourdhui_paris() and x.bail_referent is not null for update of x skip locked loop
  if not exists(select 1 from public.baux b join public.persons p on p.id=v_compteur.personne_referente
    join public.memberships m on m.account_id=p.account_id and m.organization_id=v_compteur.organization_id and m.role='locataire' and m.status='active'
    where b.id=v_compteur.bail_referent and b.etat in('actif','preavis') and (b.locataire_principal=p.id or exists(select 1 from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=p.id and bp.role='colocataire'))) then continue; end if;
  if not exists(select 1 from public.demandes_releves d where d.compteur_id=v_compteur.id and d.statut='attendue') then
   insert into public.demandes_releves(organization_id,compteur_id,bail_id,personne_id,echeance)
   values(v_compteur.organization_id,v_compteur.id,v_compteur.bail_referent,v_compteur.personne_referente,v_compteur.prochaine_demande) on conflict(compteur_id,echeance) do nothing;
   get diagnostics nb=row_count; cree:=cree+nb;
  end if;
  prochain:=v_compteur.prochaine_demande;
  while prochain<=public.aujourdhui_paris() loop prochain:=(prochain+make_interval(months=>v_compteur.periodicite_mois))::date; end loop;
  update public.compteurs_consommation set prochaine_demande=prochain where id=v_compteur.id;
 end loop;
 perform set_config('gerimmo.systeme',coalesce(contexte_avant,''),true);
 return jsonb_build_object('creees',cree,'annulees',annulees);
exception when others then
 perform set_config('gerimmo.systeme',coalesce(contexte_avant,''),true);
 raise;
end $$;
revoke all on function consommations_interne.planifier() from public,anon,authenticated;
grant usage on schema consommations_interne to service_role;
grant execute on function consommations_interne.planifier() to service_role;
create or replace function public.planifier_releves_consommation() returns jsonb language sql security invoker set search_path='' as $$ select consommations_interne.planifier(); $$;
revoke all on function public.planifier_releves_consommation() from public,anon,authenticated;
grant execute on function public.planifier_releves_consommation() to service_role;
