-- Revue 26/08 (passe n°2) — quatre resserrages :
--  F1. Les stats de la vue d'ensemble Documents s'agrègent en SQL (le plafond
--      PostgREST faussait « Pièces à renouveler » et « Par type » au-delà de
--      1000 pièces) ; le seuil « à renouveler » vient de l'app (horloge Paris).
--  F2. L'exigence d'adhésion locataire ACTIVE atteint aussi les fonctions
--      bail du matin (mon_bail_locataire, mon_bail_document_locataire).
--  F3. Le chemin storage fourni aux fonctions de dépôt/remplacement est
--      contraint au préfixe de l'agence (un chemin forgé vers le fichier
--      d'une autre agence n'entre plus dans la whitelist storage).
-- Appliquée le 2026-08-26 sur « Gerimmo V4 » via MCP. Copie de référence.

-- ============================================================
-- F1. Stats GED agrégées (security invoker : RLS gérants)
-- ============================================================
create function public.documents_stats_par_type(p_org uuid)
returns table (type public.document_type, total bigint)
language sql stable security invoker set search_path = '' as $$
  select d.type, count(*)
  from public.documents_courants(p_org) d
  where d.purged_at is null
  group by d.type
  order by count(*) desc;
$$;

create function public.documents_a_renouveler(p_org uuid, p_limite date)
returns table (id uuid, titre text, expire_le date)
language sql stable security invoker set search_path = '' as $$
  select d.id, d.titre, d.expire_le
  from public.documents_courants(p_org) d
  where d.purged_at is null
    and d.expire_le is not null and d.expire_le <= p_limite
  order by d.expire_le;
$$;

-- ============================================================
-- F2. Adhésion locataire active sur les fonctions bail du matin
-- ============================================================
create or replace function public.mon_bail_locataire(p_org uuid)
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
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status = 'active')
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by b.created_at desc;
$$;

create or replace function public.mon_bail_document_locataire(p_org uuid)
returns table (document_id uuid, titre text, mime_type text,
               storage_path text, purged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.titre, d.mime_type, d.storage_path, d.purged_at
  from public.baux b
  join public.documents d on d.id = b.document_signe
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis')
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status = 'active')
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
-- F3. Le chemin storage reste dans le préfixe de l'agence
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
  if p_storage_path not like p_org::text || '/%' then
    raise exception 'Chemin de fichier invalide';
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

create or replace function public.remplacer_document_ged(
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
  if p_storage_path not like p_org::text || '/%' then
    raise exception 'Chemin de fichier invalide';
  end if;

  select * into v_ancienne from public.documents
  where id = p_remplace and organization_id = p_org;
  if not found then
    raise exception 'La pièce à remplacer est introuvable dans l''agence';
  end if;
  if v_ancienne.purged_at is not null then
    raise exception 'Cette pièce a été purgée : elle ne peut plus être remplacée';
  end if;

  insert into public.documents
    (organization_id, type, titre, storage_path, mime_type, taille_octets,
     empreinte, deposited_by, expire_le, remplace_id)
  values
    (p_org, v_ancienne.type,
     coalesce(nullif(p_titre, ''), v_ancienne.titre),
     p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()),
     p_expire, p_remplace)
  returning id into v_doc;

  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  select v_doc, p_org, dl.entite, dl.entite_id
  from public.document_liens dl
  where dl.document_id = p_remplace
  on conflict (document_id, entite, entite_id) do nothing;

  update public.baux
  set document_signe = v_doc
  where organization_id = p_org and document_signe = p_remplace;

  return v_doc;
end;
$$;
