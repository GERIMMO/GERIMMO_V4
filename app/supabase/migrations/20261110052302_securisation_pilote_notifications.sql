begin;
-- Correction du raccordement hérité : la table actuelle est pieces_demandees.
create or replace function public.empreinte_metier_courriel(p_org uuid,p_contexte jsonb) returns text
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
   select to_jsonb(i),i.person_id into objet,personne from public.pieces_demandees i where i.id=(p_contexte->>'id')::uuid and i.organization_id=p_org and i.satisfaite_le is null;
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
-- Intention métier transactionnelle, puis raccordement au journal d'envoi existant.
-- Pas de destinataire ni de contenu sensible conservés ici ; aucun transport SQL.
create table public.notification_intentions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 evenement text not null, objet uuid not null, role text not null check(role in ('agence','locataire','artisan')),
 revision text not null, etat text not null default 'a_preparer' check(etat in ('a_preparer','preparation','conservee','obsolete','a_verifier')),
 courriel_id text references public.courriels_durables(id), jeton uuid, verrou_jusqua timestamptz,
 tentatives integer not null default 0, disponible_le timestamptz not null default now(),
 cree_le timestamptz not null default now(), actualise_le timestamptz not null default now(), motif text,
 unique(organization_id,evenement,objet,role,revision)
);
alter table public.notification_intentions enable row level security;
revoke all on public.notification_intentions from public,anon,authenticated;
grant select on public.notification_intentions to service_role;
create index notification_intentions_reprise on public.notification_intentions(disponible_le) where etat in ('a_preparer','preparation');

create function public.source_notification(p_org uuid,p_evenement text,p_objet uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j jsonb; i uuid;
begin
 case
 when p_evenement='incident_urgent' then
  select jsonb_build_array(id,urgence,responsable_account_id) into j from public.incidents where id=p_objet and organization_id=p_org and urgence='urgente' and etat<>'clos';
 when p_evenement in ('mission_confiee','mission_acceptee','mission_refusee','rendez_vous_fixe','creneaux_proposes') then
  select incident_id into i from public.incident_interventions where id=p_objet and organization_id=p_org;
  if not exists(select 1 from public.incidents where id=i and organization_id=p_org and etat<>'clos') then return null; end if;
  if p_evenement='creneaux_proposes' then
   select jsonb_agg(jsonb_build_array(id,debut,fin,tour) order by id) into j from public.intervention_creneaux where organization_id=p_org and intervention_id=p_objet and propose_par='artisan' and statut='propose';
  elsif p_evenement='rendez_vous_fixe' then
   select jsonb_build_array(id,artisan_id,debut_prevu,fin_prevue) into j from public.incident_interventions where id=p_objet and organization_id=p_org and debut_prevu is not null and statut in ('acceptee','en_cours');
  else
   select jsonb_build_array(id,artisan_id,statut,confiee_le,acceptee_le,refusee_le) into j from public.incident_interventions where id=p_objet and organization_id=p_org and statut::text=case p_evenement when 'mission_confiee' then 'proposee' when 'mission_acceptee' then 'acceptee' else 'refusee' end;
  end if;
 when p_evenement='devis_demande' then
  select jsonb_build_array(id,artisan_id,statut,envoyee_le),incident_id into j,i from public.incident_sollicitations where id=p_objet and organization_id=p_org and statut='envoyee';
 when p_evenement='devis_recu' then
  select jsonb_build_array(id,artisan_id,document_id,montant_ttc_cents,version),incident_id into j,i from public.incident_devis where id=p_objet and organization_id=p_org and statut='depose';
 when p_evenement='reponse_gestionnaire' then
  select jsonb_build_array(id,person_id,texte) into j from public.messages where id=p_objet and organization_id=p_org and auteur='gerant' and lu_le is null;
 when p_evenement='piece_demandee' then
  select to_jsonb(p)-'relancee_le' into j from public.pieces_demandees p where id=p_objet and organization_id=p_org and satisfaite_le is null;
 when p_evenement='signature_demandee' then
  select jsonb_build_array(p.id,p.person_id,p.document_id,d.empreinte,d.storage_path) into j from public.demandes_signature p join public.documents d on d.id=p.document_id and d.organization_id=p.organization_id where p.id=p_objet and p.organization_id=p_org and p.signee_le is null and d.purged_at is null and d.anonymise_le is null;
 else return null;
 end case;
 if i is not null and not exists(select 1 from public.incidents where id=i and organization_id=p_org and etat<>'clos') then return null; end if;
 return j;
end $$;
create function public.capturer_notification(p_org uuid,p_evenement text,p_objet uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 s:=public.source_notification(p_org,p_evenement,p_objet); if s is null then return; end if;
 insert into public.notification_intentions(organization_id,evenement,objet,role,revision)
 values(p_org,p_evenement,p_objet,p_role,encode(sha256(convert_to(s::text,'UTF8')),'hex')) on conflict do nothing;
end $$;
create function public.capturer_notifications_metier() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 case tg_table_name
 when 'incidents' then perform public.capturer_notification(new.organization_id,'incident_urgent',new.id,'agence');
 when 'incident_interventions' then
  perform public.capturer_notification(new.organization_id,'mission_confiee',new.id,'artisan');
  perform public.capturer_notification(new.organization_id,'mission_acceptee',new.id,'agence');
  perform public.capturer_notification(new.organization_id,'mission_refusee',new.id,'agence');
  perform public.capturer_notification(new.organization_id,'rendez_vous_fixe',new.id,'artisan');
  perform public.capturer_notification(new.organization_id,'rendez_vous_fixe',new.id,'locataire');
 when 'incident_sollicitations' then perform public.capturer_notification(new.organization_id,'devis_demande',new.id,'artisan');
 when 'incident_devis' then perform public.capturer_notification(new.organization_id,'devis_recu',new.id,'agence');
 when 'messages' then perform public.capturer_notification(new.organization_id,'reponse_gestionnaire',new.id,'locataire');
 when 'pieces_demandees' then perform public.capturer_notification(new.organization_id,'piece_demandee',new.id,'locataire');
 when 'demandes_signature' then perform public.capturer_notification(new.organization_id,'signature_demandee',new.id,'locataire');
 when 'intervention_creneaux' then perform public.capturer_notification(new.organization_id,'creneaux_proposes',new.intervention_id,'locataire');
 end case;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['incidents','incident_interventions','incident_sollicitations','incident_devis','messages','pieces_demandees','demandes_signature','intervention_creneaux'] loop
 execute format('create trigger notification_transactionnelle after insert or update on public.%I for each row execute function public.capturer_notifications_metier()',t);
 end loop;
end $$;
-- Pas de rattrapage aveugle de l'historique antérieur : ces événements ont pu être envoyés avant la migration.
create function public.notifications_a_preparer(p_limite integer default 25) returns setof public.notification_intentions
language sql security definer set search_path='' as $$
 select * from public.notification_intentions where (etat='a_preparer' or (etat='preparation' and verrou_jusqua<now())) and disponible_le<=now() order by disponible_le,cree_le limit least(greatest(p_limite,1),100);
$$;
create function public.notification_courante(p_org uuid,p_evenement text,p_objet uuid,p_role text) returns uuid
language sql security definer set search_path='' as $$
 select id from public.notification_intentions where organization_id=p_org and evenement=p_evenement and objet=p_objet and role=p_role order by cree_le desc,id desc limit 1;
$$;
create function public.prendre_notification(p_id uuid,p_jeton uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n public.notification_intentions; s jsonb; dest text; personne uuid; artisan uuid; incident uuid; responsable uuid; contexte jsonb;
begin
 select * into n from public.notification_intentions where id=p_id for update skip locked;
 if not found or n.etat not in ('a_preparer','preparation') or (n.etat='preparation' and n.verrou_jusqua>now()) or n.disponible_le>now() then return null; end if;
 s:=public.source_notification(n.organization_id,n.evenement,n.objet);
 if s is null or encode(sha256(convert_to(s::text,'UTF8')),'hex')<>n.revision then
  update public.notification_intentions set etat='obsolete',actualise_le=now(),motif='Événement remplacé ou déjà traité' where id=n.id; return null;
 end if;
 if n.evenement='incident_urgent' then incident:=n.objet;
 elsif n.evenement in ('mission_confiee','mission_acceptee','mission_refusee','rendez_vous_fixe','creneaux_proposes') then select incident_id,artisan_id into incident,artisan from public.incident_interventions where id=n.objet and organization_id=n.organization_id;
 elsif n.evenement='devis_demande' then select incident_id,artisan_id into incident,artisan from public.incident_sollicitations where id=n.objet and organization_id=n.organization_id;
 elsif n.evenement='devis_recu' then select incident_id,artisan_id into incident,artisan from public.incident_devis where id=n.objet and organization_id=n.organization_id;
 elsif n.evenement='reponse_gestionnaire' then select person_id into personne from public.messages where id=n.objet and organization_id=n.organization_id;
 elsif n.evenement='piece_demandee' then select person_id into personne from public.pieces_demandees where id=n.objet and organization_id=n.organization_id;
 elsif n.evenement='signature_demandee' then select person_id into personne from public.demandes_signature where id=n.objet and organization_id=n.organization_id;
 end if;
 if n.role='agence' then
  select responsable_account_id into responsable from public.incidents where id=incident and organization_id=n.organization_id;
  select lower(btrim(u.email)) into dest from public.memberships m join auth.users u on u.id=m.account_id where m.organization_id=n.organization_id and m.status='active' and m.role in ('proprietaire_direct','admin_agence') and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) order by (m.account_id=responsable) desc nulls last,m.account_id limit 1;
 elsif n.role='artisan' then select lower(btrim(email)) into dest from public.artisans where id=artisan;
 else
  if personne is null then select coalesce(b.locataire_principal,i.declarant_person_id) into personne from public.incidents i left join public.baux b on b.id=i.bail_id and b.organization_id=i.organization_id where i.id=incident and i.organization_id=n.organization_id; end if;
  if personne is null and incident is not null then update public.notification_intentions set etat='obsolete',motif='Parties communes sans locataire concerné',actualise_le=now() where id=n.id; return null; end if;
  select lower(btrim(email)) into dest from public.persons where id=personne and organization_id=n.organization_id;
 end if;
 contexte:=jsonb_build_object('type','notification','id',n.objet,'evenement',n.evenement,'role',n.role,'destinataire',encode(sha256(convert_to(dest,'UTF8')),'hex'),'source',n.id);
 if dest is null or public.empreinte_metier_courriel(n.organization_id,contexte) is null then
  update public.notification_intentions set etat='a_verifier',actualise_le=now(),motif='Destinataire ou droits à vérifier ; aucun envoi' where id=n.id; return null;
 end if;
 update public.notification_intentions set etat='preparation',jeton=p_jeton,verrou_jusqua=now()+interval '1 minute',tentatives=tentatives+1,actualise_le=now() where id=n.id;
 return jsonb_build_object('id',n.id,'organisation',n.organization_id,'evenement',n.evenement,'objet',n.objet,'role',n.role,'destinataire',dest,'contexte',contexte);
end $$;
-- Garde de source appliquée également lors de toute reprise différée de l'outbox existante.
alter function public.empreinte_metier_courriel(uuid,jsonb) rename to empreinte_metier_courriel_lot2;
create function public.empreinte_metier_courriel(p_org uuid,p_contexte jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare n public.notification_intentions; s jsonb;
begin
 if p_contexte ? 'source' then
  select * into n from public.notification_intentions where id=(p_contexte->>'source')::uuid and organization_id=p_org and evenement=p_contexte->>'evenement' and objet=(p_contexte->>'id')::uuid and role=p_contexte->>'role';
  if not found or n.etat='obsolete' then return null; end if;
  s:=public.source_notification(n.organization_id,n.evenement,n.objet);
  if s is null or encode(sha256(convert_to(s::text,'UTF8')),'hex')<>n.revision then return null; end if;
 end if;
 return public.empreinte_metier_courriel_lot2(p_org,p_contexte);
end $$;
create function public.finir_notification(p_id uuid,p_jeton uuid,p_courriel text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_courriel is not null and not exists(select 1 from public.courriels_durables m join public.notification_intentions n on n.id=p_id where m.id=p_courriel and m.organization_id=n.organization_id and m.contexte_metier->>'source'=p_id::text) then return false; end if;
 update public.notification_intentions set etat=case when p_courriel is not null then 'conservee' when tentatives>=8 then 'a_verifier' else 'a_preparer' end,
 courriel_id=p_courriel,verrou_jusqua=null,disponible_le=now()+interval '30 seconds',actualise_le=now(),motif=case when p_courriel is null then 'Préparation interrompue, reprise nécessaire' else null end
 where id=p_id and jeton=p_jeton and etat='preparation'; return found;
end $$;
-- Fonctions internes et service uniquement. La session propriétaire ne peut ni capturer ni réclamer une émission.
do $$ declare r record; begin
 for r in select oid::regprocedure f from pg_proc where pronamespace='public'::regnamespace and proname in ('source_notification','capturer_notification','capturer_notifications_metier','notifications_a_preparer','notification_courante','prendre_notification','finir_notification','empreinte_metier_courriel','empreinte_metier_courriel_lot2') loop
 execute format('revoke all on function %s from public,anon,authenticated',r.f);
 if r.f::text not like 'capturer_%' then execute format('grant execute on function %s to service_role',r.f); end if;
 end loop;
end $$;
commit;
