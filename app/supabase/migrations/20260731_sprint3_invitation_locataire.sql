-- Sprint 3 (incrément 6) — Invitation d'un locataire (module 0b)
-- L'agence invite une personne : création du compte locataire + adhésion +
-- rattachement de la fiche. L'invité définit son mot de passe via le flux de
-- réinitialisation (email). Contrôlé par fonction SECURITY DEFINER (création de
-- compte réservée aux gérants ; pas de clé service-role côté app).

create function public.inviter_locataire(p_org uuid, p_person_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_uid uuid;
begin
  -- Réservé aux gérants de l'agence
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;

  select email into v_email from public.persons
  where id = p_person_id and organization_id = p_org;
  if v_email is null or v_email = '' then
    raise exception 'La personne doit avoir un email pour être invitée';
  end if;

  -- Créer le compte auth s'il n'existe pas (mot de passe aléatoire, à réinitialiser)
  select id into v_uid from auth.users where email = v_email;
  if v_uid is null then
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

  -- L'account (miroir) est alimenté par trigger sur auth.users
  select id into v_uid from public.accounts where email = v_email;

  -- Rattacher la fiche au compte (si pas déjà fait)
  update public.persons set account_id = v_uid
  where id = p_person_id and organization_id = p_org and account_id is null;

  -- Adhésion locataire (idempotent)
  if not exists (
    select 1 from public.memberships
    where account_id = v_uid and organization_id = p_org and role = 'locataire'
  ) then
    insert into public.memberships (account_id, organization_id, role)
    values (v_uid, p_org, 'locataire');
  end if;

  return v_email;
end;
$$;
revoke execute on function public.inviter_locataire(uuid, uuid) from public, anon;
