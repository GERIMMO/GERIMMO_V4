-- RETOUR ARRIÈRE de 20261014302000_creneaux_non_retenus_caducs.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les
-- migrations d'origine SANS cette migration, puis recopiées ici par un générateur — aucune n'est écrite
-- à la main. Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014302000_creneaux_non_retenus_caducs.retour.sql
--
-- RÉINTRODUIT le défaut CHN-01 : un choix de créneau (le locataire retient une date de l'artisan, ou l'artisan retient une date du
-- locataire) enregistre de nouveau les autres dates « refusées » (refuse_le = maintenant), et elles recomptent dans les six refus.
-- NE DÉFAIT PAS les créneaux déjà passés à « caduc » par les nouveaux choix (valeur d'énumération qui existe depuis l'origine) :
-- ils restent « caduc » et ne comptent pas dans les six refus. Aucune donnée n'est modifiée par ce script.

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
-- Hors transaction, l'instruction démarre à l'instant même de sa transaction ; dans un lot, elle est plus tardive.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;

begin;
set local lock_timeout = '10s';

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public).
-- Rétablit la définition ANTÉRIEURE (reprise de la base reconstruite par les migrations d'origine) si, et
-- seulement si, la définition en vigueur porte la marque du correctif. Sans la marque, la fonction est
-- déjà revenue (rejeu) ou a été réécrite depuis : on n'y touche pas.
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

-- CHN-01 (1/2)
select pg_temp.restaurer_fonction('public.choisir_creneau(uuid,uuid)',
  $marque$Audit du 13/10 (CHN-01)$marque$,
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
  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
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

-- CHN-01 (2/2)
select pg_temp.restaurer_fonction('public.accepter_creneau_locataire(uuid)',
  $marque$Audit du 13/10 (CHN-01)$marque$,
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
  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
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

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014302000';
  end if;
end $retour_arriere$;

commit;
