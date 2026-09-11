-- Ouvrir une organisation depuis la console, au lieu d'écrire du SQL.
--
-- CE QUI MANQUAIT. Le wiki réserve la création d'agence au super admin, à la
-- signature du contrat (RM-16.1.1) — et le site recueille bien les demandes
-- (« Demandes de devis », traitées depuis /admin/devis). Mais AUCUN écran ne
-- crée l'organisation : entre la demande reçue et le client qui se connecte, il
-- fallait ouvrir un client SQL, insérer l'organisation, insérer l'adhésion, et
-- fabriquer le compte de son administrateur à la main. Le geste le plus
-- commercial du produit était le seul à ne pas exister.
--
-- CE QUE CETTE FONCTION FAIT, ET S'ARRÊTE DE FAIRE. Elle crée l'organisation,
-- le compte de son premier responsable et l'adhésion qui les relie. Elle
-- n'envoie pas l'e-mail : c'est l'application qui le fait, par le même chemin
-- que « mot de passe oublié » — celui que le produit utilise déjà pour inviter
-- un locataire. Une base ne poste pas de courrier.
--
-- IDEMPOTENTE SUR LE COMPTE, PAS SUR L'ORGANISATION. Un responsable peut déjà
-- exister (il gère une autre agence, ou il est locataire quelque part) : on
-- réutilise son compte. Mais on ne déduplique PAS les organisations par leur
-- nom — deux agences peuvent légitimement s'appeler « Cabinet Martin », et
-- refuser la seconde serait décider à la place du super admin.

create or replace function public.ouvrir_organisation(
  p_nom text,
  p_type public.organization_type,
  p_email_responsable text,
  p_essai_jours integer default 14,
  p_active_immediatement boolean default false
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

  insert into public.organizations (name, type, status, essai_fin)
  values (
    v_nom, p_type,
    case when p_active_immediatement then 'active' else 'essai' end::public.organization_status,
    case when p_active_immediatement then null else (current_date + p_essai_jours) end
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
                             'essai_jours', case when p_active_immediatement then null else p_essai_jours end));

  return query select v_org, v_email, v_existant;
end;
$$;
comment on function public.ouvrir_organisation(text, public.organization_type, text, integer, boolean) is
  'Crée une organisation, le compte de son premier responsable et leur adhésion. Réservée au super admin (RM-16.1.1). N''envoie pas l''e-mail : l''application le fait.';
revoke execute on function public.ouvrir_organisation(text, public.organization_type, text, integer, boolean)
  from public, anon;

-- Marquer une demande de devis traitée en même temps qu'on ouvre l'agence
-- qu'elle appelait : sans cela, la file garde une ligne dont la suite a eu
-- lieu, et le super admin la retraite.
create or replace function public.demande_devis_traitee(p_demande uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super admin';
  end if;
  update public.demandes_devis set traitee_le = now()
  where id = p_demande and traitee_le is null;
end;
$$;
revoke execute on function public.demande_devis_traitee(uuid) from public, anon;
