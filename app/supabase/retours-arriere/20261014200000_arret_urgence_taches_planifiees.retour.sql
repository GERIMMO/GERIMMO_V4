-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014200000_arret_urgence_taches_planifiees.sql (décision D06 : l'arrêt d'urgence
-- couvre aussi les 8 tâches pg_cron).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Ce que fait ce script : il retire de chacune des 8 fonctions planifiées l'appel au prédicat
-- tache_planifiee_autorisee (leur définition antérieure est rétablie), puis supprime le prédicat, la
-- table de correspondance supervision_taches_arret et la ligne d'historique de la migration.
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les
-- migrations d'origine SANS cette migration, puis recopiées ici par un générateur — aucune n'est écrite
-- à la main. Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014200000_arret_urgence_taches_planifiees.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : un arrêt d'urgence (global, « purge », « appels », « quittances »,
-- « relances », « rappels » ou « marketing ») ne retient plus la rétention, le cycle mensuel des appels
-- de loyer, les alertes ni le déclencheur marketing de pg_cron. L'écran continuerait d'afficher « arrêt
-- actif » pendant que ces tâches tournent. Aucune donnée n'est modifiée par le retour lui-même.

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

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

-- appliquer_retention
select pg_temp.restaurer_fonction('public.appliquer_retention()',
  $marque$Audit du 14/10 (SUP-01)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.appliquer_retention()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_regle record;
  v_doc record;
  v_docs_purges int := 0;
  v_docs_anonymises int := 0;
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

  delete from public.demandes_devis
    where created_at < now() - make_interval(months => 24);
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('demandes_devis', v_count);

  delete from public.intentions_conge
    where traitee_le is not null
      and traitee_le < now() - make_interval(months => 24);
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('intentions_conge', v_count);

  delete from public.demandes_signature ds
    where exists (select 1 from public.documents d
                  where d.id = ds.document_id and d.purged_at is not null
                    and d.anonymise_le is null)
       or (ds.signee_le is not null
           and ds.signee_le < now() - make_interval(months => 24));
  get diagnostics v_count = row_count;
  v_journaux := v_journaux || jsonb_build_object('demandes_signature', v_count);

  -- Le compteur court depuis le déclencheur de la règle (fin du bail, du
  -- mandat, de la gestion, clôture de l'incident), pas depuis le dépôt.
  for v_doc in
    select d.id, d.organization_id, d.type, d.storage_path, r.sort, r.data_type, r.libelle,
           public.debut_conservation_document(d.id) as debut
    from public.documents d
    join public.retention_rules r
      on r.data_type = 'document:' || d.type::text and r.actif
    where d.purged_at is null
      and r.sort in ('suppression', 'anonymisation')
      -- préfiltre bon marché : le déclencheur n'est jamais avant le dépôt
      and d.retention_reference_date + make_interval(months => r.duree_mois) <= now()
  loop
    continue when v_doc.debut is null;
    continue when v_doc.debut + make_interval(months => (select duree_mois from public.retention_rules
                                                           where data_type = v_doc.data_type)) > now();

    if v_doc.storage_path is not null then
      insert into public.purge_fichiers (storage_path) values (v_doc.storage_path);
    end if;

    if v_doc.sort = 'anonymisation' then
      -- La contrepartie subsiste, sans personne : rattachements non
      -- personnels gardés, titre neutre, auteurs retirés.
      delete from public.document_liens where document_id = v_doc.id and entite = 'personne';
      update public.documents
        set purged_at = now(), anonymise_le = now(), storage_path = null, mime_type = null,
            taille_octets = null, titre = v_doc.libelle || ' (anonymisé)',
            deposited_by = null, verifie_par = null
        where id = v_doc.id;
      v_docs_anonymises := v_docs_anonymises + 1;
    else
      delete from public.document_liens where document_id = v_doc.id;
      update public.documents
        set purged_at = now(), storage_path = null, mime_type = null,
            taille_octets = null, empreinte = null, titre = null,
            deposited_by = null, verifie_par = null
        where id = v_doc.id;
    end if;
    insert into public.audit_log (account_id, organization_id, action, details)
    values ((select auth.uid()), v_doc.organization_id, 'purge_retention',
            jsonb_build_object('document_id', v_doc.id, 'type', v_doc.type,
                               'regle', v_doc.data_type, 'sort', v_doc.sort,
                               'debut_conservation', v_doc.debut));
    v_docs_purges := v_docs_purges + 1;
  end loop;

  v_journaux := v_journaux || jsonb_build_object('signalements_support',public.purger_signalements_support());
  return jsonb_build_object('journaux', v_journaux, 'documents_purges', v_docs_purges,
                            'documents_anonymises', v_docs_anonymises,
                            'fichiers_en_attente', (select count(*) from public.purge_fichiers where deleted_at is null));
end;
$function$
$definition_anterieure$);

-- cycle_mensuel_interne
select pg_temp.restaurer_fonction('public.cycle_mensuel_interne()',
  $marque$Audit du 14/10 (SUP-01)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.cycle_mensuel_interne()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_bail record;
  v_appels int;
  v_crees int := 0;
  v_baux int := 0;
  v_quittances int := 0;
  v_recus int := 0;
  v_echecs jsonb := '[]'::jsonb;
  r record;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'cycle_mensuel_interne: reserve au cron et au super admin';
  end if;

  for v_bail in
    select b.id
    from public.baux b
    join public.organizations o on o.id = b.organization_id
    where b.date_debut is not null
      and (b.etat in ('actif', 'preavis')
           -- Un bail clos ce mois-ci ou le mois dernier doit encore recevoir
           -- son dernier appel proratisé ; au-delà, tout a déjà été généré.
           or (b.etat = 'termine' and b.date_fin is not null
               and b.date_fin >= (date_trunc('month', current_date) - interval '1 month')::date))
      -- Une organisation suspendue n'est plus servie : elle lit, elle n'écrit plus.
      and public.org_ecriture_ouverte(o.id)
    order by b.id
  loop
    v_baux := v_baux + 1;
    -- Un bail en défaut (mention manquante, données incohérentes) ne doit pas
    -- emporter le mois de tous les autres : on note et on continue.
    begin
      v_appels := public.generer_appels_loyer_interne(v_bail.id);
      v_crees := v_crees + v_appels;
      select q.quittances, q.recus into r
        from public.resynchroniser_quittances(v_bail.id) q;
      v_quittances := v_quittances + coalesce(r.quittances, 0);
      v_recus := v_recus + coalesce(r.recus, 0);
    exception when others then
      v_echecs := v_echecs || jsonb_build_object('bail_id', v_bail.id, 'erreur', sqlerrm);
    end;
  end loop;

  -- Le journal technique garde la trace du passage : sans elle, « le cycle n'a
  -- pas tourné » et « le cycle n'avait rien à faire » ne se distinguent pas.
  insert into public.tech_log (evenement, details)
  values ('cycle_mensuel', jsonb_build_object(
    'baux', v_baux, 'appels_crees', v_crees,
    'quittances', v_quittances, 'recus', v_recus,
    'echecs', jsonb_array_length(v_echecs), 'detail_echecs', v_echecs));

  return jsonb_build_object('baux', v_baux, 'appels_crees', v_crees,
    'quittances', v_quittances, 'recus', v_recus, 'echecs', v_echecs);
end;
$function$
$definition_anterieure$);

-- declencher_marketing
select pg_temp.restaurer_fonction('public.declencher_marketing()',
  $marque$Audit du 14/10 (SUP-01)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.declencher_marketing()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.declencheur_marketing%rowtype; v_du boolean;
begin
  select * into d from public.declencheur_marketing where singleton;
  if not found or not d.actif then return; end if;
  select exists (select from public.publications p where p.statut = 'programmee' and p.programmee_pour <= now())
      or public.preparation_marketing_due() into v_du;
  if not v_du then return; end if;
  if not exists (select from pg_catalog.pg_extension where extname = 'pg_net') then return; end if;
  -- Pas plus d'un appel toutes les quatre minutes : l'appel précédent peut
  -- encore tourner (préparation du visuel, jusqu'à trois minutes).
  if d.dernier_appel_le is not null and d.dernier_appel_le > now() - interval '4 minutes' then return; end if;
  update public.declencheur_marketing set dernier_appel_le = now() where singleton;
  perform net.http_get(
    url := d.site_url || '/api/cron/equipes?mission=marketing',
    headers := jsonb_build_object('authorization', 'Bearer ' || d.jeton),
    timeout_milliseconds := 15000);
end $function$
$definition_anterieure$);

-- generer_alertes_assurance
select pg_temp.restaurer_fonction('public.generer_alertes_assurance()',
  $marque$Audit du 14/10 (SUP-01)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.generer_alertes_assurance()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_att record;
  v_seuil text;
  v_criticite public.alerte_criticite;
  v_crees int := 0;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'generer_alertes_assurance: reserve au cron et au super admin';
  end if;

  for v_att in
    select d.id as document_id, d.organization_id, d.expire_le,
           dl.entite_id as person_id, p.nom as person_nom
    from public.documents d
    join public.document_liens dl
      on dl.document_id = d.id and dl.entite = 'personne'
    join public.persons p on p.id = dl.entite_id
    where d.type = 'attestation_assurance'
      and d.purged_at is null
      and d.expire_le is not null
      and d.expire_le <= current_date + 30
      and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  loop
    v_seuil := case
      when v_att.expire_le <= current_date - 15 then 'J+15'
      when v_att.expire_le <= current_date then 'J+0'
      when v_att.expire_le <= current_date + 15 then 'J-15'
      else 'J-30'
    end;
    v_criticite := case v_seuil
      when 'J-30' then 'informative'::public.alerte_criticite
      when 'J-15' then 'normale'::public.alerte_criticite
      else 'critique'::public.alerte_criticite
    end;
    v_crees := v_crees + public.poser_alerte_seuil(
      v_att.organization_id, 'assurance_expiration', 'document_id', v_att.document_id, v_seuil,
      v_criticite,
      format('Assurance habitation — %s : %s', v_att.person_nom,
        case v_seuil
          when 'J-30' then format('expire le %s (rappel locataire)', to_char(v_att.expire_le, 'DD/MM/YYYY'))
          when 'J-15' then format('expire le %s (relance à faire)', to_char(v_att.expire_le, 'DD/MM/YYYY'))
          when 'J+0' then 'défaut d''assurance constaté'
          else 'défaut d''assurance persistant (motif possible de résiliation)'
        end),
      jsonb_build_object('document_id', v_att.document_id, 'person_id', v_att.person_id),
      v_att.expire_le);
  end loop;

  return v_crees;
end;
$function$
$definition_anterieure$);

-- generer_alertes_diagnostics
select pg_temp.restaurer_fonction('public.generer_alertes_diagnostics()',
  $marque$Audit du 14/10 (SUP-01)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.generer_alertes_diagnostics()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_diag record;
  v_seuil text;
  v_criticite public.alerte_criticite;
  v_crees int := 0;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'generer_alertes_diagnostics: reserve au cron et au super admin';
  end if;

  for v_diag in
    select d.id, d.organization_id, d.type, d.date_expiration,
           coalesce(l.nom, b2.nom) as cible,
           coalesce(b.nom, b2.nom) as bien_nom
    from public.diagnostics d
    left join public.lots l on l.id = d.lot_id
    left join public.biens b on b.id = l.bien_id
    left join public.biens b2 on b2.id = d.bien_id
    where d.archived_at is null and d.date_expiration is not null
      and d.date_expiration <= current_date + 90
  loop
    v_seuil := case
      when v_diag.date_expiration <= current_date then 'J+0'
      when v_diag.date_expiration <= current_date + 30 then 'J-30'
      else 'J-90'
    end;
    v_criticite := case v_seuil
      when 'J+0' then 'critique'::public.alerte_criticite
      when 'J-30' then 'normale'::public.alerte_criticite
      else 'informative'::public.alerte_criticite
    end;
    v_crees := v_crees + public.poser_alerte_seuil(
      v_diag.organization_id, 'diagnostic_expiration', 'diagnostic_id', v_diag.id, v_seuil,
      v_criticite,
      format('%s — %s : %s',
        upper(v_diag.type::text), v_diag.bien_nom,
        case when v_seuil = 'J+0'
          then 'diagnostic expiré (bail bloqué tant qu''il n''est pas redéposé)'
          else format('expire le %s', to_char(v_diag.date_expiration, 'DD/MM/YYYY')) end),
      jsonb_build_object('diagnostic_id', v_diag.id, 'type_diagnostic', v_diag.type),
      v_diag.date_expiration);
  end loop;

  return v_crees;
end;
$function$
$definition_anterieure$);

-- generer_alertes_impayes
select pg_temp.restaurer_fonction('public.generer_alertes_impayes()',
  $marque$Audit du 14/10 (SUP-01)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.generer_alertes_impayes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_bail record;
  v_posees int := 0;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'generer_alertes_impayes: reserve au cron et au super admin';
  end if;

  for v_bail in
    select b.id
    from public.baux b
    join public.organizations o on o.id = b.organization_id
    where b.etat in ('actif', 'preavis', 'termine')
      -- La dette survit au bail (RM-3.6.8) : un bail terminé qui doit encore
      -- reste suivi. Ce qui s'arrête, c'est le service d'une organisation
      -- suspendue — elle ne reçoit plus d'alertes neuves.
      and public.org_ecriture_ouverte(o.id)
    order by b.id
  loop
    v_posees := v_posees + public.suivre_impayes_bail(v_bail.id);
  end loop;
  return v_posees;
end;
$function$
$definition_anterieure$);

-- generer_alertes_restitution
select pg_temp.restaurer_fonction('public.generer_alertes_restitution()',
  $marque$Audit du 14/10 (SUP-01)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.generer_alertes_restitution()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_r record;
  v_limite date;
  v_seuil text;
  v_criticite public.alerte_criticite;
  v_crees int := 0;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'generer_alertes_restitution: reserve au cron et au super admin';
  end if;

  for v_r in
    select r.id, r.organization_id, r.bail_id, r.date_remise_cles, r.delai_mois,
           l.nom as lot_nom,
           trim(coalesce(p.prenom, '') || ' ' || p.nom) as locataire
    from public.restitutions r
    join public.baux b on b.id = r.bail_id
    join public.lots l on l.id = b.lot_id
    left join public.persons p on p.id = b.locataire_principal
    where r.statut = 'en_cours'
  loop
    v_limite := public.restitution_date_limite(v_r.date_remise_cles, v_r.delai_mois);
    if v_limite > current_date + 7 then continue; end if;
    v_seuil := case when v_limite <= current_date then 'J+0' else 'J-7' end;
    v_criticite := case v_seuil when 'J+0' then 'critique'::public.alerte_criticite
                                else 'normale'::public.alerte_criticite end;
    v_crees := v_crees + public.poser_alerte_seuil(
      v_r.organization_id, 'restitution_echeance', 'restitution_id', v_r.id, v_seuil,
      v_criticite,
      format('Restitution du dépôt — %s · %s : %s',
        v_r.lot_nom, coalesce(nullif(v_r.locataire, ''), 'locataire'),
        case when v_seuil = 'J+0'
          then format('délai légal dépassé depuis le %s (intérêts de retard dus)', to_char(v_limite, 'DD/MM/YYYY'))
          else format('à rendre avant le %s', to_char(v_limite, 'DD/MM/YYYY')) end),
      jsonb_build_object('restitution_id', v_r.id, 'bail_id', v_r.bail_id),
      v_limite);
  end loop;

  return v_crees;
end;
$function$
$definition_anterieure$);

-- proposer_publications_interne
select pg_temp.restaurer_fonction('public.proposer_publications_interne(date)',
  $marque$Audit du 14/10 (SUP-01)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.proposer_publications_interne(p_a_la_date date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_jour    date := coalesce(p_a_la_date, current_date);
  v_mois    smallint := extract(month from v_jour)::smallint;
  v_annee   text := to_char(v_jour, 'YYYY');
  v         record;
  v_periode text;
  v_cree    integer := 0;
begin

  for v in
    select * from public.publication_veines
     where actif and v_mois = any(mois_declencheur)
     order by cle
  loop
    v_periode := case v.cadence
      when 'annuelle'      then v_annee
      when 'semestrielle'  then v_annee || '-S' || (case when v_mois <= 6 then '1' else '2' end)
      else v_annee || '-T' || ceil(v_mois / 3.0)::int::text
    end;

    insert into public.publications
      (veine, periode, statut, titre, chapo, corps, sources)
    values
      (v.cle, v_periode, 'proposition',
       replace(v.titre_gabarit, '{annee}', v_annee),
       v.chapo_gabarit,
       v.plan_gabarit,
       v.sources)
    on conflict (veine, periode) where veine is not null do nothing;

    if found then v_cree := v_cree + 1; end if;
  end loop;

  return v_cree;
end $function$
$definition_anterieure$);

-- Plus aucune fonction ne doit appeler le prédicat avant qu'on le retire : une fonction réécrite depuis
-- par une autre migration, qui l'appellerait encore, planterait à son prochain passage. Dans ce cas tout
-- s'arrête ici et la transaction est annulée (il faut alors régénérer ce script).
do $retour_arriere$
declare v_restantes text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.proname) into v_restantes
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prokind in ('f', 'p')
     and p.proname <> 'tache_planifiee_autorisee'
     and pg_get_functiondef(p.oid) like '%tache_planifiee_autorisee%';
  if v_restantes is not null then
    raise exception 'RETOUR ARRIÈRE REFUSÉ, rien n''a été modifié : des fonctions appellent encore le prédicat (%). Voir LISEZ-MOI.md.', v_restantes;
  end if;
end $retour_arriere$;

-- Le prédicat, puis sa table, SANS cascade (une dépendance inattendue arrête tout).
drop function if exists public.tache_planifiee_autorisee(text);
drop table if exists public.supervision_taches_arret;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014200000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
