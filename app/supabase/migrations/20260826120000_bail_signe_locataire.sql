-- Recette 26/08 (anomalie 4.7.1) : le locataire ne pouvait pas consulter le
-- PDF de son bail signé. Quatre maillons manquaient : la projection de
-- mon_bail_locataire, une RPC de métadonnées de la pièce, la trace d'accès
-- (log_document_access refusait le rôle locataire) et la lecture storage.
-- Appliquée le 2026-08-26 sur « Gerimmo V4 » via MCP. Copie de référence.

-- ============================================================
-- 1. mon_bail_locataire expose le document signé (changement de
--    signature de retour → drop puis recreate)
-- ============================================================
drop function public.mon_bail_locataire(uuid);
create function public.mon_bail_locataire(p_org uuid)
returns table (bail_id uuid, type public.bail_type, etat public.bail_etat,
               loyer_hc numeric, charges numeric, date_debut date, date_fin date,
               lot_nom text, document_signe uuid)
language sql stable security definer set search_path = '' as $$
  select b.id, b.type, b.etat, b.loyer_hc, b.charges, b.date_debut, b.date_fin,
         l.nom, b.document_signe
  from public.baux b
  join public.lots l on l.id = b.lot_id
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis')
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by b.created_at desc;
$$;

-- ============================================================
-- 2. Métadonnées de la pièce du bail pour la route de consultation
--    locataire (definer : documents n'est pas lisible par ce rôle)
-- ============================================================
create function public.mon_bail_document_locataire(p_org uuid)
returns table (document_id uuid, titre text, mime_type text,
               storage_path text, purged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.titre, d.mime_type, d.storage_path, d.purged_at
  from public.baux b
  join public.documents d on d.id = b.document_signe
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis')
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by b.created_at desc;
$$;

-- ============================================================
-- 3. Trace d'accès : le locataire peut tracer (donc consulter) la
--    pièce de SON bail — la trace reste obligatoire (RM-0b.7.5)
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
    -- Locataire : uniquement le bail signé d'un bail dont il est
    -- locataire principal ou colocataire
    or exists (
      select 1 from public.baux b
      join public.persons p on p.organization_id = b.organization_id
                           and p.account_id = (select auth.uid())
      where b.document_signe = doc
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  ) then
    raise exception 'log_document_access: acces refuse';
  end if;
  insert into public.acces_pieces_log (organization_id, account_id, document_id, action)
  values (v_org, (select auth.uid()), doc, acces);
end;
$$;

-- ============================================================
-- 4. Lecture storage : les chemins des baux signés du locataire,
--    via une fonction definer (les policies s'évaluent sous la RLS
--    des tables référencées — cf. correctif sprint 3 attestations)
-- ============================================================
create function public.chemins_pieces_bail_locataire()
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
                      and bp.role = 'colocataire'));
$$;

create policy ged_select_locataire_bail on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and name in (select public.chemins_pieces_bail_locataire())
  );
