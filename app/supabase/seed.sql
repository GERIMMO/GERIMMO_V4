-- Seed de démo Sprint 0 — environnement de développement uniquement.
-- Mot de passe commun des comptes de démo : Gerimmo-Demo-2026
do $$
declare
  v_org_alpha uuid;
  v_org_beta uuid;
  v_uid uuid;
  v_pwd text := 'Gerimmo-Demo-2026';
  r record;
begin
  insert into public.organizations (name, status) values ('Agence Alpha', 'active') returning id into v_org_alpha;
  insert into public.organizations (name, status) values ('Agence Beta', 'active') returning id into v_org_beta;

  for r in
    select * from (values
      ('superadmin@gerimmo-demo.fr'),
      ('admin.alpha@gerimmo-demo.fr'),
      ('agent.alpha@gerimmo-demo.fr'),
      ('admin.beta@gerimmo-demo.fr')
    ) as t(email)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      r.email, extensions.crypt(v_pwd, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', '', ''
    );
  end loop;

  select id into v_uid from public.accounts where email = 'superadmin@gerimmo-demo.fr';
  insert into public.memberships (account_id, organization_id, role) values (v_uid, null, 'super_admin');

  select id into v_uid from public.accounts where email = 'admin.alpha@gerimmo-demo.fr';
  insert into public.memberships (account_id, organization_id, role) values (v_uid, v_org_alpha, 'admin_agence');

  select id into v_uid from public.accounts where email = 'agent.alpha@gerimmo-demo.fr';
  insert into public.memberships (account_id, organization_id, role) values (v_uid, v_org_alpha, 'agent');

  select id into v_uid from public.accounts where email = 'admin.beta@gerimmo-demo.fr';
  insert into public.memberships (account_id, organization_id, role) values (v_uid, v_org_beta, 'admin_agence');

  insert into public.persons (organization_id, nom, prenom) values (v_org_alpha, 'Dupont', 'Alice');
  insert into public.persons (organization_id, nom, prenom) values (v_org_beta, 'Martin', 'Bruno');
end $$;
