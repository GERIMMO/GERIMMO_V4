-- Corrections de l'audit de vérification du 06/09 (vague chantiers + vitrine).
--
--  1. terminer_bail : le geste de clôture qui manquait — sans lui, l'état
--     « locataire sorti » (lecture seule) n'était atteignable par aucun
--     parcours. Exigences : bail en préavis, EDL de sortie SIGNÉ (RM-3.11.2 :
--     le solde vient après l'état des lieux). Le bail passe à « termine »,
--     le lot redevient disponible, les adhésions locataire des personnes du
--     bail sans autre bail vivant passent à « inactive » (l'espace reste
--     consultable — chantier D2), les alertes du bail se ferment.
--  2. mon_echeancier_locataire inclut les baux terminés : les quittances
--     restent dues au locataire pendant 10 ans (décision 25/07).
--  3. mon_gestionnaire_locataire et mes_incidents_locataire s'ouvrent à
--     l'adhésion inactive (lecture du sorti).
--  4. mon_conge_locataire : l'alerte d'intention se dédoublonne PAR PERSONNE
--     (le mot d'un second colocataire n'était jamais transmis) et se ferme
--     aussi si l'intention est annulée par le gérant via enregistrer_conge.
--  5. mes_edl_locataire filtré sur le dernier bail (les EDL d'un ancien bail
--     dans la même agence ne se mélangent plus) ; mon_intention_conge rend
--     l'intention EN ATTENTE en priorité ; mon_espace_locataire ordonné.
--  6. appliquer_retention purge les demandes de devis (24 mois) et les
--     intentions de congé traitées (24 mois) — données personnelles sans
--     règle jusqu'ici.

-- 1. terminer_bail ---------------------------------------------------------
create function public.terminer_bail(p_bail uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_bail record;
begin
  select b.* into v_bail from public.baux b where b.id = p_bail;
  if v_bail.id is null then raise exception 'Bail introuvable'; end if;
  if not (v_bail.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_bail.etat <> 'preavis' then
    raise exception 'Seul un bail en préavis se clôture — enregistrez d''abord le congé';
  end if;
  if not exists (select 1 from public.etats_des_lieux e
                 where e.bail_id = p_bail and e.type = 'sortie' and e.etat = 'signe') then
    raise exception 'Clôture impossible sans état des lieux de sortie signé (RM-3.11.2)';
  end if;

  update public.baux set etat = 'termine', updated_at = now() where id = p_bail;
  update public.lots set etat = 'disponible'
   where id = v_bail.lot_id and etat in ('loue', 'preavis');

  -- Les personnes du bail sans autre bail vivant perdent le geste, pas la
  -- lecture : adhésion locataire désactivée (espace en consultation, D2)
  update public.memberships m
     set status = 'inactive'
   where m.organization_id = v_bail.organization_id
     and m.role = 'locataire' and m.status = 'active'
     and m.account_id in (
       select p.account_id from public.persons p
       where p.organization_id = v_bail.organization_id
         and p.account_id is not null
         and (p.id = v_bail.locataire_principal
              or exists (select 1 from public.bail_personnes bp
                         where bp.bail_id = p_bail and bp.person_id = p.id)))
     and not exists (
       select 1 from public.baux b2
       join public.persons p2 on p2.account_id = m.account_id
                             and p2.organization_id = b2.organization_id
       where b2.organization_id = v_bail.organization_id
         and b2.etat in ('actif', 'preavis')
         and (b2.locataire_principal = p2.id
              or exists (select 1 from public.bail_personnes bp2
                         where bp2.bail_id = b2.id and bp2.person_id = p2.id)));

  -- Les alertes encore ouvertes du bail (EDL de sortie, intention) se ferment
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
         closed_action = 'Bail clôturé'
   where organization_id = v_bail.organization_id and statut = 'ouverte'
     and details ->> 'bail_id' = p_bail::text
     and type in ('edl_sortie', 'edl_entree', 'conge_intention');
end;
$$;
revoke execute on function public.terminer_bail(uuid) from public, anon;

-- 2. Quittances : 10 ans, baux terminés compris ---------------------------
create or replace function public.mon_echeancier_locataire(p_org uuid)
returns table (periode date, montant_du numeric, montant_couvert numeric, statut text, quittance_id uuid)
language sql stable security definer set search_path to '' as $$
  select e.periode, e.montant_du, e.montant_couvert, e.statut,
    (select q.id from public.quittances q where q.appel_id = e.appel_id) as quittance_id
  from public.baux b
  cross join lateral public.etat_loyers_bail(b.id) e
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis', 'termine')
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

-- 3. Lecture du sorti : gestionnaire et incidents -------------------------
create or replace function public.mon_gestionnaire_locataire(p_org uuid)
returns table (agence text, telephone text, email_contact text, agent_email text)
language sql stable security definer set search_path to '' as $$
  select o.name, o.telephone, o.email_contact,
    (select a.email
     from public.baux b
     join public.mandat_lignes ml on ml.lot_id = b.lot_id and ml.date_fin is null
     join public.mandats m on m.id = ml.mandat_id and m.etat = 'actif'
     join public.accounts a on a.id = m.agent_account_id
     where b.organization_id = p_org and b.etat in ('actif', 'preavis')
       and exists (
         select 1 from public.persons p
         where p.organization_id = p_org and p.account_id = (select auth.uid())
           and (p.id = b.locataire_principal
                or exists (select 1 from public.bail_personnes bp
                           where bp.bail_id = b.id and bp.person_id = p.id
                             and bp.role = 'colocataire')))
     order by b.created_at desc limit 1)
  from public.organizations o
  where o.id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'));
$$;
revoke execute on function public.mon_gestionnaire_locataire(uuid) from public, anon;

create or replace function public.mes_incidents_locataire(p_org uuid)
returns table (id uuid, numero text, categorie text, piece text, description text,
               anciennete text, urgence public.incident_urgence, etat public.incident_etat,
               imputation public.incident_imputation, imputation_justification text,
               imputation_contestee_le timestamptz, cloture_motif public.incident_cloture,
               clos_le timestamptz, declare_le timestamptz, lot_nom text,
               nb_photos bigint, est_declarant boolean)
language sql stable security definer set search_path to '' as $$
  with mes_fiches as (
    select p.id from public.persons p
    where p.organization_id = p_org and p.account_id = (select auth.uid())
  ),
  mes_baux as (
    select b.id from public.baux b
    where b.organization_id = p_org and b.etat in ('actif', 'preavis')
      and (b.locataire_principal in (select id from mes_fiches)
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.role = 'colocataire'
                        and bp.person_id in (select id from mes_fiches)))
  )
  select i.id, i.numero, i.categorie, i.piece, i.description, i.anciennete,
         i.urgence, i.etat, i.imputation, i.imputation_justification,
         i.imputation_contestee_le, i.cloture_motif, i.clos_le, i.created_at,
         l.nom,
         (select count(*) from public.document_liens dl
            join public.documents d on d.id = dl.document_id and d.purged_at is null
          where dl.organization_id = p_org
            and dl.entite = 'incident' and dl.entite_id = i.id),
         (i.declarant_person_id in (select id from mes_fiches))
  from public.incidents i
  join public.lots l on l.id = i.lot_id
  where i.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and (i.declarant_person_id in (select id from mes_fiches)
         or i.bail_id in (select id from mes_baux))
  order by (i.etat = 'clos'), i.created_at desc;
$$;
revoke execute on function public.mes_incidents_locataire(uuid) from public, anon;

-- 4. Intention de congé : dédoublonnage PAR PERSONNE ----------------------
create or replace function public.mon_conge_locataire(p_org uuid, p_motif text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_bail record;
  v_person uuid;
  v_intention uuid;
begin
  v_person := public.ma_personne_locataire(p_org);
  if v_person is null then
    raise exception 'Aucune fiche rattachée à votre compte dans cette agence';
  end if;
  select b.* into v_bail
  from public.baux b
  where b.organization_id = p_org and b.etat = 'actif'
    and (b.locataire_principal = v_person
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = v_person
                      and bp.role = 'colocataire'))
  order by b.created_at desc limit 1;
  if v_bail.id is null then
    raise exception 'Aucun bail actif à votre nom — contactez votre gestionnaire';
  end if;
  if exists (select 1 from public.intentions_conge i
             where i.bail_id = v_bail.id and i.person_id = v_person
               and i.traitee_le is null) then
    raise exception 'Votre demande est déjà transmise — votre gestionnaire la confirmera à réception de votre lettre recommandée';
  end if;

  insert into public.intentions_conge (organization_id, bail_id, person_id, motif)
  values (p_org, v_bail.id, v_person,
          nullif(trim(coalesce(p_motif, '')), ''))
  returning id into v_intention;

  -- Une alerte par personne : le mot d'un second colocataire compte aussi
  if not exists (select 1 from public.alerts a
                 where a.organization_id = p_org and a.statut = 'ouverte'
                   and a.type = 'conge_intention'
                   and a.details ->> 'bail_id' = v_bail.id::text
                   and a.details ->> 'person_id' = v_person::text) then
    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (p_org, 'conge_intention', 'normale',
            'Intention de congé du locataire — lettre recommandée à venir',
            jsonb_build_object('bail_id', v_bail.id, 'lot_id', v_bail.lot_id,
                               'intention_id', v_intention, 'person_id', v_person,
                               'motif', nullif(trim(coalesce(p_motif, '')), '')));
  end if;
  return v_intention;
end;
$$;
revoke execute on function public.mon_conge_locataire(uuid, text) from public, anon;

-- 5. Lectures affinées ----------------------------------------------------
create or replace function public.mes_edl_locataire(p_org uuid)
returns table (id uuid, type text, etat text, date_edl date, signe_le timestamptz, bail_id uuid)
language sql stable security definer set search_path = '' as $$
  select e.id, e.type::text, e.etat::text, e.date_edl, e.signe_le, e.bail_id
  from public.etats_des_lieux e
  where e.organization_id = p_org
    and e.bail_id = public.mon_dernier_bail_locataire(p_org)
  order by e.created_at;
$$;
revoke execute on function public.mes_edl_locataire(uuid) from public, anon;

create or replace function public.mon_intention_conge(p_org uuid)
returns table (id uuid, created_at timestamptz, motif text, traitee_le timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.created_at, i.motif, i.traitee_le
  from public.intentions_conge i
  where i.organization_id = p_org
    and i.person_id = public.ma_personne_locataire(p_org)
  order by (i.traitee_le is null) desc, i.created_at desc
  limit 1;
$$;
revoke execute on function public.mon_intention_conge(uuid) from public, anon;

create or replace function public.mon_espace_locataire(p_org uuid)
returns table (organisation_nom text, person_id uuid, nom text, prenom text, adhesion_active boolean)
language sql stable security definer set search_path = '' as $$
  select o.name, p.id, p.nom, p.prenom, (m.status = 'active')
  from public.memberships m
  join public.organizations o on o.id = m.organization_id
  left join public.persons p on p.organization_id = m.organization_id
                            and p.account_id = m.account_id
  where m.organization_id = p_org
    and m.account_id = (select auth.uid())
    and m.role = 'locataire'
    and m.status in ('active', 'inactive')
  order by p.created_at
  limit 1;
$$;
revoke execute on function public.mon_espace_locataire(uuid) from public, anon;

-- 6. Rétention des données de prospection et d'intention ------------------
create or replace function public.appliquer_retention()
returns jsonb
language plpgsql security definer set search_path to '' as $function$
declare
  v_regle record;
  v_doc record;
  v_docs_purges int := 0;
  v_journaux jsonb := '{}'::jsonb;
  v_count bigint;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'appliquer_retention: reserve au super admin';
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:tech_log' and actif;
  if found then
    delete from public.tech_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('tech_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:acces_pieces' and actif;
  if found then
    delete from public.acces_pieces_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('acces_pieces_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:audit_log' and actif;
  if found then
    delete from public.audit_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('audit_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'alerte:traitee' and actif;
  if found then
    delete from public.alerts
      where statut = 'fermee'
        and closed_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('alertes', v_count);
  end if;

  -- Prospection (vitrine) : une demande de devis est une donnée personnelle
  -- sans autre base que le recontact — 24 mois puis suppression.
  delete from public.demandes_devis
    where created_at < now() - make_interval(months => 24);
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('demandes_devis', v_count);

  -- Intentions de congé traitées : le congé (conges) fait foi, le mot du
  -- locataire n'a plus d'usage — 24 mois puis suppression.
  delete from public.intentions_conge
    where traitee_le is not null
      and traitee_le < now() - make_interval(months => 24);
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('intentions_conge', v_count);

  for v_doc in
    select d.id, d.organization_id, d.type, d.storage_path, r.sort, r.data_type
    from public.documents d
    join public.retention_rules r
      on r.data_type = 'document:' || d.type::text and r.actif
    where d.purged_at is null
      and r.sort in ('suppression', 'anonymisation')
      and d.retention_reference_date + make_interval(months => r.duree_mois) <= now()
  loop
    insert into public.purge_fichiers (storage_path) values (v_doc.storage_path);
    delete from public.document_liens where document_id = v_doc.id;
    update public.documents
      set purged_at = now(), storage_path = null, mime_type = null,
          taille_octets = null, empreinte = null, titre = null,
          deposited_by = null
      where id = v_doc.id;
    insert into public.audit_log (account_id, organization_id, action, details)
    values ((select auth.uid()), v_doc.organization_id, 'purge_retention',
            jsonb_build_object('document_id', v_doc.id, 'type', v_doc.type,
                               'regle', v_doc.data_type, 'sort', v_doc.sort));
    v_docs_purges := v_docs_purges + 1;
  end loop;

  return jsonb_build_object('journaux', v_journaux, 'documents_purges', v_docs_purges,
                            'fichiers_en_attente', (select count(*) from public.purge_fichiers where deleted_at is null));
end;
$function$;
