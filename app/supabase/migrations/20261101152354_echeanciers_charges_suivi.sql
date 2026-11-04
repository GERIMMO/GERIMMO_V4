-- Échéanciers liés à un décompte déjà validé : aucune dépense brute ne crée de dette.
create table public.echeanciers_charges (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 regularisation_id uuid not null unique references public.regularisations_charges(id),
 bail_id uuid not null references public.baux(id),
 total_cents bigint not null check(total_cents>0 and total_cents<=9007199254740991),
 echeances jsonb not null check(jsonb_typeof(echeances)='array'),
 document_id uuid references public.documents(id),
 publie_le timestamptz,
 accepte_le timestamptz,
 accepte_par uuid references public.accounts(id),
 created_at timestamptz not null default now()
);
create table public.rappels_echeanciers_charges (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 echeancier_id uuid not null references public.echeanciers_charges(id),
 destinataire text not null check(destinataire in ('proprietaire','locataire')),
 mois date not null,
 created_at timestamptz not null default now(),
 unique(echeancier_id,destinataire,mois)
);
create index echeanciers_charges_org on public.echeanciers_charges(organization_id,bail_id);
create index rappels_echeanciers_org on public.rappels_echeanciers_charges(organization_id,mois);

create function public.acces_echeancier_charges(p_bail uuid,p_gerant boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.baux b where b.id=p_bail and (
  (b.organization_id in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[])) and not public.lot_hors_portefeuille(b.organization_id,b.lot_id))
  or (not p_gerant and exists(select 1 from public.memberships m where m.account_id=auth.uid() and m.organization_id=b.organization_id and m.role='locataire' and m.status in('active','inactive'))
   and exists(select 1 from public.persons p where p.organization_id=b.organization_id and p.account_id=auth.uid() and (p.id=b.locataire_principal or exists(select 1 from public.bail_personnes bp where bp.bail_id=b.id and bp.person_id=p.id and bp.role='colocataire'))))
 ));
$$;
revoke all on function public.acces_echeancier_charges(uuid,boolean) from public,anon;
grant execute on function public.acces_echeancier_charges(uuid,boolean) to authenticated,service_role;
alter table public.echeanciers_charges enable row level security;
alter table public.rappels_echeanciers_charges enable row level security;
create policy echeanciers_charges_lecture on public.echeanciers_charges for select to authenticated using(
 public.acces_echeancier_charges(bail_id,true) or (publie_le is not null and public.acces_echeancier_charges(bail_id,false))
);
create policy rappels_charges_lecture on public.rappels_echeanciers_charges for select to authenticated using(exists(
 select 1 from public.echeanciers_charges e where e.id=echeancier_id and ((destinataire='proprietaire' and public.acces_echeancier_charges(e.bail_id,true))
 or(destinataire='locataire' and not public.acces_echeancier_charges(e.bail_id,true) and public.acces_echeancier_charges(e.bail_id,false)))
));
revoke all on public.echeanciers_charges,public.rappels_echeanciers_charges from anon,authenticated;
grant select on public.echeanciers_charges,public.rappels_echeanciers_charges to authenticated;
grant all on public.echeanciers_charges,public.rappels_echeanciers_charges to service_role;

create function public.preparer_echeancier_charges(p_regularisation uuid,p_nombre integer,p_premiere date)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.regularisations_charges%rowtype;v_id uuid;v_total bigint;v_base bigint;v_lignes jsonb:='[]';i integer;v_nombre integer;
begin
 select * into r from public.regularisations_charges where id=p_regularisation for update;
 if not found or not public.acces_echeancier_charges(r.bail_id,true) then raise exception 'Décompte inaccessible';end if;
 if r.ecart>=0 then raise exception 'Aucun complément à réclamer : le solde est nul ou en faveur du locataire';end if;
 if exists(select 1 from public.baux where id=r.bail_id and charges_mode='forfait') then raise exception 'Charges au forfait : aucun complément ne peut être demandé';end if;
 select id into v_id from public.echeanciers_charges where regularisation_id=r.id and document_id is not null;
 if found then return v_id;end if;
 if p_nombre is null or p_nombre not between 1 and 24 or p_premiere is null or p_premiere<(public.aujourdhui_paris()+interval '1 month')::date then raise exception 'Prévoyez 1 à 24 mensualités et au moins un mois avant la première échéance';end if;
 -- Offre protectrice de douze mensualités pour tout complément tardif.
 v_nombre:=case when r.tardive then 12 else p_nombre end;
 v_total:=round(-r.ecart*100)::bigint;v_base:=v_total/v_nombre;
 for i in 1..v_nombre loop
  v_lignes:=v_lignes||jsonb_build_array(jsonb_build_object('rang',i,'date',(p_premiere+make_interval(months=>i-1))::date,
   'du_cents',case when i<v_nombre then v_base else v_total-v_base*(v_nombre-1) end,'recu_cents',0,'declare_le',null,'recu_le',null));
 end loop;
 insert into public.echeanciers_charges(organization_id,regularisation_id,bail_id,total_cents,echeances)
 values(r.organization_id,r.id,r.bail_id,v_total,v_lignes)
 on conflict(regularisation_id) do update set echeances=excluded.echeances where echeanciers_charges.document_id is null returning id into v_id;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),r.organization_id,'echeancier_charges_prepare',jsonb_build_object('echeancier_id',v_id));
 return v_id;
end;$$;

create function public.publier_echeancier_charges(p_plan uuid,p_storage_path text,p_mime text,p_taille bigint,p_empreinte text)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.echeanciers_charges%rowtype;v_doc uuid;
begin
 select * into e from public.echeanciers_charges where id=p_plan for update;
 if not found or not public.acces_echeancier_charges(e.bail_id,true) then raise exception 'Échéancier inaccessible';end if;
 if e.document_id is not null then return e.document_id;end if;
 if (e.echeances->0->>'date')::date<(public.aujourdhui_paris()+interval '1 month')::date then raise exception 'La première échéance doit laisser au moins un mois après la transmission du décompte';end if;
 if p_mime<>'application/pdf' then raise exception 'Un PDF est obligatoire';end if;
 v_doc:=public.creer_fiche_justificatif(e.organization_id,'Décompte et proposition d’échéancier de charges',p_storage_path,p_mime,p_taille,p_empreinte);
 insert into public.document_liens(organization_id,document_id,entite,entite_id) values(e.organization_id,v_doc,'bail',e.bail_id) on conflict do nothing;
 insert into public.document_liens(organization_id,document_id,entite,entite_id)
 select e.organization_id,v_doc,'personne',p.id from public.persons p where p.organization_id=e.organization_id and (
 p.id=(select b.locataire_principal from public.baux b where b.id=e.bail_id) or exists(select 1 from public.bail_personnes bp where bp.bail_id=e.bail_id and bp.person_id=p.id and bp.role='colocataire')) on conflict do nothing;
 update public.echeanciers_charges set document_id=v_doc,publie_le=now() where id=e.id;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),e.organization_id,'echeancier_charges_propose',jsonb_build_object('echeancier_id',e.id,'document_id',v_doc));
 return v_doc;
end;$$;

create function public.agir_echeancier_charges(p_plan uuid,p_action text,p_rang integer default null,p_recu_cents bigint default null,p_date date default null)
returns void language plpgsql security definer set search_path='' as $$
declare e public.echeanciers_charges%rowtype;l jsonb;v_index integer;v_gerant boolean;
begin
 select * into e from public.echeanciers_charges where id=p_plan for update;
 if not found or e.publie_le is null or not public.acces_echeancier_charges(e.bail_id,false) then raise exception 'Échéancier inaccessible';end if;
 v_gerant:=public.acces_echeancier_charges(e.bail_id,true);
 if p_action='accepter' then
  if v_gerant then raise exception 'L’accord doit être donné depuis l’espace du locataire';end if;
  if e.accepte_le is null then update public.echeanciers_charges set accepte_le=now(),accepte_par=auth.uid() where id=e.id;end if;
 elsif p_action in ('declarer','confirmer') then
  if e.accepte_le is null then raise exception 'L’échéancier attend l’accord du locataire';end if;
  if p_rang is null or p_rang<1 or p_rang>jsonb_array_length(e.echeances) then raise exception 'Échéance inconnue';end if;
  v_index:=p_rang-1;l:=e.echeances->v_index;
  if p_action='declarer' then
   if v_gerant then raise exception 'Le paiement est signalé depuis l’espace locataire';end if;
   l:=l||jsonb_build_object('declare_le',now());
  else
   if not v_gerant then raise exception 'Seul le propriétaire peut confirmer la réception';end if;
   if p_recu_cents is null or p_recu_cents<(l->>'recu_cents')::bigint or p_recu_cents>(l->>'du_cents')::bigint or p_date is null or p_date>public.aujourdhui_paris() then raise exception 'Vérifiez le montant total reçu et sa date';end if;
   if p_recu_cents>(l->>'recu_cents')::bigint then
    if not public.org_ecriture_ouverte(e.organization_id) then raise exception 'Les écritures de ce dossier sont fermées';end if;
    insert into public.ecritures(organization_id,bail_id,lot_id,categorie,sens,montant,date_piece,date_imputation,libelle,systeme)
    select e.organization_id,e.bail_id,b.lot_id,'regularisation_charges','recette',(p_recu_cents-(l->>'recu_cents')::bigint)::numeric/100,p_date,p_date,
      'Régularisation de charges · échéance '||p_rang||' · '||e.id::text,true from public.baux b where b.id=e.bail_id;
   end if;
   l:=l||jsonb_build_object('recu_cents',p_recu_cents,'recu_le',p_date,'declare_le',case when p_recu_cents<(l->>'du_cents')::bigint then null else l->>'declare_le' end);
  end if;
  update public.echeanciers_charges set echeances=jsonb_set(echeances,array[v_index::text],l) where id=e.id;
 else raise exception 'Action inconnue';end if;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),e.organization_id,'echeancier_charges_'||p_action,jsonb_build_object('echeancier_id',e.id,'rang',p_rang,'recu_cents',p_recu_cents));
end;$$;

create function public.synchroniser_rappels_echeanciers_charges(p_org uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare v_n integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' and (p_org is null or not exists(select 1 from public.memberships m where m.organization_id=p_org and m.account_id=auth.uid() and m.role in('proprietaire_direct','admin_agence','agent') and m.status='active')) then raise exception 'Accès refusé';end if;
 insert into public.rappels_echeanciers_charges(organization_id,echeancier_id,destinataire,mois)
 select e.organization_id,e.id,d.destinataire,date_trunc('month',public.aujourdhui_paris())::date
 from public.echeanciers_charges e cross join(values('proprietaire'),('locataire'))d(destinataire)
 where (p_org is null or e.organization_id=p_org) and e.accepte_le is not null
 and (coalesce(auth.jwt()->>'role','')='service_role' or public.acces_echeancier_charges(e.bail_id,true))
 and exists(select 1 from jsonb_array_elements(e.echeances)l where (l->>'date')::date<=public.aujourdhui_paris() and (l->>'recu_cents')::bigint<(l->>'du_cents')::bigint)
 on conflict do nothing;
 get diagnostics v_n=row_count;return v_n;
end;$$;
revoke all on function public.preparer_echeancier_charges(uuid,integer,date),public.publier_echeancier_charges(uuid,text,text,bigint,text),public.agir_echeancier_charges(uuid,text,integer,bigint,date),public.synchroniser_rappels_echeanciers_charges(uuid) from public,anon;
grant execute on function public.preparer_echeancier_charges(uuid,integer,date),public.publier_echeancier_charges(uuid,text,text,bigint,text),public.agir_echeancier_charges(uuid,text,integer,bigint,date),public.synchroniser_rappels_echeanciers_charges(uuid) to authenticated,service_role;

create index echeanciers_charges_bail_fk on public.echeanciers_charges(bail_id);
create index echeanciers_charges_document_fk on public.echeanciers_charges(document_id);
create index echeanciers_charges_acceptant_fk on public.echeanciers_charges(accepte_par);
