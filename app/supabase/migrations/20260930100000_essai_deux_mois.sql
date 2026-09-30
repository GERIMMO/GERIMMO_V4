-- L'ESSAI GRATUIT PASSE DE 14 JOURS À 2 MOIS (décision du porteur, 30/09/2026).
--
-- Pour tous : particuliers et SCI (inscription en ligne) comme agences
-- (ouverture depuis la console). Le TypeScript l'annonce (`MOIS_ESSAI`,
-- `DUREE_ESSAI` dans src/lib/tarifs.ts) ; la base l'APPLIQUE, ici.
--
-- EN MOIS CALENDAIRES, PAS EN JOURS. « 2 mois » posé le 30 septembre finit le
-- 30 novembre ; 60 jours finiraient le 29. On écrit donc
-- `(current_date + interval '2 months')::date`, comme on le dit.
--
-- CE QUI CHANGE, ET RIEN D'AUTRE :
--   1. `essai_ordinaire_fin()` : la date de fin d'un essai qui commence
--      aujourd'hui — un seul endroit, lu par les deux fonctions qui ouvrent
--      une organisation ;
--   2. `initialiser_espace_proprietaire()` (inscription d'un propriétaire
--      direct) : reprise de sa dernière définition
--      (20260910172000_espace_proprietaire_sans_course), `current_date + 14`
--      remplacé ;
--   3. `ouvrir_organisation()` (console) : reprise de 20260911260000 ; la
--      durée par défaut devient l'essai ordinaire (paramètre omis ou NULL) ;
--      une durée en jours reste possible pour un essai négocié ;
--   4. `parrainage_avantage_filleul()` (grille historique seulement) : reprise
--      de 20260928090000 ; les trente jours du filleul ne peuvent plus
--      raccourcir un essai de 2 mois — la base gardait déjà le plus long, mais
--      l'avantage se disait « appliqué » sans rien allonger : il est désormais
--      inscrit « sans objet » dans ce cas ;
--   5. les organisations EN ESSAI aujourd'hui voient leur essai porté à
--      2 mois depuis leur création (jamais raccourci).

-- ── 1. La fin de l'essai ordinaire ─────────────────────────────────────────
create or replace function public.essai_ordinaire_fin()
returns date
language sql
stable
set search_path = ''
as $$ select (current_date + interval '2 months')::date $$;
comment on function public.essai_ordinaire_fin() is
  'Fin de l''essai gratuit ordinaire commençant aujourd''hui : 2 mois calendaires (décision du 30/09/2026). Même durée que MOIS_ESSAI (src/lib/tarifs.ts).';
revoke execute on function public.essai_ordinaire_fin() from public, anon;
grant execute on function public.essai_ordinaire_fin() to authenticated, service_role;

-- ── 2. L'inscription d'un propriétaire direct ──────────────────────────────
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
revoke execute on function public.initialiser_espace_proprietaire() from public, anon;

-- ── 3. L'ouverture depuis la console ───────────────────────────────────────
-- Même signature ; seul le défaut de `p_essai_jours` change (14 → NULL, qui
-- veut dire « l'essai ordinaire de 2 mois »).
create or replace function public.ouvrir_organisation(
  p_nom text,
  p_type public.organization_type,
  p_email_responsable text,
  p_essai_jours integer default null,
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
  v_essai_fin date;
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

  insert into public.organizations (name, type, status, essai_fin)
  values (
    v_nom, p_type,
    case when p_active_immediatement then 'active' else 'essai' end::public.organization_status,
    v_essai_fin
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
comment on function public.ouvrir_organisation(text, public.organization_type, text, integer, boolean) is
  'Crée une organisation, le compte de son premier responsable et leur adhésion. Réservée au super admin (RM-16.1.1). Essai par défaut : 2 mois (essai_ordinaire_fin). N''envoie pas l''e-mail : l''application le fait.';
revoke execute on function public.ouvrir_organisation(text, public.organization_type, text, integer, boolean)
  from public, anon;

-- ── 4. L'avantage filleul (grille historique) ──────────────────────────────
-- Reprise de 20260928090000_tarification_2026 : même comportement, sauf
-- quand l'essai en cours va déjà au-delà des trente jours du filleul (ce qui
-- est désormais le cas de tout essai ordinaire) : rien n'est allongé, la
-- ligne le dit (« sans objet »), au lieu d'annoncer « Essai porté à
-- 30 jours » à quelqu'un qui en a davantage.
create or replace function public.parrainage_avantage_filleul(p_parrainage uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filleul uuid;
  v_statut public.organization_status;
  v_essai date;
  v_grille text;
  v_cible date := current_date + public.parrainage_jours_filleul();
begin
  select p.filleul_organization_id into v_filleul
  from public.parrainages p where p.id = p_parrainage;
  if v_filleul is null then return; end if;

  select o.status, o.essai_fin, o.grille_tarifaire into v_statut, v_essai, v_grille
  from public.organizations o where o.id = v_filleul;

  if v_grille = '2026-09-28' then
    insert into public.avantages_parrainage
      (parrainage_id, beneficiaire_organization_id, nature, jours, etat, applique_le)
    values (p_parrainage, v_filleul, 'essai_filleul', 0, 'sans_objet', now())
    on conflict (parrainage_id, nature) do nothing;
    return;
  end if;

  if v_statut <> 'essai' then
    insert into public.avantages_parrainage
      (parrainage_id, beneficiaire_organization_id, nature, jours, etat, applique_le)
    values (p_parrainage, v_filleul, 'essai_filleul', 0, 'sans_objet', now())
    on conflict (parrainage_id, nature) do nothing;
    return;
  end if;

  -- L'essai en cours dépasse déjà la cible : rien à rallonger (30/09/2026).
  if v_essai is not null and v_essai >= v_cible then
    insert into public.avantages_parrainage
      (parrainage_id, beneficiaire_organization_id, nature, jours, etat, applique_le)
    values (p_parrainage, v_filleul, 'essai_filleul', null, 'sans_objet', now())
    on conflict (parrainage_id, nature) do nothing;
    return;
  end if;

  perform set_config('gerimmo.systeme', 'on', true);
  update public.organizations
     set essai_fin = greatest(coalesce(v_essai, v_cible), v_cible), updated_at = now()
   where id = v_filleul;
  perform set_config('gerimmo.systeme', '', true);

  insert into public.avantages_parrainage
    (parrainage_id, beneficiaire_organization_id, nature, jours, etat, applique_le)
  values (p_parrainage, v_filleul, 'essai_filleul',
          public.parrainage_jours_filleul(), 'applique', now())
  on conflict (parrainage_id, nature) do nothing;
end $$;
revoke execute on function public.parrainage_avantage_filleul(uuid) from public, anon, authenticated;

-- ── 5. Les essais en cours ─────────────────────────────────────────────────
-- Toute organisation en essai à ce jour a droit aux 2 mois, comptés depuis sa
-- création. Jamais raccourci (greatest) : un essai prolongé par la supervision
-- ou par un parrainage garde sa date. `essai_fin` est un champ réservé : le
-- déclencheur `organizations_champs_reserves_sa` laisse passer ce geste du
-- système, comme pour les autres fonctions de facturation.
-- Dans un bloc : le réglage local vit le temps de la transaction du bloc,
-- que le fichier soit joué d'un seul tenant ou instruction par instruction.
do $$
begin
  perform set_config('gerimmo.systeme', 'on', true);
  update public.organizations
     set essai_fin = greatest(essai_fin, (created_at::date + interval '2 months')::date),
         updated_at = now()
   where status = 'essai'
     and essai_fin >= current_date
     and essai_fin < (created_at::date + interval '2 months')::date;
  perform set_config('gerimmo.systeme', '', true);
end $$;

comment on column public.organizations.essai_fin is
  'Fin de la période d''essai (incluse). Essai ordinaire : 2 mois calendaires depuis l''ouverture (décision du 30/09/2026, auparavant 14 jours).';
