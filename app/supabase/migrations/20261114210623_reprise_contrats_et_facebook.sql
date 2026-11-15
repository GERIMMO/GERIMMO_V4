-- La réservation durable reste commune aux webhooks, aux actions et aux reprises.
create unique index courriel_contrat_episode on public.courriels_durables
 (organization_id,(contexte_metier->>'type'),(contexte_metier->>'id'),
 (coalesce(contexte_metier->>'fin','')),(coalesce(contexte_metier->>'rang','')))
 where contexte_metier->>'type' in ('confirmation_abonnement','accuse_resiliation');

alter function public.empreinte_metier_courriel(uuid,jsonb) rename to empreinte_courriel_avant_contrats;
create function public.empreinte_metier_courriel(p_org uuid,p_contexte jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare a record; geste record; adresse text; responsable uuid;
begin
 if coalesce(p_contexte->>'type','') not in ('confirmation_abonnement','accuse_resiliation') then
   return public.empreinte_courriel_avant_contrats(p_org,p_contexte);
 end if;
 select * into a from public.abonnement_courrier_contexte(p_org);
 if not found or a.stripe_subscription_id is distinct from p_contexte->>'id'
 or a.stripe_statut not in ('active','trialing','past_due') or a.stripe_statut is null
 or a.organisation is distinct from p_contexte->>'organisation'
 or a.formule is distinct from p_contexte->>'formule' then return null; end if;
 adresse:=encode(sha256(convert_to(lower(btrim(a.destinataire)),'UTF8')),'hex');
 if p_contexte->>'type'='confirmation_abonnement' then
   if a.confirmation_envoyee_le is not null or a.cgu_version is null or a.cgu_acceptee_le is null
   or a.souscrit_le is distinct from (p_contexte->>'souscrit')::timestamptz
   or a.montant_periode_cents is distinct from (p_contexte->>'montant')::bigint
   or a.periodicite is distinct from p_contexte->>'periodicite'
   or a.unites_souscrites is distinct from (p_contexte->>'unites')::int
   or a.cgu_version is distinct from p_contexte->>'version'
   or a.cgu_acceptee_le is distinct from (p_contexte->>'acceptee')::timestamptz then return null; end if;
 else
   if a.resiliations_accusees is distinct from (p_contexte->>'rang')::int
   or a.periode_fin is distinct from (p_contexte->>'fin')::timestamptz
   or a.resiliation_accusee_pour=a.periode_fin then return null; end if;
   if p_contexte->>'chemin'='action' then
     select l.* into geste from public.audit_log l where l.organization_id=p_org
       and l.action in ('abonnement_resiliation_notifiee','abonnement_resiliation_levee')
       and l.details->>'souscription'=a.stripe_subscription_id order by l.created_at desc,l.id desc limit 1;
     if not found or geste.action<>'abonnement_resiliation_notifiee'
     or (geste.details->>'notifiee_le')::timestamptz is distinct from (p_contexte->>'notification')::timestamptz then return null; end if;
     responsable:=geste.account_id;
     adresse:=coalesce(geste.details->>'destinataire_empreinte',adresse);
   elsif p_contexte->>'chemin'='webhook' then
     if not exists(select from public.abonnements where organization_id=p_org and annulation_demandee) then return null; end if;
   else return null; end if;
 end if;
 if adresse is null or adresse is distinct from p_contexte->>'destinataire' then return null; end if;
 if not exists(select from public.memberships m join auth.users u on u.id=m.account_id
 where m.organization_id=p_org and m.status='active' and m.role in ('admin_agence','proprietaire_direct')
 and u.deleted_at is null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
 and (case when responsable is null then lower(btrim(u.email))=lower(btrim(a.destinataire)) else u.id=responsable end)) then return null; end if;
 return encode(sha256(convert_to(jsonb_build_array(to_jsonb(a),p_contexte,responsable)::text,'UTF8')),'hex');
end $$;

alter function public.finaliser_courriel_metier(text) rename to finaliser_courriel_avant_contrats;
create function public.finaliser_courriel_metier(p_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.courriels_durables; c jsonb; ok boolean;
begin
 select * into m from public.courriels_durables where id=p_id for update;
 c:=m.contexte_metier;
 if coalesce(c->>'type','') not in ('confirmation_abonnement','accuse_resiliation') then return public.finaliser_courriel_avant_contrats(p_id); end if;
 if m.etat not in ('accepte','livre') or m.fournisseur_id is null then return false; end if;
 if m.finalisation_etat='terminee' then return true; end if;
 perform 1 from public.abonnements where organization_id=m.organization_id for update;
 if not public.verifier_contexte_courriel(p_id) then return false; end if;
 if c->>'type'='confirmation_abonnement' then
   ok:=public.abonnement_confirmation_envoyee(m.organization_id,c->>'id',m.fournisseur_id,(c->>'document')::boolean);
 else
   ok:=public.abonnement_resiliation_accusee(m.organization_id,c->>'id',(c->>'fin')::timestamptz,m.fournisseur_id,c->>'chemin');
 end if;
 if ok then
   update public.courriels_durables set finalisation_etat='terminee',motif=null where id=p_id;
   insert into public.courriels_evenements(courrier_id,etat) values(p_id,'finalisation_terminee');
 end if;
 return ok;
end $$;
revoke all on function public.empreinte_courriel_avant_contrats(uuid,jsonb),public.empreinte_metier_courriel(uuid,jsonb),
 public.finaliser_courriel_avant_contrats(text),public.finaliser_courriel_metier(text) from public,anon,authenticated,service_role;
grant execute on function public.finaliser_courriel_metier(text) to service_role;

-- L'intention est inscrite dans la même écriture que la parution sur le site.
alter table public.publications add column facebook_a_diffuser boolean not null default false;
create function public.suivre_parution_facebook() returns trigger language plpgsql set search_path='' as $$
begin
 if new.statut='publiee' and old.statut='programmee' and old.marketing_jour is not null then
   new.facebook_a_diffuser:=true;
 elsif new.statut<>'publiee' or new.facebook_post_id is not null then
   new.facebook_a_diffuser:=false;
 end if;
 if new.statut='publiee' and old.statut='publiee' and
 (new.facebook_texte,new.facebook_image_url,new.slug,new.titre,new.chapo,new.corps)
 is distinct from (old.facebook_texte,old.facebook_image_url,old.slug,old.titre,old.chapo,old.corps) then
   new.facebook_a_diffuser:=false;
 end if;
 return new;
end $$;
create trigger tracer_parution_facebook before update on public.publications
 for each row execute function public.suivre_parution_facebook();
revoke all on function public.suivre_parution_facebook() from public,anon,authenticated;

create or replace function public.publications_marketing_echues()
returns setof uuid language sql stable security definer set search_path='' as $$
 select p.id from public.publications p where (select auth.role())='service_role'
 and p.programmee_pour<=now() and (p.statut='programmee' or
 (p.statut='publiee' and p.facebook_a_diffuser and p.facebook_post_id is null))
 order by p.programmee_pour;
$$;

alter function public.reserver_diffusion_facebook(uuid,boolean) rename to reserver_facebook_avant_reprise;
create function public.reserver_diffusion_facebook(p_id uuid,p_automatique boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_automatique then
   if (select auth.role()) is distinct from 'service_role' then raise exception 'Réservé au traitement marketing'; end if;
   perform pg_catalog.pg_advisory_xact_lock(20260925,13);
   perform 1 from public.publications p join public.marketing_reglages r on r.singleton
    where p.id=p_id and p.facebook_a_diffuser and (not r.validation_obligatoire or p.valide_le is not null)
    and not exists(select from public.regulatory_watch v where v.id=p.veille_source_id and v.statut='ecarte')
    for update of p;
   if not found then return false; end if;
 end if;
 return public.reserver_facebook_avant_reprise(p_id,p_automatique);
end $$;
revoke all on function public.reserver_facebook_avant_reprise(uuid,boolean),public.reserver_diffusion_facebook(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.reserver_diffusion_facebook(uuid,boolean) to authenticated,service_role;
