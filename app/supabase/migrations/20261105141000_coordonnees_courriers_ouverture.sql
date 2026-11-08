-- Coordonnées de correspondance à l’ouverture. Les espaces existants gardent leur accès.
create or replace function public.initialiser_espace_proprietaire()
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
  v_telephone text;
  v_adresse text;
  v_cp text;
  v_ville text;
  v_qualite text;
  v_org uuid;
  v_essai_fin date := public.essai_ordinaire_fin();
begin
  if v_uid is null then
    raise exception 'Accès refusé';
  end if;

  -- Chemin nominal : l'espace existe déjà, on le rend (idempotence).
  select organization_id into v_org
  from public.memberships
  where account_id = v_uid and role = 'proprietaire_direct' and status = 'active'
  limit 1;
  if v_org is not null then
    return v_org;
  end if;

  select u.email,
         nullif(btrim(u.raw_user_meta_data ->> 'nom'), ''),
         nullif(btrim(u.raw_user_meta_data ->> 'prenom'), ''),
         nullif(btrim(u.raw_user_meta_data ->> 'telephone'), ''),
         nullif(btrim(u.raw_user_meta_data ->> 'adresse'), ''),
         nullif(btrim(u.raw_user_meta_data ->> 'code_postal'), ''),
         nullif(btrim(u.raw_user_meta_data ->> 'ville'), ''),
         nullif(btrim(u.raw_user_meta_data ->> 'qualite'), '')
    into v_email, v_nom, v_prenom, v_telephone, v_adresse, v_cp, v_ville, v_qualite
  from auth.users u
  where u.id = v_uid;

  if v_nom is null then
    raise exception 'Le nom est obligatoire pour ouvrir un espace propriétaire';
  end if;

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

  if coalesce(v_adresse, '') !~ '[^[:space:]]' or coalesce(v_cp, '') !~ '[^[:space:]]' or coalesce(v_ville, '') !~ '[^[:space:]]' then
    raise exception 'Renseignez une adresse postale complète (adresse, code postal et ville) pour vos courriers.';
  end if;
  if length(v_adresse) > 200 or length(v_cp) > 10 or length(v_ville) > 100 then
    raise exception 'Vérifiez la longueur de l’adresse postale.';
  end if;
  if coalesce(v_email, '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Renseignez un e-mail de contact valide pour vos courriers.';
  end if;

  -- Création de l'espace. Sous-transaction : si un appel concurrent a gagné la
  -- course, l'index unique refuse l'adhésion et TOUT ce bloc est défait —
  -- l'organisation du perdant ne survit pas à sa propre erreur.
  begin
    insert into public.organizations
      (name, type, status, essai_fin, address_line1, postal_code, city, telephone, email_contact)
    values (
      'Parc de ' || coalesce(v_prenom || ' ', '') || v_nom,
      'proprietaire_direct',
      'essai',
      v_essai_fin,
      v_adresse, v_cp, v_ville, v_telephone, v_email
    )
    returning id into v_org;

    insert into public.memberships (account_id, organization_id, role)
    values (v_uid, v_org, 'proprietaire_direct');

    insert into public.persons
      (organization_id, account_id, nom, prenom, email, telephone,
       address_line1, postal_code, city, qualite)
    values (v_org, v_uid, v_nom, v_prenom, v_email, v_telephone,
            v_adresse, v_cp, v_ville, coalesce(v_qualite, 'Personne physique'));

    insert into public.audit_log (account_id, organization_id, action, details)
    values (v_uid, v_org, 'inscription_proprietaire', jsonb_build_object('essai_fin', v_essai_fin));
  exception when unique_violation then
    -- Un appel concurrent a ouvert l'espace pendant le nôtre : sa transaction
    -- est committée (c'est ce qui a fait échouer notre insertion), on rend SON
    -- espace — le double-clic reste idempotent.
    v_org := null;
    select organization_id into v_org
    from public.memberships
    where account_id = v_uid and role = 'proprietaire_direct' and status = 'active'
    limit 1;
    -- Aucune adhésion concurrente : l'unicité violée était ailleurs, on ne
    -- masque pas l'erreur.
    if v_org is null then
      raise;
    end if;
    return v_org;
  end;

  return v_org;
end;
$$;
revoke all on function public.initialiser_espace_proprietaire() from public, anon;
grant execute on function public.initialiser_espace_proprietaire() to authenticated;

drop function public.ouvrir_organisation(text,public.organization_type,text,integer,boolean);
create or replace function public.ouvrir_organisation(
  p_nom text,
  p_type public.organization_type,
  p_email_responsable text,
  p_essai_jours integer default null,
  p_active_immediatement boolean default false,
  p_adresse text default null, p_code_postal text default null, p_ville text default null
)
returns table (organization_id uuid, email_responsable text, compte_deja_existant boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email_responsable, '')));
  v_nom text := btrim(coalesce(p_nom, ''));
  v_org uuid;
  v_uid uuid;
  v_existant boolean;
  v_role public.membership_role;
  v_essai_fin date;
  v_adresse text := btrim(p_adresse);
  v_cp text := btrim(p_code_postal);
  v_ville text := btrim(p_ville);
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin : l''ouverture d''une organisation suit la signature du contrat (RM-16.1.1)';
  end if;
  if length(v_nom) = 0 then
    raise exception 'Le nom de l''organisation est obligatoire';
  end if;
  if length(v_nom) < 2 then
    raise exception 'Le nom de l''organisation doit faire au moins deux caractères : %', p_nom;
  end if;
  -- Contrôle volontairement sommaire : c'est l'adresse à laquelle part
  -- l'invitation, une faute de frappe se voit à l'envoi, pas ici.
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'L''adresse du responsable est invalide : %', p_email_responsable;
  end if;
  if p_essai_jours < 0 or p_essai_jours > 365 then
    raise exception 'La durée d''essai doit tenir entre 0 et 365 jours';
  end if;

  -- Le rôle découle du type : une agence a un administrateur, un parc a son
  -- propriétaire. Il n'y a pas de troisième cas.
  v_role := case p_type
    when 'agence' then 'admin_agence'::public.membership_role
    else 'proprietaire_direct'::public.membership_role
  end;

  -- Sans durée précisée : l'essai ordinaire, 2 mois calendaires (30/09/2026).
  v_essai_fin := case
    when p_active_immediatement then null
    when p_essai_jours is null then public.essai_ordinaire_fin()
    else current_date + p_essai_jours
  end;

  if coalesce(v_adresse, '') !~ '[^[:space:]]' or coalesce(v_cp, '') !~ '[^[:space:]]' or coalesce(v_ville, '') !~ '[^[:space:]]' then
    raise exception 'Renseignez une adresse postale complète (adresse, code postal et ville) pour vos courriers.';
  end if;
  if length(v_adresse) > 200 or length(v_cp) > 10 or length(v_ville) > 100 then
    raise exception 'Vérifiez la longueur de l’adresse postale.';
  end if;

  insert into public.organizations (name, type, status, essai_fin, address_line1, postal_code, city, email_contact)
  values (
    v_nom, p_type,
    case when p_active_immediatement then 'active' else 'essai' end::public.organization_status,
    v_essai_fin, v_adresse, v_cp, v_ville, v_email
  )
  returning id into v_org;

  -- Le compte du responsable : réutilisé s'il existe (il peut gérer une autre
  -- agence, ou être locataire ailleurs), créé sinon avec un mot de passe
  -- aléatoire que personne ne connaît — il le définira par le lien reçu.
  select id into v_uid from auth.users where lower(email) = v_email;
  v_existant := v_uid is not null;
  if not v_existant then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      v_email, extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', '', ''
    );
  end if;
  -- `accounts` est alimentée par déclencheur sur auth.users.
  select id into v_uid from public.accounts where lower(email) = v_email;
  if v_uid is null then
    raise exception 'Le compte de % n''a pas pu être préparé', v_email;
  end if;

  insert into public.memberships (account_id, organization_id, role)
  values (v_uid, v_org, v_role);

  insert into public.audit_log (organization_id, action, details)
  values (v_org, 'organisation_ouverte',
          jsonb_build_object('nom', v_nom, 'type', p_type, 'role', v_role,
                             'responsable', v_email, 'compte_existant', v_existant,
                             'essai_jours', case when p_active_immediatement then null else v_essai_fin - current_date end,
                             'essai_fin', v_essai_fin));

  return query select v_org, v_email, v_existant;
end;
$$;
revoke all on function public.ouvrir_organisation(text,public.organization_type,text,integer,boolean,text,text,text) from public, anon;
grant execute on function public.ouvrir_organisation(text,public.organization_type,text,integer,boolean,text,text,text) to authenticated;
notify pgrst,'reload schema';
