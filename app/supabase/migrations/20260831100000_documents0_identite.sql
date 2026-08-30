-- Sprint « Documents-0 » — identité des parties (2026-08-31).
-- Les documents générés ont besoin d'un expéditeur complet (en-tête, « Fait
-- à ») : adresse et qualité sur les personnes, identité sur l'organisation.
-- L'inscription du propriétaire recueille désormais ces informations ; le
-- responsable (admin d'agence ou propriétaire) complète le reste sur la page
-- « Profil » de son organisation.

alter table public.persons
  add column address_line1 text,
  add column postal_code text,
  add column city text,
  -- Qualité du bailleur au sens du contrat type : personne physique, SCI…
  add column qualite text;

alter table public.organizations
  add column address_line1 text,
  add column postal_code text,
  add column city text,
  add column telephone text,
  add column email_contact text,
  add column siret text;

-- L'inscription du propriétaire porte maintenant adresse, téléphone et
-- qualité (métadonnées du compte) : la fiche personne ET l'organisation en
-- héritent — le « Fait à » des documents vient de la ville.
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

  return v_org;
end;
$$;
revoke execute on function public.initialiser_espace_proprietaire() from public, anon;
