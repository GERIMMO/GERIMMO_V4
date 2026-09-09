-- ============================================================================
-- Audit fonctionnel 09/09 — P0 : le périmètre du rôle AGENT est appliqué en
-- BASE, plus seulement dans la navigation.
--
-- Constat : un agent sans mandat voyait toute l'agence (lots, baux, compta,
-- personnes) et pouvait préparer des opérations financières globales. La RLS
-- était org-wide pour le rôle agent, et `perimetre_persons_gerant` contenait
-- un repli « aucun mandat → tout voir ».
--
-- Décision (RM-18.1.3 durci) :
--   portefeuille d'un agent = lots des lignes OUVERTES (date_fin null) des
--   mandats dont il est TITULAIRE (mandats.agent_account_id), états
--   brouillon / a_signer / actif / preavis. Zéro mandat → listes vides.
--
-- Trois étages, pour que même une requête forgée soit refusée :
--   1. des policies RLS RESTRICTIVES (lecture) sur les tables métier —
--      elles ne mordent que si l'appelant n'est QU'agent dans l'organisation ;
--   2. un trigger générique de garde sur les mutations des tables
--      financières / vie du bail — il s'applique aussi aux RPC definer ;
--   3. le durcissement des RPC de lecture qui renvoyaient l'organisation
--      entière (quittancement, loyers, totaux, quittance, messages).
-- Admin d'agence, propriétaire direct, super admin et locataires : inchangés.
-- ============================================================================

-- ---------------------------------------------------------------- 1. Helpers
-- L'appelant n'est-il QU'agent dans p_org ? (ni admin, ni PD, ni super admin)
create or replace function public.est_agent_restreint(p_org uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.memberships m
                 where m.account_id = (select auth.uid()) and m.organization_id = p_org
                   and m.status = 'active' and m.role = 'agent')
     and not exists (select 1 from public.memberships m
                 where m.account_id = (select auth.uid()) and m.organization_id = p_org
                   and m.status = 'active' and m.role in ('admin_agence','proprietaire_direct'))
     and not public.is_super_admin();
$$;
revoke execute on function public.est_agent_restreint(uuid) from public, anon;

create or replace function public.lots_de_mon_portefeuille(p_org uuid)
returns setof uuid language sql stable security definer set search_path to '' as $$
  select ml.lot_id
  from public.mandats md
  join public.mandat_lignes ml on ml.mandat_id = md.id and ml.date_fin is null
  where md.organization_id = p_org
    and md.agent_account_id = (select auth.uid())
    and md.etat in ('brouillon','a_signer','actif','preavis');
$$;
revoke execute on function public.lots_de_mon_portefeuille(uuid) from public, anon;

-- Chaque prédicat « hors portefeuille » ne renvoie true QUE pour un agent
-- restreint : pour tous les autres rôles il vaut false et la garde est neutre.
create or replace function public.lot_hors_portefeuille(p_org uuid, p_lot uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.est_agent_restreint(p_org)
     and (p_lot is null
          or p_lot not in (select public.lots_de_mon_portefeuille(p_org)));
$$;
revoke execute on function public.lot_hors_portefeuille(uuid, uuid) from public, anon;

create or replace function public.bail_hors_portefeuille(p_org uuid, p_bail uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.est_agent_restreint(p_org)
     and (p_bail is null
          or not exists (select 1 from public.baux b
                         where b.id = p_bail
                           and b.lot_id in (select public.lots_de_mon_portefeuille(p_org))));
$$;
revoke execute on function public.bail_hors_portefeuille(uuid, uuid) from public, anon;

create or replace function public.bien_hors_portefeuille(p_org uuid, p_bien uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.est_agent_restreint(p_org)
     and (p_bien is null
          or not exists (select 1 from public.lots l
                         where l.bien_id = p_bien
                           and l.id in (select public.lots_de_mon_portefeuille(p_org))));
$$;
revoke execute on function public.bien_hors_portefeuille(uuid, uuid) from public, anon;

create or replace function public.edl_hors_portefeuille(p_org uuid, p_edl uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.est_agent_restreint(p_org)
     and (p_edl is null
          or not exists (select 1 from public.etats_des_lieux e
                         join public.baux b on b.id = e.bail_id
                         where e.id = p_edl
                           and b.lot_id in (select public.lots_de_mon_portefeuille(p_org))));
$$;
revoke execute on function public.edl_hors_portefeuille(uuid, uuid) from public, anon;

create or replace function public.restitution_hors_portefeuille(p_org uuid, p_restitution uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.est_agent_restreint(p_org)
     and (p_restitution is null
          or not exists (select 1 from public.restitutions r
                         join public.baux b on b.id = r.bail_id
                         where r.id = p_restitution
                           and b.lot_id in (select public.lots_de_mon_portefeuille(p_org))));
$$;
revoke execute on function public.restitution_hors_portefeuille(uuid, uuid) from public, anon;

create or replace function public.mandat_hors_portefeuille(p_org uuid, p_mandat uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.est_agent_restreint(p_org)
     and (p_mandat is null
          or not exists (select 1 from public.mandats md
                         where md.id = p_mandat
                           and md.agent_account_id = (select auth.uid())));
$$;
revoke execute on function public.mandat_hors_portefeuille(uuid, uuid) from public, anon;

-- ---------------------------------------- 2. Périmètre personnes, sans repli
-- AVANT : « aucun mandat → toutes les personnes ». APRÈS : un agent ne voit
-- que les locataires/garants des baux de ses lots, les mandants de ses
-- mandats et les propriétaires (détentions) de ses lots. Zéro mandat → vide.
create or replace function public.perimetre_persons_gerant(p_org uuid)
returns table(person_id uuid)
language sql stable security definer set search_path to '' as $$
  select p.id from public.persons p
  where p.organization_id = p_org
    and (
      exists (select 1 from public.memberships m
              where m.account_id = (select auth.uid())
                and m.organization_id = p_org and m.status = 'active'
                and m.role in ('admin_agence', 'proprietaire_direct'))
      or public.is_super_admin()
      or exists (
        select 1 from public.baux b
        where b.organization_id = p_org
          and b.lot_id in (select public.lots_de_mon_portefeuille(p_org))
          and (b.locataire_principal = p.id
               or exists (select 1 from public.bail_personnes bp
                          where bp.bail_id = b.id and bp.person_id = p.id)))
      or exists (
        select 1 from public.mandats md
        where md.organization_id = p_org
          and md.agent_account_id = (select auth.uid())
          and md.etat in ('brouillon','a_signer','actif','preavis')
          and md.person_id = p.id)
      or exists (
        select 1 from public.detentions dt
        where dt.organization_id = p_org and dt.date_fin is null
          and dt.lot_id in (select public.lots_de_mon_portefeuille(p_org))
          and dt.person_id = p.id)
    );
$$;

create or replace function public.person_hors_portefeuille(p_org uuid, p_person uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.est_agent_restreint(p_org)
     and (p_person is null
          or p_person not in (select pp.person_id from public.perimetre_persons_gerant(p_org) pp));
$$;
revoke execute on function public.person_hors_portefeuille(uuid, uuid) from public, anon;

-- Un document est du portefeuille s'il est rattaché (document_liens) à un
-- lot, un bail, une personne ou un mandat du périmètre.
create or replace function public.document_dans_portefeuille(p_org uuid, p_doc uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.document_liens dl
    where dl.document_id = p_doc
      and (
        (dl.entite = 'lot' and not public.lot_hors_portefeuille(p_org, dl.entite_id))
        or (dl.entite = 'bail' and not public.bail_hors_portefeuille(p_org, dl.entite_id))
        or (dl.entite = 'personne' and not public.person_hors_portefeuille(p_org, dl.entite_id))
        or (dl.entite = 'mandat' and not public.mandat_hors_portefeuille(p_org, dl.entite_id))
      )
  );
$$;
revoke execute on function public.document_dans_portefeuille(uuid, uuid) from public, anon;

-- Une alerte « pour tous » reste visible d'un agent si son objet (details)
-- est du portefeuille — ou si elle ne cible aucun objet rattachable.
create or replace function public.alerte_dans_portefeuille(p_org uuid, p_details jsonb)
returns boolean language sql stable security definer set search_path to '' as $$
  select case
    when p_details ? 'bail_id' then not public.bail_hors_portefeuille(p_org, (p_details->>'bail_id')::uuid)
    when p_details ? 'lot_id' then not public.lot_hors_portefeuille(p_org, (p_details->>'lot_id')::uuid)
    when p_details ? 'person_id' then not public.person_hors_portefeuille(p_org, (p_details->>'person_id')::uuid)
    else true
  end;
$$;
revoke execute on function public.alerte_dans_portefeuille(uuid, jsonb) from public, anon;

-- ------------------------------------------- 3. Garde générique des mutations
-- Posée en trigger : elle s'applique à TOUTES les voies d'écriture — RLS,
-- RPC definer, requête forgée. Sur UPDATE, l'ancienne ET la nouvelle version
-- doivent être du portefeuille (pas de déplacement d'objet hors périmètre).
create or replace function public.garde_portefeuille_agent()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  v_rows jsonb[];
  j jsonb;
  v_org uuid;
begin
  if tg_op = 'INSERT' then v_rows := array[to_jsonb(new)];
  elsif tg_op = 'DELETE' then v_rows := array[to_jsonb(old)];
  else v_rows := array[to_jsonb(old), to_jsonb(new)];
  end if;

  foreach j in array v_rows loop
    v_org := (j->>'organization_id')::uuid;
    if v_org is null or not public.est_agent_restreint(v_org) then
      continue;
    end if;
    if tg_table_name in ('mandats', 'mandat_lignes') then
      raise exception 'Les mandats sont gérés par l''administrateur de l''agence';
    elsif tg_table_name = 'lots' then
      if public.lot_hors_portefeuille(v_org, (j->>'id')::uuid) then
        raise exception 'Ce lot est hors de votre portefeuille (mandats dont vous êtes titulaire)';
      end if;
    elsif (j->>'bail_id') is not null then
      if public.bail_hors_portefeuille(v_org, (j->>'bail_id')::uuid) then
        raise exception 'Ce bail est hors de votre portefeuille';
      end if;
    elsif (j->>'lot_id') is not null then
      if public.lot_hors_portefeuille(v_org, (j->>'lot_id')::uuid) then
        raise exception 'Ce lot est hors de votre portefeuille';
      end if;
    elsif j ? 'edl_id' then
      if public.edl_hors_portefeuille(v_org, (j->>'edl_id')::uuid) then
        raise exception 'Cet état des lieux est hors de votre portefeuille';
      end if;
    elsif j ? 'restitution_id' then
      if public.restitution_hors_portefeuille(v_org, (j->>'restitution_id')::uuid) then
        raise exception 'Cette restitution est hors de votre portefeuille';
      end if;
    elsif j ? 'mandat_id' then
      if public.mandat_hors_portefeuille(v_org, (j->>'mandat_id')::uuid) then
        raise exception 'Ce mandat est hors de votre portefeuille';
      end if;
    elsif (j->>'person_id') is not null then
      if public.person_hors_portefeuille(v_org, (j->>'person_id')::uuid) then
        raise exception 'Cette personne est hors de votre portefeuille';
      end if;
    else
      raise exception 'Opération réservée à l''administrateur de l''agence';
    end if;
  end loop;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'lots','baux','bail_personnes','appels_loyer','encaissements','quittances',
    'depot_encaissements','ecritures','conges','etats_des_lieux','edl_lignes',
    'restitutions','retenues','relances','revisions_loyer','inventaire_lignes',
    'diagnostics','messages','mandats','mandat_lignes','rapports_gestion',
    'detentions','clotures_comptables'
  ] loop
    execute format('drop trigger if exists garde_portefeuille_agent on public.%I', t);
    execute format(
      'create trigger garde_portefeuille_agent
         before insert or update or delete on public.%I
         for each row execute function public.garde_portefeuille_agent()', t);
  end loop;
end $$;

-- ------------------------------------------ 4. Policies RESTRICTIVES lecture
-- Elles se combinent en ET avec les policies permissives existantes : rien ne
-- change pour les autres rôles, l'agent restreint est réduit au portefeuille.
drop policy if exists lots_agent_portefeuille on public.lots;
create policy lots_agent_portefeuille on public.lots
  as restrictive for select to authenticated
  using (not public.lot_hors_portefeuille(organization_id, id));

drop policy if exists biens_agent_portefeuille on public.biens;
create policy biens_agent_portefeuille on public.biens
  as restrictive for select to authenticated
  using (not public.bien_hors_portefeuille(organization_id, id));

drop policy if exists baux_agent_portefeuille on public.baux;
create policy baux_agent_portefeuille on public.baux
  as restrictive for select to authenticated
  using (not public.lot_hors_portefeuille(organization_id, lot_id));

do $$
declare t text;
begin
  -- Tables filles d'un bail : même prédicat
  foreach t in array array[
    'bail_personnes','appels_loyer','encaissements','quittances',
    'depot_encaissements','conges','etats_des_lieux','restitutions',
    'relances','revisions_loyer','inventaire_lignes'
  ] loop
    execute format('drop policy if exists %I_agent_portefeuille on public.%I', t, t);
    execute format(
      'create policy %I_agent_portefeuille on public.%I
         as restrictive for select to authenticated
         using (not public.bail_hors_portefeuille(organization_id, bail_id))', t, t);
  end loop;
end $$;

drop policy if exists ecritures_agent_portefeuille on public.ecritures;
create policy ecritures_agent_portefeuille on public.ecritures
  as restrictive for select to authenticated
  using (
    not public.est_agent_restreint(organization_id)
    or (lot_id is not null and not public.lot_hors_portefeuille(organization_id, lot_id))
  );

drop policy if exists edl_lignes_agent_portefeuille on public.edl_lignes;
create policy edl_lignes_agent_portefeuille on public.edl_lignes
  as restrictive for select to authenticated
  using (not public.edl_hors_portefeuille(organization_id, edl_id));

drop policy if exists retenues_agent_portefeuille on public.retenues;
create policy retenues_agent_portefeuille on public.retenues
  as restrictive for select to authenticated
  using (not public.restitution_hors_portefeuille(organization_id, restitution_id));

drop policy if exists diagnostics_agent_portefeuille on public.diagnostics;
create policy diagnostics_agent_portefeuille on public.diagnostics
  as restrictive for select to authenticated
  using (
    not public.est_agent_restreint(organization_id)
    or (lot_id is not null and not public.lot_hors_portefeuille(organization_id, lot_id))
    or (bien_id is not null and not public.bien_hors_portefeuille(organization_id, bien_id))
  );

drop policy if exists detentions_agent_portefeuille on public.detentions;
create policy detentions_agent_portefeuille on public.detentions
  as restrictive for select to authenticated
  using (not public.lot_hors_portefeuille(organization_id, lot_id));

-- Personnes : lecture, modification et suppression au périmètre ; la CRÉATION
-- reste permise (création rapide d'un locataire depuis le bail — la fiche
-- entre dans le périmètre dès son rattachement au bail du portefeuille).
drop policy if exists persons_agent_portefeuille on public.persons;
create policy persons_agent_portefeuille on public.persons
  as restrictive for select to authenticated
  using (not public.person_hors_portefeuille(organization_id, id));
drop policy if exists persons_agent_portefeuille_maj on public.persons;
create policy persons_agent_portefeuille_maj on public.persons
  as restrictive for update to authenticated
  using (not public.person_hors_portefeuille(organization_id, id));
drop policy if exists persons_agent_portefeuille_suppr on public.persons;
create policy persons_agent_portefeuille_suppr on public.persons
  as restrictive for delete to authenticated
  using (not public.person_hors_portefeuille(organization_id, id));

drop policy if exists messages_agent_portefeuille on public.messages;
create policy messages_agent_portefeuille on public.messages
  as restrictive for select to authenticated
  using (not public.person_hors_portefeuille(organization_id, person_id));

drop policy if exists mandats_agent_portefeuille on public.mandats;
create policy mandats_agent_portefeuille on public.mandats
  as restrictive for select to authenticated
  using (
    not public.est_agent_restreint(organization_id)
    or agent_account_id = (select auth.uid())
  );

drop policy if exists mandat_lignes_agent_portefeuille on public.mandat_lignes;
create policy mandat_lignes_agent_portefeuille on public.mandat_lignes
  as restrictive for select to authenticated
  using (not public.mandat_hors_portefeuille(organization_id, mandat_id));

drop policy if exists rapports_gestion_agent_portefeuille on public.rapports_gestion;
create policy rapports_gestion_agent_portefeuille on public.rapports_gestion
  as restrictive for select to authenticated
  using (not public.mandat_hors_portefeuille(organization_id, mandat_id));

-- Documents : visibles s'ils sont rattachés au portefeuille ou déposés par
-- l'agent lui-même ; un document d'agence sans rattachement reste à l'admin.
drop policy if exists documents_agent_portefeuille on public.documents;
create policy documents_agent_portefeuille on public.documents
  as restrictive for select to authenticated
  using (
    not public.est_agent_restreint(organization_id)
    or deposited_by = (select auth.uid())
    or public.document_dans_portefeuille(organization_id, id)
  );
drop policy if exists documents_agent_portefeuille_maj on public.documents;
create policy documents_agent_portefeuille_maj on public.documents
  as restrictive for update to authenticated
  using (
    not public.est_agent_restreint(organization_id)
    or deposited_by = (select auth.uid())
    or public.document_dans_portefeuille(organization_id, id)
  );

drop policy if exists document_liens_agent_portefeuille on public.document_liens;
create policy document_liens_agent_portefeuille on public.document_liens
  as restrictive for select to authenticated
  using (
    not public.est_agent_restreint(organization_id)
    or public.document_dans_portefeuille(organization_id, document_id)
  );

-- Alertes : celles qui me sont assignées, et les « pour tous » dont l'objet
-- est du portefeuille (ou sans objet rattachable).
drop policy if exists alerts_agent_portefeuille on public.alerts;
create policy alerts_agent_portefeuille on public.alerts
  as restrictive for select to authenticated
  using (
    not public.est_agent_restreint(organization_id)
    or assignee_account_id = (select auth.uid())
    or (assigned_all and public.alerte_dans_portefeuille(organization_id, details))
  );
drop policy if exists alerts_agent_portefeuille_maj on public.alerts;
create policy alerts_agent_portefeuille_maj on public.alerts
  as restrictive for update to authenticated
  using (
    not public.est_agent_restreint(organization_id)
    or assignee_account_id = (select auth.uid())
    or (assigned_all and public.alerte_dans_portefeuille(organization_id, details))
  );

-- --------------------------- 5. RPC de lecture : plus jamais l'agence entière
-- quittancement_mois : le tableau du mois est réduit aux baux du portefeuille.
create or replace function public.quittancement_mois(p_org uuid, p_mois date)
returns table(bail_id uuid, appel_id uuid, lot_id uuid, lot_nom text, locataire text, montant_du numeric, montant_couvert numeric, statut text, quittance_id uuid, est_quittance boolean, email_envoye_at timestamp with time zone)
language sql stable security definer set search_path to '' as $function$
  select
    b.id, e.appel_id, l.id, l.nom,
    nullif(trim(coalesce(p.prenom || ' ', '') || coalesce(p.nom, '')), ''),
    e.montant_du, e.montant_couvert, e.statut,
    q.id, q.est_quittance, q.email_envoye_at
  from public.baux b
  join public.lots l on l.id = b.lot_id
  left join public.persons p on p.id = b.locataire_principal
  cross join lateral public.etat_loyers_bail(b.id) e
  left join public.quittances q on q.appel_id = e.appel_id
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis')
    and e.periode = date_trunc('month', p_mois)::date
    and b.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and not public.bail_hors_portefeuille(p_org, b.id)
  order by 5 nulls last, 4;
$function$;

-- etat_loyers_bail : un bail hors portefeuille ne livre plus son échéancier.
create or replace function public.etat_loyers_bail(p_bail uuid)
returns table(appel_id uuid, periode date, date_echeance date, montant_du numeric, cumul_du numeric, montant_couvert numeric, statut text)
language sql stable security definer set search_path to '' as $function$
  with garde as (
    select not public.bail_hors_portefeuille(b.organization_id, b.id) as ok
    from public.baux b where b.id = p_bail
  ), a as (
    select id, periode, date_echeance, montant_du,
      sum(montant_du) over (order by periode rows between unbounded preceding and current row) as cumul_du
    from public.appels_loyer where bail_id = p_bail
  ), tot as (
    select coalesce(sum(montant), 0) as encaisse from public.encaissements where bail_id = p_bail
  )
  select
    a.id, a.periode, a.date_echeance, a.montant_du, a.cumul_du,
    round(least(a.montant_du, greatest(0, tot.encaisse - (a.cumul_du - a.montant_du))), 2) as montant_couvert,
    case
      when tot.encaisse >= a.cumul_du then 'paye'
      when tot.encaisse > (a.cumul_du - a.montant_du) then 'partiel'
      when a.date_echeance < current_date then 'impaye'
      else 'attendu'
    end as statut
  from a, tot
  where (select ok from garde)
  order by a.periode;
$function$;

-- totaux_ecritures : les totaux d'un agent sont ceux de son portefeuille,
-- même si p_lots est forgé ; les écritures d'agence (sans lot) en sont exclues.
create or replace function public.totaux_ecritures(p_org uuid, p_lots uuid[] default null::uuid[])
returns table(recettes numeric, depenses numeric)
language sql stable security definer set search_path to '' as $function$
  select coalesce(sum(e.montant) filter (where e.sens = 'recette'), 0),
         coalesce(sum(e.montant) filter (where e.sens = 'depense'), 0)
  from public.ecritures e
  where e.organization_id = p_org
    and p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and e.categorie <> 'depot_garantie'
    and e.contre_ecriture_de is null
    and not exists (select 1 from public.ecritures c where c.contre_ecriture_de = e.id)
    and (p_lots is null or e.lot_id = any(p_lots))
    and (not public.est_agent_restreint(p_org)
         or (e.lot_id is not null and not public.lot_hors_portefeuille(p_org, e.lot_id)));
$function$;

-- quittance_detail : la branche gérant respecte le portefeuille (la branche
-- locataire est inchangée).
create or replace function public.quittance_detail(p_quittance uuid)
returns table(emetteur text, proprietaire text, locataire text, adresse text, lot_nom text, periode date, loyer_hc numeric, charges numeric, montant numeric, est_quittance boolean, date_emission date)
language sql stable security definer set search_path to '' as $function$
  select
    o.name,
    (select string_agg(p.nom || coalesce(' ' || p.prenom, ''), ', ')
       from public.detentions d join public.persons p on p.id = d.person_id
      where d.lot_id = l.id and d.date_fin is null),
    (loc.nom || coalesce(' ' || loc.prenom, '')),
    (b2.address_line1 || coalesce(', ' || b2.address_line2, '') || ', ' || b2.postal_code || ' ' || b2.city),
    l.nom, a.periode, a.loyer_hc, a.charges, q.montant, q.est_quittance, q.date_emission
  from public.quittances q
  join public.appels_loyer a on a.id = q.appel_id
  join public.baux b on b.id = q.bail_id
  join public.lots l on l.id = b.lot_id
  join public.biens b2 on b2.id = l.bien_id
  join public.organizations o on o.id = q.organization_id
  join public.persons loc on loc.id = b.locataire_principal
  where q.id = p_quittance
    and (
      (q.organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
       and not public.bail_hors_portefeuille(q.organization_id, q.bail_id))
      or exists (
        select 1 from public.persons p
        where p.organization_id = q.organization_id
          and p.account_id = (select auth.uid())
          and (p.id = b.locataire_principal
               or exists (select 1 from public.bail_personnes bp
                          where bp.bail_id = b.id and bp.person_id = p.id
                            and bp.role = 'colocataire')))
    );
$function$;

-- messages_personne / repondre_message_personne : garde sur la personne.
create or replace function public.messages_personne(p_org uuid, p_person uuid)
returns table(id uuid, auteur public.message_auteur, texte text, cree_le timestamp with time zone, lu_le timestamp with time zone)
language plpgsql security definer set search_path to '' as $function$
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if public.person_hors_portefeuille(p_org, p_person) then
    raise exception 'Cette personne est hors de votre portefeuille';
  end if;
  update public.messages m set lu_le = now()
  where m.organization_id = p_org and m.person_id = p_person
    and m.auteur = 'locataire' and m.lu_le is null;
  return query
    select m.id, m.auteur, m.texte, m.created_at, m.lu_le
    from public.messages m
    where m.organization_id = p_org and m.person_id = p_person
    order by m.created_at;
end;
$function$;

create or replace function public.repondre_message_personne(p_org uuid, p_person uuid, p_texte text)
returns uuid
language plpgsql security definer set search_path to '' as $function$
declare
  v_message uuid;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if public.person_hors_portefeuille(p_org, p_person) then
    raise exception 'Cette personne est hors de votre portefeuille';
  end if;
  if length(trim(coalesce(p_texte, ''))) = 0 then
    raise exception 'Écrivez votre réponse avant d''envoyer';
  end if;
  if not exists (select 1 from public.persons p
                 where p.id = p_person and p.organization_id = p_org) then
    raise exception 'Personne introuvable';
  end if;
  insert into public.messages (organization_id, person_id, auteur, auteur_account_id, texte)
  values (p_org, p_person, 'gerant', (select auth.uid()), trim(p_texte))
  returning id into v_message;
  -- La réponse solde l'alerte — sinon, dédoublonnée sur « alerte ouverte »,
  -- elle étouffait la notification de tous les messages suivants.
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
         closed_action = 'Réponse envoyée au locataire'
   where organization_id = p_org and statut = 'ouverte'
     and type = 'message_locataire'
     and (details ->> 'person_id')::uuid = p_person;
  return v_message;
end;
$function$;
