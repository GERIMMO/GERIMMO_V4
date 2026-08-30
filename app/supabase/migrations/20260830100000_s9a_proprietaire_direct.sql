-- Sprint 9a — Propriétaire direct (PD) : naissance de son espace.
--
-- 1. Type d'organisation (agence | proprietaire_direct) + fin d'essai 14 jours.
-- 2. Auto-inscription : le compte est créé par Supabase Auth (signUp) ; la
--    fonction `initialiser_espace_proprietaire` — appelée une fois la session
--    ouverte — crée l'organisation, l'adhésion `proprietaire_direct` et la fiche
--    personne du propriétaire (idempotente : la relancer rend le même espace).
-- 3. Droits du PD alignés sur ceux d'un gérant : créer/modifier ses personnes
--    (locataires, garants) et clôturer/rouvrir ses mois. Le mandat ne lui est
--    jamais nécessaire : `ecritures.mandat_id` est nullable et les honoraires
--    ne se génèrent qu'en présence d'une ligne de mandat (S6).
-- 4. Exclusivité PD / PM par personne (décision du 2026-08-19) : un compte qui
--    gère son parc en direct ne peut pas être mandant d'une agence, et
--    réciproquement. Le mandant n'ayant pas d'adhésion, le contrôle croise
--    l'adresse email du compte avec celle du mandant (persons.email).
-- 5. `can_manage_organization(org)` : vrai pour le SA, l'admin d'agence de
--    l'agence et le PD de SA propre organisation — et de nulle autre.

-- ------------------------------------------------------------
-- 1. Type d'organisation et essai
-- ------------------------------------------------------------
create type public.organization_type as enum ('agence', 'proprietaire_direct');

alter table public.organizations
  add column type public.organization_type not null default 'agence',
  add column essai_fin date;

comment on column public.organizations.essai_fin is
  'Fin de la période d''essai (14 jours à l''inscription d''un propriétaire direct). Le paiement Stripe arrive au S11.';

-- ------------------------------------------------------------
-- 2. Auto-inscription du propriétaire direct
-- ------------------------------------------------------------
-- Le formulaire public passe nom/prénom dans les métadonnées du compte
-- (auth.users.raw_user_meta_data) ; la fonction les relit — une seule source,
-- que la session vienne d'une inscription immédiate ou d'un lien de
-- confirmation reçu par email.
create function public.initialiser_espace_proprietaire()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_nom text;
  v_prenom text;
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Accès refusé';
  end if;

  -- Déjà propriétaire direct : on rend son espace (idempotence)
  select organization_id into v_org
  from public.memberships
  where account_id = v_uid and role = 'proprietaire_direct' and status = 'active'
  limit 1;
  if v_org is not null then
    return v_org;
  end if;

  select u.email,
         nullif(btrim(u.raw_user_meta_data ->> 'nom'), ''),
         nullif(btrim(u.raw_user_meta_data ->> 'prenom'), '')
    into v_email, v_nom, v_prenom
  from auth.users u
  where u.id = v_uid;

  if v_nom is null then
    raise exception 'Le nom est obligatoire pour ouvrir un espace propriétaire';
  end if;

  -- Exclusivité PD / PM : cette adresse est-elle celle d'un mandant en cours ?
  if exists (
    select 1
    from public.mandats m
    join public.persons p on p.id = m.person_id
    where m.etat in ('a_signer', 'actif', 'preavis')
      and p.email is not null
      and lower(p.email) = lower(v_email)
  ) then
    raise exception 'Cette adresse est celle d''un propriétaire mandant : un parc confié à une agence ne se gère pas aussi en direct (exclusivité PD/PM)';
  end if;

  insert into public.organizations (name, type, status, essai_fin)
  values (
    'Parc de ' || coalesce(v_prenom || ' ', '') || v_nom,
    'proprietaire_direct',
    'essai',
    current_date + 14
  )
  returning id into v_org;

  insert into public.memberships (account_id, organization_id, role)
  values (v_uid, v_org, 'proprietaire_direct');

  -- Sa fiche personne : c'est elle qui porte la détention de ses lots
  insert into public.persons (organization_id, account_id, nom, prenom, email)
  values (v_org, v_uid, v_nom, v_prenom, v_email);

  insert into public.audit_log (account_id, organization_id, action, details)
  values (v_uid, v_org, 'inscription_proprietaire', jsonb_build_object('essai_fin', current_date + 14));

  return v_org;
end;
$$;
revoke execute on function public.initialiser_espace_proprietaire() from public, anon;

-- ------------------------------------------------------------
-- 3. Droits du propriétaire direct
-- ------------------------------------------------------------
drop policy persons_insert on public.persons;
drop policy persons_update on public.persons;

create policy persons_insert on public.persons
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy persons_update on public.persons
  for update to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );

-- Clôture recommandée, jamais imposée : le PD clôture quand il le souhaite,
-- avec la même mécanique que l'agence (mois verrouillé, contre-écriture).
create or replace function public.cloturer_mois(p_org uuid, p_mois date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Seul l''admin d''agence peut clôturer';
  end if;
  insert into public.clotures_comptables (organization_id, mois)
  values (p_org, date_trunc('month', p_mois)::date)
  on conflict (organization_id, mois) do nothing;
end; $$;

create or replace function public.rouvrir_mois(p_org uuid, p_mois date, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Seul un administrateur d''agence peut rouvrir un mois';
  end if;
  if p_motif is null or btrim(p_motif) = '' then
    raise exception 'Un motif est obligatoire pour rouvrir un mois';
  end if;
  if exists (
    select 1 from public.rapports_gestion r
    where r.organization_id = p_org
      and date_trunc('month', r.mois) = date_trunc('month', p_mois)
      and r.statut = 'envoye'
  ) then
    raise exception 'Un rapport de gestion a déjà été envoyé sur ce mois : réouverture impossible, passez par une contre-écriture et un rectificatif (RM-4.4.6)';
  end if;
  delete from public.clotures_comptables
    where organization_id = p_org and date_trunc('month', mois) = date_trunc('month', p_mois);
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), p_org, 'mois_reouvert',
          jsonb_build_object('mois', date_trunc('month', p_mois)::date, 'motif', p_motif));
end $$;

-- ------------------------------------------------------------
-- 4. Exclusivité PD / PM — côté agence
-- ------------------------------------------------------------
-- Une agence ne peut pas faire signer un mandat à une personne qui gère déjà
-- son parc en direct (même adresse email qu'un compte proprietaire_direct).
create function public.mandat_verifier_exclusivite_pd()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if new.etat not in ('a_signer', 'actif', 'preavis') then
    return new;
  end if;
  select p.email into v_email from public.persons p where p.id = new.person_id;
  if v_email is not null and exists (
    select 1
    from public.memberships m
    join public.accounts a on a.id = m.account_id
    where m.role = 'proprietaire_direct' and m.status = 'active'
      and lower(a.email) = lower(v_email)
  ) then
    raise exception 'Cette personne gère déjà son parc en direct sur Gerimmo : elle ne peut pas être mandante (exclusivité PD/PM)';
  end if;
  return new;
end;
$$;
revoke execute on function public.mandat_verifier_exclusivite_pd() from public, anon;

create trigger mandats_exclusivite_pd_trg
  before insert or update of etat, person_id on public.mandats
  for each row execute function public.mandat_verifier_exclusivite_pd();

-- ------------------------------------------------------------
-- 5. can_manage_organization
-- ------------------------------------------------------------
create function public.can_manage_organization(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_super_admin()
      or org in (select public.org_ids_avec_roles(
           array['admin_agence','proprietaire_direct']::public.membership_role[]));
$$;
revoke execute on function public.can_manage_organization(uuid) from public, anon;

-- Le responsable renomme sa propre organisation ; le statut, l'essai et le
-- type restent la prérogative du super admin (trigger ci-dessous).
drop policy organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using ((select public.can_manage_organization(id)));

create function public.organizations_champs_reserves_sa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status is distinct from old.status
      or new.type is distinct from old.type
      or new.essai_fin is distinct from old.essai_fin)
     and not public.is_super_admin() then
    raise exception 'Seul le super admin modifie le statut, le type ou l''essai d''une organisation';
  end if;
  return new;
end;
$$;
revoke execute on function public.organizations_champs_reserves_sa() from public, anon;

create trigger organizations_champs_reserves_sa_trg
  before update on public.organizations
  for each row execute function public.organizations_champs_reserves_sa();
