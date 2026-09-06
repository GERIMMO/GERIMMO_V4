-- Chantiers différés de l'audit du 06/09 — trois briques :
--  1. Messages non lus CÔTÉ GESTIONNAIRE : le pendant de
--     messages_non_lus_locataire, par personne (pastilles sur la liste).
--  2. LOCATAIRE SORTI : l'adhésion désactivée ne coupe plus la LECTURE —
--     restitution, retenues, quittances, relances, documents restent
--     consultables (RM-2.7, quittances 10 ans — décision 25/07). Les
--     écritures (messages, congé, dépôts) restent réservées à l'adhésion
--     active (ma_personne_locataire inchangée). Les pièces du bail vivant
--     (bail signé, règlement) disparaissent toujours à la résiliation
--     (recette 30.7) — seules les portes « restitution » et « dossier »
--     restent ouvertes.
--  3. EDL VISIBLE CÔTÉ LOCATAIRE : mes_edl_locataire — l'état des lieux
--     lui est opposable, il en suit l'avancement (signature sur place).

-- 1. Messages non lus côté gestionnaire -----------------------------------
create function public.messages_non_lus_gerant(p_org uuid)
returns table (person_id uuid, non_lus integer)
language sql stable security definer set search_path = '' as $$
  select m.person_id, count(*)::integer
  from public.messages m
  where m.organization_id = p_org
    and m.auteur = 'locataire' and m.lu_le is null
    and p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  group by m.person_id;
$$;
revoke execute on function public.messages_non_lus_gerant(uuid) from public, anon;

-- 2. Locataire sorti : lecture conservée ----------------------------------
-- La fiche de l'appelant, adhésion locataire active OU désactivée (lecture)
create function public.ma_personne_espace(p_org uuid)
returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.persons p
  where p.organization_id = p_org and p.account_id = (select auth.uid())
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  limit 1;
$$;
revoke execute on function public.ma_personne_espace(uuid) from public, anon;

create or replace function public.mon_dernier_bail_locataire(p_org uuid)
returns uuid
language sql stable security definer set search_path to '' as $$
  select b.id from public.baux b
  where b.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by b.created_at desc limit 1;
$$;
revoke execute on function public.mon_dernier_bail_locataire(uuid) from public, anon;

create or replace function public.mes_relances_locataire(p_org uuid)
returns table (niveau text, date_envoi date, date_premiere_presentation date, numero_recommande text)
language sql stable security definer set search_path to '' as $$
  select r.niveau::text, r.date_envoi, r.date_premiere_presentation, r.numero_recommande
  from public.relances r
  join public.baux b on b.id = r.bail_id
  where b.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by r.date_envoi desc;
$$;
revoke execute on function public.mes_relances_locataire(uuid) from public, anon;

create or replace function public.mes_pieces_locataire(p_org uuid)
returns table (document_id uuid, type public.document_type, titre text, mime_type text,
               depose_le timestamptz, expire_le date, verifie_le timestamptz, source text)
language sql stable security definer set search_path to '' as $$
  with ma_personne as (
    select p.id from public.persons p
    where p.organization_id = p_org and p.account_id = (select auth.uid())
      and exists (select 1 from public.memberships m where m.account_id = p.account_id and m.organization_id = p_org and m.role = 'locataire' and m.status in ('active', 'inactive'))
  ),
  dossier as (
    select d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.documents d
    join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
    join ma_personne mp on mp.id = dl.entite_id
    where d.organization_id = p_org and d.type in ('attestation_assurance', 'piece_identite', 'justificatif') and d.purged_at is null
      and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  ),
  attestation_validee as (
    select d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.documents d
    join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
    join ma_personne mp on mp.id = dl.entite_id
    where d.organization_id = p_org and d.purged_at is null and d.type = 'attestation_assurance' and d.verifie_le is not null
    order by d.verifie_le desc limit 1
  ),
  pieces_bail as (
    select distinct d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.pieces_bail_locataire() pb
    join public.documents d on d.id = pb.document_id
    where pb.organization_id = p_org and d.purged_at is null
  )
  select id, type, titre, mime_type, created_at, expire_le, verifie_le, 'dossier' from dossier
  union
  select av.id, av.type, av.titre, av.mime_type, av.created_at, av.expire_le, av.verifie_le, 'dossier'
  from attestation_validee av
  where not exists (select 1 from dossier x where x.id = av.id)
    and exists (select 1 from dossier x where x.type = 'attestation_assurance' and x.verifie_le is null)
  union
  select pb.id, pb.type, pb.titre, pb.mime_type, pb.created_at, pb.expire_le, pb.verifie_le, 'bail'
  from pieces_bail pb
  where not exists (select 1 from dossier x where x.id = pb.id)
  order by 5 desc;
$$;
revoke execute on function public.mes_pieces_locataire(uuid) from public, anon;

-- L'échéancier gagne au passage le contrôle d'adhésion qui lui manquait
-- (audit S-3) — ouvert actif ET inactif : les quittances restent dues au
-- locataire pendant 10 ans.
create or replace function public.mon_echeancier_locataire(p_org uuid)
returns table (periode date, montant_du numeric, montant_couvert numeric, statut text, quittance_id uuid)
language sql stable security definer set search_path to '' as $$
  select e.periode, e.montant_du, e.montant_couvert, e.statut,
    (select q.id from public.quittances q where q.appel_id = e.appel_id) as quittance_id
  from public.baux b
  cross join lateral public.etat_loyers_bail(b.id) e
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis')
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by e.periode;
$$;
revoke execute on function public.mon_echeancier_locataire(uuid) from public, anon;

create or replace function public.mon_document_locataire(p_org uuid, p_doc uuid)
returns table (document_id uuid, titre text, mime_type text, storage_path text, purged_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select d.id, d.titre, d.mime_type, d.storage_path, d.purged_at
  from public.documents d
  where d.id = p_doc and d.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and (
      (d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
       and exists (
        select 1 from public.document_liens dl
        join public.persons p on p.id = dl.entite_id
        where dl.document_id = d.id and dl.entite = 'personne'
          and p.organization_id = p_org
          and p.account_id = (select auth.uid())))
      or exists (select 1 from public.pieces_bail_locataire() pb
                 where pb.document_id = d.id and pb.organization_id = p_org)
      -- Justificatif d'une retenue du décompte FINALISÉ de mon bail
      or exists (
        select 1 from public.retenues t
        join public.restitutions r on r.id = t.restitution_id and r.statut = 'finalise'
        where t.justificatif_document = d.id
          and r.organization_id = p_org
          and r.bail_id = public.mon_dernier_bail_locataire(p_org))
      -- Justificatif d'une régularisation de charges de mon bail (RM-3.9.5)
      or exists (
        select 1 from public.regularisations_charges rc
        join public.baux b on b.id = rc.bail_id
        join public.persons p on p.organization_id = b.organization_id
                             and p.account_id = (select auth.uid())
        where rc.justificatif_document = d.id
          and b.organization_id = p_org
          and (p.id = b.locataire_principal
               or exists (select 1 from public.bail_personnes bp
                          where bp.bail_id = b.id and bp.person_id = p.id
                            and bp.role = 'colocataire'))));
$$;
revoke execute on function public.mon_document_locataire(uuid, uuid) from public, anon;

-- La policy storage suit : adhésion active OU inactive sur les branches
-- dossier / retenue / régularisation (les pièces du bail vivant gardent leur
-- prédicat)
create or replace function public.chemins_pieces_locataire()
returns setof text
language sql stable security definer set search_path = '' as $$
  select d.storage_path
  from public.pieces_bail_locataire() pb
  join public.documents d on d.id = pb.document_id
  where d.purged_at is null and d.storage_path is not null
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
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  union
  select d.storage_path
  from public.retenues r
  join public.restitutions re on re.id = r.restitution_id and re.statut = 'finalise'
  join public.baux b on b.id = re.bail_id
  join public.documents d on d.id = r.justificatif_document
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'))
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  union
  select d.storage_path
  from public.regularisations_charges rc
  join public.baux b on b.id = rc.bail_id
  join public.documents d on d.id = rc.justificatif_document
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'))
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'));
$$;

-- Le fil de messages reste lisible (l'historique appartient aussi au sorti) ;
-- écrire reste réservé à l'adhésion active (envoyer_message_locataire).
create or replace function public.mes_messages_locataire(p_org uuid)
returns table (id uuid, auteur public.message_auteur, texte text, cree_le timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid;
begin
  v_person := public.ma_personne_espace(p_org);
  if v_person is null then raise exception 'Accès refusé'; end if;
  update public.messages m set lu_le = now()
  where m.organization_id = p_org and m.person_id = v_person
    and m.auteur = 'gerant' and m.lu_le is null;
  return query
    select m.id, m.auteur, m.texte, m.created_at
    from public.messages m
    where m.organization_id = p_org and m.person_id = v_person
    order by m.created_at;
end;
$$;
revoke execute on function public.mes_messages_locataire(uuid) from public, anon;

create or replace function public.messages_non_lus_locataire(p_org uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.messages m
  where m.organization_id = p_org
    and m.person_id = public.ma_personne_espace(p_org)
    and m.auteur = 'gerant' and m.lu_le is null;
$$;
revoke execute on function public.messages_non_lus_locataire(uuid) from public, anon;

-- 3. EDL visibles côté locataire ------------------------------------------
-- L'état des lieux lui est opposable : entrée et sortie de ses baux (y
-- compris après résiliation — la sortie se joue précisément là), avec leur
-- avancement. La signature reste un geste sur place (RM-13.1.6).
create function public.mes_edl_locataire(p_org uuid)
returns table (id uuid, type text, etat text, date_edl date, signe_le timestamptz, bail_id uuid)
language sql stable security definer set search_path = '' as $$
  select e.id, e.type::text, e.etat::text, e.date_edl, e.signe_le, e.bail_id
  from public.etats_des_lieux e
  join public.baux b on b.id = e.bail_id
  where e.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by e.created_at;
$$;
revoke execute on function public.mes_edl_locataire(uuid) from public, anon;
