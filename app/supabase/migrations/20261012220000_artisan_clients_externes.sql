-- DEC-ART001, accord local du 12/10/2026. Nouveau domaine privé, sans bail ni organisation.
-- Aucune activation implicite : les deux interrupteurs sont initialement désactivés.
create table public.artisan_modules_locaux (code text primary key check(code in ('clients','reglements')), actif boolean not null default false);
insert into public.artisan_modules_locaux(code) values ('clients'),('reglements');
alter table public.artisan_modules_locaux enable row level security;
revoke all on public.artisan_modules_locaux from public,anon,authenticated;
create function public.artisan_identite_reelle() returns uuid language sql stable security definer set search_path='' as $$
 select id from public.artisans where account_id=(select auth.uid()) limit 1
$$;
revoke all on function public.artisan_identite_reelle() from public,anon;
grant execute on function public.artisan_identite_reelle() to authenticated;
create function public.artisan_module_actif(p_code text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select actif from public.artisan_modules_locaux where code=p_code),false)
$$;
revoke all on function public.artisan_module_actif(text) from public,anon;
grant execute on function public.artisan_module_actif(text) to authenticated;

create table public.artisan_pieces_privees (
 id uuid primary key default gen_random_uuid(), artisan_id uuid not null references public.artisans(id),
 storage_path text not null unique, nom text not null check(length(nom) between 1 and 240),
 mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),
 taille bigint not null check(taille between 1 and 10485760), sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), created_by uuid not null references public.accounts(id), unique(id,artisan_id)
);
create table public.artisan_clients (
 id uuid primary key default gen_random_uuid(), artisan_id uuid not null references public.artisans(id),
 nom text not null check(length(btrim(nom)) between 1 and 200), type text not null check(type in ('particulier','entreprise')),
 email text not null default '' check(length(email)<=254 and (email='' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 telephone text not null default '' check(length(telephone)<=40), adresse text not null check(length(btrim(adresse)) between 1 and 1000),
 revision integer not null default 1, archive_le timestamptz, created_at timestamptz not null default now(), unique(id,artisan_id)
);
create unique index artisan_clients_doublon on public.artisan_clients(artisan_id,lower(btrim(nom)),lower(btrim(email)),lower(btrim(adresse))) where archive_le is null;
create table public.artisan_chantiers (
 id uuid primary key default gen_random_uuid(), artisan_id uuid not null references public.artisans(id), client_id uuid not null,
 titre text not null check(length(btrim(titre)) between 1 and 200), adresse text not null check(length(btrim(adresse)) between 1 and 1000),
 description text not null check(length(btrim(description)) between 1 and 4000),
 statut text not null default 'brouillon' check(statut in ('brouillon','accepte','planifie','en_cours','termine','annule')),
 revision integer not null default 1, bilan text, photo_id uuid, created_at timestamptz not null default now(),
 unique(id,artisan_id), foreign key(client_id,artisan_id) references public.artisan_clients(id,artisan_id),
 foreign key(photo_id,artisan_id) references public.artisan_pieces_privees(id,artisan_id)
);
create table public.artisan_devis_externes (
 id uuid primary key default gen_random_uuid(), artisan_id uuid not null references public.artisans(id), chantier_id uuid not null,
 version integer not null, statut text not null default 'brouillon' check(statut in ('brouillon','valide','accepte','refuse','remplace')),
 description text not null check(length(btrim(description)) between 1 and 4000), lignes jsonb not null,
 montant_ht_cents bigint not null, montant_tva_cents bigint not null, montant_ttc_cents bigint not null check(montant_ttc_cents>0),
 entreprise jsonb not null, client jsonb not null, valide_jusqu_au date not null, pdf_id uuid, preuve_acceptation_id uuid,
 accepte_le date, motif_decision text, created_at timestamptz not null default now(), unique(id,artisan_id), unique(chantier_id,version),
 foreign key(chantier_id,artisan_id) references public.artisan_chantiers(id,artisan_id),
 foreign key(pdf_id,artisan_id) references public.artisan_pieces_privees(id,artisan_id),
 foreign key(preuve_acceptation_id,artisan_id) references public.artisan_pieces_privees(id,artisan_id)
);
create table public.artisan_rendez_vous (
 id uuid primary key default gen_random_uuid(), artisan_id uuid not null references public.artisans(id), chantier_id uuid not null,
 debut timestamptz not null, fin timestamptz not null, statut text not null default 'retenu' check(statut in ('retenu','reporte','annule')),
 motif text not null default '', conflit_motif text, created_at timestamptz not null default now(),
 check(isfinite(debut) and isfinite(fin) and fin>debut), foreign key(chantier_id,artisan_id) references public.artisan_chantiers(id,artisan_id)
);
create unique index artisan_rendez_vous_courant on public.artisan_rendez_vous(chantier_id) where statut='retenu';
create table public.artisan_factures_externes (
 id uuid primary key default gen_random_uuid(), artisan_id uuid not null references public.artisans(id), chantier_id uuid not null unique,
 devis_id uuid not null, numero text not null check(length(btrim(numero)) between 1 and 60),
 montant_ttc_cents bigint not null check(montant_ttc_cents between 1 and 100000000000), justification text,
 piece_id uuid not null, created_at timestamptz not null default now(), unique(id,artisan_id), unique(artisan_id,numero),
 foreign key(chantier_id,artisan_id) references public.artisan_chantiers(id,artisan_id),
 foreign key(devis_id,artisan_id) references public.artisan_devis_externes(id,artisan_id),
 foreign key(piece_id,artisan_id) references public.artisan_pieces_privees(id,artisan_id)
);
create table public.artisan_evenements_prives (
 id uuid primary key default gen_random_uuid(), artisan_id uuid not null references public.artisans(id),
 objet_id uuid not null, action text not null, details jsonb not null, cle uuid not null, empreinte_requete text not null,
 auteur uuid not null references public.accounts(id), created_at timestamptz not null default clock_timestamp(), unique(artisan_id,cle)
);
-- Index couvrant chaque FK et RLS strictement attachée au compte artisan réel, jamais à un emprunt.
do $$ declare t text; c record; begin
 foreach t in array array['artisan_pieces_privees','artisan_clients','artisan_chantiers','artisan_devis_externes','artisan_rendez_vous','artisan_factures_externes','artisan_evenements_prives'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy lecture_artisan_reel on public.%I for select to authenticated using (artisan_id=(select public.artisan_identite_reelle()))',t);
  for c in select conname, string_agg(quote_ident(a.attname),',' order by k.ord) as cols from pg_constraint f cross join lateral unnest(f.conkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=f.conrelid and a.attnum=k.num where f.conrelid=('public.'||t)::regclass and f.contype='f' group by conname loop
   execute format('create index %I on public.%I(%s)',left(c.conname,50)||'_idx',t,c.cols);
  end loop;
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('artisan-prive','artisan-prive',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
create policy artisan_prive_lecture on storage.objects for select to authenticated using(bucket_id='artisan-prive' and split_part(name,'/',1)=(select public.artisan_identite_reelle())::text);
create policy artisan_prive_depot on storage.objects for insert to authenticated with check(bucket_id='artisan-prive' and split_part(name,'/',1)=(select public.artisan_identite_reelle())::text and (public.artisan_module_actif('clients') or public.artisan_module_actif('reglements')));
create policy artisan_prive_orphelin on storage.objects for delete to authenticated using(bucket_id='artisan-prive' and split_part(name,'/',1)=(select public.artisan_identite_reelle())::text and not exists(select 1 from public.artisan_pieces_privees p where p.storage_path=name));
create function public.artisan_classer_piece(p_path text,p_nom text,p_mime text,p_taille bigint,p_sha text) returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid:=public.exiger_artisan_reel(); o jsonb; i uuid; begin
 if (select auth.uid()) is null or a is null or not(public.artisan_module_actif('clients') or public.artisan_module_actif('reglements')) then raise exception 'Saisie désactivée'; end if;
 if split_part(p_path,'/',1)<>a::text then raise exception 'Accès refusé'; end if;
 select to_jsonb(s) into o from storage.objects s where bucket_id='artisan-prive' and name=p_path;
 if o is null or coalesce(nullif(o->>'owner_id',''),o->>'owner') is distinct from (select auth.uid())::text then raise exception 'Déposez votre propre justificatif avant de continuer'; end if;
 if coalesce(o->'metadata'->>'mimetype',p_mime)<>p_mime or coalesce((o->'metadata'->>'size')::bigint,p_taille)<>p_taille then raise exception 'Le justificatif a changé'; end if;
 select id into i from public.artisan_pieces_privees where artisan_id=a and storage_path=p_path and sha256=p_sha and mime=p_mime and taille=p_taille;
 if found then return i; end if;
 insert into public.artisan_pieces_privees(artisan_id,storage_path,nom,mime,taille,sha256,created_by) values(a,p_path,p_nom,p_mime,p_taille,p_sha,(select auth.uid())) returning id into i; return i;
end $$;
revoke all on function public.artisan_classer_piece(text,text,text,bigint,text) from public,anon;
grant execute on function public.artisan_classer_piece(text,text,text,bigint,text) to authenticated;

create function public.artisan_externe_ecrire(p_action text,p_id uuid,p_revision integer,p_donnees jsonb,p_cle uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid:=public.exiger_artisan_reel(); c public.artisan_clients; h public.artisan_chantiers; d public.artisan_devis_externes; old public.artisan_evenements_prives; r uuid; calcul record; debut timestamptz; fin timestamptz; conflit boolean; empreinte text; piece uuid;
begin
 if (select auth.uid()) is null or a is null or not public.artisan_module_actif('clients') then raise exception 'Clients externes : saisie désactivée'; end if;
 if p_cle is null or p_donnees is null or jsonb_typeof(p_donnees)<>'object' or octet_length(p_donnees::text)>100000 then raise exception 'Demande invalide'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text,0));
 empreinte:=md5(jsonb_build_array(p_action,p_id,p_revision,p_donnees)::text);
 select * into old from public.artisan_evenements_prives where artisan_id=a and cle=p_cle;
 if found then if old.empreinte_requete<>empreinte then raise exception 'Cette clé a déjà servi pour une autre demande'; end if; return old.objet_id; end if;
 if p_action in ('client','modifier_client','archiver_client') then
  if p_action<>'client' then
   select * into c from public.artisan_clients where id=p_id and artisan_id=a for update;
   if not found then raise exception 'Accès refusé'; end if;
   if c.revision is distinct from p_revision then raise exception 'La fiche a changé : rechargez avant de continuer'; end if;
  end if;
  if p_action='client' then
   insert into public.artisan_clients(artisan_id,nom,type,email,telephone,adresse) values(a,btrim(p_donnees->>'nom'),p_donnees->>'type',lower(btrim(coalesce(p_donnees->>'email',''))),btrim(coalesce(p_donnees->>'telephone','')),btrim(p_donnees->>'adresse')) returning id into r;
  elsif p_action='modifier_client' then
   if c.archive_le is not null then raise exception 'Réactivez ce client avant modification'; end if;
   update public.artisan_clients set nom=btrim(p_donnees->>'nom'),type=p_donnees->>'type',email=lower(btrim(coalesce(p_donnees->>'email',''))),telephone=btrim(coalesce(p_donnees->>'telephone','')),adresse=btrim(p_donnees->>'adresse'),revision=revision+1 where id=c.id; r:=c.id;
  else update public.artisan_clients set archive_le=case when coalesce((p_donnees->>'archive')::boolean,true) then now() else null end,revision=revision+1 where id=c.id; r:=c.id;
  end if;
 elsif p_action='chantier' then
  select * into c from public.artisan_clients where id=p_id and artisan_id=a;
  if not found then raise exception 'Accès refusé'; end if;
  if c.archive_le is not null then raise exception 'Ce client est archivé'; end if;
  insert into public.artisan_chantiers(artisan_id,client_id,titre,adresse,description) values(a,c.id,btrim(p_donnees->>'titre'),btrim(p_donnees->>'adresse'),btrim(p_donnees->>'description')) returning id into r;
 else
  select * into h from public.artisan_chantiers where id=p_id and artisan_id=a for update;
  if not found then raise exception 'Accès refusé'; end if;
  if h.revision is distinct from p_revision then raise exception 'Le chantier a changé : rechargez avant de continuer'; end if;
  if h.statut in ('annule','termine') and not(p_action='facture' and h.statut='termine') then raise exception 'Ce chantier est terminé ou annulé'; end if;
  r:=h.id;
  select * into c from public.artisan_clients where id=h.client_id and artisan_id=a;
  if p_action='devis' then
   if h.statut not in ('brouillon','accepte','planifie') then raise exception 'Le devis ne peut plus être révisé après le début des travaux'; end if;
   if c.archive_le is not null then raise exception 'Ce client est archivé'; end if;
   if (p_donnees->>'valide_jusqu_au')::date<current_date or (p_donnees->>'valide_jusqu_au')::date>current_date+365 then raise exception 'Vérifiez la date de validité'; end if;
   select * into calcul from public.calculer_devis_lignes(p_donnees->'lignes');
   update public.artisan_devis_externes set statut='remplace' where chantier_id=h.id and statut in ('brouillon','valide','accepte');
   update public.artisan_rendez_vous set statut='annule',motif='Révision du devis : nouvelle acceptation requise' where chantier_id=h.id and statut='retenu';
   insert into public.artisan_devis_externes(artisan_id,chantier_id,version,description,lignes,montant_ht_cents,montant_tva_cents,montant_ttc_cents,entreprise,client,valide_jusqu_au)
    select a,h.id,coalesce((select max(version) from public.artisan_devis_externes where chantier_id=h.id),0)+1,p_donnees->>'description',calcul.lignes_normalisees,calcul.montant_ht_cents,calcul.montant_tva_cents,calcul.montant_ttc_cents,
      jsonb_build_object('nom',ar.raison_sociale,'siret',ar.siret,'telephone',ar.telephone,'email',ar.email,'adresse',pr.adresse,'mentions',pr.mentions),to_jsonb(c),(p_donnees->>'valide_jusqu_au')::date
    from public.artisans ar left join public.artisan_profils_documents pr on pr.artisan_id=ar.id where ar.id=a;
   update public.artisan_chantiers set statut='brouillon' where id=h.id;
  elsif p_action in ('valider_devis','decision') then
   select * into d from public.artisan_devis_externes where chantier_id=h.id and artisan_id=a order by version desc limit 1 for update;
   if not found or d.id is distinct from (p_donnees->>'devis_id')::uuid then raise exception 'Relisez la dernière version du devis'; end if;
   if p_action='valider_devis' then
    piece:=(p_donnees->>'piece_id')::uuid;
    if d.statut<>'brouillon' or d.valide_jusqu_au<current_date or coalesce(d.entreprise->>'adresse','')='' then raise exception 'Complétez la fiche entreprise et relisez un devis valable'; end if;
    if not exists(select 1 from public.artisan_pieces_privees where id=piece and artisan_id=a and mime='application/pdf') then raise exception 'PDF du devis absent'; end if;
    update public.artisan_devis_externes set statut='valide',pdf_id=piece where id=d.id;
   else
    if d.statut<>'valide' or d.valide_jusqu_au<current_date then raise exception 'Validez un devis encore valable avant la décision'; end if;
    if length(btrim(coalesce(p_donnees->>'motif',''))) not between 3 and 4000 then raise exception 'Précisez la décision du client'; end if;
    if p_donnees->>'decision'='accepte' then
     piece:=(p_donnees->>'piece_id')::uuid;
     if not exists(select 1 from public.artisan_pieces_privees where id=piece and artisan_id=a) then raise exception 'Joignez la preuve de l’accord'; end if;
     if (p_donnees->>'date')::date is null or (p_donnees->>'date')::date>current_date or (p_donnees->>'date')::date<d.created_at::date then raise exception 'Date de décision invalide'; end if;
     update public.artisan_devis_externes set statut='accepte',preuve_acceptation_id=piece,accepte_le=(p_donnees->>'date')::date,motif_decision=p_donnees->>'motif' where id=d.id;
     update public.artisan_chantiers set statut='accepte' where id=h.id;
    elsif p_donnees->>'decision'='refuse' then update public.artisan_devis_externes set statut='refuse',motif_decision=p_donnees->>'motif' where id=d.id;
    else raise exception 'Décision invalide'; end if;
   end if;
  elsif p_action='planning' then
   if h.statut not in ('accepte','planifie') then raise exception 'L’accord du client est requis avant le rendez-vous'; end if;
   debut:=(p_donnees->>'debut')::timestamptz; fin:=(p_donnees->>'fin')::timestamptz;
   if debut is null or fin is null or not isfinite(debut) or not isfinite(fin) or debut<=now() or fin<=debut then raise exception 'Choisissez des dates futures et une fin après le début'; end if;
   if h.statut='planifie' and length(btrim(coalesce(p_donnees->>'motif','')))<3 then raise exception 'Expliquez le report'; end if;
   -- Variables qualifiées plus bas évitent toute ambiguïté avec les colonnes du rendez-vous.
   select exists(select 1 from public.artisan_rendez_vous rv where rv.artisan_id=a and rv.chantier_id<>h.id and rv.statut='retenu' and rv.debut<(p_donnees->>'fin')::timestamptz and rv.fin>(p_donnees->>'debut')::timestamptz)
    or exists(select 1 from public.incident_interventions i where i.artisan_id=a and i.statut in ('planifiee','en_cours') and i.debut_prevu<(p_donnees->>'fin')::timestamptz and i.fin_prevue>(p_donnees->>'debut')::timestamptz) into conflit;
   if conflit and length(btrim(coalesce(p_donnees->>'conflit_motif','')))<10 then raise exception 'Un autre chantier occupe ce créneau. Expliquez explicitement le maintien (équipe distincte, par exemple)'; end if;
   update public.artisan_rendez_vous set statut='reporte' where chantier_id=h.id and statut='retenu';
   insert into public.artisan_rendez_vous(artisan_id,chantier_id,debut,fin,motif,conflit_motif) values(a,h.id,debut,fin,coalesce(p_donnees->>'motif',''),case when conflit then p_donnees->>'conflit_motif' else null end);
   update public.artisan_chantiers set statut='planifie' where id=h.id;
  elsif p_action='demarrer' then
   if h.statut<>'planifie' then raise exception 'Planifiez d’abord le chantier'; end if;
   update public.artisan_chantiers set statut='en_cours' where id=h.id;
  elsif p_action='bilan' then
   piece:=(p_donnees->>'piece_id')::uuid;
   if h.statut<>'en_cours' then raise exception 'Démarrez d’abord le chantier'; end if;
   if length(btrim(coalesce(p_donnees->>'bilan',''))) not between 10 and 8000 then raise exception 'Décrivez les travaux réalisés'; end if;
   if not exists(select 1 from public.artisan_pieces_privees where id=piece and artisan_id=a and mime in ('image/jpeg','image/png')) then raise exception 'Joignez une photo du travail'; end if;
   update public.artisan_chantiers set statut='termine',bilan=p_donnees->>'bilan',photo_id=piece where id=h.id;
  elsif p_action='annuler' then
   if length(btrim(coalesce(p_donnees->>'motif',''))) not between 3 and 4000 then raise exception 'Expliquez l’annulation'; end if;
   update public.artisan_chantiers set statut='annule' where id=h.id;
   update public.artisan_rendez_vous set statut='annule',motif=p_donnees->>'motif' where chantier_id=h.id and statut='retenu';
  elsif p_action='facture' then
   if h.statut<>'termine' or h.photo_id is null or h.bilan is null then raise exception 'Terminez le bilan et la photo avant la facture'; end if;
   select * into d from public.artisan_devis_externes where chantier_id=h.id and statut='accepte';
   if not found then raise exception 'Devis accepté absent'; end if;
   if (p_donnees->>'montant_ttc_cents')::bigint<>d.montant_ttc_cents and length(btrim(coalesce(p_donnees->>'justification','')))<10 then raise exception 'Expliquez l’écart avec le devis accepté'; end if;
   insert into public.artisan_factures_externes(artisan_id,chantier_id,devis_id,numero,montant_ttc_cents,justification,piece_id) values(a,h.id,d.id,btrim(p_donnees->>'numero'),(p_donnees->>'montant_ttc_cents')::bigint,p_donnees->>'justification',(p_donnees->>'piece_id')::uuid);
  else raise exception 'Action inconnue'; end if;
  update public.artisan_chantiers set revision=revision+1 where id=h.id;
 end if;
 insert into public.artisan_evenements_prives(artisan_id,objet_id,action,details,cle,empreinte_requete,auteur) values(a,r,p_action,p_donnees,p_cle,empreinte,(select auth.uid()));
 return r;
exception when unique_violation then raise exception 'Ce dossier ou cette facture existe déjà. Rechargez avant de recommencer';
end $$;
revoke all on function public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid) from public,anon;
grant execute on function public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid) to authenticated;
