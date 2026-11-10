begin;
alter table public.courriels_durables
 add column contexte_metier jsonb,
 add column empreinte_metier text,
 add column finalisation_etat text not null default 'a_verifier' check(finalisation_etat in ('a_verifier','en_attente','terminee')),
 add column accepte_le timestamptz;
-- Aucun ancien contenu ne devient autorisé du seul fait de sa conservation.
update public.courriels_durables set reprise_autonome=false,
 motif=coalesce(motif,'Revalidation métier nécessaire avant reprise') where reprise_autonome;

create or replace function public.empreinte_metier_courriel(p_org uuid,p_contexte jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare b public.baux; q public.quittances; d public.documents; destinataire text; source jsonb;
begin
 if not exists(select 1 from public.organizations where id=p_org and status in ('active','essai')) then return null; end if;
 if p_contexte->>'type'='quittance' then
  select * into q from public.quittances where id=(p_contexte->>'id')::uuid and organization_id=p_org;
  if not found or q.montant is distinct from (p_contexte->>'montant')::numeric or q.est_quittance is distinct from (p_contexte->>'est_quittance')::boolean then return null; end if;
  select * into b from public.baux where id=q.bail_id and organization_id=p_org;
 elsif p_contexte->>'type'='bail_signe' then
  select * into b from public.baux where id=(p_contexte->>'id')::uuid and organization_id=p_org;
  if not found or b.etat='brouillon' or b.document_signe is distinct from (p_contexte->>'document')::uuid then return null; end if;
  select * into d from public.documents where id=b.document_signe and organization_id=p_org and purged_at is null and anonymise_le is null;
  if not found then return null; end if;
 else return null;
 end if;
 select lower(btrim(email)) into destinataire from public.persons p where p.id=b.locataire_principal and p.organization_id=p_org and p.archived_at is null
 and (p.account_id is null or exists(select 1 from public.memberships m where m.account_id=p.account_id and m.organization_id=p_org and m.role='locataire' and m.status='active'));
 if destinataire is null or encode(sha256(convert_to(destinataire,'UTF8')),'hex') is distinct from p_contexte->>'destinataire' then return null; end if;
 if p_contexte->>'type'='quittance' then
  if not public.quittance_envoi_autorise(p_org,b.id,destinataire) then return null; end if;
  if coalesce((p_contexte->>'automatique')::boolean,false) and not exists(select 1 from public.organizations where id=p_org and quittances_envoi_auto) then return null; end if;
  source:=public.quittance_document(q.id);
  if source is null then return null; end if;
 else source:=jsonb_build_array(b.id,b.etat,b.locataire_principal,b.document_signe,d.empreinte,d.storage_path,d.updated_at);
 end if;
 return encode(sha256(convert_to(source::text,'UTF8')),'hex');
end $$;

create function public.attacher_contexte_courriel(p_id text,p_org uuid,p_contexte jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables; e text;
begin
 select * into m from public.courriels_durables where id=p_id and organization_id=p_org for update;
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

create function public.verifier_contexte_courriel(p_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables; e text;
begin
 select * into m from public.courriels_durables where id=p_id for update;
 if not found then return false; end if;
 e:=public.empreinte_metier_courriel(m.organization_id,m.contexte_metier);
 if e is null or e is distinct from m.empreinte_metier then
  update public.courriels_durables set reprise_autonome=false,finalisation_etat='a_verifier',motif='Données, droits ou consentement modifiés : nouvelle validation nécessaire' where id=p_id;
  insert into public.courriels_evenements(courrier_id,etat) values(p_id,'validation_metier_refusee');
  return false;
 end if;
 return true;
end $$;

create or replace function public.finaliser_courriel_metier(p_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables;
begin
 select * into m from public.courriels_durables where id=p_id for update;
 if not found or m.etat not in ('accepte','livre') then return false; end if;
 if m.finalisation_etat='terminee' then return true; end if;
 if m.contexte_metier is null then return false; end if;
 if not public.verifier_contexte_courriel(p_id) then return false; end if;
 if m.contexte_metier->>'type'='quittance' then
  update public.quittances set email_envoye_at=coalesce(email_envoye_at,m.accepte_le,now()) where id=(m.contexte_metier->>'id')::uuid and organization_id=m.organization_id;
 elsif m.contexte_metier->>'type'='bail_signe' then
  update public.baux set signe_envoye_le=coalesce(signe_envoye_le,m.accepte_le,now()) where id=(m.contexte_metier->>'id')::uuid and organization_id=m.organization_id and document_signe=(m.contexte_metier->>'document')::uuid;
 else return false;
 end if;
 if not found then return false; end if;
 update public.courriels_durables set finalisation_etat='terminee',motif=null where id=p_id;
 insert into public.courriels_evenements(courrier_id,etat) values(p_id,'finalisation_terminee');
 return true;
end $$;
create function public.courriels_finalisations_a_reprendre() returns setof public.courriels_durables
language sql security definer set search_path='' as $$
 select * from public.courriels_durables where etat in ('accepte','livre') and finalisation_etat='en_attente' order by updated_at limit 20;
$$;
create function public.suivre_finalisation_courriel() returns trigger language plpgsql set search_path='' as $$
begin
 if new.etat in ('accepte','livre') then new.accepte_le:=coalesce(old.accepte_le,now()); end if;
 if new.contexte_metier is null and new.etat in ('en_attente','accepte','livre') then
  new.motif:=coalesce(new.motif,'Reprise ou finalisation métier à vérifier dans le circuit d’origine');
 end if;
 return new;
end $$;
create trigger suivi_finalisation_courriel before update on public.courriels_durables for each row execute function public.suivre_finalisation_courriel();
revoke all on function public.empreinte_metier_courriel(uuid,jsonb),public.attacher_contexte_courriel(text,uuid,jsonb),public.verifier_contexte_courriel(text),public.finaliser_courriel_metier(text),public.courriels_finalisations_a_reprendre(),public.suivre_finalisation_courriel() from public,anon,authenticated;
grant execute on function public.attacher_contexte_courriel(text,uuid,jsonb),public.verifier_contexte_courriel(text),public.finaliser_courriel_metier(text),public.courriels_finalisations_a_reprendre() to service_role;
commit;
