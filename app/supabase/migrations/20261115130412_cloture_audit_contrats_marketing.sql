create or replace function public.abonnement_courrier_contexte(p_org uuid, p_confirmation boolean)
returns table (organization_id uuid, organisation text, public_tarif public.organization_type, grille text,
               destinataire text, nom_titulaire text, stripe_subscription_id text, stripe_statut text,
               souscrit_le timestamptz, periode_fin timestamptz, essai_fin date, formule text, unites_souscrites integer,
               periodicite text, montant_periode_cents bigint, confirmation_envoyee_le timestamptz,
               resiliation_accusee_pour timestamptz, cgu_version text, cgu_acceptee_le timestamptz,
               resiliations_accusees integer)
language sql stable security definer set search_path='' as $$
 select c.organization_id,c.organisation,c.public_tarif,c.grille,
 case when p_confirmation then u.email::text else c.destinataire end,
 case when p_confirmation then nullif(trim(concat_ws(' ',u.raw_user_meta_data->>'prenom',u.raw_user_meta_data->>'nom')),'') else c.nom_titulaire end,
 c.stripe_subscription_id,c.stripe_statut,c.souscrit_le,c.periode_fin,c.essai_fin,c.formule,c.unites_souscrites,c.periodicite,c.montant_periode_cents,c.confirmation_envoyee_le,c.resiliation_accusee_pour,c.cgu_version,c.cgu_acceptee_le,c.resiliations_accusees
 from public.abonnement_courrier_contexte(p_org) c
 left join public.preuves_commandes_abonnement p on p.organization_id=c.organization_id and p.subscription=c.stripe_subscription_id
 left join public.acceptations_cgu preuve on preuve.id=p.acceptation
 left join auth.users u on u.id=preuve.account_id and u.email_confirmed_at is not null and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now())
 and exists(select from public.memberships m where m.account_id=u.id and m.organization_id=c.organization_id and m.status='active' and m.role in ('proprietaire_direct','admin_agence'));
$$;
revoke all on function public.abonnement_courrier_contexte(uuid,boolean) from public,anon,authenticated;
grant execute on function public.abonnement_courrier_contexte(uuid,boolean) to service_role;
create or replace function public.empreinte_metier_courriel(p_org uuid,p_contexte jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare a record; geste record; adresse text; responsable uuid;
begin
 if coalesce(p_contexte->>'type','') not in ('confirmation_abonnement','accuse_resiliation') then
   return public.empreinte_courriel_avant_contrats(p_org,p_contexte);
 end if;
 select * into a from public.abonnement_courrier_contexte(p_org,p_contexte->>'type'='confirmation_abonnement');
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
   if not exists(select from public.abonnements where organization_id=p_org and stripe_subscription_id=a.stripe_subscription_id and annulation_demandee for share) then return null; end if;
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
create or replace function public.lier_preuve_commande(p_org uuid, p_subscription text, p_commande uuid, p_acceptation uuid)
returns void language plpgsql security definer set search_path='' as $$
declare preuve uuid;
begin
  if exists(select from public.preuves_commandes_abonnement where subscription=p_subscription and organization_id=p_org and commande=p_commande and acceptation=p_acceptation) then return; end if;
  select c.id into preuve
  from public.abonnements a
  join public.intentions_souscription i on i.organization_id=a.organization_id and i.id=p_commande
  join public.audit_log l on l.organization_id=a.organization_id
  join public.acceptations_cgu c on c.id::text=l.details->>'acceptation' and c.account_id=l.account_id
  where a.organization_id=p_org and a.stripe_subscription_id=p_subscription
  and l.details->>'commande'=p_commande::text and l.action='abonnement_commande_confirmee' and c.id=p_acceptation
  and c.document='conditions_clients' and c.version=l.details->>'conditions_acceptees'
  and c.acceptee_le<=l.created_at and l.created_at < date_trunc('second',a.souscrit_le)+interval '1 second'
  order by l.created_at,l.id limit 1 for update of a;
  if preuve is null then
    if exists(select from public.preuves_commandes_abonnement where subscription=p_subscription and organization_id=p_org and commande=p_commande and acceptation=p_acceptation) then return; end if;
    insert into public.tech_log(evenement,details) values('preuve_commande_a_verifier',jsonb_build_object('organisation',p_org,'commande',p_commande));
    return;
  end if;
  insert into public.preuves_commandes_abonnement values(p_subscription,p_org,p_commande,preuve)
    on conflict do nothing;
  if not exists(select from public.preuves_commandes_abonnement where subscription=p_subscription
    and organization_id=p_org and commande=p_commande and acceptation=preuve) then
    insert into public.tech_log(evenement,details) values('preuve_commande_en_conflit',jsonb_build_object('organisation',p_org,'commande',p_commande));
  end if;
end $$;
-- Une validation porte sur une version précise de l’article et de son affiche.
create or replace function public.reverifier_affiche_modifiee()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(old.titre, old.slug, old.chapo, old.corps, old.facebook_texte, old.facebook_image_url, old.image_empreinte,old.seo_description,old.sources,old.veille_source_id)
      is not distinct from
      row(new.titre, new.slug, new.chapo, new.corps, new.facebook_texte, new.facebook_image_url, new.image_empreinte,new.seo_description,new.sources,new.veille_source_id) then
    return new;
  end if;
  if old.facebook_envoi_demarre_le is not null and old.facebook_post_id is null then
    raise exception 'Vérifiez la tentative Facebook en cours avant de modifier cette publication.';
  end if;
  new.facebook_a_diffuser := false;
  new.valide_le := null;
  new.valide_par := null;
  return new;
end;
$$;

revoke all on function public.reverifier_affiche_modifiee() from public, anon, authenticated;
drop trigger reverifier_affiche_modifiee on public.publications;
create trigger reverifier_affiche_modifiee
before update of titre, slug, chapo, corps, facebook_texte, facebook_image_url, image_empreinte, seo_description, sources, veille_source_id
on public.publications for each row
execute function public.reverifier_affiche_modifiee();

-- Une décision humaine clôt une tentative précise. Une absence constatée n'autorise pas un nouvel envoi.
create function public.resoudre_tentative_facebook(p_id uuid,p_tentative timestamptz,p_post text,p_constat text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if public.is_permanent_super_admin() is not true or (select auth.jwt()->>'aal') is distinct from 'aal2'
 then raise exception 'Supervision avec double authentification requise'; end if;
 if p_tentative is null or p_tentative>now()-interval '10 minutes' then return false; end if;
 if p_post is null and length(trim(coalesce(p_constat,''))) not between 12 and 300 then return false; end if;
 if p_post is not null and p_post !~ '^[0-9]+_[0-9]+$' then return false; end if;
 update public.publications set facebook_envoi_demarre_le=case when p_post is not null then p_tentative end,
 facebook_post_id=p_post,facebook_publie_le=case when p_post is not null then now() end,
 facebook_a_diffuser=false,facebook_erreur=null
 where id=p_id and statut='publiee' and facebook_post_id is null and facebook_envoi_demarre_le=p_tentative;
 if not found then return false; end if;
 insert into public.audit_log(account_id,action,details) values(auth.uid(),'resolution_diffusion_facebook',
 jsonb_build_object('publication',p_id,'tentative',p_tentative,'post',p_post,'constat',left(p_constat,300)));
 return true;
end $$;
revoke all on function public.resoudre_tentative_facebook(uuid,timestamptz,text,text) from public,anon,service_role;
grant execute on function public.resoudre_tentative_facebook(uuid,timestamptz,text,text) to authenticated;


-- Reprise après une interruption entre la confirmation Stripe et la préparation de l'accusé.
create function public.resiliation_page_a_reprendre(p_org uuid,p_subscription text,p_fin timestamptz)
returns table(destinataire text,notifiee_le timestamptz)
language sql stable security definer set search_path='' as $$
 with dernier as (
   select l.* from public.audit_log l where l.organization_id=p_org
   and l.details->>'souscription'=p_subscription
   and l.action in ('abonnement_resiliation_notifiee','abonnement_resiliation_levee')
   order by l.created_at desc,l.id desc limit 1
 )
 select u.email::text,(l.details->>'notifiee_le')::timestamptz
 from dernier l join public.abonnements a on a.organization_id=l.organization_id
 join auth.users u on u.id=l.account_id
 where l.action='abonnement_resiliation_notifiee' and l.created_at>=now()-interval '23 hours'
 and a.stripe_subscription_id=p_subscription and a.annulation_demandee and a.periode_fin=p_fin
 and a.resiliation_accusee_pour is distinct from p_fin and u.deleted_at is null and u.email_confirmed_at is not null
 and (u.banned_until is null or u.banned_until<=now()) and exists(select from public.memberships m
 where m.organization_id=p_org and m.account_id=u.id and m.status='active' and m.role in ('proprietaire_direct','admin_agence'))
 and case when l.details->>'destinataire_empreinte' is null then lower(u.email)=lower(public.destinataire_facturation(p_org))
 else encode(sha256(convert_to(lower(trim(u.email)),'UTF8')),'hex')=l.details->>'destinataire_empreinte' end;
$$;
revoke all on function public.resiliation_page_a_reprendre(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.resiliation_page_a_reprendre(uuid,text,timestamptz) to service_role;

create or replace function public.suivre_parution_facebook() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
    new.facebook_a_diffuser:=false;
    new.valide_le:=null;
    new.valide_par:=null;
 elsif old.statut='programmee' and new.statut='publiee' and old.marketing_jour is not null then
    new.facebook_a_diffuser:=not exists(select from public.marketing_reglages r where r.singleton and r.validation_obligatoire and new.valide_le is null);
 elsif new.statut<>'publiee' or new.facebook_post_id is not null or not old.facebook_a_diffuser then
    new.facebook_a_diffuser:=false;
 end if;
 return new;
end $$;
create trigger initialiser_intention_facebook before insert on public.publications
for each row execute function public.suivre_parution_facebook();
