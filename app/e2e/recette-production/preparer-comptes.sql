-- PRÉPARER LES COMPTES D'UNE RECETTE DE PRODUCTION.
--
-- CE QUE FAIT CE SCRIPT. Il crée, pour UN passage de recette identifié par son
-- suffixe, les cinq personas que la recette Playwright
-- (e2e/recette-production/) parcourt :
--   · une agence « <nom_agence> <suffixe> » en essai de 2 mois, et son admin
--     d'agence ;
--   · un propriétaire direct et son parc (« Parc de Paul Recette-<suffixe> »),
--     avec UN bien déjà saisi : le premier bien est offert à vie, c'est le
--     second — créé par la recette — qui fait apparaître un montant et le
--     bouton d'abonnement (la recette ne clique jamais dessus) ;
--   · un locataire de l'agence : compte, fiche personne rattachée au compte,
--     adhésion « locataire ». Sans bail : la recette vérifie que son espace
--     vide se lit sans erreur ;
--   · un artisan privé validé, rattaché uniquement à l’agence de ce passage ;
--   · une supervision sans organisation, avec expiration automatique et MFA réel.
-- Il reproduit ce que font `ouvrir_organisation` (agence),
-- `initialiser_espace_proprietaire` (parc) et l'invitation d'un locataire —
-- sans passer par elles, qui exigent une session (super admin, titulaire).
--
-- LES ADRESSES. Toutes au domaine resend.dev, boîte « delivered+… » : un
-- courrier parti par erreur est accepté et jeté par Resend, jamais remis à
-- une personne. Toutes portent le suffixe : `purger.sql` les retrouve ainsi.
--   delivered+recette-admin-<suffixe>@resend.dev
--   delivered+recette-proprietaire-<suffixe>@resend.dev
--   delivered+recette-locataire-<suffixe>@resend.dev
--
-- LANCEMENT : uniquement scripts/recette-production-comptes.mjs depuis le
-- chantier autonome. Il génère le mot de passe en mémoire et le transmet sur
-- l'entrée privée de psql, jamais en argument, input manuel ou journal.
-- Les comptes artisan et supervision ne sont pas admis par la recette manuelle.
-- La supervision expire après 60 minutes, avec une tâche de contrôle par minute.
--
-- IL REFUSE plutôt que d'écraser : si un compte du suffixe existe déjà, rien
-- n'est créé (purger d'abord, ou choisir un autre suffixe). Tout est fait
-- dans une transaction : une erreur ne laisse rien derrière elle.

\set ON_ERROR_STOP on

\if :{?suffixe}
\else
  \echo 'Paramètre manquant : -v suffixe=… (minuscules, chiffres, tirets ; 6 à 40 caractères)'
  \quit
\endif
\if :{?mot_de_passe}
\else
  \echo 'Paramètre manquant : -v mot_de_passe=… (12 caractères au moins)'
  \quit
\endif
\if :{?nom_agence}
\else
  \set nom_agence 'Recette banc'
\endif

begin;

-- Les variables psql ne traversent pas un bloc $$ … $$ : on les confie à des
-- réglages LOCAUX à la transaction, lus dans le bloc, oubliés au commit.
select set_config('recette.suffixe', :'suffixe', true),
       set_config('recette.mot_de_passe', :'mot_de_passe', true),
       set_config('recette.nom_agence', :'nom_agence', true)
\gset ignore_

do $recette$
declare
  v_suffixe text := current_setting('recette.suffixe');
  v_mdp text := current_setting('recette.mot_de_passe');
  v_nom_agence text := btrim(current_setting('recette.nom_agence'));
  v_version_cgu constant text := '2026-09-30'; -- CONDITIONS_VERSION (src/lib/editeur.ts)
  v_email_admin text;
  v_email_proprio text;
  v_email_locataire text;
  v_email_artisan text;
  v_email_superadmin text;
  v_artisan uuid;
  v_superadmin uuid;
  v_expire timestamptz := now() + interval '60 minutes';
  v_org_agence uuid;
  v_org_parc uuid;
  v_uid uuid;
  v_compte record;
begin
  if v_suffixe !~ '^[a-z0-9][a-z0-9-]{5,39}$' then
    raise exception 'Suffixe refusé (%) : minuscules, chiffres et tirets, 6 à 40 caractères', v_suffixe;
  end if;
  if length(v_mdp) < 12 then
    raise exception 'Mot de passe trop court : 12 caractères au moins';
  end if;
  if length(v_nom_agence) < 2 then
    raise exception 'Nom d''agence trop court';
  end if;

  v_email_admin := 'delivered+recette-admin-' || v_suffixe || '@resend.dev';
  v_email_proprio := 'delivered+recette-proprietaire-' || v_suffixe || '@resend.dev';
  v_email_locataire := 'delivered+recette-locataire-' || v_suffixe || '@resend.dev';
  v_email_artisan := 'delivered+recette-artisan-' || v_suffixe || '@resend.dev';
  v_email_superadmin := 'delivered+recette-superadmin-' || v_suffixe || '@resend.dev';

  if exists (select 1 from auth.users u
             where lower(u.email) like 'delivered+%' || v_suffixe || '%@resend.dev') then
    raise exception 'Des comptes du suffixe « % » existent déjà : purgez-les (purger.sql) ou changez de suffixe', v_suffixe;
  end if;
  if exists (select 1 from public.organizations o where o.name like '%' || v_suffixe || '%') then
    raise exception 'Une organisation porte déjà le suffixe « % » : purgez-la (purger.sql) ou changez de suffixe', v_suffixe;
  end if;

  -- Les cinq comptes, comme les crée `ouvrir_organisation` — mais avec un
  -- mot de passe connu, puisque personne ne relèvera le lien d'invitation.
  -- `cgu_version` dans les métadonnées : le déclencheur d'inscription pose la
  -- preuve d'acceptation (acceptations_cgu), comme pour une vraie inscription.
  for v_compte in
    select * from (values
      (v_email_admin, 'Alice', 'Recette-' || v_suffixe),
      (v_email_proprio, 'Paul', 'Recette-' || v_suffixe),
      (v_email_locataire, 'Lina', 'Recette-' || v_suffixe),
      (v_email_artisan, 'Arthur', 'Recette-' || v_suffixe),
      (v_email_superadmin, 'Supervision', 'Recette-' || v_suffixe)
    ) as t(email, prenom, nom)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      v_compte.email, extensions.crypt(v_mdp, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('prenom', v_compte.prenom, 'nom', v_compte.nom,
                         'cgu_version', v_version_cgu, 'cgu_acceptee_le', now()),
      now(), now(), '', '', '', '', ''
    )
    returning id into v_uid;

    -- L'identité « email » que GoTrue pose à l'inscription. Absente du banc
    -- local (pas de table auth.identities) ; présente en production.
    if to_regclass('auth.identities') is not null then
      execute $sql$
        insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values ($1::text, $1, jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true),
                'email', now(), now(), now())
      $sql$ using v_uid, v_compte.email;
    end if;
  end loop;

  -- 1. L'agence et son admin (ouvrir_organisation, type agence, essai de 2 mois).
  insert into public.organizations (name, type, status, essai_fin)
  values (v_nom_agence || ' ' || v_suffixe, 'agence', 'essai', public.essai_ordinaire_fin())
  returning id into v_org_agence;
  select id into strict v_uid from public.accounts where lower(email) = v_email_admin;
  insert into public.memberships (account_id, organization_id, role)
  values (v_uid, v_org_agence, 'admin_agence');
  insert into public.audit_log (organization_id, action, details)
  values (v_org_agence, 'organisation_ouverte',
          jsonb_build_object('nom', v_nom_agence || ' ' || v_suffixe, 'type', 'agence',
                             'role', 'admin_agence', 'responsable', v_email_admin,
                             'compte_existant', false, 'essai_jours', public.essai_ordinaire_fin() - current_date,
                             'essai_fin', public.essai_ordinaire_fin(), 'recette', v_suffixe));

  -- 2. Le parc du propriétaire direct (initialiser_espace_proprietaire).
  select id into strict v_uid from public.accounts where lower(email) = v_email_proprio;
  -- Adresse et e-mail du bailleur renseignés, comme à une inscription
  -- complète : sans eux, la création d'un bien est refusée (« Complétez
  -- d'abord votre identité… », actions/parc.ts) — ils désignent le bailleur
  -- dans les documents.
  insert into public.organizations (name, type, status, essai_fin,
                                    address_line1, postal_code, city, email_contact)
  values ('Parc de Paul Recette-' || v_suffixe, 'proprietaire_direct', 'essai', current_date + 14,
          '5 rue du Bailleur', '69003', 'Lyon', v_email_proprio)
  returning id into v_org_parc;
  insert into public.memberships (account_id, organization_id, role)
  values (v_uid, v_org_parc, 'proprietaire_direct');
  insert into public.persons (organization_id, account_id, nom, prenom, email, qualite,
                              address_line1, postal_code, city)
  values (v_org_parc, v_uid, 'Recette-' || v_suffixe, 'Paul', v_email_proprio, 'Personne physique',
          '5 rue du Bailleur', '69003', 'Lyon');
  insert into public.audit_log (account_id, organization_id, action, details)
  values (v_uid, v_org_parc, 'inscription_proprietaire',
          jsonb_build_object('essai_fin', current_date + 14, 'recette', v_suffixe));
  -- Le premier bien, offert à vie, et son lot unique.
  insert into public.biens (organization_id, nom, type, address_line1, postal_code, city,
                            annee_construction, parties_communes, acces_tic, created_by)
  values (v_org_parc, 'Studio recette ' || v_suffixe, 'appartement', '1 rue de la Recette',
          '69001', 'Lyon', 2001, 'Hall d''entrée', 'Fibre optique', v_uid);
  insert into public.lots (bien_id, organization_id, nom, surface_m2, pieces, created_by)
  select b.id, v_org_parc, 'Lot unique', 25, 1, v_uid
    from public.biens b where b.organization_id = v_org_parc;

  -- 3. Le locataire de l'agence : fiche rattachée au compte, adhésion active.
  select id into strict v_uid from public.accounts where lower(email) = v_email_locataire;
  insert into public.persons (organization_id, account_id, nom, prenom, email, qualite)
  values (v_org_agence, v_uid, 'Recette-' || v_suffixe, 'Lina', v_email_locataire, 'Personne physique');
  insert into public.memberships (account_id, organization_id, role)
  values (v_uid, v_org_agence, 'locataire');

  -- 4. Artisan fictif, privé : aucun référencement dans le réseau public.
  select id into strict v_uid from public.accounts where lower(email) = v_email_artisan;
  insert into public.artisans(account_id,raison_sociale,siret,email,telephone,visibilite,statut_plateforme,siret_etat,cree_par_organization_id)
  values(v_uid,'TEST Artisan recette-' || v_suffixe,
    (10000000000000 + floor(random()*89999999999999))::bigint::text,
    v_email_artisan,'0600000000','privee','valide','verifie',v_org_agence) returning id into v_artisan;
  insert into public.artisan_agences(artisan_id,organization_id,statut) values(v_artisan,v_org_agence,'actif');
  insert into public.artisan_metiers(artisan_id,metier) values(v_artisan,'plomberie');
  insert into public.artisan_zones(artisan_id,code_postal) values(v_artisan,'69001');

  -- 5. Rôle réel de supervision, second facteur obligatoire et configuré par le
  -- navigateur. Aucun secret MFA ni session AAL2 n'est fabriqué par le SQL.
  select id into strict v_superadmin from public.accounts where lower(email) = v_email_superadmin;
  insert into public.memberships(account_id,organization_id,role) values(v_superadmin,null,'super_admin');
  -- Filet de sécurité si le runner disparaît : retrait du rôle sous 61 minutes,
  -- blocage Auth et révocation des sessions. Le nettoyage normal retire ce job.
  -- UUID, échéance et nom du job uniquement ; aucun mot de passe ou secret.
  perform cron.schedule('recette-expiration-' || v_suffixe, '* * * * *', format($expiration$
    do $borne$ begin
      if clock_timestamp() >= %L::timestamptz then
        delete from public.memberships where account_id=%L::uuid and role='super_admin';
        update auth.users set banned_until='infinity'::timestamptz where id=%L::uuid;
        delete from auth.sessions where user_id=%L::uuid;
        perform cron.unschedule(%L);
      end if;
    end $borne$;
  $expiration$,v_expire,v_superadmin,v_superadmin,v_superadmin,'recette-expiration-' || v_suffixe));
  raise notice 'Recette « % » préparée.', v_suffixe;
end
$recette$;

commit;

-- Valeurs non secrètes lues uniquement par le chantier autonome avec nettoyage.
select 'email_admin' as parametre, u.email as valeur
  from auth.users u where u.email = 'delivered+recette-admin-' || :'suffixe' || '@resend.dev'
union all
select 'email_proprietaire', u.email
  from auth.users u where u.email = 'delivered+recette-proprietaire-' || :'suffixe' || '@resend.dev'
union all
select 'email_locataire', u.email
  from auth.users u where u.email = 'delivered+recette-locataire-' || :'suffixe' || '@resend.dev'
union all
select 'email_artisan', u.email from auth.users u where u.email = 'delivered+recette-artisan-' || :'suffixe' || '@resend.dev'
union all
select 'email_superadmin', u.email from auth.users u where u.email = 'delivered+recette-superadmin-' || :'suffixe' || '@resend.dev'
union all
select 'org_agence', o.id::text
  from public.organizations o where o.type = 'agence' and o.name like '% ' || :'suffixe'
union all
select 'org_proprietaire', o.id::text
  from public.organizations o where o.type = 'proprietaire_direct' and o.name = 'Parc de Paul Recette-' || :'suffixe'
union all
select 'suffixe', :'suffixe';
