-- Revue 26/08 (passe n°1) — périmètre locataire resserré + remplacement atomique.
-- Findings corrigés :
--  1. Le type pilote seul les droits : côté dossier, le locataire ne voit que
--     attestation_assurance / piece_identite / justificatif — jamais les types
--     « Agence seule » (courrier, diagnostic, mandat…) qu'un gérant rattacherait
--     à sa fiche.
--  2. Verrou d'organisation : toutes les branches « dossier » exigent
--     d.organization_id = p.organization_id, et un trigger garantit qu'un lien
--     ne peut pas pointer un document d'une autre agence.
--  3. Ex-locataire : toutes les fonctions exigent une adhésion « locataire »
--     ACTIVE dans l'agence de la pièce (décision par défaut : l'accès s'éteint
--     avec l'adhésion — à rediscuter si un droit de récupération est souhaité).
--  4. Bail résilié : le bail signé ne se sert que sur bail actif/préavis,
--     partout (liste, métadonnées, storage, trace).
--  5. deposer_mon_attestation valide le MIME côté base (defense en profondeur).
--  6. Remplacement : RPC definer transactionnelle (fiche + liens + pointeur
--     baux.document_signe dans la même transaction) + index d'unicité sur
--     remplace_id (deux remplacements concurrents ne fourchent plus l'historique).
-- Appliquée le 2026-08-26 sur « Gerimmo V4 » via MCP. Copie de référence.

-- ============================================================
-- 0. Garde-fous structurels
-- ============================================================
create unique index documents_remplace_id_unique
  on public.documents (remplace_id)
  where remplace_id is not null;

-- Un lien ne rattache jamais un document d'une autre agence (la policy
-- document_liens_insert ne vérifiait que l'agence du lien, pas celle du
-- document — chemin de fuite par PostgREST direct)
create function public.verifier_lien_meme_agence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select d.organization_id from public.documents d where d.id = new.document_id)
     is distinct from new.organization_id then
    raise exception 'Le document et le lien doivent appartenir à la même agence';
  end if;
  return new;
end;
$$;
create trigger document_liens_meme_agence
  before insert or update on public.document_liens
  for each row execute function public.verifier_lien_meme_agence();

-- ============================================================
-- 1. mes_pieces_locataire — types visibles, org, adhésion active
-- ============================================================
create or replace function public.mes_pieces_locataire(p_org uuid)
returns table (document_id uuid, type public.document_type, titre text,
               mime_type text, depose_le timestamptz, expire_le date,
               verifie_le timestamptz, source text)
language sql stable security definer set search_path = '' as $$
  with ma_personne as (
    select p.id from public.persons p
    where p.organization_id = p_org and p.account_id = (select auth.uid())
      and exists (select 1 from public.memberships m
                  where m.account_id = p.account_id
                    and m.organization_id = p_org
                    and m.role = 'locataire' and m.status = 'active')
  ),
  dossier as (
    select d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.documents d
    join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
    join ma_personne mp on mp.id = dl.entite_id
    where d.organization_id = p_org
      and d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
      and d.purged_at is null
      and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  ),
  attestation_validee as (
    select d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.documents d
    join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
    join ma_personne mp on mp.id = dl.entite_id
    where d.organization_id = p_org
      and d.purged_at is null and d.type = 'attestation_assurance'
      and d.verifie_le is not null
    order by d.verifie_le desc
    limit 1
  ),
  bail_signe as (
    select distinct d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.baux b
    join public.documents d on d.id = b.document_signe
    join ma_personne mp on true
    where b.organization_id = p_org
      and b.etat in ('actif', 'preavis')
      and d.purged_at is null
      and (b.locataire_principal = mp.id
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.person_id = mp.id
                        and bp.role = 'colocataire'))
  )
  select id, type, titre, mime_type, created_at, expire_le, verifie_le, 'dossier'
  from dossier
  union
  select av.id, av.type, av.titre, av.mime_type, av.created_at, av.expire_le,
         av.verifie_le, 'dossier'
  from attestation_validee av
  where not exists (select 1 from dossier x where x.id = av.id)
    and exists (select 1 from dossier x
                where x.type = 'attestation_assurance' and x.verifie_le is null)
  union
  select bs.id, bs.type, bs.titre, bs.mime_type, bs.created_at, bs.expire_le,
         bs.verifie_le, 'bail'
  from bail_signe bs
  where not exists (select 1 from dossier x where x.id = bs.id)
  order by 5 desc;
$$;

-- ============================================================
-- 2. mon_document_locataire — mêmes verrous
-- ============================================================
create or replace function public.mon_document_locataire(p_org uuid, p_doc uuid)
returns table (document_id uuid, titre text, mime_type text,
               storage_path text, purged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.titre, d.mime_type, d.storage_path, d.purged_at
  from public.documents d
  where d.id = p_doc and d.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status = 'active')
    and (
      (d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
       and exists (
        select 1 from public.document_liens dl
        join public.persons p on p.id = dl.entite_id
        where dl.document_id = d.id and dl.entite = 'personne'
          and p.organization_id = p_org
          and p.account_id = (select auth.uid())))
      or exists (
        select 1 from public.baux b
        join public.persons p on p.organization_id = b.organization_id
                             and p.account_id = (select auth.uid())
        where b.document_signe = d.id
          and b.etat in ('actif', 'preavis')
          and (p.id = b.locataire_principal
               or exists (select 1 from public.bail_personnes bp
                          where bp.bail_id = b.id and bp.person_id = p.id
                            and bp.role = 'colocataire'))));
$$;

-- ============================================================
-- 3. chemins_pieces_locataire — mêmes verrous côté storage
-- ============================================================
create or replace function public.chemins_pieces_locataire()
returns setof text
language sql stable security definer set search_path = '' as $$
  select d.storage_path
  from public.baux b
  join public.documents d on d.id = b.document_signe
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and b.etat in ('actif', 'preavis')
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status = 'active')
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'))
  union
  select d.storage_path
  from public.documents d
  join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
  join public.persons p on p.id = dl.entite_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and d.organization_id = p.organization_id
    and d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = p.organization_id
                  and m.role = 'locataire' and m.status = 'active');
$$;

-- ============================================================
-- 4. log_document_access — mêmes verrous sur la trace
-- ============================================================
create or replace function public.log_document_access(doc uuid, acces text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if acces not in ('consultation', 'telechargement') then
    raise exception 'log_document_access: action inconnue %', acces;
  end if;
  select d.organization_id into v_org from public.documents d where d.id = doc;
  if v_org is null then
    raise exception 'log_document_access: document inconnu';
  end if;
  if not (
    v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or public.is_super_admin()
    or (
      exists (select 1 from public.memberships m
              where m.account_id = (select auth.uid())
                and m.organization_id = v_org
                and m.role = 'locataire' and m.status = 'active')
      and (
        exists (
          select 1 from public.baux b
          join public.persons p on p.organization_id = b.organization_id
                               and p.account_id = (select auth.uid())
          where b.document_signe = doc
            and b.etat in ('actif', 'preavis')
            and (p.id = b.locataire_principal
                 or exists (select 1 from public.bail_personnes bp
                            where bp.bail_id = b.id and bp.person_id = p.id
                              and bp.role = 'colocataire')))
        or exists (
          select 1 from public.document_liens dl
          join public.persons p on p.id = dl.entite_id
          join public.documents d on d.id = dl.document_id
          where dl.document_id = doc and dl.entite = 'personne'
            and p.organization_id = v_org
            and d.organization_id = v_org
            and d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
            and p.account_id = (select auth.uid()))))
  ) then
    raise exception 'log_document_access: acces refuse';
  end if;
  insert into public.acces_pieces_log (organization_id, account_id, document_id, action)
  values (v_org, (select auth.uid()), doc, acces);
end;
$$;

-- ============================================================
-- 5. deposer_mon_attestation — MIME validé côté base
-- ============================================================
create or replace function public.deposer_mon_attestation(
  p_org uuid, p_storage_path text, p_mime text, p_taille bigint,
  p_empreinte text, p_titre text, p_expire date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  v_person_nom text;
  v_courante uuid;
  v_doc uuid;
begin
  if p_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Format refusé : PDF, JPEG ou PNG uniquement';
  end if;
  select id, trim(coalesce(prenom, '') || ' ' || nom) into v_person, v_person_nom
  from public.persons
  where organization_id = p_org and account_id = (select auth.uid())
  limit 1;
  if v_person is null then
    raise exception 'Aucune fiche rattachée à votre compte dans cette agence';
  end if;

  select d.id into v_courante
  from public.documents d
  join public.document_liens dl
    on dl.document_id = d.id and dl.entite = 'personne' and dl.entite_id = v_person
  where d.type = 'attestation_assurance' and d.purged_at is null
    and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  order by d.created_at desc
  limit 1;

  insert into public.documents
    (organization_id, type, titre, storage_path, mime_type, taille_octets,
     empreinte, deposited_by, expire_le, remplace_id)
  values
    (p_org, 'attestation_assurance',
     coalesce(nullif(p_titre, ''), 'Attestation d''assurance'),
     p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()),
     p_expire, v_courante)
  returning id into v_doc;

  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, p_org, 'organisation', p_org),
         (v_doc, p_org, 'personne', v_person);

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'attestation_a_verifier', 'normale',
          format('Attestation d''assurance déposée — %s', v_person_nom),
          jsonb_build_object('document_id', v_doc, 'person_id', v_person,
                             'libelle', format('Expire le %s — à vérifier puis valider',
                                               to_char(p_expire, 'DD/MM/YYYY'))));
  return v_doc;
end;
$$;

-- ============================================================
-- 6. Remplacement atomique côté agence : fiche + liens + pointeur
--    baux.document_signe dans la même transaction
-- ============================================================
create function public.remplacer_document_ged(
  p_org uuid, p_remplace uuid, p_storage_path text, p_mime text,
  p_taille bigint, p_empreinte text, p_titre text, p_expire date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ancienne record;
  v_doc uuid;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if p_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Format refusé : PDF, JPEG ou PNG uniquement';
  end if;

  select * into v_ancienne from public.documents
  where id = p_remplace and organization_id = p_org;
  if not found then
    raise exception 'La pièce à remplacer est introuvable dans l''agence';
  end if;
  if v_ancienne.purged_at is not null then
    raise exception 'Cette pièce a été purgée : elle ne peut plus être remplacée';
  end if;

  -- L'index documents_remplace_id_unique tranche les remplacements concurrents
  insert into public.documents
    (organization_id, type, titre, storage_path, mime_type, taille_octets,
     empreinte, deposited_by, expire_le, remplace_id)
  values
    (p_org, v_ancienne.type,
     coalesce(nullif(p_titre, ''), v_ancienne.titre),
     p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()),
     p_expire, p_remplace)
  returning id into v_doc;

  -- Les rattachements suivent la nouvelle version (agence comprise)
  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  select v_doc, p_org, dl.entite, dl.entite_id
  from public.document_liens dl
  where dl.document_id = p_remplace
  on conflict (document_id, entite, entite_id) do nothing;

  -- Les références fortes suivent aussi : le bail signé pointe la nouvelle
  -- version (sinon l'agence et le locataire verraient deux vérités)
  update public.baux
  set document_signe = v_doc
  where organization_id = p_org and document_signe = p_remplace;

  return v_doc;
end;
$$;
revoke execute on function public.remplacer_document_ged(uuid, uuid, text, text, bigint, text, text, date) from public, anon;
grant execute on function public.remplacer_document_ged(uuid, uuid, text, text, bigint, text, text, date) to authenticated;
