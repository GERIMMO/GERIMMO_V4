-- Seed de démo Sprint 0 — environnement de développement uniquement.
-- Mot de passe commun des comptes de démo : Gerimmo-Demo-2026
do $$
declare
  v_org_alpha uuid;
  v_org_beta uuid;
  v_org_pd uuid;
  v_uid uuid;
  v_pwd text := 'Gerimmo-Demo-2026';
  r record;
begin
  insert into public.organizations (name, status) values ('Agence Alpha', 'active') returning id into v_org_alpha;
  insert into public.organizations (name, status) values ('Agence Beta', 'active') returning id into v_org_beta;
  -- Propriétaire direct de démo (S9a) : son parc, en essai 14 jours
  insert into public.organizations (name, type, status, essai_fin)
  values ('Parc de Claire Moreau', 'proprietaire_direct', 'essai', current_date + 14)
  returning id into v_org_pd;

  for r in
    select * from (values
      ('superadmin@gerimmo-demo.fr'),
      ('admin.alpha@gerimmo-demo.fr'),
      ('agent.alpha@gerimmo-demo.fr'),
      ('admin.beta@gerimmo-demo.fr'),
      ('multi@gerimmo-demo.fr'),
      ('locataire.alpha@gerimmo-demo.fr'),
      ('proprietaire@gerimmo-demo.fr')
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

  -- Double adhésion : fait apparaître le sélecteur d'espaces
  select id into v_uid from public.accounts where email = 'multi@gerimmo-demo.fr';
  insert into public.memberships (account_id, organization_id, role) values (v_uid, v_org_alpha, 'agent');
  insert into public.memberships (account_id, organization_id, role) values (v_uid, v_org_beta, 'admin_agence');

  insert into public.persons (organization_id, nom, prenom) values (v_org_alpha, 'Dupont', 'Alice');
  insert into public.persons (organization_id, nom, prenom) values (v_org_beta, 'Martin', 'Bruno');

  -- Locataire de démo (espace LO) : compte + adhésion + fiche rattachée
  select id into v_uid from public.accounts where email = 'locataire.alpha@gerimmo-demo.fr';
  insert into public.memberships (account_id, organization_id, role) values (v_uid, v_org_alpha, 'locataire');
  insert into public.persons (organization_id, account_id, nom, prenom, email)
  values (v_org_alpha, v_uid, 'Leblanc', 'Julie', 'locataire.alpha@gerimmo-demo.fr');

  -- Propriétaire direct : adhésion + sa propre fiche (elle porte la détention de ses lots)
  select id into v_uid from public.accounts where email = 'proprietaire@gerimmo-demo.fr';
  insert into public.memberships (account_id, organization_id, role) values (v_uid, v_org_pd, 'proprietaire_direct');
  insert into public.persons (organization_id, account_id, nom, prenom, email)
  values (v_org_pd, v_uid, 'Moreau', 'Claire', 'proprietaire@gerimmo-demo.fr');
end $$;
