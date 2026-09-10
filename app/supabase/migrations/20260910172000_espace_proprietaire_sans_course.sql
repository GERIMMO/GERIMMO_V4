-- Audit 2026-09-10 — un compte propriétaire direct n'a qu'UN seul espace.
--
-- LA RÈGLE. L'auto-inscription du propriétaire direct (décision du 2026-08-19,
-- livrée au sprint 9a) ouvre SON espace : l'organisation « Parc de Prénom Nom »,
-- l'adhésion `proprietaire_direct` et sa fiche personne — et la fonction est
-- « idempotente : la relancer rend le même espace » (wiki : [[Propriétaire
-- bailleur]] § Livraison du Sprint 9a ; [[Onboarding et abonnement]] § Livré le
-- 2026-08-30). Le socle exige que cette unicité soit portée par la base, pas par
-- du code : « Idempotence par contrainte, pas par code » et « Idempotence |
-- Contrainte d'unicité | Garantie par la base » ([[Architecture du socle V3]],
-- lot 0) — exactement comme RM-A1.3 (une adhésion au plus par couple compte ×
-- agence) l'est déjà par `memberships_unique_compte_agence`, « un doublon
-- d'email ou une double adhésion sont impossibles, même en cas d'erreur de
-- programmation » ([[Compte, personne et adhésion]] § Traduction technique).
--
-- LE DÉFAUT. `initialiser_espace_proprietaire()` lisait l'adhésion puis insérait
-- (check-then-insert). Deux appels concurrents — double-clic sur /espaces, retry
-- réseau, deux onglets — ne se voient pas : chacun ne trouve rien et crée son
-- organisation. Rejoué le 2026-09-10 sur la base locale (deux connexions, la
-- seconde appelant la fonction pendant que la première n'avait pas encore
-- committé) : DEUX organisations « Parc de … » et deux adhésions actives pour le
-- même compte. Conséquences : un espace fantôme (le propriétaire saisit son parc
-- dans l'un, l'application le renvoie dans l'autre), et l'exclusivité
-- propriétaire direct / mandant — « cette bascule est exclusive et complète : une
-- même personne ne cumule pas gestion directe et mandat » ([[Compte, personne et
-- adhésion]] § Les six cas résolus, cas 5, décision du 2026-08-19) — devenue
-- contournable, puisqu'elle se raisonne espace par espace.
--
-- LA CORRECTION, en deux temps.
--  1. STRUCTUREL : un index unique partiel sur `memberships (account_id)` limité
--     aux adhésions `proprietaire_direct` actives. La course est tranchée par la
--     base : le second insert attend le premier, puis échoue. L'index reste
--     partiel car il ne dit rien des autres rôles (un compte peut être agent
--     d'une agence ET propriétaire direct) ni des adhésions inactivées — le
--     propriétaire direct devenu mandant garde son adhésion en `inactive`
--     (cas 5 ci-dessus), ce qui ne doit jamais bloquer un retour en gestion
--     directe.
--  2. IDEMPOTENT : la fonction rattrape la violation d'unicité et rend l'espace
--     du gagnant au lieu de remonter une erreur brute. Le bloc `exception` de
--     plpgsql étant une sous-transaction, l'organisation créée par le perdant est
--     défaite avec lui : aucun parc orphelin ne subsiste. Le second appel reste
--     donc ce que le sprint 9a promet et teste — le même espace.
--
-- Aucune autre migration n'est touchée ; le comportement nominal (premier appel)
-- est inchangé, gardes d'identité, de nom et d'exclusivité PD/PM comprises.

-- ------------------------------------------------------------
-- 1. Rattrapage préalable : refuser d'avancer sur des données déjà doublées
-- ------------------------------------------------------------
-- L'index ne peut pas naître si un compte porte déjà deux espaces. Plutôt qu'un
-- « could not create unique index » illisible, on nomme les comptes concernés :
-- la fusion des deux parcs est une décision humaine (lequel garde les biens ?),
-- jamais un effet de bord de migration.
do $$
declare
  v_comptes text;
begin
  select string_agg(account_id::text, ', ')
    into v_comptes
  from (
    select account_id
    from public.memberships
    where role = 'proprietaire_direct' and status = 'active'
    group by account_id
    having count(*) > 1
  ) d;
  if v_comptes is not null then
    raise exception 'Rattrapage requis avant unicité : ces comptes portent déjà plusieurs espaces propriétaires actifs (%). Fusionner ou désactiver l''adhésion en trop, puis rejouer cette migration.', v_comptes;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 2. L'unicité, portée par la base
-- ------------------------------------------------------------
create unique index if not exists memberships_un_seul_espace_proprietaire
  on public.memberships (account_id)
  where role = 'proprietaire_direct' and status = 'active';

comment on index public.memberships_un_seul_espace_proprietaire is
  'Un compte n''a qu''un seul espace « propriétaire direct » actif : l''idempotence de initialiser_espace_proprietaire() est garantie par la base, pas par une lecture préalable (audit 2026-09-10).';

-- ------------------------------------------------------------
-- 3. La fonction : même contrat, course tranchée proprement
-- ------------------------------------------------------------
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
      current_date + 14,
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
    values (v_uid, v_org, 'inscription_proprietaire', jsonb_build_object('essai_fin', current_date + 14));
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
