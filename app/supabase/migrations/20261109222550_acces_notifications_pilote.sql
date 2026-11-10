begin;
-- Extension du journal existant : pas de seconde file. Aucune autorisation à partir de user_metadata.
alter function public.empreinte_metier_courriel(uuid,jsonb) rename to empreinte_metier_courriel_lot1;
create function public.empreinte_metier_courriel(p_org uuid,p_contexte jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare u auth.users; il public.invitations_locataires; ia public.invitations_artisans;
 source jsonb; objet jsonb; incident uuid; artisan uuid; personne uuid; dest text; jeton text; instant timestamptz; ev text;
begin
 if p_contexte->>'type' not in ('acces','invitation_artisan','notification') then
  return public.empreinte_metier_courriel_lot1(p_org,p_contexte);
 end if;
 if p_org is not null and not exists(select 1 from public.organizations where id=p_org and status in ('active','essai')) then return null; end if;
 if p_contexte ? 'acteur' and not exists(select 1 from public.memberships where organization_id=p_org
  and account_id=(p_contexte->>'acteur')::uuid and status='active' and role in ('proprietaire_direct','admin_agence')) then return null; end if;
 if p_contexte->>'type'='acces' then
  select * into u from auth.users where id=(p_contexte->>'id')::uuid;
  if not found or u.deleted_at is not null or u.banned_until>now() then return null; end if;
  if p_contexte->>'usage'='signup' then jeton:=u.confirmation_token; instant:=u.confirmation_sent_at;
  elsif p_contexte->>'usage'='recovery' then jeton:=u.recovery_token; instant:=u.recovery_sent_at;
  else return null; end if;
  if jeton is null or jeton='' or instant is null or instant<now()-interval '15 minutes'
   or encode(sha256(convert_to(jeton,'UTF8')),'hex') is distinct from p_contexte->>'jeton_empreinte' then return null; end if;
  dest:=lower(btrim(u.email));
  if p_org is not null then
   if not (p_contexte ? 'acteur' and p_contexte ? 'invitation') then return null; end if;
   select * into il from public.invitations_locataires where id=(p_contexte->>'invitation')::uuid and organization_id=p_org;
   if not found or il.etat<>'en_attente' or il.expire_le<=now() or il.account_id<>u.id or il.email<>dest
    or not exists(select 1 from public.persons where id=il.person_id and organization_id=p_org and archived_at is null and lower(btrim(email))=dest)
    then return null; end if;
  elsif p_contexte ? 'invitation' or p_contexte ? 'acteur' then return null;
  end if;
  source:=jsonb_build_array(u.id,dest,encode(sha256(convert_to(u.encrypted_password,'UTF8')),'hex'),p_contexte->>'jeton_empreinte',instant,il.id,il.expire_le);
 elsif p_contexte->>'type'='invitation_artisan' then
  if not (p_contexte ? 'acteur') then return null; end if;
  select * into ia from public.invitations_artisans where id=(p_contexte->>'id')::uuid and organization_id=p_org;
  if not found or ia.etat<>'en_attente' or ia.expire_le<=now() then return null; end if;
  dest:=ia.email; source:=jsonb_build_array(ia.id,ia.email,ia.etat,ia.expire_le,ia.cree_par);
 else
  ev:=p_contexte->>'evenement';
  if ev='incident_urgent' then
   select to_jsonb(i),i.id into objet,incident from public.incidents i where i.id=(p_contexte->>'id')::uuid and i.organization_id=p_org;
  elsif ev in ('mission_confiee','mission_refusee','mission_acceptee','rendez_vous_fixe','creneaux_proposes') then
   select to_jsonb(i),i.incident_id,i.artisan_id into objet,incident,artisan from public.incident_interventions i
    where i.id=(p_contexte->>'id')::uuid and i.organization_id=p_org;
   if (ev='mission_confiee' and objet->>'statut' not in ('proposee','acceptee'))
    or (ev='mission_refusee' and objet->>'statut'<>'refusee')
    or (ev='mission_acceptee' and objet->>'statut'<>'acceptee')
    or (ev in ('rendez_vous_fixe','creneaux_proposes') and objet->>'statut' in ('annulee','refusee','terminee')) then return null; end if;
  elsif ev='devis_demande' then
   select to_jsonb(i),i.incident_id,i.artisan_id into objet,incident,artisan from public.incident_sollicitations i where i.id=(p_contexte->>'id')::uuid and i.organization_id=p_org;
  elsif ev='devis_recu' then
   select to_jsonb(i),i.incident_id,i.artisan_id into objet,incident,artisan from public.incident_devis i where i.id=(p_contexte->>'id')::uuid and i.organization_id=p_org;
  elsif ev='reponse_gestionnaire' then
   select to_jsonb(i),i.person_id into objet,personne from public.messages i where i.id=(p_contexte->>'id')::uuid and i.organization_id=p_org and i.auteur='gerant' and i.lu_le is null;
  elsif ev='piece_demandee' then
   select to_jsonb(i),i.person_id into objet,personne from public.demandes_pieces i where i.id=(p_contexte->>'id')::uuid and i.organization_id=p_org and i.statut='en_attente';
  elsif ev='signature_demandee' then
   select jsonb_build_array(to_jsonb(i),d.empreinte,d.updated_at,d.storage_path),i.person_id into objet,personne
    from public.demandes_signature i join public.documents d on d.id=i.document_id and d.organization_id=i.organization_id
    where i.id=(p_contexte->>'id')::uuid and i.organization_id=p_org and i.signee_le is null and d.purged_at is null and d.anonymise_le is null;
  else return null; -- Les autres notifications restent fermées tant que leur document et leurs droits ne sont pas raccordés.
  end if;
  if objet is null or (incident is null and personne is null) then return null; end if;
  if p_contexte->>'role'='agence' then
   select lower(btrim(a.email)) into dest from public.memberships m join auth.users a on a.id=m.account_id
    where a.deleted_at is null and a.email_confirmed_at is not null and (a.banned_until is null or a.banned_until<=now())
    and m.organization_id=p_org and m.status='active' and m.role in ('proprietaire_direct','admin_agence')
    and encode(sha256(convert_to(lower(btrim(a.email)),'UTF8')),'hex')=p_contexte->>'destinataire' limit 1;
  elsif p_contexte->>'role'='artisan' and artisan is not null then
   select lower(btrim(a.email)) into dest from public.artisans a join auth.users utilisateur on utilisateur.id=a.account_id
    where a.id=artisan and a.statut_plateforme='valide' and a.blacklist_globale_le is null and utilisateur.deleted_at is null and (utilisateur.banned_until is null or utilisateur.banned_until<=now())
    and lower(btrim(utilisateur.email))=lower(btrim(a.email)) and utilisateur.email_confirmed_at is not null;
  elsif p_contexte->>'role'='locataire' then
   if personne is null then select coalesce(b.locataire_principal,i.declarant_person_id) into personne from public.incidents i left join public.baux b on b.id=i.bail_id and b.organization_id=p_org where i.id=incident and i.organization_id=p_org; end if;
   select lower(btrim(p.email)) into dest from public.persons p join public.memberships m on m.account_id=p.account_id and m.organization_id=p.organization_id join auth.users utilisateur on utilisateur.id=p.account_id
    where utilisateur.deleted_at is null and utilisateur.email_confirmed_at is not null and (utilisateur.banned_until is null or utilisateur.banned_until<=now()) and lower(btrim(utilisateur.email))=lower(btrim(p.email))
    and p.id=personne and p.organization_id=p_org and p.archived_at is null and m.status='active' and m.role='locataire';
  else return null; end if;
  if incident is not null then
   if not exists(select 1 from public.incidents where id=incident and organization_id=p_org and etat<>'clos') then return null; end if;
   select jsonb_build_array(objet,to_jsonb(i)) into objet from public.incidents i where i.id=incident and i.organization_id=p_org;
  end if;
  source:=jsonb_build_array(objet,incident,artisan,personne,dest);
 end if;
 if dest is null or encode(sha256(convert_to(dest,'UTF8')),'hex') is distinct from p_contexte->>'destinataire' then return null; end if;
 return encode(sha256(convert_to(source::text,'UTF8')),'hex');
end $$;
-- La fabrique ne reçoit que des empreintes non utilisables comme liens d'accès.
create function public.contexte_acces_courriel(p_email text,p_jeton text,p_usage text,p_org uuid,p_invitation uuid,p_acteur uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; c jsonb;
begin
 if p_usage not in ('signup','recovery') then return null; end if;
 select id into uid from auth.users where encode(sha256(convert_to(lower(btrim(email)),'UTF8')),'hex')=p_email
  and encode(sha256(convert_to(case when p_usage='signup' then confirmation_token else recovery_token end,'UTF8')),'hex')=p_jeton;
 if uid is null then return null; end if;
 c:=jsonb_strip_nulls(jsonb_build_object('type','acces','id',uid,'usage',p_usage,'jeton_empreinte',p_jeton,'destinataire',p_email,'acteur',p_acteur,'invitation',p_invitation));
 if public.empreinte_metier_courriel(p_org,c) is null then return null; end if;
 return c;
end $$;
create or replace function public.attacher_contexte_courriel(p_id text,p_org uuid,p_contexte jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables; e text;
begin
 select * into m from public.courriels_durables where id=p_id and organization_id is not distinct from p_org for update;
 if not found then return false; end if;
 if m.contexte_metier is not null then return m.contexte_metier=p_contexte; end if;
 if m.etat<>'en_attente' or m.tentatives<>0 then return false; end if;
 e:=public.empreinte_metier_courriel(p_org,p_contexte);
 if e is null then
  update public.courriels_durables set reprise_autonome=false,motif='Conditions métier invalides : nouvelle validation nécessaire' where id=p_id;
  return false;
 end if;
 update public.courriels_durables set contexte_metier=p_contexte,empreinte_metier=e,finalisation_etat='en_attente',reprise_autonome=true where id=p_id;
 return true;
end $$;


alter function public.finaliser_courriel_metier(text) rename to finaliser_courriel_metier_lot1;
create function public.finaliser_courriel_metier(p_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables;
begin
 select * into m from public.courriels_durables where id=p_id for update;
 if not found or m.etat not in ('accepte','livre') then return false; end if;
 if m.contexte_metier->>'type' not in ('acces','invitation_artisan','notification') then return public.finaliser_courriel_metier_lot1(p_id); end if;
 if m.finalisation_etat='terminee' then return true; end if;
 -- Constate seulement une acceptation prouvée. Ne redonne jamais de droits, ne réactive jamais une invitation.
 if m.contexte_metier->>'type'='invitation_artisan' then
  update public.invitations_artisans set envoye_le=coalesce(envoye_le,m.accepte_le),erreur_envoi=false
   where id=(m.contexte_metier->>'id')::uuid and organization_id=m.organization_id
   and encode(sha256(convert_to(email,'UTF8')),'hex')=m.contexte_metier->>'destinataire';
  if not found then
   update public.courriels_durables set finalisation_etat='a_verifier',motif='Invitation modifiée après acceptation du message : vérifier le destinataire' where id=p_id;
   return false;
  end if;
 elsif m.contexte_metier->>'type'='acces' and m.contexte_metier ? 'invitation' then
  update public.invitations_locataires set envoye_le=coalesce(envoye_le,m.accepte_le),erreur_envoi=false
   where id=(m.contexte_metier->>'invitation')::uuid and organization_id=m.organization_id
   and encode(sha256(convert_to(email,'UTF8')),'hex')=m.contexte_metier->>'destinataire';
  if not found then
   update public.courriels_durables set finalisation_etat='a_verifier',motif='Invitation modifiée après acceptation du message : vérifier le destinataire' where id=p_id;
   return false;
  end if;
 end if;
 update public.courriels_durables set finalisation_etat='terminee',motif=null where id=p_id;
 insert into public.courriels_evenements(courrier_id,etat) values(p_id,'finalisation_terminee');
 return true;
end $$;
revoke all on function public.empreinte_metier_courriel(uuid,jsonb),public.empreinte_metier_courriel_lot1(uuid,jsonb),public.contexte_acces_courriel(text,text,text,uuid,uuid,uuid),public.finaliser_courriel_metier(text),public.finaliser_courriel_metier_lot1(text) from public,anon,authenticated,service_role;
grant execute on function public.contexte_acces_courriel(text,text,text,uuid,uuid,uuid),public.finaliser_courriel_metier(text) to service_role;
commit;
