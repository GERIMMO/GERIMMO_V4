-- RETOUR ARRIÈRE de 20261014601000_devis_revision_versions.sql (décision D18 du 14/10/2026, livraison 2 : révision et versions)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base au stade de la livraison 1 (20261014600000
-- appliquée, celle-ci non), puis recopiées ici par un générateur — aucune n'est écrite à la main.
-- Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014601000_devis_revision_versions.retour.sql
--
-- RÉINTRODUIT le défaut ART-13 et la partie « révision » de PRO2-12 : plus de demande de révision, plus de version
-- suivante ; l'artisan ne peut plus déposer depuis une demande en révision ni y renoncer ; les demandes de révision
-- sans réponse n'expirent plus. Le code de l'application qui appelle demander_revision_devis et mes_versions_devis
-- échouera tant qu'il n'est pas revenu lui aussi.
-- NE DÉFAIT PAS : les colonnes version, devis_precedent_id, note_revision (incident_devis) et revision_avant
-- (incident_sollicitations), les valeurs d'énumération revise / revision_demandee, les types d'événement ajoutés, les
-- alertes devis_revision_expiree déjà écrites, ni les devis déjà révisés (ils restent « révision demandée », lisibles).
-- La contrainte d'unicité (sollicitation, version) et l'index « un seul devis vivant par demande » sont CONSERVÉS :
-- l'ancienne contrainte (une seule réponse par demande) ne peut pas être reposée si des versions existent, et pour
-- des devis en version 1 les deux reviennent au même. Aucune donnée n'est modifiée par ce script.
-- Une demande encore « en révision » au moment du retour reste dans cet état : l'artisan ne pourra ni répondre ni
-- renoncer ; la lever (ou la passer « expirée ») relève d'une décision humaine, identifiant par identifiant.
-- Ordre : ce retour AVANT celui de 20261014600000 (livraison 1), qui le vérifie.

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

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public). « or replace » :
-- un autre retour joué dans la même session peut l'avoir déjà posé.
create or replace function pg_temp.restaurer_fonction(p_signature text, p_marque text, p_definition text)
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

-- Ce que le retour laisse en place, dit en nombres.
do $retour_arriere$
declare v_revises integer; v_en_revision integer;
begin
  select count(*) into v_revises from public.incident_devis where statut = 'revise';
  select count(*) into v_en_revision from public.incident_sollicitations where statut = 'revision_demandee';
  raise notice 'Devis « révision demandée » conservés : % ; demandes encore en révision (sans issue après le retour) : %', v_revises, v_en_revision;
end $retour_arriere$;

-- Les fonctions nouvelles disparaissent (celle de l'échéance après la fonction planifiée qui l'appelle).
drop function if exists public.demander_revision_devis(uuid, uuid, text, uuid);
drop function if exists public.mes_versions_devis(uuid);

-- deposer_devis
select pg_temp.restaurer_fonction('public.deposer_devis(uuid,bigint,text,date,text,text,bigint,text)',
  $marque$Décision D18 du 14/10 (livraison 2)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.deposer_devis(p_sollicitation uuid, p_montant_ttc_cents bigint, p_description text, p_valide_jusqu_au date DEFAULT NULL::date, p_storage_path text DEFAULT NULL::text, p_mime text DEFAULT NULL::text, p_taille bigint DEFAULT NULL::bigint, p_empreinte text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; c record; v_devis uuid; v_doc uuid; v_echeance date;
begin
  select s.* into v from public.incident_sollicitations s
  where s.id = p_sollicitation and s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut <> 'envoyee' then
    raise exception 'Cette demande n''attend plus de devis (état : %)', v.statut;
  end if;
  if coalesce(p_montant_ttc_cents, 0) <= 0 then
    raise exception 'Indiquez le montant TTC du devis';
  end if;
  if length(trim(coalesce(p_description, ''))) = 0 then
    raise exception 'Décrivez ce que couvre le devis';
  end if;
  select * into c from public.incident_consultations where id = v.consultation_id;
  v_echeance := coalesce(p_valide_jusqu_au, (current_date + c.validite_jours)::date);
  if v_echeance <= current_date then
    raise exception 'La date de validité du devis doit être à venir';
  end if;

  if p_storage_path is not null then
    if p_storage_path not like v.organization_id::text || '/%' then
      raise exception 'Chemin de stockage invalide';
    end if;
    begin
      insert into public.documents
        (organization_id, type, titre, storage_path, mime_type, taille_octets,
         empreinte, deposited_by)
      values (v.organization_id, 'devis',
              'Devis — incident ' || (select i.numero from public.incidents i where i.id = v.incident_id),
              p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()))
      returning id into v_doc;
    exception when unique_violation then
      raise exception 'Ce fichier a déjà été déposé';
    end;
    insert into public.document_liens (document_id, organization_id, entite, entite_id)
    values (v_doc, v.organization_id, 'organisation', v.organization_id),
           (v_doc, v.organization_id, 'incident', v.incident_id);
  end if;

  insert into public.incident_devis
    (organization_id, sollicitation_id, incident_id, artisan_id,
     montant_ttc_cents, description, valide_jusqu_au, document_id)
  values (v.organization_id, p_sollicitation, v.incident_id, v.artisan_id,
          p_montant_ttc_cents, trim(p_description), v_echeance, v_doc)
  returning id into v_devis;

  update public.incident_sollicitations
  set statut = 'devis_depose', repondue_le = now() where id = p_sollicitation;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'devis', (select auth.uid()),
          jsonb_build_object('devis_id', v_devis, 'artisan_id', v.artisan_id,
                             'montant_ttc_cents', p_montant_ttc_cents,
                             'valide_jusqu_au', v_echeance));
  -- Audit du 13/10 (PRO2-13) : le devis reçu attend une décision du gérant ou du propriétaire.
  -- L'alerte naît dans la transaction du dépôt (patron de l'avenant) et se ferme quand le devis cesse
  -- d'attendre (déclencheur fermer_alerte_devis_a_decider). Elle ne porte que des identifiants et des montants.
  insert into public.alerts (organization_id, type, criticite, titre, details, origine_type, origine_id)
  values (v.organization_id, 'devis_a_decider', 'normale',
          'Devis reçu, à décider — ' || (select i.numero from public.incidents i where i.id = v.incident_id),
          jsonb_build_object('incident_id', v.incident_id,
                             'lot_id', (select i2.lot_id from public.incidents i2 where i2.id = v.incident_id),
                             'consultation_id', v.consultation_id,
                             'sollicitation_id', p_sollicitation,
                             'devis_id', v_devis,
                             'montant_ttc_cents', p_montant_ttc_cents,
                             'valide_jusqu_au', v_echeance,
                             'libelle', 'Un devis est arrivé : consultez-le et décidez de le retenir.'),
          'devis', v_devis);
  return v_devis;
exception when unique_violation then
  raise exception 'Un devis a déjà été déposé pour cette demande';
end;
$function$
$definition_anterieure$);

-- decliner_sollicitation
select pg_temp.restaurer_fonction('public.decliner_sollicitation(uuid,text)',
  $marque$Décision D18 du 14/10 (livraison 2)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.decliner_sollicitation(p_sollicitation uuid, p_motif text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record;
begin
  select s.* into v from public.incident_sollicitations s
  where s.id = p_sollicitation and s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut <> 'envoyee' then
    raise exception 'Cette demande n''est plus en attente (état : %)', v.statut;
  end if;
  update public.incident_sollicitations
  set statut = 'declinee', repondue_le = now(),
      refus_motif = nullif(trim(coalesce(p_motif, '')), '')
  where id = p_sollicitation;
  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'sollicitation', (select auth.uid()),
          jsonb_build_object('sollicitation_id', p_sollicitation, 'decision', 'declinee',
                             'motif', nullif(trim(coalesce(p_motif, '')), '')));
end;
$function$
$definition_anterieure$);

-- solliciter_artisan_interne
select pg_temp.restaurer_fonction('public.solliciter_artisan_interne(uuid,uuid,uuid)',
  $marque$Décision D18 du 14/10 (livraison 2)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.solliciter_artisan_interne(p_org uuid, p_consultation uuid, p_artisan uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c record; v_code_postal text; v_nb integer; v_sollicitation uuid; v_account uuid;
begin
  -- Périmètre incident de l'agent (recette 13/09).
  if public.consultation_hors_portefeuille(p_org, p_consultation) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into c from public.incident_consultations
  where id = p_consultation and organization_id = p_org for update;
  if not found then raise exception 'Mise en concurrence introuvable'; end if;
  if c.statut <> 'ouverte' then
    raise exception 'Cette mise en concurrence est close';
  end if;

  select b.postal_code into v_code_postal
  from public.incidents i join public.lots l on l.id = i.lot_id
  join public.biens b on b.id = l.bien_id
  where i.id = c.incident_id and i.organization_id = p_org;

  if not public.artisan_affectable(p_artisan, p_org, c.metier, c.nature_travaux, case when public.reseau_contact_dans_zone(p_org,p_artisan,v_code_postal) then v_code_postal else null end) then
    -- Le message nomme la raison : sans elle, l'agent ne sait pas quoi corriger.
    if public.decennale_requise(c.nature_travaux)
       and not public.artisan_decennale_valide(p_artisan) then
      raise exception 'Artisan écarté : ces travaux exigent une décennale valide (RM-8.2.9), la sienne ne l''est pas';
    end if;
    if not exists (select 1 from public.artisan_metiers am
                   where am.artisan_id = p_artisan and am.metier = c.metier) then
      raise exception 'Artisan écarté : ce n''est pas son métier (RM-8.3)';
    end if;
    raise exception 'Artisan écarté : profil non validé par la plateforme, en liste noire, hors zone, ou non rattaché à votre agence';
  end if;

  select count(*) into v_nb from public.incident_sollicitations s
  where s.consultation_id = p_consultation
    and s.statut in ('envoyee', 'devis_depose', 'retenue');
  if v_nb >= 2 then
    raise exception 'Deux artisans au maximum sollicités en parallèle (RM-9.1.1)';
  end if;

  insert into public.incident_sollicitations
    (organization_id, consultation_id, incident_id, artisan_id, created_by)
  values (p_org, p_consultation, c.incident_id, p_artisan, (select auth.uid()))
  returning id into v_sollicitation;

  -- L'adhésion ne donne AUCUN droit sur les données de l'agence (voir règle 3
  -- du préambule) : elle sert uniquement à faire apparaître l'agence dans
  -- /espaces. `do nothing` parce qu'un compte n'a qu'une adhésion par agence —
  -- si l'artisan y est déjà connu autrement, on ne l'écrase pas.
  select a.account_id into v_account from public.artisans a where a.id = p_artisan;
  if v_account is not null then
    insert into public.memberships (account_id, organization_id, role)
    values (v_account, p_org, 'artisan') on conflict do nothing;
  end if;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, c.incident_id, 'sollicitation', (select auth.uid()),
          jsonb_build_object('sollicitation_id', v_sollicitation, 'artisan_id', p_artisan));
  return v_sollicitation;
exception when unique_violation then
  raise exception 'Cet artisan est déjà sollicité sur cette mise en concurrence';
end;
$function$
$definition_anterieure$);

-- retenir_devis
select pg_temp.restaurer_fonction('public.retenir_devis(uuid,uuid)',
  $marque$Décision D18 du 14/10 (livraison 2)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.retenir_devis(p_org uuid, p_devis uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d record; i record; v_intervention uuid;
begin
  -- Périmètre incident de l'agent (recette 13/09).
  if public.devis_hors_portefeuille(p_org, p_devis) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé — la sélection d''un devis appartient à l''agence ou au propriétaire';
  end if;
  select * into d from public.incident_devis
  where id = p_devis and organization_id = p_org for update;
  if not found then raise exception 'Devis introuvable'; end if;
  if d.statut <> 'depose' then
    -- Décision D18 du 14/10 (livraison 1) : un devis refusé ne se retient plus, et l'écran le dit en clair.
    if d.statut = 'refuse' then
      raise exception 'Ce devis a été refusé : il ne peut plus être retenu. Sollicitez un autre artisan.';
    end if;
    raise exception 'Ce devis n''est plus sélectionnable (état : %)', d.statut;
  end if;
  if d.valide_jusqu_au < current_date then
    raise exception 'Ce devis a expiré le % — il est caduc (RM-9.2.3)', to_char(d.valide_jusqu_au, 'DD/MM/YYYY');
  end if;

  select * into i from public.incidents
  where id = d.incident_id and organization_id = p_org for update;
  if i.etat <> 'qualifie' then
    raise exception 'Cet incident n''est pas en attente d''affectation (état actuel : %)', i.etat;
  end if;
  -- La décennale est revérifiée À LA SÉLECTION : elle a pu expirer entre la
  -- sollicitation et le choix (seuils J-60/J-30/J-7/J+0, RM-8.2.5).
  if not public.artisan_affectable(
       d.artisan_id, p_org,
       (select c.metier from public.incident_consultations c
        join public.incident_sollicitations s on s.consultation_id = c.id
        where s.id = d.sollicitation_id),
       (select c.nature_travaux from public.incident_consultations c
        join public.incident_sollicitations s on s.consultation_id = c.id
        where s.id = d.sollicitation_id)) then
    raise exception 'Cet artisan n''est plus affectable aujourd''hui (décennale, liste noire ou validation plateforme) — choisissez l''autre devis ou relancez une consultation';
  end if;

  update public.incident_devis
  set statut = 'retenu', retenu_le = now(), retenu_par = (select auth.uid())
  where id = p_devis;
  update public.incident_sollicitations set statut = 'retenue' where id = d.sollicitation_id;

  -- Les non-retenus sont notifiés automatiquement (module 9) : ici, leur
  -- statut bascule — c'est ce que leur écran lit.
  update public.incident_devis set statut = 'non_retenu'
  where sollicitation_id in (select s.id from public.incident_sollicitations s
                             where s.consultation_id = (select s2.consultation_id
                               from public.incident_sollicitations s2 where s2.id = d.sollicitation_id))
    and id <> p_devis and statut = 'depose';
  update public.incident_sollicitations set statut = 'non_retenue'
  where consultation_id = (select s2.consultation_id from public.incident_sollicitations s2
                           where s2.id = d.sollicitation_id)
    and id <> d.sollicitation_id and statut in ('envoyee', 'devis_depose');
  update public.incident_consultations set statut = 'close', closed_at = now()
  where id = (select s2.consultation_id from public.incident_sollicitations s2
              where s2.id = d.sollicitation_id);

  insert into public.incident_interventions
    (organization_id, incident_id, artisan_id, devis_id, nature_travaux, created_by)
  values (p_org, d.incident_id, d.artisan_id, p_devis,
          (select c.nature_travaux from public.incident_consultations c
           join public.incident_sollicitations s on s.consultation_id = c.id
           where s.id = d.sollicitation_id),
          (select auth.uid()))
  returning id into v_intervention;

  update public.incidents set etat = 'affecte' where id = d.incident_id;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, d.incident_id, 'selection_devis', (select auth.uid()),
          jsonb_build_object('devis_id', p_devis, 'artisan_id', d.artisan_id,
                             'montant_ttc_cents', d.montant_ttc_cents,
                             'intervention_id', v_intervention)),
         (p_org, d.incident_id, 'mission_confiee', (select auth.uid()),
          jsonb_build_object('intervention_id', v_intervention, 'artisan_id', d.artisan_id));
  return v_intervention;
end;
$function$
$definition_anterieure$);

-- artisan_blacklist_locale
select pg_temp.restaurer_fonction('public.artisan_blacklist_locale(uuid,uuid,text)',
  $marque$Décision D18 du 14/10 (livraison 2)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.artisan_blacklist_locale(p_org uuid, p_artisan uuid, p_motif text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_en_cours integer;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé — la mise en liste noire est du ressort du responsable de l''agence';
  end if;
  if length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Le motif est obligatoire — une liste noire se motive, une désactivation non (RM-8.5.2)';
  end if;

  select count(*) into v_en_cours from public.incident_interventions i
  where i.organization_id = p_org and i.artisan_id = p_artisan
    and i.statut in ('acceptee', 'planifiee', 'en_cours');
  if v_en_cours > 0 then
    raise exception 'Cet artisan a % intervention(s) en cours — une intervention en cours n''est jamais interrompue (RM-8.2.7/8.5.7)', v_en_cours;
  end if;

  insert into public.artisan_agences
    (organization_id, artisan_id, statut, blacklist_le, blacklist_motif,
     blacklist_par, purge_motif_le, created_by)
  values (p_org, p_artisan, 'desactive', now(), trim(p_motif),
          (select auth.uid()), (current_date + interval '3 years')::date,
          (select auth.uid()))
  on conflict (organization_id, artisan_id) do update
  set statut = 'desactive', blacklist_le = now(), blacklist_motif = trim(p_motif),
      blacklist_par = (select auth.uid()),
      purge_motif_le = (current_date + interval '3 years')::date;

  -- Les devis en attente tombent avec la liste noire (RM-8.5.7).
  update public.incident_devis set statut = 'annule'
  where organization_id = p_org and artisan_id = p_artisan and statut = 'depose';
  update public.incident_sollicitations set statut = 'annulee', repondue_le = now()
  where organization_id = p_org and artisan_id = p_artisan
    and statut in ('envoyee', 'devis_depose');
end;
$function$
$definition_anterieure$);

-- artisan_decider_plateforme
select pg_temp.restaurer_fonction('public.artisan_decider_plateforme(uuid,public.artisan_decision_plateforme,text)',
  $marque$Décision D18 du 14/10 (livraison 2)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.artisan_decider_plateforme(p_artisan uuid, p_decision artisan_decision_plateforme, p_motif text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_en_cours integer;
begin
  if not public.is_super_admin() then
    raise exception 'Accès refusé — la validation plateforme appartient au super admin seul (RM-8.5.3)';
  end if;
  if p_decision in ('refus', 'blacklist_globale', 'suspension')
     and length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Un refus, une suspension et une liste noire globale se motivent sur des faits objectifs';
  end if;
  -- « Vérifié » est le seul état de SIRET affectable (RM-A1.9, corrigée le
  -- 2026-09-04). Valider un artisan dont le SIRET ne l'est pas le rendrait
  -- « valide » et pourtant proposable nulle part, sans que rien ne le dise :
  -- une impasse silencieuse. On la refuse avec le geste qui manque.
  if p_decision = 'validation'
     and (select a.siret_etat from public.artisans a where a.id = p_artisan) <> 'verifie' then
    raise exception 'Vérifiez d''abord le SIRET : un artisan validé dont le SIRET ne l''est pas ne serait proposé à aucune agence (RM-A1.9)';
  end if;
  -- 27/09 : une suspension ne vise qu'une inscription validée.
  if p_decision = 'suspension'
     and (select a.statut_plateforme from public.artisans a where a.id = p_artisan) is distinct from 'valide' then
    raise exception 'Seule une inscription validée se suspend';
  end if;

  if p_decision = 'blacklist_globale' then
    select count(*) into v_en_cours from public.incident_interventions i
    where i.artisan_id = p_artisan and i.statut in ('acceptee', 'planifiee', 'en_cours');
    if v_en_cours > 0 then
      raise exception 'Cet artisan a % intervention(s) en cours — une intervention en cours n''est jamais interrompue (RM-8.2.7)', v_en_cours;
    end if;
  end if;

  update public.artisans a set
    statut_plateforme = case p_decision
      when 'validation' then 'valide'
      when 'refus' then 'refuse'
      when 'remise_en_attente' then 'en_attente'
      -- Suspendue : l'inscription redevient « à examiner » ; elle n'est plus
      -- proposée à de nouvelles affectations jusqu'à une nouvelle validation.
      when 'suspension' then 'en_attente'
      else a.statut_plateforme end::public.artisan_statut_plateforme,
    statut_motif = case when p_decision in ('validation','refus','remise_en_attente','suspension')
      then nullif(trim(coalesce(p_motif, '')), '') else a.statut_motif end,
    statut_decide_le = case when p_decision in ('validation','refus','remise_en_attente','suspension')
      then now() else a.statut_decide_le end,
    statut_decide_par = case when p_decision in ('validation','refus','remise_en_attente','suspension')
      then (select auth.uid()) else a.statut_decide_par end,
    blacklist_globale_le = case p_decision
      when 'blacklist_globale' then now()
      when 'levee_blacklist' then null else a.blacklist_globale_le end,
    blacklist_globale_motif = case p_decision
      when 'blacklist_globale' then trim(p_motif)
      when 'levee_blacklist' then null else a.blacklist_globale_motif end,
    blacklist_globale_par = case p_decision
      when 'blacklist_globale' then (select auth.uid())
      when 'levee_blacklist' then null else a.blacklist_globale_par end,
    -- A2 corrige RM-8.5.6 : le motif d'une blacklist globale se conserve
    -- 5 ans, « la sanction la plus lourde justifiant la trace la plus
    -- longue » — pas indéfiniment.
    purge_motif_le = case p_decision
      when 'blacklist_globale' then (current_date + interval '5 years')::date
      when 'levee_blacklist' then null else a.purge_motif_le end,
    -- Une validation solde la purge des inscriptions sans suite.
    purge_prevue_le = case when p_decision = 'validation' then null else a.purge_prevue_le end
  where a.id = p_artisan;
  if not found then raise exception 'Artisan introuvable'; end if;

  if p_decision = 'blacklist_globale' then
    update public.incident_devis set statut = 'annule'
    where artisan_id = p_artisan and statut = 'depose';
    update public.incident_sollicitations set statut = 'annulee', repondue_le = now()
    where artisan_id = p_artisan and statut in ('envoyee', 'devis_depose');
  end if;

  insert into public.artisan_validations (artisan_id, decision, motif, decide_par)
  values (p_artisan, p_decision, nullif(trim(coalesce(p_motif, '')), ''), (select auth.uid()));
end;
$function$
$definition_anterieure$);

-- mon_suivi_intervention
select pg_temp.restaurer_fonction('public.mon_suivi_intervention(uuid)',
  $marque$Décision D18 du 14/10 (livraison 2)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.mon_suivi_intervention(p_org uuid)
 RETURNS TABLE(incident_id uuid, etape text, intervention_id uuid, artisan text, nb_artisans_consultes integer, nb_devis_recus integer, rdv_debut timestamp with time zone, rdv_fin timestamp with time zone, terminee_le timestamp with time zone, creneaux_a_choisir integer, mes_creneaux_en_attente integer, creneaux_refuses integer, arbitrage boolean, travaux_realises text, nouvelle_intervention_necessaire boolean, photos_apres uuid[], deja_notee boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  ),
  mes_incidents as (
    select i.id
    from public.incidents i
    where i.organization_id = p_org
      and exists (select 1 from public.memberships m
                  where m.account_id = (select auth.uid())
                    and m.organization_id = p_org
                    and m.role = 'locataire' and m.status in ('active', 'inactive'))
      and (i.declarant_person_id in (select id from mes_fiches)
           or i.bail_id in (select id from mes_baux))
  ),
  -- Une seule mission par incident : la dernière confiée. Il peut y en avoir
  -- plusieurs (une refusée puis sa remplaçante), mais une seule VIVANTE —
  -- l'index unique partiel du socle le garantit — et c'est toujours la
  -- dernière qui a cours.
  derniere_mission as (
    select distinct on (iv.incident_id)
           iv.id, iv.incident_id, iv.artisan_id, iv.statut,
           iv.debut_prevu, iv.fin_prevue, iv.terminee_le
    from public.incident_interventions iv
    where iv.organization_id = p_org and iv.incident_id in (select id from mes_incidents)
    order by iv.incident_id, iv.confiee_le desc
  ),
  consultation_ouverte as (
    select c.id, c.incident_id
    from public.incident_consultations c
    where c.organization_id = p_org and c.statut = 'ouverte'
      and c.incident_id in (select id from mes_incidents)
  ),
  assemble as (
    select
      inc.id as incident_id,
      co.id as consultation_id,
      m.id as mission_id,
      m.statut as mission_statut,
      -- La mission RACONTE l'étape tant qu'aucune consultation n'est rouverte
      -- au-dessus d'elle et qu'elle n'est ni refusée ni annulée. Les deux cas
      -- existent : un refus rouvre une recherche (registre A5, retour à
      -- « qualifié »), et une réouverture d'incident peut relancer une
      -- consultation par-dessus une mission déjà terminée. Dans ces cas, tout
      -- ce que la mission portait (rendez-vous, compte rendu, photos) est
      -- périmé : on ne le laisse pas s'afficher comme s'il avait cours.
      (co.id is null and m.id is not null
       and m.statut not in ('refusee', 'annulee')) as courante,
      m.artisan_id, m.debut_prevu, m.fin_prevue, m.terminee_le,
      coalesce(so.nb, 0)::integer as nb_artisans_consultes,
      coalesce(dv.nb, 0)::integer as nb_devis_recus,
      coalesce(cr.a_choisir, 0)::integer as a_choisir,
      coalesce(cr.a_choisir_passes, 0)::integer as a_choisir_passes,
      coalesce(cr.les_miens, 0)::integer as les_miens,
      coalesce(cr.refuses, 0)::integer as refuses,
      cro.travaux_realises,
      coalesce(cro.nouvelle_intervention_necessaire, false) as nouvelle_intervention,
      coalesce(ph.apres, array[]::uuid[]) as photos_apres,
      (ev.id is not null) as deja_notee
    from mes_incidents inc
    left join derniere_mission m on m.incident_id = inc.id
    left join consultation_ouverte co on co.incident_id = inc.id
    left join lateral (
      -- On ne compte que les artisans DONT UN DEVIS EST ENCORE POSSIBLE.
      -- « declinee » et « expiree » y figuraient : l'écran annonçait alors
      -- « 2 artisans consultés — votre gestionnaire attend leur devis » alors
      -- que les deux avaient refusé de chiffrer et que personne n'enverrait
      -- rien (constat du 11/09).
      select count(*) filter (
        where s.statut in ('envoyee', 'devis_depose', 'retenue', 'non_retenue')
      ) as nb
      from public.incident_sollicitations s where s.consultation_id = co.id
    ) so on true
    left join lateral (
      select count(*) as nb from public.incident_devis d
      join public.incident_sollicitations s on s.id = d.sollicitation_id
      where s.consultation_id = co.id and d.statut in ('depose', 'retenu')
    ) dv on true
    left join lateral (
      select
        -- Seulement si le bail est encore vivant : `mes_creneaux_locataire`,
        -- seule source de la LISTE affichable, l'exige. Sans ce miroir, un
        -- locataire relogé dans la même agence (adhésion conservée, incident
        -- rattaché par declarant_person_id) lisait « propose 3 créneaux » au
        -- dessus d'une liste vide.
        count(*) filter (
          where k.statut = 'propose' and k.propose_par = 'artisan'
            and k.debut > now()
            and exists (select 1 from public.incidents i2
                        where i2.id = m.incident_id and i2.bail_id in (select id from mes_baux))
        ) as a_choisir,
        -- Les créneaux de l'artisan déjà PASSÉS (audit du 27/09) : ils ne se
        -- retiennent plus, mais l'étape reste « à choisir » — le locataire y
        -- propose ses disponibilités au lieu d'attendre une liste qui ne
        -- viendra pas.
        count(*) filter (
          where k.statut = 'propose' and k.propose_par = 'artisan'
            and k.debut <= now()
            and exists (select 1 from public.incidents i2
                        where i2.id = m.incident_id and i2.bail_id in (select id from mes_baux))
        ) as a_choisir_passes,
        count(*) filter (where k.statut = 'propose' and k.propose_par = 'locataire') as les_miens,
        count(*) filter (where k.statut = 'refuse') as refuses
      from public.intervention_creneaux k where k.intervention_id = m.id
    ) cr on true
    left join public.intervention_comptes_rendus cro on cro.intervention_id = m.id
    left join lateral (
      select array_agg(p.document_id order by p.created_at) as apres
      from public.intervention_photos p
      join public.documents d on d.id = p.document_id and d.purged_at is null
      where p.intervention_id = m.id and p.moment = 'apres'
    ) ph on true
    -- Une évaluation RETIRÉE par le super admin (RM-11.4.4) compte quand même
    -- comme « déjà notée » : la contrainte d'unicité du socle porte sur
    -- (intervention, source) sans regarder le retrait, donc rouvrir le
    -- formulaire ne ferait qu'offrir un geste que la base refusera.
    left join public.artisan_evaluations ev
           on ev.intervention_id = m.id and ev.source = 'locataire'
    where m.id is not null or co.id is not null
  )
  select
    a.incident_id,
    case
      when a.consultation_id is not null then
        case when a.nb_devis_recus > 0 then 'devis_recus' else 'recherche' end
      when a.mission_id is null then null
      when a.mission_statut = 'refusee' then 'reaffectation'
      when a.mission_statut = 'annulee' then 'reaffectation_agence'
      when a.mission_statut = 'proposee'  then 'artisan_retenu'
      when a.mission_statut = 'planifiee' then 'planifiee'
      when a.mission_statut = 'en_cours'  then 'en_cours'
      when a.mission_statut = 'terminee'  then 'terminee'
      -- « acceptee » : la négociation du rendez-vous (module 10)
      when a.a_choisir + a.a_choisir_passes > 0 then 'creneau_a_choisir'
      when a.les_miens > 0 then 'ma_proposition'
      else 'creneaux_attendus'
    end,
    case when a.courante then a.mission_id end,
    -- Le nom n'apparaît qu'une fois la mission acceptée (voir l'en-tête).
    case when a.courante and a.mission_statut in
              ('acceptee', 'planifiee', 'en_cours', 'terminee')
         then ar.raison_sociale end,
    a.nb_artisans_consultes,
    a.nb_devis_recus,
    case when a.courante then a.debut_prevu end,
    case when a.courante then a.fin_prevue end,
    case when a.courante then a.terminee_le end,
    case when a.courante then a.a_choisir else 0 end,
    case when a.courante then a.les_miens else 0 end,
    case when a.courante then a.refuses else 0 end,
    -- RM-10.4.1 : au-delà de six refus « le problème n'est plus logistique
    -- mais relationnel » — le gérant règle par téléphone. L'écran cesse alors
    -- de réclamer une septième contre-proposition, qui n'ajouterait qu'un
    -- tour ; les créneaux refusés restent en base, opposables (RM-10.4.4).
    a.courante and a.refuses >= 6,
    -- Le travail décrit par l'artisan, et rien d'autre du compte rendu : ce
    -- qui en est écarté, et pourquoi, est dit en tête de migration.
    case when a.courante then a.travaux_realises end,
    case when a.courante then a.nouvelle_intervention else false end,
    case when a.courante then a.photos_apres else array[]::uuid[] end,
    a.courante and a.deja_notee
  from assemble a
  left join public.artisans ar on ar.id = a.artisan_id;
$function$
$definition_anterieure$);

-- mes_photos_incident_artisan
select pg_temp.restaurer_fonction('public.mes_photos_incident_artisan(uuid,uuid)',
  $marque$Décision D18 du 14/10 (livraison 2)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.mes_photos_incident_artisan(p_sollicitation uuid DEFAULT NULL::uuid, p_intervention uuid DEFAULT NULL::uuid)
 RETURNS TABLE(document_id uuid, mime_type text, rang integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with moi as (select public.mon_artisan_id() as id),
  vise as (
    select s.incident_id, s.organization_id
      from public.incident_sollicitations s, moi
     where p_sollicitation is not null and moi.id is not null
       and s.id = p_sollicitation and s.artisan_id = moi.id
       and s.statut in ('envoyee', 'devis_depose', 'retenue')
    union
    select iv.incident_id, iv.organization_id
      from public.incident_interventions iv, moi
     where p_intervention is not null and moi.id is not null
       and iv.id = p_intervention and iv.artisan_id = moi.id
       and iv.statut in ('proposee', 'acceptee', 'planifiee', 'en_cours')
  )
  select d.id, d.mime_type, (row_number() over (order by d.created_at, d.id))::integer
    from vise v
    join public.incidents inc on inc.id = v.incident_id and inc.organization_id = v.organization_id and inc.etat <> 'clos'
    join public.persons declarant on declarant.id = inc.declarant_person_id and declarant.account_id is not null
    join public.document_liens dl on dl.entite = 'incident' and dl.entite_id = v.incident_id and dl.organization_id = v.organization_id
    join public.documents d on d.id = dl.document_id and d.organization_id = v.organization_id
     and d.type = 'photo_incident' and d.purged_at is null and d.storage_path is not null
     and d.deposited_by = declarant.account_id
   order by 3;
$function$
$definition_anterieure$);

-- lire_devis_structure
select pg_temp.restaurer_fonction('public.lire_devis_structure(uuid)',
  $marque$Décision D18 du 14/10 (livraison 2)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.lire_devis_structure(p_sollicitation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.incident_devis%rowtype; resultat jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Accès refusé'; end if;
  select * into d from public.incident_devis where sollicitation_id=p_sollicitation;
  if d.id is null then raise exception 'Accès refusé'; end if;
  -- Coalesce obligatoire : une identité artisan absente ne doit pas court-circuiter le refus.
  if not coalesce(public.is_super_admin() or d.artisan_id=public.mon_artisan_id() or
    (d.organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
      and not public.incident_hors_portefeuille(d.organization_id,d.incident_id)),false) then raise exception 'Accès refusé'; end if;
  select jsonb_build_object('id',d.id,'description',d.description,'lignes',d.lignes,
    'montant_ht_cents',d.montant_ht_cents,'montant_tva_cents',d.montant_tva_cents,'montant_ttc_cents',d.montant_ttc_cents,
    'diagnostic',d.diagnostic,'delai_intervention',d.delai_intervention,'duree_estimee',d.duree_estimee,
    'contraintes',d.contraintes,'observations',d.observations,'statut',d.statut,
    'depose_le',d.depose_le,'valide_jusqu_au',d.valide_jusqu_au,
    'artisan_nom',a.raison_sociale,'artisan_siret',a.siret,'artisan_telephone',a.telephone,
    'artisan_email',a.email,'agence_nom',o.name,'incident_numero',i.numero,
    'commune',b.city,'code_postal',b.postal_code)
  into resultat from public.artisans a join public.organizations o on o.id=d.organization_id
    join public.incidents i on i.id=d.incident_id and i.organization_id=d.organization_id
    join public.lots l on l.id=i.lot_id and l.organization_id=d.organization_id
    join public.biens b on b.id=l.bien_id and b.organization_id=d.organization_id
    where a.id=d.artisan_id;
  insert into public.audit_log(account_id,organization_id,action,details)
    values((select auth.uid()),d.organization_id,'devis_document_consulte',jsonb_build_object('devis_id',d.id));
  return resultat;
end $function$
$definition_anterieure$);

-- fermer_alerte
select pg_temp.restaurer_fonction('public.fermer_alerte_devis_a_decider()',
  $marque$Décision D18 du 14/10 (livraison 2)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.fermer_alerte_devis_a_decider()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Seules les alertes encore ouvertes de CE devis : une alerte déjà fermée à la main (ou par la clôture de
  -- l'incident) garde sa raison. La raison dit ce qui est arrivé au devis.
  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = case new.statut
        when 'retenu' then 'Devis retenu'
        when 'non_retenu' then 'Un autre devis a été retenu'
        when 'expire' then 'Devis expiré'
        -- Décision D18 du 14/10 (livraison 1) : le refus motivé ferme l'alerte avec sa raison.
        when 'refuse' then 'Devis refusé'
        else 'Devis annulé' end
  where organization_id = new.organization_id
    and type = 'devis_a_decider'
    and statut = 'ouverte'
    and details->>'devis_id' = new.id::text;
  return null;
end $function$
$definition_anterieure$);

-- maintenance_artisans_interne
select pg_temp.restaurer_fonction('public.maintenance_artisans_interne()',
  $marque$Décision D18 du 14/10 (livraison 2)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.maintenance_artisans_interne()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- Audit du 14/10 (AUT-01), D42 option B : la caducité des devis SEULE, pour pg_cron (aucune garde d'identité).
-- Audit du 14/10 (AUT-01, D06) : l'arrêt d'urgence l'arrête aussi (global, ou clé « rappels ») : aucun effet.
declare
  v_devis integer;
  -- Le jour de Paris, comme l'écran : un devis valable « jusqu'au » un jour l'est toute la journée.
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_systeme text := coalesce(current_setting('gerimmo.systeme', true), '');
  v_autorisee boolean := true;
begin
  -- Arrêt d'urgence, lu AVANT tout effet. Le prédicat est celui du lot « arrêt d'urgence » (fermé à tous les rôles,
  -- lu ici par le propriétaire de la fonction) ; absent, il n'y a rien à lire.
  if pg_catalog.to_regprocedure('public.tache_planifiee_autorisee(text)') is not null then
    execute 'select public.tache_planifiee_autorisee($1)' into v_autorisee using 'maintenance-artisans';
    if not v_autorisee then
      return 0;
    end if;
  end if;

  -- Tâche de plateforme : sans identité (pg_cron), la garde d'abonnement refuse toute écriture sur une agence
  -- suspendue ; une seule agence dans ce cas ferait échouer le passage pour TOUTES. La caducité d'un devis ne
  -- dépend pas de la situation commerciale de l'agence (c'est l'usage prévu de tache_systeme(), « à appeler en tête
  -- d'une tâche planifiée »). Le drapeau ne vaut que pour la transaction en cours, et il est rendu à sa valeur
  -- d'avant avant de sortir (appel manuel inclus).
  perform public.tache_systeme();

  update public.incident_devis set statut = 'expire'
  where statut = 'depose' and valide_jusqu_au < v_jour;
  get diagnostics v_devis = row_count;

  update public.incident_sollicitations s set statut = 'expiree'
  where s.statut in ('envoyee', 'devis_depose')
    and exists (select 1 from public.incident_devis d
                where d.sollicitation_id = s.id and d.statut = 'expire');

  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);
  return v_devis;
end;
$function$
$definition_anterieure$);

-- libelle_generique_alerte
select pg_temp.restaurer_fonction('public.libelle_generique_alerte(text)',
  $marque$devis_revision_expiree$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.libelle_generique_alerte(p_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_type
    when 'assurance_expiration' then 'Attestation d’assurance à renouveler'
    when 'attestation_a_verifier' then 'Attestation à contrôler'
    when 'avenant_devis_a_decider' then 'Dépassement de devis à décider'
    when 'conge_intention' then 'Congé à confirmer'
    when 'creneaux_arbitrage' then 'Rendez-vous à arbitrer'
    when 'decompte' then 'Décompte de restitution à envoyer'
    when 'decompte_lrar' then 'Décompte de restitution à envoyer en recommandé'
    when 'diagnostic_expiration' then 'Diagnostic à renouveler'
    when 'ecart_versement' then 'Écart de versement au propriétaire'
    when 'edl_entree' then 'État des lieux d’entrée à faire'
    when 'edl_sortie' then 'État des lieux de sortie à faire'
    when 'facture_artisan_a_valider' then 'Facture d’artisan à contrôler'
    when 'incident_a_qualifier' then 'Incident à qualifier'
    when 'incident_conteste' then 'Imputation d’incident contestée'
    when 'incident_imputation_a_reviser' then 'Imputation à réviser avant facturation'
    when 'loyer_impaye' then 'Loyer impayé'
    when 'manuelle' then 'Alerte saisie à la main'
    when 'message_locataire' then 'Message d’un locataire'
    when 'piece_deposee' then 'Pièce déposée à contrôler'
    when 'restitution_echeance' then 'Restitution du dépôt de garantie à traiter'
    when 'retenue_sans_justificatif' then 'Retenue sans justificatif'
    when 'signature_a_reprendre' then 'Signature à reprendre'
    when 'signature_retournee' then 'Document signé à contrôler'
    when 'versement_proprietaire' then 'Versement au propriétaire à faire'
    when 'zone_tendue_a_verifier' then 'Zone tendue à vérifier'
    else 'Alerte à traiter'
  end;
$function$
$definition_anterieure$);

drop function if exists public.expirer_revisions_devis(date);

-- mes_sollicitations : le type de retour change, donc drop puis create (seulement si la marque y est).
do $retour_arriere$
declare v_courante text;
begin
  v_courante := pg_get_functiondef('public.mes_sollicitations()'::regprocedure);
  if position('Décision D18 du 14/10 (livraison 2)' in v_courante) = 0 then
    raise notice 'public.mes_sollicitations() : marque du correctif absente, rien à faire';
    return;
  end if;
  drop function public.mes_sollicitations();
  execute $definition_anterieure$CREATE OR REPLACE FUNCTION public.mes_sollicitations()
 RETURNS TABLE(sollicitation_id uuid, organization_id uuid, agence_nom text, incident_numero text, categorie text, description text, urgence incident_urgence, metier artisan_metier, nature_travaux nature_travaux, decennale_requise boolean, code_postal text, ville text, envoyee_le timestamp with time zone, statut sollicitation_statut, valide_jusqu_au date, montant_ttc_cents bigint, decision_motif text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Décision D18 du 14/10 (livraison 1) : la dernière colonne porte le motif du refus de son devis.
  select s.id, s.organization_id, o.name, i.numero, i.categorie, i.description,
         i.urgence, c.metier, c.nature_travaux, c.decennale_requise,
         b.postal_code, b.city, s.envoyee_le, s.statut,
         d.valide_jusqu_au, d.montant_ttc_cents,
         d.decision_motif
  from public.incident_sollicitations s
  join public.incident_consultations c on c.id = s.consultation_id
  join public.incidents i on i.id = s.incident_id
  join public.lots l on l.id = i.lot_id
  join public.biens b on b.id = l.bien_id
  join public.organizations o on o.id = s.organization_id
  left join public.incident_devis d on d.sollicitation_id = s.id
  where s.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  order by (s.statut = 'envoyee') desc, s.envoyee_le desc;
$function$$definition_anterieure$;
  revoke all on function public.mes_sollicitations() from public, anon;
  grant execute on function public.mes_sollicitations() to authenticated, service_role;
  raise notice 'public.mes_sollicitations() : définition antérieure rétablie';
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014601000';
  end if;
end $retour_arriere$;

commit;
