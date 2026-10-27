-- Retour de 20261027100100_incident_gerant_bail_explicite.sql (audit PR #264, FL-01).
-- Remettre le code précédent avant ce retour : l'écran « Déclarer un incident » transmet `p_bail`, que la signature
-- d'avant ne connaît pas. Aucune donnée n'est modifiée. Les incidents ouverts par le gérant entre-temps gardent un
-- déclarant vide : leur locataire les voit toujours par son bail en cours, mais, revenu à la règle d'avant (déclarant
-- seul), il ne peut plus en contester l'imputation ni les rouvrir depuis son espace, et la fenêtre de son lot ne les
-- compte plus (signalements en cours, historique). Le retour rétablit aussi le rattachement au bail vivant le plus
-- récent du lot, c'est-à-dire le défaut FL-01.
-- Les quatre fonctions refaites en entier reprennent leur définition installée avant la migration (texte de
-- 20260821141744 et 20260906140000, garde de portefeuille de 20260913150000) ; `fiche_lot` et `historique_du_lot`
-- retrouvent leur filtre par le déclarant par relecture de la définition en vigueur, comme 20261014502000 et son retour.
-- Une seule instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe,
-- qu'elle ne valide jamais.
do $retour_atomique$
declare
  -- Fenêtre du lot : signature, filtre FL-01, filtre d'avant, nombre exact d'occurrences.
  v_cibles constant text[][] := array[
    ['public.fiche_lot(uuid)',
     'public.titulaire_incident(i.declarant_person_id, i.canal, i.bail_id) = public.ma_personne_locataire(l.organization_id)',
     'i.declarant_person_id = public.ma_personne_locataire(l.organization_id)',
     '1'],
    ['public.historique_du_lot(uuid,integer)',
     'public.titulaire_incident(i.declarant_person_id, i.canal, i.bail_id) = public.ma_personne_locataire(r.org)',
     'i.declarant_person_id = public.ma_personne_locataire(r.org)',
     '2']
  ];
  v_i integer;
  v_oid regprocedure;
  v_def text;
  v_nb integer;
begin
  perform set_config('lock_timeout', '10s', true);

  drop function if exists public.ouvrir_incident_agence(uuid, uuid, text, text, text, text, public.incident_urgence, uuid);
  create or replace function public.ouvrir_incident_agence(
    p_org uuid, p_lot uuid, p_categorie text, p_description text,
    p_piece text, p_anciennete text, p_urgence public.incident_urgence
  )
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
  as $fonction$
  declare
    v_lot record;
    v_bail record;
  begin
    -- Périmètre incident de l'agent (recette 13/09).
    if public.lot_hors_portefeuille(p_org, p_lot) then
      raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
    end if;
    if not (p_org in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
      raise exception 'Accès refusé';
    end if;
    select id, etat into v_lot from public.lots
    where id = p_lot and organization_id = p_org;
    if v_lot.id is null then
      raise exception 'Lot introuvable dans cette agence';
    end if;
    if v_lot.etat = 'archive' then
      raise exception 'Ce lot est archivé — aucun incident ne peut y être ouvert';
    end if;

    select b.id, b.locataire_principal into v_bail
    from public.baux b
    where b.organization_id = p_org and b.lot_id = p_lot and b.etat in ('actif', 'preavis')
    order by b.created_at desc
    limit 1;

    return public.incident_creer(p_org, p_lot, v_bail.id, v_bail.locataire_principal,
      'agence', p_categorie, p_description, p_piece, p_anciennete, p_urgence,
      (select auth.uid()));
  end;
  $fonction$;
  revoke execute on function public.ouvrir_incident_agence(uuid, uuid, text, text, text, text, public.incident_urgence)
    from public, anon;
  grant execute on function public.ouvrir_incident_agence(uuid, uuid, text, text, text, text, public.incident_urgence)
    to authenticated;

  create or replace function public.mes_incidents_locataire(p_org uuid)
  returns table (id uuid, numero text, categorie text, piece text, description text,
                 anciennete text, urgence public.incident_urgence, etat public.incident_etat,
                 imputation public.incident_imputation, imputation_justification text,
                 imputation_contestee_le timestamptz, cloture_motif public.incident_cloture,
                 clos_le timestamptz, declare_le timestamptz, lot_nom text,
                 nb_photos bigint, est_declarant boolean)
  language sql stable security definer set search_path to '' as $fonction$
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
  $fonction$;
  revoke execute on function public.mes_incidents_locataire(uuid) from public, anon;

  create or replace function public.contester_imputation(p_org uuid, p_incident uuid, p_message text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
  as $fonction$
  declare
    v record;
  begin
    -- Adhésion locataire active exigée (un ex-locataire ne conteste plus)
    if not (p_org in (select public.org_ids_avec_roles(array['locataire']::public.membership_role[]))) then
      raise exception 'Accès refusé';
    end if;
    select i.* into v from public.incidents i
    join public.persons p on p.id = i.declarant_person_id
    where i.id = p_incident and i.organization_id = p_org
      and p.account_id = (select auth.uid())
    for update of i;
    if not found then raise exception 'Incident introuvable'; end if;
    -- Un incident clos ne se conteste plus : l'alerte n'aurait plus de clôture
    -- pour la solder (RM-7.6.2) — il se rouvre si le désordre persiste.
    if v.etat = 'clos' then
      raise exception 'Cet incident est clos — rouvrez-le si le problème persiste';
    end if;
    if v.imputation is null then
      raise exception 'Cet incident n''est pas encore qualifié — il n''y a rien à contester';
    end if;
    if v.imputation_contestee_le is not null then
      raise exception 'Votre contestation a déjà été transmise';
    end if;
    if length(trim(coalesce(p_message, ''))) = 0 then
      raise exception 'Expliquez pourquoi vous contestez cette imputation';
    end if;

    update public.incidents
    set imputation_contestee_le = now(), imputation_contestation = trim(p_message)
    where id = p_incident;

    insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
    values (p_org, p_incident, 'contestation', (select auth.uid()),
            jsonb_build_object('imputation', v.imputation, 'message', trim(p_message)));

    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (p_org, 'incident_conteste', 'normale',
            'Imputation contestée par le locataire — ' || v.numero,
            jsonb_build_object('incident_id', p_incident, 'lot_id', v.lot_id,
                               'libelle', left(trim(p_message), 140)));
  end;
  $fonction$;
  revoke execute on function public.contester_imputation(uuid, uuid, text) from public, anon;

  create or replace function public.rouvrir_incident(p_org uuid, p_incident uuid, p_motif text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
  as $fonction$
  declare
    v record;
    v_gerant boolean;
    v_declarant boolean;
  begin
    -- Périmètre incident de l'agent (recette 13/09).
    if public.incident_hors_portefeuille(p_org, p_incident) then
      raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
    end if;
    select i.*, p.account_id as declarant_account into v
    from public.incidents i
    left join public.persons p on p.id = i.declarant_person_id
    where i.id = p_incident and i.organization_id = p_org
    for update of i;
    if not found then raise exception 'Incident introuvable'; end if;

    v_gerant := p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
    v_declarant := v.declarant_account = (select auth.uid())
      and p_org in (select public.org_ids_avec_roles(array['locataire']::public.membership_role[]));
    if not (v_gerant or v_declarant) then
      raise exception 'Accès refusé';
    end if;
    if v.etat <> 'clos' then
      raise exception 'Seul un incident clos peut être rouvert';
    end if;
    if length(trim(coalesce(p_motif, ''))) = 0 then
      raise exception 'Dites pourquoi vous rouvrez — le désordre réapparu, par exemple';
    end if;

    -- La requalification repart de zéro : l'ancienne imputation ne préjuge pas
    -- de la nouvelle (elle reste dans l'événement de réouverture).
    update public.incidents
    set etat = 'rouvert',
        imputation = null, imputation_justification = null,
        imputation_contestee_le = null, imputation_contestation = null,
        cloture_motif = null, cloture_commentaire = null,
        clos_le = null, clos_par = null
    where id = p_incident;

    insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
    values (p_org, p_incident, 'reouverture', (select auth.uid()),
            jsonb_build_object('motif', trim(p_motif), 'cloture_precedente',
              jsonb_build_object('motif', v.cloture_motif, 'clos_le', v.clos_le,
                                 'imputation', v.imputation)));

    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (p_org, 'incident_a_qualifier',
            (case when v.urgence = 'urgente' then 'critique' else 'normale' end)::public.alerte_criticite,
            'Incident rouvert, à requalifier — ' || v.numero,
            jsonb_build_object('incident_id', p_incident, 'lot_id', v.lot_id,
                               'libelle', left(trim(p_motif), 140)));
  end;
  $fonction$;
  revoke execute on function public.rouvrir_incident(uuid, uuid, text) from public, anon;

  -- Fenêtre et historique du lot : le filtre par le déclarant d'avant, par relecture de la définition en vigueur
  -- (chemin inverse du point 6 de la migration), avant de retirer `titulaire_incident`, qu'ils appellent. Filtre
  -- d'avant déjà là : rien à faire ; un autre nombre d'occurrences : arrêt, rien n'est modifié.
  for v_i in 1 .. array_length(v_cibles, 1) loop
    v_oid := to_regprocedure(v_cibles[v_i][1]);
    if v_oid is null then
      raise exception 'Retour FL-01 : la fonction % est absente de cette base ; rien n''est modifié.', v_cibles[v_i][1];
    end if;
    v_def := pg_get_functiondef(v_oid);
    v_nb := (length(v_def) - length(replace(v_def, v_cibles[v_i][2], ''))) / length(v_cibles[v_i][2]);
    if v_nb = 0 and position('titulaire_incident' in v_def) = 0 then continue; end if;
    if v_nb <> v_cibles[v_i][4]::integer then
      raise exception 'Retour FL-01 : % contient % filtre(s) par le titulaire au lieu de % : définition réécrite depuis, rien n''est modifié.',
        v_cibles[v_i][1], v_nb, v_cibles[v_i][4];
    end if;
    v_def := replace(v_def, v_cibles[v_i][2], v_cibles[v_i][3]);
    v_def := replace(v_def, 'ni ceux que l''agence a ouverts hors de son bail en cours (FL-01 : titulaire).',
      'ni ceux que l''agence a ouverts de son côté.');
    execute v_def;
  end loop;

  drop function if exists public.titulaire_incident(uuid, public.incident_canal, uuid);
  perform public.fermer_fonctions_a_anon();
  perform pg_notify('pgrst', 'reload schema');

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261027100100';
  end if;
end;
$retour_atomique$;
