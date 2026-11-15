-- La commande enregistrée avant Checkout est identifiée dans la souscription Stripe.
-- Les anciens contrats sans cette correspondance nécessitent une vérification.
create table public.preuves_commandes_abonnement (
  subscription text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  commande uuid not null unique,
  acceptation uuid not null references public.acceptations_cgu(id) on delete cascade
);
alter table public.preuves_commandes_abonnement enable row level security;
revoke all on public.preuves_commandes_abonnement from public, anon, authenticated, service_role;
create function public.lier_preuve_commande(p_org uuid, p_subscription text, p_commande uuid, p_acceptation uuid)
returns void language plpgsql security definer set search_path='' as $$
declare preuve uuid;
begin
  select c.id into strict preuve
  from public.abonnements a
  join public.intentions_souscription i on i.organization_id=a.organization_id and i.id=p_commande
  join public.audit_log l on l.organization_id=a.organization_id
  join public.acceptations_cgu c on c.id::text=l.details->>'acceptation' and c.account_id=l.account_id
  where a.organization_id=p_org and a.stripe_subscription_id=p_subscription
  and l.action='abonnement_commande_confirmee' and c.id=p_acceptation
  and c.document='conditions_clients' and c.version=l.details->>'conditions_acceptees'
  and c.acceptee_le<=l.created_at and l.created_at < date_trunc('second',a.souscrit_le)+interval '1 second'
  order by l.created_at,l.id limit 1 for update of a;
  insert into public.preuves_commandes_abonnement values(p_subscription,p_org,p_commande,preuve)
    on conflict(subscription) do nothing;
  if not exists(select from public.preuves_commandes_abonnement where subscription=p_subscription
    and organization_id=p_org and commande=p_commande and acceptation=preuve) then
    raise exception 'Commande différente pour cette souscription';
  end if;
end $$;
revoke all on function public.lier_preuve_commande(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.lier_preuve_commande(uuid,text,uuid,uuid) to service_role;

create or replace function public.abonnement_courrier_contexte(p_org uuid)
returns table (organization_id uuid, organisation text, public_tarif public.organization_type, grille text,
               destinataire text, nom_titulaire text, stripe_subscription_id text, stripe_statut text,
               souscrit_le timestamptz, periode_fin timestamptz, essai_fin date, formule text, unites_souscrites integer,
               periodicite text, montant_periode_cents bigint, confirmation_envoyee_le timestamptz,
               resiliation_accusee_pour timestamptz, cgu_version text, cgu_acceptee_le timestamptz,
               resiliations_accusees integer)
language sql
stable
security definer
set search_path = ''
as $$
  with titulaire as (
    select m.account_id
    from public.memberships m
    where m.organization_id = p_org and m.status = 'active' and m.role in ('admin_agence', 'proprietaire_direct')
    order by m.created_at limit 1
  ), acceptation as (
    select c.version,c.acceptee_le from public.preuves_commandes_abonnement p
    join public.abonnements a on a.organization_id=p.organization_id and a.stripe_subscription_id=p.subscription
    join public.acceptations_cgu c on c.id=p.acceptation where p.organization_id=p_org
  )
  select o.id, o.name, o.type, o.grille_tarifaire,
         public.destinataire_facturation(o.id),
         (select nullif(btrim(concat_ws(' ', nullif(btrim(u.raw_user_meta_data->>'prenom'), ''),
                                             nullif(btrim(u.raw_user_meta_data->>'nom'), ''))), '')
            from auth.users u where u.id = (select t.account_id from titulaire t)),
         a.stripe_subscription_id, a.stripe_statut, a.souscrit_le, a.periode_fin, o.essai_fin, a.formule,
         a.unites_souscrites, coalesce(a.periodicite, 'mensuel'), a.montant_periode_cents, a.confirmation_envoyee_le,
         a.resiliation_accusee_pour,
         (select x.version from acceptation x), (select x.acceptee_le from acceptation x),
         (select count(*)::integer from public.audit_log l
           where l.organization_id = o.id and l.action = 'abonnement_resiliation_accusee'
             and l.details->>'souscription' = a.stripe_subscription_id)
  from public.organizations o
  left join public.abonnements a on a.organization_id = o.id
  where o.id = p_org;
$$;

create or replace function public.empreinte_metier_courriel(p_org uuid,p_contexte jsonb) returns text
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

create unique index publications_identifiant_facebook_unique on public.publications(facebook_post_id) where facebook_post_id is not null;

-- Le retour de Stripe peut précéder le webhook. Un événement reçu depuis le geste
-- a priorité sur cette réponse HTTP qui pourrait alors être périmée.
create function public.confirmer_geste_resiliation(p_org uuid, p_subscription text,
 p_notifiee timestamptz, p_fin timestamptz, p_annulation boolean)
returns void language plpgsql security definer set search_path='' as $$
declare geste public.audit_log;
begin
  perform 1 from public.abonnements where organization_id=p_org and stripe_subscription_id=p_subscription for update;
  if not found then return; end if;
  select * into geste from public.audit_log l where l.organization_id=p_org
    and l.action in ('abonnement_resiliation_notifiee','abonnement_resiliation_levee')
    and l.details->>'souscription'=p_subscription order by l.created_at desc,l.id desc limit 1;
  if not found or (geste.details->>'notifiee_le')::timestamptz is distinct from p_notifiee
    or (geste.action='abonnement_resiliation_notifiee') is distinct from p_annulation then return; end if;
  update public.abonnements set annulation_demandee=p_annulation,updated_at=clock_timestamp()
    where organization_id=p_org and stripe_subscription_id=p_subscription
      and periode_fin=p_fin and updated_at<=geste.created_at and annulation_demandee is distinct from p_annulation;
end $$;
revoke all on function public.confirmer_geste_resiliation(uuid,text,timestamptz,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.confirmer_geste_resiliation(uuid,text,timestamptz,timestamptz,boolean) to service_role;
