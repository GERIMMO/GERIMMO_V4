-- LOC008 : consentement avant accès, expiration et historique. Aucun accès existant retiré.
create table public.invitations_locataires (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 person_id uuid not null references public.persons(id),
 account_id uuid not null references public.accounts(id),
 email text not null,
 etat text not null default 'en_attente' check(etat in ('en_attente','acceptee','refusee','annulee','expiree')),
 cree_par uuid not null references public.accounts(id),
 cree_le timestamptz not null default now(),
 expire_le timestamptz not null default (now()+interval '30 days'),
 repondu_le timestamptz,
 envoye_le timestamptz,
 erreur_envoi boolean not null default false
);
create unique index invitation_locataire_en_attente on public.invitations_locataires(person_id) where etat='en_attente';
create index invitations_locataires_compte on public.invitations_locataires(account_id,cree_le desc);
create index invitations_locataires_organisation on public.invitations_locataires(organization_id,person_id,cree_le desc);
alter table public.invitations_locataires enable row level security;
revoke all on public.invitations_locataires from public,anon,authenticated;
grant select on public.invitations_locataires to authenticated;
create policy invitations_locataires_lecture on public.invitations_locataires for select to authenticated using (
 account_id=(select auth.uid()) or organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
);

create function public.preparer_invitation_locataire(p_org uuid,p_person_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 p public.persons%rowtype; v_uid uuid; v_existait boolean; i public.invitations_locataires%rowtype; v_email text; m public.memberships%rowtype;
begin
 if auth.uid() is null or not (p_org in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 if not exists(select 1 from public.organizations where id=p_org and status='active') then raise exception 'Cette organisation ne peut pas envoyer de nouvelles invitations'; end if;
 select * into p from public.persons where id=p_person_id and organization_id=p_org for update;
 if not found or p.archived_at is not null then raise exception 'Fiche introuvable ou archivée'; end if;
 v_email:=lower(btrim(p.email));
 if v_email is null or v_email='' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'La personne doit avoir un email valide pour être invitée'; end if;
 -- Deux fiches visant le même compte ne créent pas deux comptes Auth.
 perform pg_advisory_xact_lock(hashtextextended('invitation-compte:'||v_email,0));
 select id into v_uid from auth.users where lower(email)=v_email;
 v_existait:=v_uid is not null;
 if v_uid is null then
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
  values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',v_email,extensions.crypt(gen_random_uuid()::text,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','') returning id into v_uid;
 end if;
 if p.account_id is not null and p.account_id<>v_uid then raise exception 'Cette fiche est déjà liée à un autre compte'; end if;
 select * into m from public.memberships where account_id=v_uid and organization_id=p_org;
 if found then
  if m.role<>'locataire' then raise exception 'Ce compte dispose déjà d’un autre rôle dans cet espace'; end if;
  if m.status<>'active' then raise exception 'Cet accès est désactivé. Vérifiez sa situation avant de le réactiver'; end if;
  if p.account_id=v_uid then return jsonb_build_object('etat','deja_actif','email',v_email); end if;
 end if;
 select * into i from public.invitations_locataires where person_id=p_person_id and etat='en_attente' for update;
 if found and (i.expire_le<=now() or i.email<>v_email or i.account_id<>v_uid) then
  update public.invitations_locataires set etat=case when expire_le<=now() then 'expiree' else 'annulee' end,repondu_le=now() where id=i.id;
  insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),p_org,'invitation_locataire_remplacee',jsonb_build_object('invitation',i.id));
  i.id:=null;
 end if;
 if i.id is null then
  insert into public.invitations_locataires(organization_id,person_id,account_id,email,cree_par) values(p_org,p_person_id,v_uid,v_email,auth.uid()) returning * into i;
  insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),p_org,'invitation_locataire',jsonb_build_object('person_id',p_person_id,'compte',v_uid,'compte_existant',v_existait,'invitation',i.id,'acces_accorde',false,'expire_le',i.expire_le));
 end if;
 return jsonb_build_object('id',i.id,'email',v_email,'etat','en_attente','expire_le',i.expire_le);
end $$;
-- Ancienne signature conservée ; elle ne doit plus accorder d’accès implicitement.
create or replace function public.inviter_locataire(p_org uuid,p_person_id uuid) returns text
language plpgsql security definer set search_path='' as $$
begin return public.preparer_invitation_locataire(p_org,p_person_id)->>'email'; end $$;

create function public.mes_invitations_locataire(p_id uuid default null)
returns table(id uuid,organization_id uuid,organisation text,etat text,expire_le timestamptz,cree_le timestamptz)
language sql stable security definer set search_path='' as $$
 select i.id,i.organization_id,o.name,
 case when i.etat='en_attente' and i.expire_le<=now() then 'expiree' else i.etat end,i.expire_le,i.cree_le
 from public.invitations_locataires i join public.organizations o on o.id=i.organization_id
 join auth.users u on u.id=i.account_id
 where i.account_id=auth.uid() and lower(btrim(u.email))=i.email and u.email_confirmed_at is not null and (p_id is null or p_id=i.id)
 order by i.cree_le desc
$$;

create function public.repondre_invitation_locataire(p_id uuid,p_accepter boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.invitations_locataires%rowtype; p public.persons%rowtype; m public.memberships%rowtype; v_person uuid;
begin
 if auth.uid() is null or p_accepter is null then raise exception 'Accès refusé'; end if;
 -- Même ordre de verrous que la préparation : fiche puis invitation.
 select person_id into v_person from public.invitations_locataires where id=p_id and account_id=auth.uid();
 if v_person is null then raise exception 'Invitation introuvable pour ce compte'; end if;
 select * into p from public.persons where id=v_person for update;
 select * into i from public.invitations_locataires where id=p_id for update;
 if not exists(select 1 from auth.users where id=auth.uid() and lower(btrim(email))=i.email and email_confirmed_at is not null) then raise exception 'Connectez-vous avec l’adresse qui a reçu cette invitation'; end if;
 if i.etat='acceptee' then return jsonb_build_object('etat','acceptee','organization_id',i.organization_id); end if;
 if i.etat<>'en_attente' then return jsonb_build_object('etat',i.etat,'erreur','Cette invitation n’est plus disponible. Demandez une nouvelle invitation.'); end if;
 if i.expire_le<=now() then
  update public.invitations_locataires set etat='expiree',repondu_le=now() where id=p_id;
  insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),i.organization_id,'invitation_locataire_expiree',jsonb_build_object('invitation',p_id));
  return jsonb_build_object('etat','expiree','erreur','Cette invitation a expiré. Demandez une nouvelle invitation.');
 end if;
 if not p_accepter then
  update public.invitations_locataires set etat='refusee',repondu_le=now() where id=p_id;
  insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),i.organization_id,'invitation_locataire_refusee',jsonb_build_object('invitation',p_id));
  return jsonb_build_object('etat','refusee');
 end if;
 if p.organization_id<>i.organization_id or p.archived_at is not null or lower(btrim(p.email)) is distinct from i.email or (p.account_id is not null and p.account_id<>auth.uid()) then raise exception 'La fiche a changé. Demandez une nouvelle invitation'; end if;
 if not exists(select 1 from public.organizations where id=i.organization_id and status='active') then raise exception 'Cet espace est indisponible. Contactez votre gestionnaire'; end if;
 perform pg_advisory_xact_lock(hashtextextended('adhesion-locataire:'||auth.uid()::text||':'||i.organization_id::text,0));
 select * into m from public.memberships where account_id=auth.uid() and organization_id=i.organization_id for update;
 if found and (m.role<>'locataire' or m.status<>'active') then raise exception 'Un autre accès existe déjà pour ce compte. Contactez votre gestionnaire'; end if;
 if m.id is null then insert into public.memberships(account_id,organization_id,role) values(auth.uid(),i.organization_id,'locataire'); end if;
 update public.persons set account_id=auth.uid() where id=i.person_id;
 update public.invitations_locataires set etat='acceptee',repondu_le=now() where id=p_id;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),i.organization_id,'invitation_locataire_acceptee',jsonb_build_object('invitation',p_id,'person_id',i.person_id));
 return jsonb_build_object('etat','acceptee','organization_id',i.organization_id);
end $$;

create function public.annuler_invitation_locataire(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare i public.invitations_locataires%rowtype;
begin
 select * into i from public.invitations_locataires where id=p_id for update;
 if not found or auth.uid() is null or not(i.organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 if i.etat<>'en_attente' then return; end if;
 update public.invitations_locataires set etat='annulee',repondu_le=now() where id=p_id;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),i.organization_id,'invitation_locataire_annulee',jsonb_build_object('invitation',p_id));
end $$;

create function public.noter_envoi_invitation_locataire(p_id uuid,p_envoye boolean) returns void
language plpgsql security definer set search_path='' as $$
declare i public.invitations_locataires%rowtype;
begin
 select * into i from public.invitations_locataires where id=p_id for update;
 if not found or auth.uid() is null or not(i.organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 if i.etat<>'en_attente' then return; end if;
 update public.invitations_locataires set envoye_le=case when p_envoye then now() else envoye_le end,erreur_envoi=not coalesce(p_envoye,false) where id=p_id;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),i.organization_id,case when p_envoye then 'invitation_locataire_envoyee' else 'invitation_locataire_envoi_echec' end,jsonb_build_object('invitation',p_id));
end $$;

revoke all on function public.preparer_invitation_locataire(uuid,uuid),public.inviter_locataire(uuid,uuid),public.mes_invitations_locataire(uuid),public.repondre_invitation_locataire(uuid,boolean),public.annuler_invitation_locataire(uuid),public.noter_envoi_invitation_locataire(uuid,boolean) from public,anon;
grant execute on function public.preparer_invitation_locataire(uuid,uuid),public.inviter_locataire(uuid,uuid),public.mes_invitations_locataire(uuid),public.repondre_invitation_locataire(uuid,boolean),public.annuler_invitation_locataire(uuid),public.noter_envoi_invitation_locataire(uuid,boolean) to authenticated;
select public.fermer_fonctions_a_anon();
