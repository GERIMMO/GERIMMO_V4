-- Audit agence du 27/09 — l'admin d'agence invite lui-même un agent.
--
-- CONSTAT. L'écran Administration disait « Ajouter un agent ne se fait pas
-- encore ici : envoyez-nous son adresse » : une agence ne pouvait pas
-- embaucher sans passer par l'équipe Gerimmo.
--
-- RÈGLE (wiki « Modèle de rôles et permissions ») : l'admin d'agence est un
-- « agent ++ » qui porte la gestion des utilisateurs et les invitations
-- (RM-18.1.1/18.1.3) ; « l'invitation crée une ADHÉSION, pas un compte »
-- (RM-A1.5, module 16) : le rôle est porté par l'adhésion compte + agence.
--
-- CORRECTION. `inviter_agent(org, email)` :
--   · réservé à l'admin de CETTE agence (ou au super admin), et aux
--     organisations de type agence ;
--   · compte existant : on lui ajoute l'adhésion « agent » (ou on réactive son
--     adhésion d'agent) — il retrouve l'agence dans ses espaces ; un compte qui
--     a déjà un autre rôle dans l'agence (admin, locataire…) est refusé, le
--     rôle ne se change pas par une invitation ;
--   · compte inconnu : préparé comme à l'ouverture d'une organisation
--     (`ouvrir_organisation`), sans mot de passe connu de quiconque — l'invité
--     le définit par le lien reçu à cette adresse.
-- La trace d'audit est posée par le déclencheur `memberships_audit`
-- (adhesion_creee / adhesion_modifiee).
--
-- Idempotent : create or replace.

create or replace function public.inviter_agent(p_org uuid, p_email text)
returns table(email text, compte_deja_existant boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_type public.organization_type;
  v_uid uuid;
  v_existant boolean;
  v_adhesion record;
begin
  if not (p_org in (select public.org_ids_avec_roles(array['admin_agence']::public.membership_role[]))
          or public.is_super_admin()) then
    raise exception 'Réservé à l''admin de l''agence : c''est lui qui gère l''équipe (RM-18.1.1)';
  end if;
  select o.type into v_type from public.organizations o where o.id = p_org;
  if v_type is distinct from 'agence'::public.organization_type then
    raise exception 'Seule une agence invite des agents';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Adresse e-mail invalide : %', p_email;
  end if;

  select id into v_uid from auth.users where lower(auth.users.email) = v_email;
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
  select a.id into v_uid from public.accounts a where lower(a.email) = v_email;
  if v_uid is null then
    raise exception 'Le compte de % n''a pas pu être préparé', v_email;
  end if;

  select m.id, m.role, m.status into v_adhesion
    from public.memberships m
   where m.account_id = v_uid and m.organization_id = p_org;
  if v_adhesion.id is null then
    insert into public.memberships (account_id, organization_id, role)
    values (v_uid, p_org, 'agent');
  elsif v_adhesion.role = 'agent' and v_adhesion.status = 'active' then
    raise exception '% fait déjà partie de l''équipe', v_email;
  elsif v_adhesion.role = 'agent' then
    update public.memberships set status = 'active', updated_at = now()
     where id = v_adhesion.id;
  else
    raise exception '% a déjà un accès à cette agence (%) : une invitation ne change pas un rôle',
      v_email,
      case v_adhesion.role
        when 'admin_agence' then 'admin d''agence'
        when 'locataire' then 'locataire'
        when 'artisan' then 'artisan'
        when 'garant' then 'garant'
        else v_adhesion.role::text
      end;
  end if;

  return query select v_email, v_existant;
end;
$function$;

comment on function public.inviter_agent(uuid, text) is
  'Audit agence 27/09 : l''admin d''agence ajoute un agent (adhésion « agent », compte préparé s''il n''existe pas). Wiki « Modèle de rôles et permissions ».';

revoke execute on function public.inviter_agent(uuid, text) from public, anon;
grant execute on function public.inviter_agent(uuid, text) to authenticated;

select public.fermer_fonctions_a_anon();
