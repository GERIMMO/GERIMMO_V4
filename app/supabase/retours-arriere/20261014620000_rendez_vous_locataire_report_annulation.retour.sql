-- RETOUR ARRIÈRE de 20261014620000_rendez_vous_locataire_report_annulation.sql (décision D22, option B)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les
-- migrations d'origine SANS cette migration, puis recopiées ici par un générateur — aucune n'est écrite
-- à la main. Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014620000_rendez_vous_locataire_report_annulation.retour.sql
--
-- RÉINTRODUIT LOC-21, CHN-01 (côté locataire) et REP-04 : le locataire n'a plus aucun geste sur un rendez-vous confirmé
-- (ni report, ni annulation) ; le clic répété sur « Accepter » ou « Confirmer » redevient une erreur ; un rendez-vous
-- reporté après le rappel de la veille n'est plus rappelé.
-- DONNÉES : la table `intervention_demandes_rdv` est SUPPRIMÉE seulement si elle est VIDE ; sinon ce script s'arrête
-- (aucune demande d'un locataire n'est effacée par un retour arrière : les archiver d'abord, sur décision). De même,
-- les événements de chronologie des six types D22 sont des lignes d'audit jamais supprimées : s'il en existe, la liste
-- fermée des types les garde (seuls les types sans aucune ligne en sont retirés). Les alertes déjà ouvertes
-- (rdv_annule_locataire, rdv_annule_tardif, rdv_demande_sans_reponse) restent lisibles et se ferment à la main.
-- Les traces de rappel gardent leur colonne `debut_prevu` remise à rien ; la clé d'unicité d'origine est rétablie, et
-- le script s'arrête si deux traces d'une même échéance existent (un rendez-vous reporté rappelé deux fois).

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;

begin;
set local lock_timeout = '10s';

-- Aucune demande d'un locataire n'est effacée par un retour arrière.
do $retour_arriere$
declare v_n bigint := 0;
begin
  -- Requête dynamique : au rejeu, la table n'existe plus.
  if to_regclass('public.intervention_demandes_rdv') is not null then
    execute 'select count(*) from public.intervention_demandes_rdv' into v_n;
  end if;
  if v_n > 0 then
    raise exception 'Retour arrière refusé : % demande(s) de locataire existent dans intervention_demandes_rdv. Les archiver d''abord (décision à prendre), puis rejouer ce script.', v_n;
  end if;
end $retour_arriere$;

create function pg_temp.restaurer_fonction(p_signature text, p_marque text, p_definition text)
returns text language plpgsql as $retour_arriere$
declare v_oid regprocedure := to_regprocedure(p_signature); v_courante text;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', p_signature;
  end if;
  v_courante := pg_get_functiondef(v_oid);
  if position(p_marque in v_courante) = 0 then
    return p_signature || ' : marque du correctif absente, rien à faire';
  end if;
  execute p_definition;
  return p_signature || ' : définition antérieure rétablie';
end $retour_arriere$;

-- LOC-21 (1/7) : réponse de l'artisan à une date du locataire
select pg_temp.restaurer_fonction('public.accepter_creneau_locataire(uuid)',
  $marque$Décision D22 (LOC-21)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.accepter_creneau_locataire(p_creneau uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record;
begin
  select c.*, i.incident_id, i.statut as statut_intervention, i.artisan_id
    into v
  from public.intervention_creneaux c
  join public.incident_interventions i on i.id = c.intervention_id
  where c.id = p_creneau
    and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
;
  if not found then raise exception 'Accès refusé'; end if;
  perform public.exiger_artisan_reel();
  perform pg_advisory_xact_lock(hashtextextended(v.artisan_id::text,0));
  perform 1 from public.incident_interventions where id=v.intervention_id for update;
  select c.*, i.incident_id, i.statut as statut_intervention, i.artisan_id
    into v from public.intervention_creneaux c
    join public.incident_interventions i on i.id=c.intervention_id
    where c.id=p_creneau and i.artisan_id=public.mon_artisan_id() for update of c;
  if v.propose_par <> 'locataire' then
    raise exception 'Cette date n''est pas une proposition du locataire';
  end if;
  if v.statut <> 'propose' then
    raise exception 'Cette date n''est plus proposée';
  end if;
  if v.statut_intervention not in ('acceptee', 'planifiee') then
    raise exception 'Cette mission n''attend pas de rendez-vous (état : %)', v.statut_intervention;
  end if;
  if v.debut <= now() then
    raise exception 'Cette date est passée : proposez vos propres créneaux, ou refusez celles du locataire pour que le gérant arbitre';
  end if;

  if public.conflit_planning_artisan(v.artisan_id,v.debut,v.fin,v.intervention_id,null) then
    raise exception 'Ce créneau chevauche un rendez-vous déjà confirmé. Retenez une autre date ou demandez un arbitrage motivé à votre interlocuteur';
  end if;
  update public.intervention_creneaux set statut = 'retenu' where id = p_creneau;
  -- Audit du 13/10 (CHN-01) : les autres dates du locataire ne sont pas refusées, elles sont
  -- écartées par ce choix. « caduc » ne compte pas dans les six refus qui déclenchent l'arbitrage.
  update public.intervention_creneaux
  set statut = 'caduc'
  where intervention_id = v.intervention_id and id <> p_creneau and statut = 'propose';
  update public.incident_interventions
  set statut = 'planifiee', debut_prevu = v.debut, fin_prevue = v.fin
  where id = v.intervention_id;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'creneau_retenu', (select auth.uid()),
          jsonb_build_object('intervention_id', v.intervention_id,
                             'creneau_id', p_creneau, 'debut', v.debut, 'par', 'artisan'));
end;
$function$
$definition_anterieure$);

-- LOC-21 (2/7) : choix d'une date par le locataire
select pg_temp.restaurer_fonction('public.choisir_creneau(uuid,uuid)',
  $marque$Décision D22 (LOC-21)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.choisir_creneau(p_org uuid, p_creneau uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_autorise boolean;
begin
  if public.ma_personne_locataire(p_org) is null then
    raise exception 'Accès refusé';
  end if;
  select cr.*, iv.incident_id, iv.statut as statut_intervention, iv.artisan_id
  into v from public.intervention_creneaux cr
  join public.incident_interventions iv on iv.id = cr.intervention_id
  where cr.id = p_creneau and cr.organization_id = p_org;
  if not found then raise exception 'Créneau introuvable'; end if;
  -- Le créneau doit porter sur SON incident : la garde d'appartenance.
  select exists (
    select 1 from public.incidents i
    join public.baux b on b.id = i.bail_id
    where i.id = v.incident_id and i.organization_id = p_org
      and (b.locataire_principal = public.ma_personne_locataire(p_org)
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.role = 'colocataire'
                        and bp.person_id = public.ma_personne_locataire(p_org)))
  ) into v_autorise;
  if not v_autorise then raise exception 'Accès refusé'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v.artisan_id::text,0));
  -- Même mission : sérialiser également les deux choix de dates différents.
  perform 1 from public.incident_interventions where id=v.intervention_id for update;
  select cr.*, iv.incident_id, iv.statut as statut_intervention, iv.artisan_id
    into v from public.intervention_creneaux cr
    join public.incident_interventions iv on iv.id=cr.intervention_id
    where cr.id=p_creneau and cr.organization_id=p_org for update of cr;
  if v.statut_intervention not in ('acceptee','planifiee') then
    raise exception 'Cette mission n’attend pas de rendez-vous';
  end if;
  if v.statut <> 'propose' then
    raise exception 'Ce créneau n''est plus proposé';
  end if;
  -- La garde manquante : on ne retient pas sa propre proposition.
  if v.propose_par = 'locataire' then
    raise exception 'Cette date est celle que vous avez proposée : elle attend l''accord de l''artisan, vous ne pouvez pas la retenir vous-même';
  end if;
  -- Un rendez-vous ne se fixe pas dans le passé (27/09).
  if v.debut <= now() then
    raise exception 'Ce créneau est passé : proposez vos disponibilités';
  end if;


  if public.conflit_planning_artisan(v.artisan_id,v.debut,v.fin,v.intervention_id,null) then
    raise exception 'Ce créneau chevauche un rendez-vous déjà confirmé de l’artisan. Choisissez une autre date ou contactez votre interlocuteur pour un arbitrage';
  end if;


  update public.intervention_creneaux set statut = 'retenu' where id = p_creneau;
  -- Audit du 13/10 (CHN-01) : les autres dates ne sont pas refusées, elles sont écartées par
  -- ce choix. « caduc » ne compte pas dans les six refus qui déclenchent l'arbitrage.
  update public.intervention_creneaux
  set statut = 'caduc'
  where intervention_id = v.intervention_id and id <> p_creneau and statut = 'propose';
  update public.incident_interventions
  set statut = 'planifiee', debut_prevu = v.debut, fin_prevue = v.fin
  where id = v.intervention_id;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'creneau_retenu', (select auth.uid()),
          jsonb_build_object('intervention_id', v.intervention_id,
                             'creneau_id', p_creneau, 'debut', v.debut, 'par', 'locataire'));
end;
$function$
$definition_anterieure$);

-- LOC-21 (3/7) : refus des dates du locataire par l'artisan
select pg_temp.restaurer_fonction('public.refuser_creneaux_locataire(uuid,text)',
  $marque$Décision D22 (LOC-21)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.refuser_creneaux_locataire(p_intervention uuid, p_motif text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_nb integer; v_numero text;
begin
  select i.* into v from public.incident_interventions i
  where i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Dites pourquoi aucune de ces dates ne vous convient : le gérant arbitrera avec cette information';
  end if;

  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = p_intervention and statut = 'propose' and propose_par = 'locataire';
  get diagnostics v_nb = row_count;
  if v_nb = 0 then
    raise exception 'Le locataire n''a aucune date en attente de votre réponse';
  end if;

  select numero into v_numero from public.incidents where id = v.incident_id;
  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'creneaux_refuses', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'par', 'artisan',
                             'nombre', v_nb, 'motif', trim(p_motif)));

  -- A5 : contre-proposé → arbitrage (refus artisan). Même alerte que celle du
  -- sixième refus (RM-10.4.1), que `fixer_creneau_arbitrage` referme.
  if not exists (select 1 from public.alerts
                 where organization_id = v.organization_id and statut = 'ouverte'
                   and type = 'creneaux_arbitrage'
                   and details->>'intervention_id' = p_intervention::text) then
    insert into public.alerts (organization_id, type, criticite, titre, details,
                               origine_type, origine_id)
    values (v.organization_id, 'creneaux_arbitrage', 'critique',
            'Rendez-vous à arbitrer — ' || v_numero,
            jsonb_build_object('incident_id', v.incident_id,
                               'lot_id', (select i2.lot_id from public.incidents i2
                                          where i2.id = v.incident_id),
                               'intervention_id', p_intervention,
                               'libelle', 'L''artisan ne peut à aucune des dates du locataire : '
                                          || trim(p_motif)
                                          || '. Réglez le rendez-vous par téléphone.'),
            'intervention', p_intervention);
  end if;
  return v_nb;
end;
$function$
$definition_anterieure$);

-- LOC-21 (4/7) : arbitrage du gérant
select pg_temp.restaurer_fonction('public.fixer_creneau_arbitrage(uuid,uuid,timestamptz,timestamptz,text)',
  $marque$Décision D22 (LOC-21)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.fixer_creneau_arbitrage(p_org uuid, p_intervention uuid, p_debut timestamp with time zone, p_fin timestamp with time zone, p_motif text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_creneau uuid; v_tour integer;
begin
  -- Périmètre incident de l'agent (recette 13/09).
  if public.intervention_hors_portefeuille(p_org, p_intervention) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.incident_interventions
  where id = p_intervention and organization_id = p_org;
  if not found then raise exception 'Intervention introuvable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v.artisan_id::text,0));
  select * into v from public.incident_interventions
    where id=p_intervention and organization_id=p_org for update;
  if v.statut not in ('acceptee', 'planifiee') then
    raise exception 'Un rendez-vous ne se fixe que sur une mission acceptée (état : %)', v.statut;
  end if;
  if p_debut is null or p_fin is null or not isfinite(p_debut) or not isfinite(p_fin)
     or p_debut<=now() or p_fin<=p_debut then
    raise exception 'Choisissez des dates futures et une fin après le début';
  end if;
  if public.conflit_planning_artisan(v.artisan_id,p_debut,p_fin,p_intervention,null) then
    raise exception 'Ce créneau chevauche un rendez-vous déjà confirmé de l’artisan. Choisissez une autre date ou confirmez explicitement un maintien motivé';
  end if;

  select coalesce(max(tour), 0) + 1 into v_tour
  from public.intervention_creneaux where intervention_id = p_intervention;
  update public.intervention_creneaux
  set statut = 'caduc' where intervention_id = p_intervention and statut in ('propose','retenu');

  insert into public.intervention_creneaux
    (organization_id, intervention_id, propose_par, tour, debut, fin, statut, created_by)
  values (p_org, p_intervention, 'agence', v_tour, p_debut, p_fin, 'retenu', (select auth.uid()))
  returning id into v_creneau;

  update public.incident_interventions
  set statut = 'planifiee', debut_prevu = p_debut, fin_prevue = p_fin
  where id = p_intervention;

  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = 'Rendez-vous fixé par arbitrage'
  where organization_id = p_org and statut = 'ouverte' and type = 'creneaux_arbitrage'
    and details->>'intervention_id' = p_intervention::text;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'arbitrage_creneau', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'debut', p_debut,
                             'fin', p_fin, 'motif', nullif(trim(coalesce(p_motif, '')), '')));
  return v_creneau;
end;
$function$
$definition_anterieure$);

-- LOC-21 (5/7) : arbitrage motivé du gérant
select pg_temp.restaurer_fonction('public.fixer_creneau_arbitrage_motive(uuid,uuid,timestamptz,timestamptz,text,text)',
  $marque$Décision D22 (LOC-21)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.fixer_creneau_arbitrage_motive(p_org uuid, p_intervention uuid, p_debut timestamp with time zone, p_fin timestamp with time zone, p_motif text, p_conflit_motif text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_creneau uuid; v_tour integer; v_conflit boolean;
begin
  -- Périmètre incident de l'agent (recette 13/09).
  if public.intervention_hors_portefeuille(p_org, p_intervention) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.incident_interventions
  where id = p_intervention and organization_id = p_org;
  if not found then raise exception 'Intervention introuvable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v.artisan_id::text,0));
  select * into v from public.incident_interventions
    where id=p_intervention and organization_id=p_org for update;
  if v.statut not in ('acceptee', 'planifiee') then
    raise exception 'Un rendez-vous ne se fixe que sur une mission acceptée (état : %)', v.statut;
  end if;
  if p_debut is null or p_fin is null or not isfinite(p_debut) or not isfinite(p_fin)
     or p_debut<=now() or p_fin<=p_debut then
    raise exception 'Choisissez des dates futures et une fin après le début';
  end if;
  v_conflit:=public.conflit_planning_artisan(v.artisan_id,p_debut,p_fin,p_intervention,null);
  if v_conflit and length(btrim(coalesce(p_conflit_motif,''))) not between 10 and 1000 then
    raise exception 'Ce créneau chevauche un rendez-vous déjà confirmé de l’artisan. Cochez le maintien et justifiez l’accord vérifié avec l’artisan (10 à 1000 caractères), ou choisissez une autre date';
  end if;


  select coalesce(max(tour), 0) + 1 into v_tour
  from public.intervention_creneaux where intervention_id = p_intervention;
  update public.intervention_creneaux
  set statut = 'caduc' where intervention_id = p_intervention and statut in ('propose','retenu');

  insert into public.intervention_creneaux
    (organization_id, intervention_id, propose_par, tour, debut, fin, statut, created_by)
  values (p_org, p_intervention, 'agence', v_tour, p_debut, p_fin, 'retenu', (select auth.uid()))
  returning id into v_creneau;

  update public.incident_interventions
  set statut = 'planifiee', debut_prevu = p_debut, fin_prevue = p_fin
  where id = p_intervention;

  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = 'Rendez-vous fixé par arbitrage'
  where organization_id = p_org and statut = 'ouverte' and type = 'creneaux_arbitrage'
    and details->>'intervention_id' = p_intervention::text;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'arbitrage_creneau', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'debut', p_debut,
                             'fin', p_fin, 'motif', nullif(trim(coalesce(p_motif, '')), ''),
                             'conflit_confirme', v_conflit,
                             'conflit_motif', case when v_conflit then btrim(p_conflit_motif) else null end));
  return v_creneau;
end;
$function$
$definition_anterieure$);

-- LOC-21 (6/7) : rendez-vous à rappeler
select pg_temp.restaurer_fonction('public.rendez_vous_a_rappeler(integer)',
  $marque$Décision D22 (LOC-21)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.rendez_vous_a_rappeler(p_limite integer DEFAULT 200)
 RETURNS TABLE(intervention_id uuid, organization_id uuid, echeance text, destinataire text, adresse text, prenom text, emetteur text, artisan text, lot text, adresse_bien text, debut_prevu timestamp with time zone, fin_prevue timestamp with time zone, incident_numero text, categorie text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Réservée à la tâche planifiée (service_role, sans identité) et au super
  -- admin : elle traverse TOUTES les organisations.
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'rendez_vous_a_rappeler: reserve a la tache de rappel';
  end if;

  return query
  with rdv as (
    select i.id, i.organization_id, i.debut_prevu, i.fin_prevue,
           o.name as emetteur, a.raison_sociale, a.email as email_artisan,
           inc.numero, inc.categorie,
           l.nom as lot_nom,
           coalesce(b.address_line1, '') as adresse_bien,
           loc.email as email_locataire, loc.prenom as prenom_locataire,
           -- La veille, ou sept jours avant : des dates exactes, lues à Paris.
           case
             when (i.debut_prevu at time zone 'Europe/Paris')::date
                  = (now() at time zone 'Europe/Paris')::date + 1 then 'veille'
             when (i.debut_prevu at time zone 'Europe/Paris')::date
                  = (now() at time zone 'Europe/Paris')::date + 7 then 'j7'
           end as quand
    from public.incident_interventions i
    join public.organizations o on o.id = i.organization_id
    join public.artisans a on a.id = i.artisan_id
    join public.incidents inc on inc.id = i.incident_id
    join public.lots l on l.id = inc.lot_id
    join public.biens b on b.id = l.bien_id
    left join public.baux ba on ba.id = inc.bail_id
    left join public.persons loc
           on loc.id = coalesce(ba.locataire_principal, inc.declarant_person_id)
    where i.debut_prevu is not null
      and i.statut in ('acceptee', 'planifiee')
      -- Une organisation suspendue n'écrit plus en son nom.
      and public.org_ecriture_ouverte(i.organization_id)
  ),
  -- Une ligne par destinataire : l'adresse fausse de l'un ne prive pas
  -- l'autre de son rappel.
  cible as (
    select r.*, 'locataire' as qui, r.email_locataire as ou, r.prenom_locataire as p
      from rdv r
    union all
    select r.*, 'artisan' as qui, r.email_artisan as ou, null::text as p
      from rdv r
  )
  select c.id, c.organization_id, c.quand, c.qui, c.ou, c.p, c.emetteur,
         c.raison_sociale, c.lot_nom, c.adresse_bien, c.debut_prevu, c.fin_prevue,
         c.numero, c.categorie
  from cible c
  where c.quand is not null
    and c.ou is not null and length(btrim(c.ou)) > 0
    and not exists (
      select 1 from public.intervention_rappels r
      where r.intervention_id = c.id
        and r.echeance = c.quand::public.rappel_echeance
        and r.destinataire = c.qui::public.rappel_destinataire
    )
  order by c.debut_prevu, c.id
  limit greatest(1, least(p_limite, 500));
end;
$function$
$definition_anterieure$);

-- LOC-21 (7/7) : trace d'un rappel envoyé
select pg_temp.restaurer_fonction('public.marquer_rappel_envoye(uuid,text,text,text)',
  $marque$Décision D22 (LOC-21)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.marquer_rappel_envoye(p_intervention uuid, p_echeance text, p_destinataire text, p_adresse text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'marquer_rappel_envoye: reserve a la tache de rappel';
  end if;
  select organization_id into v_org
  from public.incident_interventions where id = p_intervention;
  if v_org is null then return false; end if;

  -- `on conflict do nothing` : si deux passes se chevauchent, la seconde ne
  -- double pas la trace et ne lève pas d'erreur.
  insert into public.intervention_rappels
    (organization_id, intervention_id, echeance, destinataire, adresse)
  values (v_org, p_intervention, p_echeance::public.rappel_echeance,
          p_destinataire::public.rappel_destinataire, p_adresse)
  on conflict (intervention_id, echeance, destinataire) do nothing;
  return found;
end;
$function$
$definition_anterieure$);

-- Les rappels : la clé d'unicité d'origine (une trace par mission, échéance et destinataire).
do $retour_arriere$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.intervention_rappels'::regclass and conname = 'intervention_rappels_une_fois_par_date') then
    if exists (select 1 from public.intervention_rappels
               group by intervention_id, echeance, destinataire having count(*) > 1) then
      raise exception 'Retour arrière refusé : des rendez-vous reportés ont été rappelés deux fois pour la même échéance ; la clé d''origine ne peut pas être rétablie sans supprimer des traces.';
    end if;
    alter table public.intervention_rappels drop constraint intervention_rappels_une_fois_par_date;
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.intervention_rappels'::regclass and conname = 'intervention_rappels_une_fois') then
    alter table public.intervention_rappels add constraint intervention_rappels_une_fois
      unique (intervention_id, echeance, destinataire);
  end if;
end $retour_arriere$;
alter table public.intervention_rappels drop column if exists debut_prevu;

-- Le déclencheur et les fonctions propres à la décision.
drop trigger if exists demandes_rdv_suivre_mission on public.incident_interventions;
drop function if exists public.demandes_rdv_suivre_mission();
drop function if exists public.demander_report_rdv(uuid, uuid, text, text, jsonb, uuid);
drop function if exists public.annuler_rdv_locataire(uuid, uuid, text, text, uuid);
drop function if exists public.retirer_demande_rdv(uuid, uuid);
drop function if exists public.expirer_demandes_rdv();
drop function if exists public.mes_rendez_vous_locataire(uuid);
drop function if exists public.mes_demandes_rdv_artisan();
drop function if exists public.intervention_du_locataire(uuid, uuid);
drop function if exists public.parametres_rdv_locataire();

-- La table (vide : vérifié en tête) et la colonne qui la référence.
drop index if exists public.intervention_creneaux_demande_id_idx;
alter table public.intervention_creneaux drop column if exists demande_id;
drop table if exists public.intervention_demandes_rdv;

-- La liste fermée des types d'événement : chaque type D22 sans aucune ligne en est retiré ; les autres types (y compris
-- ceux qu'une autre migration aurait ajoutés) sont gardés tels quels.
do $retour_arriere$
declare v_def text; v_types text[]; v_retires text[] := array[
  'rdv_report_demande', 'rdv_report_accepte', 'rdv_report_refuse',
  'rdv_report_retire', 'rdv_report_expire', 'rdv_annule_par_locataire'];
  v_gardes text[];
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
  where conrelid = 'public.incident_evenements'::regclass and conname = 'incident_evenements_type_check';
  select array_agg(t.m[1] order by t.n) into v_types
  from regexp_matches(v_def, '''([a-z0-9_]+)''', 'g') with ordinality as t(m, n);
  select coalesce(array_agg(distinct e.type), '{}') into v_gardes
  from public.incident_evenements e where e.type = any (v_retires);
  if array_length(v_gardes, 1) > 0 then
    raise notice 'Types gardés dans la liste (des lignes d''audit les portent) : %', v_gardes;
  end if;
  if not (v_types && v_retires) then return; end if;
  select array_agg(x order by o) into v_types
  from unnest(v_types) with ordinality as w(x, o)
  where not (x = any (v_retires)) or x = any (v_gardes);
  alter table public.incident_evenements drop constraint incident_evenements_type_check;
  execute format('alter table public.incident_evenements add constraint incident_evenements_type_check check (type = any (array[%s]::text[]))',
                 (select string_agg(quote_literal(x), ', ' order by o) from unnest(v_types) with ordinality as w(x, o)));
end $retour_arriere$;

select public.fermer_fonctions_a_anon();

-- La ligne d'historique de la migration : elle pourra être rejouée.
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014620000';
  end if;
end $retour_arriere$;

commit;
