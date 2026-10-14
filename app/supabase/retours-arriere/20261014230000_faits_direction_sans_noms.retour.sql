-- RETOUR ARRIÈRE de 20261014230000_faits_direction_sans_noms.sql (D13, fiche SUP-05)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une migration, il se
-- joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Une seule transaction : la moindre erreur annule tout.
--
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les migrations d'origine SANS
-- cette migration, puis recopiées ici par un générateur — aucune n'est écrite à la main. Rejouable : sans la marque
-- « D13 (SUP-05) » dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014230000_faits_direction_sans_noms.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (SUP-05) : les faits de direction recopient de nouveau le titre brut des alertes de toutes les
-- organisations (donc parfois un nom de locataire), la préparation et la lecture ne laissent plus de trace par organisation,
-- et les instantanés sont de nouveau écrits en version 1.
--
-- NE DÉFAIT PAS : les instantanés de version 2 déjà écrits (ils restent, sans nom, lisibles par l'ancienne lecture) ; les lignes
-- d'audit déjà écrites (preparation_faits_direction, consultation_faits_direction) ; l'effacement d'instantanés fait par
-- 20261014232000 (voir son propre retour : aucun).

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

-- préparation (1/3)
select pg_temp.restaurer_fonction('public.preparer_faits_direction()',
  $marque$D13 (SUP-05)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.preparer_faits_direction()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cle text; donnees jsonb; precedent jsonb; sources jsonb:='{}'; manquantes text[]:='{}'; resultat public.brief_direction_snapshots;
begin
 if not public.is_permanent_super_admin() then raise exception 'Supervision permanente et double vérification requises'; end if;
 -- Sérialise deux clics : une préparation simultanée ne fait pas concurrence
 -- au choix du dernier état connu. Aucun envoi, tâche ni décision créé ici.
 perform pg_advisory_xact_lock(hashtext('brief_direction_manuel'));
 foreach cle in array array['incidents','interventions','loyers','echeances','service'] loop
  begin
   donnees:=public.collecter_source_direction(cle);
   if donnees is null or jsonb_typeof(donnees)<>'object' then raise exception 'Source vide'; end if;
   sources:=sources||jsonb_build_object(cle,jsonb_build_object('statut','disponible','observe_le',now(),'donnees',donnees));
  exception when others then
   select s.sources->cle into precedent from public.brief_direction_snapshots s
    where s.sources->cle->>'observe_le' is not null order by s.genere_le desc limit 1;
   manquantes:=array_append(manquantes,cle);
   sources:=sources||jsonb_build_object(cle,jsonb_build_object('statut','indisponible','observe_le',precedent->'observe_le','donnees',precedent->'donnees','erreur','Lecture indisponible ; dernier état connu conservé','code_erreur',SQLSTATE));
  end;
 end loop;
 insert into public.brief_direction_snapshots(jour,auteur_reel,sources,indisponibles)
 values((now() at time zone 'Europe/Paris')::date,auth.uid(),sources,manquantes) returning * into resultat;
 return to_jsonb(resultat);
end;
$function$
$definition_anterieure$);

-- lecture (2/3)
select pg_temp.restaurer_fonction('public.lire_faits_direction(date)',
  $marque$D13 (SUP-05)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.lire_faits_direction(p_jour date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb;
begin
 if not public.is_permanent_super_admin() then raise exception 'Supervision permanente et double vérification requises'; end if;
 select to_jsonb(s) into r from public.brief_direction_snapshots s where s.jour=p_jour order by s.genere_le desc limit 1;
 return r;
end;
$function$
$definition_anterieure$);

-- collecte (3/3)
select pg_temp.restaurer_fonction('public.collecter_source_direction(text)',
  $marque$D13 (SUP-05)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.collecter_source_direction(p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb;
begin
 if not public.is_permanent_super_admin() then raise exception 'Supervision permanente et double vérification requises'; end if;
 case p_source
 when 'incidents' then
  select jsonb_build_object('mesures',jsonb_build_object('urgents_ouverts',count(*)),
   'faits',coalesce((select jsonb_agg(x.obj) from (select jsonb_build_object('titre',i.numero||' · '||i.etat::text,'date',i.created_at,'href','/agence/'||i.organization_id||'/incidents?sel='||i.id) obj
    from public.incidents i where i.urgence='urgente' and i.etat<>'clos' order by i.created_at limit 20)x),'[]'::jsonb)) into r
  from public.incidents where urgence='urgente' and etat<>'clos';
 when 'interventions' then
  select jsonb_build_object('mesures',jsonb_build_object('rendez_vous_depasses',count(*) filter(where fin_prevue<now()),'missions_sans_date',count(*) filter(where fin_prevue is null)),
   'faits',coalesce((select jsonb_agg(x.obj) from (select jsonb_build_object('titre',inc.numero||' · rendez-vous dépassé','date',iv.fin_prevue,'href','/agence/'||iv.organization_id||'/incidents?sel='||iv.incident_id) obj
    from public.incident_interventions iv join public.incidents inc on inc.id=iv.incident_id
    where iv.statut in ('acceptee','planifiee','en_cours') and iv.fin_prevue<now() order by iv.fin_prevue limit 20)x),'[]'::jsonb)) into r
  from public.incident_interventions where statut in ('acceptee','planifiee','en_cours');
 when 'loyers' then
  with etats as materialized(select b.organization_id,b.id bail_id,e.* from public.baux b cross join lateral public.etat_loyers_bail_brut(b.id)e),
   retards as(select * from etats where date_echeance<current_date and montant_couvert<montant_du),
   prochains as(select * from etats where date_echeance between current_date and current_date+7 and montant_couvert<montant_du)
  select jsonb_build_object('mesures',jsonb_build_object('echeances_en_retard',(select count(*) from retards),'reste_en_retard_eur',(select coalesce(sum(montant_du-montant_couvert),0) from retards),'echeances_prochains_7_jours',(select count(*) from prochains),'reste_prochains_7_jours_eur',(select coalesce(sum(montant_du-montant_couvert),0) from prochains)),
   'faits',coalesce((select jsonb_agg(x.obj) from(select jsonb_build_object('titre','Échéance en retard · '||to_char(montant_du-montant_couvert,'FM999999999990.00')||' €','date',date_echeance,'href','/agence/'||organization_id||'/baux/'||bail_id) obj from retards order by date_echeance limit 20)x),'[]'::jsonb)) into r;
 when 'echeances' then
  select jsonb_build_object('mesures',jsonb_build_object('alertes_en_retard',count(*) filter(where echeance<current_date),'alertes_prochains_7_jours',count(*) filter(where echeance between current_date and current_date+7),'alertes_critiques',count(*) filter(where criticite='critique')),
   'faits',coalesce((select jsonb_agg(x.obj) from(select jsonb_build_object('titre',titre,'date',echeance,'href','/agence/'||organization_id||'/alertes') obj from public.alerts where statut='ouverte' and echeance<=current_date+7 order by echeance limit 20)x),'[]'::jsonb)) into r
  from public.alerts where statut='ouverte';
 when 'service' then
  select jsonb_build_object('mesures',jsonb_build_object('passages_24h',count(*),'passages_en_echec_24h',count(*) filter(where etat in ('a_reprendre','interrompu'))),
   'faits',coalesce((select jsonb_agg(x.obj) from(select jsonb_build_object('titre',mission||' · '||etat,'date',debut,'href','/admin/equipes') obj from public.agent_passages where debut>=now()-interval '24 hours' and etat in ('a_reprendre','interrompu') order by debut desc limit 20)x),'[]'::jsonb)) into r
  from public.agent_passages where debut>=now()-interval '24 hours';
 else raise exception 'Source de direction inconnue';
 end case;
 return r;
end;
$function$
$definition_anterieure$);

-- Les deux fonctions nées de la migration : retirées SANS cascade (une dépendance inattendue arrête tout).
drop function if exists public.organisations_citees_faits_direction(jsonb);
drop function if exists public.libelle_generique_alerte(text);

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014230000';
  end if;
end $retour_arriere$;

commit;
