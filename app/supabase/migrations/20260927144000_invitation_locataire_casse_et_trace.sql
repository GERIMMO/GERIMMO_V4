-- AUDIT SÉCURITÉ DU 27/09 — MINEUR : `inviter_locataire`.
--
-- (a) CASSE DE L'ADRESSE. La recherche `auth.users where email = v_email`
--     était sensible à la casse et `persons.email` n'est pas normalisé : une
--     fiche « Locataire.Alpha@… » dont le compte existe en minuscules
--     tombait sur l'erreur brute `duplicate key … accounts_email_unique`.
--     L'adresse est désormais comparée et créée en minuscules (Supabase Auth
--     les stocke ainsi).
-- (b) RATTACHEMENT D'OFFICE SANS TRACE. Un compte existant — celui d'une
--     autre agence — était rattaché comme locataire sans que rien ne le dise.
--     Le rattachement reste possible (c'est le parcours d'invitation actuel),
--     mais chaque invitation est inscrite au journal d'audit : fiche, compte,
--     compte déjà existant ou créé, nombre d'autres organisations où ce compte
--     a une adhésion. Le flux avec acceptation (relances J+3/J+10, expiration
--     J+30, refus tracé — wiki « Compte, personne et adhésion ») reste à
--     construire : il change le parcours du locataire.
--
-- Idempotent : CREATE OR REPLACE, même signature et mêmes droits.

create or replace function public.inviter_locataire(p_org uuid, p_person_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text;
  v_uid uuid;
  v_existait boolean;
  v_autres integer;
  v_nouvelle_adhesion boolean := false;
begin
  -- Réservé aux gérants de l'agence
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;

  select lower(btrim(email)) into v_email from public.persons
  where id = p_person_id and organization_id = p_org;
  if v_email is null or v_email = '' then
    raise exception 'La personne doit avoir un email pour être invitée';
  end if;

  -- Créer le compte auth s'il n'existe pas (mot de passe aléatoire, à réinitialiser)
  select id into v_uid from auth.users where lower(email) = v_email;
  v_existait := v_uid is not null;
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
  select id into v_uid from public.accounts where lower(email) = v_email;
  if v_uid is null then
    raise exception 'Le compte n''a pas pu être préparé : réessayez dans un instant';
  end if;

  select count(distinct m.organization_id) into v_autres
  from public.memberships m
  where m.account_id = v_uid and m.organization_id is distinct from p_org;

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
    v_nouvelle_adhesion := true;
  end if;

  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), p_org, 'invitation_locataire',
          jsonb_build_object('person_id', p_person_id, 'compte', v_uid,
                             'compte_existant', v_existait,
                             'autres_organisations', v_autres,
                             'nouvelle_adhesion', v_nouvelle_adhesion));

  return v_email;
end;
$function$;

revoke execute on function public.inviter_locataire(uuid, uuid) from public, anon;
grant execute on function public.inviter_locataire(uuid, uuid) to authenticated;

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
