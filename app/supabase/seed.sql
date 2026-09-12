-- Seed de démo Sprint 0 — environnement de développement uniquement.
-- Mot de passe commun des comptes de démo : Gerimmo-Demo-2026
--
-- LES IDENTIFIANTS DE DÉMO SONT FIXES, ET C'EST LE CORRECTIF DU 12/09. Ils
-- étaient tirés au hasard à chaque montage : un banc reconstruit recevait de
-- nouveaux UUID, et les cinq specs E2E qui les portent en dur — abonnement,
-- fiches-parc, fenêtre du lot, l'agent qui ajoute un bien, le brouillon d'EDL —
-- se mettaient à interroger des objets inexistants. Vingt-quatre tests rouges,
-- sans qu'une ligne de produit ait bougé.
--
-- Le banc n'était donc pas reproductible : il ne vivait que par accumulation,
-- et personne ne pouvait le remonter de zéro. Un banc qu'on ne peut pas
-- reconstruire finit par mesurer son propre passé au lieu du produit.
-- Ces UUID sont ceux que les specs portaient déjà : ils deviennent la
-- convention, au lieu d'être l'empreinte d'une base particulière.
do $$
declare
  v_org_alpha uuid;
  v_org_beta uuid;
  v_org_pd uuid;
  v_uid uuid;
  v_pwd text := 'Gerimmo-Demo-2026';
  r record;
begin
  insert into public.organizations (id, name, status)
  values ('c14c3187-1258-4e58-8822-368c6007e3fa', 'Agence Alpha', 'active')
  returning id into v_org_alpha;
  insert into public.organizations (id, name, status)
  values ('b6332d4f-1ef8-45d7-b1cb-9628381a7527', 'Agence Beta', 'active')
  returning id into v_org_beta;
  -- Propriétaire direct de démo (S9a) : son parc, en essai 14 jours
  insert into public.organizations (id, name, type, status, essai_fin)
  values ('3c1d1e95-3570-400b-8012-44530be145b1', 'Parc de Claire Moreau',
          'proprietaire_direct', 'essai', current_date + 14)
  returning id into v_org_pd;

  for r in
    select * from (values
      ('superadmin@gerimmo-demo.fr'),
      ('admin.alpha@gerimmo-demo.fr'),
      ('agent.alpha@gerimmo-demo.fr'),
      ('admin.beta@gerimmo-demo.fr'),
      ('multi@gerimmo-demo.fr'),
      ('locataire.alpha@gerimmo-demo.fr'),
      ('proprietaire@gerimmo-demo.fr'),
      -- Artisan de démo (module 8). Il n'a PAS d'adhésion posée ici : elle est
      -- créée par `solliciter_artisan` au moment où une agence le sollicite —
      -- c'est ainsi que le portail artisan apparaît dans « Mes espaces », et
      -- ainsi que l'artisan n'existe pour une agence qu'après un vrai geste.
      ('artisan.alpha@gerimmo-demo.fr')
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

-- Jeu de démo du propriétaire direct (ajouté le 06/09, reflet de la prod) :
-- un bien avec son lot détenu à 100 % par Claire Moreau, et un locataire
-- prêt à recevoir son bail (le parcours complet — bail, PDF signé, EDL —
-- reste à jouer pendant les essais).
do $$
declare
  v_org_pd uuid;
  v_claire uuid;
  v_bien uuid;
  v_lot uuid;
  v_person uuid;
  v_uid uuid;
begin
  select id into v_org_pd from public.organizations where name = 'Parc de Claire Moreau';
  select id into v_claire from public.persons
   where organization_id = v_org_pd and nom = 'Moreau' limit 1;
  if v_org_pd is null or v_claire is null then return; end if;

  insert into public.biens (organization_id, nom, type, address_line1, postal_code, city,
                            annee_construction, copropriete, zone_tendue)
  values (v_org_pd, 'Résidence des Lilas', 'appartement', '12 rue des Lilas', '69003', 'Lyon',
          1998, false, true)
  returning id into v_bien;

  insert into public.lots (organization_id, bien_id, nom, etat, surface_m2, pieces, etage, meuble)
  values (v_org_pd, v_bien, 'Appartement T2 — 12 rue des Lilas', 'disponible', 46, 2, '2', false)
  returning id into v_lot;

  insert into public.detentions (organization_id, lot_id, person_id, quote_part)
  values (v_org_pd, v_lot, v_claire, 100);

  -- UN SECOND BIEN, ET IL A UNE RAISON D'ÊTRE. Le premier bien est offert à
  -- vie : avec un seul, « Mon abonnement » affiche 0 € et ne propose rien à
  -- payer. Le banc ne pourrait donc jamais montrer ni éprouver l'encaissement
  -- — ni le décompte, ni le bouton, ni le prorata. Ce studio est ce qui rend
  -- la facturation observable (5,99 €/mois, décision humain du 2026-09-05).
  insert into public.biens (organization_id, nom, type, address_line1, postal_code, city,
                            annee_construction, copropriete, zone_tendue)
  values (v_org_pd, 'Studio du Rhône', 'appartement', '7 quai Claude Bernard', '69007', 'Lyon',
          2004, true, true);

  insert into public.persons (organization_id, nom, prenom, email, telephone)
  values (v_org_pd, 'Bernard', 'Lucas', 'locataire.pd@gerimmo-demo.fr', '06 12 34 56 78')
  returning id into v_person;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'locataire.pd@gerimmo-demo.fr', extensions.crypt('Gerimmo-Demo-2026', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', '', ''
  );
  select id into v_uid from public.accounts where email = 'locataire.pd@gerimmo-demo.fr';
  update public.persons set account_id = v_uid where id = v_person;
  insert into public.memberships (account_id, organization_id, role, status)
  values (v_uid, v_org_pd, 'locataire', 'active');
end $$;

-- ── Un portefeuille sous mandat, pour que la facturation agence soit visible ──
--
-- POURQUOI DU MULTI-LOT. La grille agence facture le LOT SOUS MANDAT ACTIF, et
-- son barème est dégressif par tranches. Avec un seul lot, le banc ne montre
-- que le forfait de départ : ni la deuxième tranche, ni la dégressivité, ni la
-- promesse qui fait tout l'intérêt de la grille — qu'un lot de plus ne fasse
-- jamais changer de palier. Cet immeuble de dix-sept lots rend la facture
-- observable, et c'est la seule raison de sa taille.
do $$
declare
  v_org uuid; v_mandant uuid; v_mandat uuid; v_bien uuid; v_lot uuid; i integer;
begin
  select id into v_org from public.organizations where name = 'Agence Alpha';
  if v_org is null then return; end if;
  -- Le drapeau système : le seed écrit avant que l'abonnement n'existe.
  perform public.tache_systeme();

  insert into public.persons (organization_id, nom, prenom)
  values (v_org, 'Vasseur', 'Hélène') returning id into v_mandant;

  -- Le mandat naît en BROUILLON : la base refuse de l'activer tant qu'il n'a
  -- ni lot ni taux (recette 23/08). On le compose, puis on l'active.
  insert into public.mandats (organization_id, person_id, etat, date_debut)
  values (v_org, v_mandant, 'brouillon', current_date - 60) returning id into v_mandat;

  insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
  values (v_org, 'Immeuble Vasseur', 'immeuble', '22 rue de la Paix', '75002', 'Paris')
  returning id into v_bien;

  for i in 1..17 loop
    insert into public.lots (organization_id, bien_id, nom)
    values (v_org, v_bien, 'Lot ' || i) returning id into v_lot;
    -- Sans détention, `mandat_lignes` refuse le lot (RM-5.1.1).
    insert into public.detentions (organization_id, lot_id, person_id, quote_part)
    values (v_org, v_lot, v_mandant, 100);
    insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires, date_debut)
    values (v_org, v_mandat, v_lot, 7, current_date - 60);
  end loop;

  update public.mandats set etat = 'actif' where id = v_mandat;
  perform set_config('gerimmo.systeme', '', true);
end $$;
