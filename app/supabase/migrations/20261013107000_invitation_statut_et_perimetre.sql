-- LOC008 : état d’accès exact, sans ouvrir la table des adhésions ; périmètre agent conservé.
create or replace function public.preparer_invitation_locataire(p_org uuid,p_person_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 p public.persons%rowtype; v_uid uuid; v_existait boolean; i public.invitations_locataires%rowtype; v_email text; m public.memberships%rowtype;
begin
 if auth.uid() is null or not (p_org in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 if public.person_hors_portefeuille(p_org,p_person_id) then raise exception 'Cette personne est hors de votre portefeuille'; end if;
 if not public.org_ecriture_ouverte(p_org) then raise exception 'Cette organisation ne peut pas envoyer de nouvelles invitations'; end if;
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
create or replace function public.annuler_invitation_locataire(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare i public.invitations_locataires%rowtype;
begin
 select * into i from public.invitations_locataires where id=p_id for update;
 if not found or auth.uid() is null or not(i.organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 if public.person_hors_portefeuille(i.organization_id,i.person_id) then raise exception 'Cette personne est hors de votre portefeuille'; end if;
 if i.etat='annulee' then return; end if;
 if i.etat='acceptee' then raise exception 'Cette invitation a déjà été acceptée. L’accès locataire reste actif'; end if;
 if i.etat='refusee' then raise exception 'Cette invitation a déjà été refusée. Aucun accès n’a été accordé'; end if;
 if i.etat='expiree' or i.expire_le<=now() then raise exception 'Cette invitation a expiré. Aucun accès n’a été accordé'; end if;
 update public.invitations_locataires set etat='annulee',repondu_le=now() where id=p_id;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),i.organization_id,'invitation_locataire_annulee',jsonb_build_object('invitation',p_id));
end $$;
create or replace function public.noter_envoi_invitation_locataire(p_id uuid,p_envoye boolean) returns void
language plpgsql security definer set search_path='' as $$
declare i public.invitations_locataires%rowtype;
begin
 select * into i from public.invitations_locataires where id=p_id for update;
 if not found or auth.uid() is null or not(i.organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 if public.person_hors_portefeuille(i.organization_id,i.person_id) then raise exception 'Cette personne est hors de votre portefeuille'; end if;
 if i.etat<>'en_attente' then return; end if;
 update public.invitations_locataires set envoye_le=case when p_envoye then now() else envoye_le end,erreur_envoi=not coalesce(p_envoye,false) where id=p_id;
 insert into public.audit_log(account_id,organization_id,action,details) values(auth.uid(),i.organization_id,case when p_envoye then 'invitation_locataire_envoyee' else 'invitation_locataire_envoi_echec' end,jsonb_build_object('invitation',p_id));
end $$;

create function public.statut_acces_locataire(p_org uuid,p_person_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.persons%rowtype; v_statut jsonb;
begin
 if auth.uid() is null or not (p_org in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 if public.person_hors_portefeuille(p_org,p_person_id) then raise exception 'Cette personne est hors de votre portefeuille'; end if;
 select * into p from public.persons where id=p_person_id and organization_id=p_org;
 if not found then raise exception 'Fiche introuvable'; end if;
 select jsonb_build_object('role',role,'status',status) into v_statut from public.memberships where organization_id=p_org and account_id=p.account_id;
 return v_statut;
end $$;
revoke all on function public.statut_acces_locataire(uuid,uuid) from public,anon;
grant execute on function public.statut_acces_locataire(uuid,uuid) to authenticated;
-- Le propriétaire voit uniquement l’état d’accès de sa fiche, pas l’annuaire des comptes.
drop policy invitations_locataires_lecture on public.invitations_locataires;
create policy invitations_locataires_lecture on public.invitations_locataires for select to authenticated using (
 account_id=(select auth.uid()) or (
  organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  and not public.person_hors_portefeuille(organization_id,person_id)
 )
);
