-- Consultation propriétaire incluse dans l'abonnement agence.
-- Aucun rôle de gestion, aucun abonnement individuel et aucun e-mail automatique.
-- Le lien doit être accepté par un compte dont l'adresse vérifiée est celle invitée.
create table public.proprietaires_invites (
 id uuid primary key default gen_random_uuid(),
 agence_id uuid not null references public.organizations(id),
 person_id uuid not null,
 email_invite text not null,
 jeton_empreinte text unique,
 expire_le timestamptz not null,
 compte_id uuid references public.accounts(id),
 accepte_le timestamptz,
 revoque_le timestamptz,
 invite_par uuid not null references public.accounts(id),
 cree_le timestamptz not null default now(),
 unique(agence_id,person_id),
 foreign key(person_id,agence_id) references public.persons(id,organization_id)
);
create index proprietaires_invites_person_agence_idx on public.proprietaires_invites(person_id,agence_id);
create index proprietaires_invites_compte_idx on public.proprietaires_invites(compte_id);
create index proprietaires_invites_invite_par_idx on public.proprietaires_invites(invite_par);
alter table public.proprietaires_invites enable row level security;
revoke all on public.proprietaires_invites from anon,authenticated;

create function public.proprietaire_invite_personnes(p_org uuid)
returns setof uuid language sql stable security definer set search_path='' as $$
 select i.person_id from public.proprietaires_invites i
 join public.persons p on p.id=i.person_id and p.organization_id=i.agence_id
 join auth.users u on u.id=i.compte_id
 where i.agence_id=p_org and i.compte_id=(select auth.uid())
   and i.accepte_le is not null and i.revoque_le is null
   and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
   and lower(btrim(u.email))=i.email_invite and lower(btrim(p.email))=i.email_invite;
$$;
revoke all on function public.proprietaire_invite_personnes(uuid) from public,anon,authenticated;

create function public.preparer_invitation_proprietaire(p_org uuid,p_person uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_email text; v_jeton text; v_id uuid;
begin
 if auth.uid() is null or not (p_org in(select public.org_ids_avec_roles(array['admin_agence']::public.membership_role[])))
    or not exists(select 1 from public.organizations where id=p_org and type='agence') then
   raise exception 'Invitation réservée au responsable de l’agence' using errcode='42501';
 end if;
 if not public.org_ecriture_ouverte(p_org) then raise exception 'L’agence doit disposer de droits de gestion pour créer une invitation';end if;
 select lower(btrim(email)) into v_email from public.persons where id=p_person and organization_id=p_org for update;
 if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Renseignez une adresse e-mail valide sur la fiche du propriétaire';end if;
 if not exists(select 1 from public.mandats m where m.organization_id=p_org and m.person_id=p_person)
    or not exists(select 1 from public.detentions d where d.organization_id=p_org and d.person_id=p_person) then
   raise exception 'Cette personne doit être propriétaire d’un lot confié à l’agence';
 end if;
 v_jeton:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into public.proprietaires_invites(agence_id,person_id,email_invite,jeton_empreinte,expire_le,invite_par)
 values(p_org,p_person,v_email,encode(sha256(convert_to(v_jeton,'UTF8')),'hex'),now()+interval '7 days',auth.uid())
 on conflict(agence_id,person_id) do update set email_invite=excluded.email_invite,jeton_empreinte=excluded.jeton_empreinte,
 expire_le=excluded.expire_le,compte_id=null,accepte_le=null,revoque_le=null,invite_par=excluded.invite_par,cree_le=now()
 returning id into v_id;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),p_org,'proprietaire_invitation_preparee',jsonb_build_object('invitation',v_id,'person_id',p_person));
 return v_jeton;
end $$;
revoke all on function public.preparer_invitation_proprietaire(uuid,uuid) from public,anon;
grant execute on function public.preparer_invitation_proprietaire(uuid,uuid) to authenticated;

create function public.accepter_invitation_proprietaire(p_jeton text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.proprietaires_invites%rowtype; v_email text;
begin
 if auth.uid() is null then raise exception 'Connectez-vous pour accepter cette invitation' using errcode='42501';end if;
 if p_jeton is null or p_jeton !~ '^[0-9a-f]{64}$' then raise exception 'Invitation invalide ou expirée';end if;
 select * into v from public.proprietaires_invites where jeton_empreinte=encode(sha256(convert_to(p_jeton,'UTF8')),'hex') for update;
 if not found or v.revoque_le is not null or v.expire_le<=now() then raise exception 'Invitation invalide ou expirée';end if;
 select lower(btrim(email)) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null and (banned_until is null or banned_until<=now());
 if v_email is null or v_email<>v.email_invite
  or not exists(select 1 from public.persons p where p.id=v.person_id and p.organization_id=v.agence_id and lower(btrim(p.email))=v.email_invite) then
   raise exception 'Connectez-vous avec l’adresse e-mail vérifiée à laquelle cette invitation est destinée' using errcode='42501';
 end if;
 if v.compte_id is not null and v.compte_id<>auth.uid() then raise exception 'Invitation déjà utilisée' using errcode='42501';end if;
 if v.accepte_le is null then
 update public.proprietaires_invites set compte_id=auth.uid(),accepte_le=now() where id=v.id;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),v.agence_id,'proprietaire_invitation_acceptee',jsonb_build_object('invitation',v.id));
 end if;
 return v.agence_id;
end $$;
revoke all on function public.accepter_invitation_proprietaire(text) from public,anon;
grant execute on function public.accepter_invitation_proprietaire(text) to authenticated;

create function public.revoquer_invitation_proprietaire(p_org uuid,p_person uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not(p_org in(select public.org_ids_avec_roles(array['admin_agence']::public.membership_role[]))) then raise exception 'Accès réservé au responsable de l’agence' using errcode='42501';end if;
 update public.proprietaires_invites set revoque_le=now(),jeton_empreinte=null where agence_id=p_org and person_id=p_person;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),p_org,'proprietaire_invitation_revoquee',jsonb_build_object('person_id',p_person));
end $$;
revoke all on function public.revoquer_invitation_proprietaire(uuid,uuid) from public,anon;
grant execute on function public.revoquer_invitation_proprietaire(uuid,uuid) to authenticated;

create function public.etat_invitation_proprietaire(p_org uuid,p_person uuid)
returns table(etat text,expire_le timestamptz,accepte_le timestamptz) language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not(p_org in(select public.org_ids_avec_roles(array['admin_agence']::public.membership_role[]))) then raise exception 'Accès réservé au responsable de l’agence' using errcode='42501';end if;
 return query select case when i.revoque_le is not null then 'revoquee' when i.accepte_le is not null then 'acceptee' when i.expire_le<=now() then 'expiree' else 'a_transmettre' end,i.expire_le,i.accepte_le from public.proprietaires_invites i where i.agence_id=p_org and i.person_id=p_person;
end $$;
revoke all on function public.etat_invitation_proprietaire(uuid,uuid) from public,anon;
grant execute on function public.etat_invitation_proprietaire(uuid,uuid) to authenticated;

create function public.mes_espaces_proprietaire_invite()
returns table(agence_id uuid,agence_nom text) language sql stable security definer set search_path='' as $$
 select distinct o.id,o.name from public.organizations o
 join public.proprietaires_invites i on i.agence_id=o.id
 where i.compte_id=(select auth.uid()) and i.person_id in(select public.proprietaire_invite_personnes(o.id));
$$;
revoke all on function public.mes_espaces_proprietaire_invite() from public,anon;
grant execute on function public.mes_espaces_proprietaire_invite() to authenticated;

-- Lecture limitée aux lots encore détenus et confiés à cette personne.
-- Les comptes rendus historiques figés de ses propres mandats restent consultables.
create function public.espace_proprietaire_invite(p_org uuid,p_lots_page integer default 0,p_rapports_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_personnes uuid[];v_lots jsonb;v_rapports jsonb;v_total_lots integer;v_total_rapports integer;v_agence jsonb;
begin
 if auth.uid() is null then raise exception 'Connexion nécessaire' using errcode='42501';end if;
 select array_agg(p) into v_personnes from public.proprietaire_invite_personnes(p_org) p;
 if coalesce(cardinality(v_personnes),0)=0 then raise exception 'Cet espace n’est pas accessible avec ce compte' using errcode='42501';end if;
 if p_lots_page<0 or p_lots_page>10000 or p_rapports_page<0 or p_rapports_page>10000 then raise exception 'Page invalide';end if;
 select jsonb_build_object('nom',o.name,'email',o.email_contact,'telephone',o.telephone) into v_agence from public.organizations o where o.id=p_org;
 with autorises as (
  select distinct l.id,l.nom,l.etat,b.nom as bien,b.address_line1,b.postal_code,b.city
  from public.lots l join public.biens b on b.id=l.bien_id and b.organization_id=p_org
  join public.detentions d on d.lot_id=l.id and d.organization_id=p_org
  where l.organization_id=p_org and d.person_id=any(v_personnes) and d.date_debut<=current_date and(d.date_fin is null or d.date_fin>=current_date)
   and exists(select 1 from public.mandat_lignes ml join public.mandats m on m.id=ml.mandat_id and m.organization_id=p_org
    where ml.lot_id=l.id and ml.organization_id=p_org and m.person_id=d.person_id and m.etat in('actif','preavis')
     and ml.date_debut<=current_date and(ml.date_fin is null or ml.date_fin>=current_date))
 ) select (select count(*)::integer from autorises),coalesce((select jsonb_agg(to_jsonb(x)) from(select * from autorises order by nom,id limit 50 offset p_lots_page*50)x),'[]'::jsonb) into v_total_lots,v_lots;
 with autorises as (
 select r.id,r.mois,r.net,r.versement_montant,r.versement_date,
  (select doc.id from public.documents doc where doc.organization_id=p_org and doc.type='rapport_gestion' and doc.purged_at is null
   and doc.titre='Compte rendu mensuel · '||r.id::text
   and exists(select 1 from public.document_liens dl where dl.document_id=doc.id and dl.organization_id=p_org and dl.entite='personne' and dl.entite_id=m.person_id)
   and exists(select 1 from public.document_liens dl where dl.document_id=doc.id and dl.organization_id=p_org and dl.entite='mandat' and dl.entite_id=m.id)
   order by doc.created_at,doc.id limit 1) document_id
 from public.rapports_gestion r join public.mandats m on m.id=r.mandat_id and m.organization_id=p_org
 where r.organization_id=p_org and r.statut='envoye' and m.person_id=any(v_personnes)
 ) select (select count(*)::integer from autorises),coalesce((select jsonb_agg(to_jsonb(x)) from(select * from autorises order by mois desc,id limit 30 offset p_rapports_page*30)x),'[]'::jsonb) into v_total_rapports,v_rapports;
 return jsonb_build_object('agence',v_agence,'lots',v_lots,'lots_total',v_total_lots,'rapports',v_rapports,'rapports_total',v_total_rapports);
end $$;
revoke all on function public.espace_proprietaire_invite(uuid,integer,integer) from public,anon;
grant execute on function public.espace_proprietaire_invite(uuid,integer,integer) to authenticated;

create function public.proprietaire_invite_document_lisible(p_document uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.documents doc
 join public.rapports_gestion r on r.organization_id=doc.organization_id and doc.titre='Compte rendu mensuel · '||r.id::text and r.statut='envoye'
 join public.mandats m on m.id=r.mandat_id and m.organization_id=doc.organization_id
 where doc.id=p_document and doc.type='rapport_gestion' and doc.mime_type='application/pdf' and doc.purged_at is null
  and doc.storage_path like doc.organization_id::text||'/%' and doc.storage_path not like '%..%'
  and m.person_id in(select public.proprietaire_invite_personnes(doc.organization_id))
  and exists(select 1 from public.document_liens dl where dl.document_id=doc.id and dl.organization_id=doc.organization_id and dl.entite='personne' and dl.entite_id=m.person_id)
  and exists(select 1 from public.document_liens dl where dl.document_id=doc.id and dl.organization_id=doc.organization_id and dl.entite='mandat' and dl.entite_id=m.id));
$$;
revoke all on function public.proprietaire_invite_document_lisible(uuid) from public,anon,authenticated;

create function public.proprietaire_invite_fichier(p_org uuid,p_document uuid,p_mode text default 'consultation')
returns table(storage_path text,titre text,mime_type text) language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_mode not in('consultation','telechargement') or not public.proprietaire_invite_document_lisible(p_document)
  or not exists(select 1 from public.documents d where d.id=p_document and d.organization_id=p_org) then raise exception 'Document inaccessible avec ce compte' using errcode='42501';end if;
 insert into public.acces_pieces_log(organization_id,account_id,document_id,action) values(p_org,auth.uid(),p_document,p_mode);
 return query select d.storage_path,d.titre,d.mime_type from public.documents d where d.id=p_document and d.organization_id=p_org;
end $$;
revoke all on function public.proprietaire_invite_fichier(uuid,uuid,text) from public,anon;
grant execute on function public.proprietaire_invite_fichier(uuid,uuid,text) to authenticated;

-- Le fichier se télécharge avec la session utilisateur, sans clé de service.
-- Cette politique ne donne accès qu'aux PDF de comptes rendus validés ci-dessus.
create function public.proprietaire_invite_stockage_lisible(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.documents d where d.storage_path=p_path and public.proprietaire_invite_document_lisible(d.id));
$$;
revoke all on function public.proprietaire_invite_stockage_lisible(text) from public,anon;
grant execute on function public.proprietaire_invite_stockage_lisible(text) to authenticated;
create policy ged_proprietaire_invite_rapport on storage.objects for select to authenticated
 using(bucket_id='documents' and public.proprietaire_invite_stockage_lisible(name));
