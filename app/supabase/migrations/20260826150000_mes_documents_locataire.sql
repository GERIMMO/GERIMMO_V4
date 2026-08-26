-- Recette 26/08 — « Mes documents » locataire (écart maquette n°1).
-- Le locataire dispose d'un onglet listant ses pièces : son dossier (pièces
-- rattachées à sa fiche), le bail signé de son bail, et — besoin exprimé en
-- recette — sa dernière attestation d'assurance VALIDÉE reste visible tant
-- que la version qui la remplace n'est pas validée par l'agence.
-- Appliquée le 2026-08-26 sur « Gerimmo V4 » via MCP. Copie de référence.

-- ============================================================
-- 1. Les pièces visibles du locataire (une ligne par pièce)
--    source = 'dossier' (fiche personne) ou 'bail' (bail signé)
-- ============================================================
create function public.mes_pieces_locataire(p_org uuid)
returns table (document_id uuid, type public.document_type, titre text,
               mime_type text, depose_le timestamptz, expire_le date,
               verifie_le timestamptz, source text)
language sql stable security definer set search_path = '' as $$
  with ma_personne as (
    select p.id from public.persons p
    where p.organization_id = p_org and p.account_id = (select auth.uid())
  ),
  dossier as (
    -- Les versions courantes des pièces de MON dossier
    select d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.documents d
    join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
    join ma_personne mp on mp.id = dl.entite_id
    where d.purged_at is null
      and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  ),
  -- La dernière attestation VALIDÉE : reste visible tant que la version qui
  -- la remplace n'est pas validée (recette 26/08)
  attestation_validee as (
    select d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.documents d
    join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
    join ma_personne mp on mp.id = dl.entite_id
    where d.purged_at is null and d.type = 'attestation_assurance'
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
  select id, type, titre, mime_type, created_at, expire_le, verifie_le, 'bail'
  from bail_signe
  order by 5 desc;
$$;
revoke execute on function public.mes_pieces_locataire(uuid) from public, anon;
grant execute on function public.mes_pieces_locataire(uuid) to authenticated;

-- ============================================================
-- 2. Métadonnées d'UNE pièce du locataire, pour la route de fichier
--    (pièce de son dossier — versions comprises — ou bail signé)
-- ============================================================
create function public.mon_document_locataire(p_org uuid, p_doc uuid)
returns table (document_id uuid, titre text, mime_type text,
               storage_path text, purged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.titre, d.mime_type, d.storage_path, d.purged_at
  from public.documents d
  where d.id = p_doc and d.organization_id = p_org
    and (
      exists (
        select 1 from public.document_liens dl
        join public.persons p on p.id = dl.entite_id
        where dl.document_id = d.id and dl.entite = 'personne'
          and p.organization_id = p_org
          and p.account_id = (select auth.uid()))
      or exists (
        select 1 from public.baux b
        join public.persons p on p.organization_id = b.organization_id
                             and p.account_id = (select auth.uid())
        where b.document_signe = d.id
          and (p.id = b.locataire_principal
               or exists (select 1 from public.bail_personnes bp
                          where bp.bail_id = b.id and bp.person_id = p.id
                            and bp.role = 'colocataire'))));
$$;
revoke execute on function public.mon_document_locataire(uuid, uuid) from public, anon;
grant execute on function public.mon_document_locataire(uuid, uuid) to authenticated;

-- ============================================================
-- 3. Trace d'accès : le locataire trace (donc consulte) les pièces
--    de SON dossier, en plus du bail signé (la trace reste obligatoire)
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
    -- Locataire : le bail signé d'un bail dont il est locataire ou colocataire
    or exists (
      select 1 from public.baux b
      join public.persons p on p.organization_id = b.organization_id
                           and p.account_id = (select auth.uid())
      where b.document_signe = doc
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
    -- Locataire : une pièce rattachée à SA fiche personne
    or exists (
      select 1 from public.document_liens dl
      join public.persons p on p.id = dl.entite_id
      where dl.document_id = doc and dl.entite = 'personne'
        and p.organization_id = v_org
        and p.account_id = (select auth.uid()))
  ) then
    raise exception 'log_document_access: acces refuse';
  end if;
  insert into public.acces_pieces_log (organization_id, account_id, document_id, action)
  values (v_org, (select auth.uid()), doc, acces);
end;
$$;

-- ============================================================
-- 4. Lecture storage : la fonction de chemins couvre le dossier
--    en plus du bail signé (remplace chemins_pieces_bail_locataire)
-- ============================================================
create function public.chemins_pieces_locataire()
returns setof text
language sql stable security definer set search_path = '' as $$
  select d.storage_path
  from public.baux b
  join public.documents d on d.id = b.document_signe
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
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
  where d.purged_at is null and d.storage_path is not null;
$$;
revoke execute on function public.chemins_pieces_locataire() from public, anon;
grant execute on function public.chemins_pieces_locataire() to authenticated;

drop policy ged_select_locataire_bail on storage.objects;
drop function public.chemins_pieces_bail_locataire();
create policy ged_select_locataire on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and name in (select public.chemins_pieces_locataire())
  );
