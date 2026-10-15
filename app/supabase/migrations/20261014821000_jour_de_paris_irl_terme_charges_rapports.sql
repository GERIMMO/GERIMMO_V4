-- Lot « fuseau-suite » (2/2), décision du dirigeant du 15 octobre 2026, point 2 : la révision IRL, le terme du bail, la
-- régularisation des charges et le rapport de gestion datent « aujourd'hui » du jour de Paris.
--
-- LE DÉFAUT. Ces objets prenaient `current_date` (ou `now()`, pour le mois du rapport préparé automatiquement), le jour du
-- fuseau de la SESSION (UTC chez Supabase). Entre minuit et 1 h (hiver) ou 2 h (été) à Paris, la base était encore la veille :
--  - une révision IRL datée d'aujourd'hui (le formulaire propose le jour de Paris) était refusée comme « datée de demain »
--    (« Révision anticipée »), et une révision sans date était datée de la veille ;
--  - le terme du bail (écran du bail, congé du bailleur) était calculé à la date de la veille ;
--  - le 1er janvier, une régularisation n'était pas encore « tardive » ni l'exercice de l'année « commencé », la date d'émission
--    était la veille et l'étalement commençait un mois trop tôt le 1er du mois ;
--  - le 1er du mois, le rapport de gestion proposé par défaut était celui du mois d'avant le mois écoulé, et l'échéance du
--    versement au propriétaire (15 jours après l'envoi du rapport) était comptée depuis la veille.
-- Maintenant : `public.aujourdhui_paris()` (migration 20261014500000). Aucun montant, aucune colonne, aucune signature, aucun
-- droit ne change ; seul le JOUR de référence change. Aucune ligne existante n'est réécrite : révisions, régularisations,
-- rapports et alertes déjà enregistrés gardent leurs dates.
--
-- Objets réécrits (nombre exact attendu dans la définition en vigueur, tous remplacés) :
--   reviser_loyer(uuid,numeric,text,date)                       2 current_date   date de la demande par défaut (en-tête), refus d'une demande « future »
--   terme_bail(uuid,date)                                       1 current_date   date de calcul du terme par défaut (en-tête)
--   regulariser_charges(uuid,integer,numeric,uuid,text,boolean) 4 current_date   exercice commencé, prescription, régularisation tardive, premier mois de l'étalement
--   rapport_du_lot(uuid,date)                                   1 current_date   mois couvert par défaut (le mois qui précède)
--   envoyer_rapport(uuid,text)                                  1 current_date   échéance du versement au propriétaire (15 jours)
--   preparer_rapports_automatiques()                            1 date_trunc('month',now())   mois couvert (le mois clôturé qui précède) ;
--                                                                                 0 current_date
-- Valeur par défaut : regularisations_charges.date_emission (date d'émission d'une régularisation).
--
-- COMMENT. Chaque fonction est relue dans sa définition EN VIGUEUR (pg_get_functiondef), jamais recopiée à la main. Aucune
-- ancre de plusieurs lignes : on remplace le seul mot `current_date` (pour preparer_rapports_automatiques, la seule expression
-- `date_trunc('month', now())`, devenue `date_trunc('month', public.aujourdhui_paris()::timestamp)`) et on exige le NOMBRE
-- EXACT d'occurrences ci-dessus. Une fonction DÉJÀ au jour de Paris (ce nombre exact de `public.aujourdhui_paris()` ou de
-- `(now() at time zone 'Europe/Paris')::date`, et plus aucune lecture du jour de la session) est laissée telle quelle : rejeu sans
-- effet. Toute autre forme arrête la migration avec un message qui nomme la fonction, sans rien modifier.
-- Pour reviser_loyer et terme_bail, l'un des `current_date` est la VALEUR PAR DÉFAUT d'un paramètre (en-tête) : elle devient
-- `public.aujourdhui_paris()` ; les appelants (comptes connectés, service) ont le droit d'exécuter cette fonction.
--
-- CE QUI NE CHANGE PAS, volontairement (décisions du dirigeant du 15/10, points 3 et 4) : l'heure du cycle mensuel des appels de
-- loyer (tâche `cycle-mensuel`) et le compteur « alertes en retard » du brief de la direction. Ni les restitutions, les mandats,
-- l'abonnement, les artisans, les diagnostics, les assurances, les factures d'honoraires et les appels de charges de copropriété,
-- hors de la décision.
--
-- Droits : inchangés (`create or replace` conserve ceux en vigueur : preparer_rapports_automatiques reste réservée à
-- service_role) ; la fermeture à `anon` est rappelée en fin de fichier.
-- Retour arrière : supabase/retours-arriere/20261014821000_jour_de_paris_irl_terme_charges_rapports.retour.sql

do $jour_de_paris$
declare
  -- signature, puis nombre exact de `current_date` attendus dans la définition en vigueur.
  v_cibles constant text[][] := array[
    ['public.reviser_loyer(uuid,numeric,text,date)', '2'],
    ['public.terme_bail(uuid,date)', '1'],
    ['public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)', '4'],
    ['public.rapport_du_lot(uuid,date)', '1'],
    ['public.envoyer_rapport(uuid,text)', '1']
  ];
  -- Le jour de Paris sous ses deux écritures admises : la fonction du lot (l'en-tête relu par pg_get_functiondef ne qualifie pas ce
  -- qui est dans le chemin de recherche, d'où `public.` facultatif) ou l'expression explicite (rendue `((now() AT TIME ZONE
  -- 'Europe/Paris'::text))::date` dans un en-tête).
  c_paris constant text := '(\mpublic\.)?\maujourdhui_paris\(\)|\(\s*now\(\)\s+at\s+time\s+zone\s+''Europe/Paris''(::text)?\s*\)\)?\s*::\s*date';
  v_i integer;
  v_signature text;
  v_attendu integer;
  v_oid regprocedure;
  v_def text;
  v_session integer;
  v_paris integer;
begin
  if to_regprocedure('public.aujourdhui_paris()') is null then
    raise exception 'Jour de Paris : la fonction public.aujourdhui_paris() est absente ; appliquez d''abord 20261014500000.';
  end if;
  for v_i in 1 .. array_length(v_cibles, 1) loop
    v_signature := v_cibles[v_i][1];
    v_attendu := v_cibles[v_i][2]::integer;
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Jour de Paris : la fonction % est absente de cette base ; rien n''est modifié.', v_signature;
    end if;
    v_def := pg_get_functiondef(v_oid);
    select count(*) into v_session from regexp_matches(v_def, '\mcurrent_date\M', 'gi');
    select count(*) into v_paris from regexp_matches(v_def, c_paris, 'gi');
    if v_session = v_attendu and v_paris = 0 then
      execute regexp_replace(v_def, '\mcurrent_date\M', 'public.aujourdhui_paris()', 'gi');
    elsif v_session = 0 and v_paris = v_attendu then
      raise notice 'Jour de Paris : % est déjà au jour de Paris, rien à faire.', v_signature;
    elsif v_session = 0 and v_paris = 0 then
      raise exception 'Jour de Paris : % ne lit ni current_date ni le jour de Paris : définition inattendue, rien n''est modifié.', v_signature;
    else
      raise exception 'Jour de Paris : % contient % occurrence(s) de current_date et % du jour de Paris, au lieu de % de l''une ou de l''autre seule : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.',
        v_signature, v_session, v_paris, v_attendu;
    end if;
  end loop;
end $jour_de_paris$;

-- Rapport de gestion préparé automatiquement : le mois couvert est celui qui précède le mois de Paris. L'expression
-- `date_trunc('month', now())` (mois de la SESSION) doit s'y trouver UNE fois, et plus aucune autre lecture du jour de la session ;
-- déjà au mois de Paris (la fonction du lot, ou `now() at time zone 'Europe/Paris'`), on laisse tel quel.
do $jour_de_paris_mois$
declare
  v_signature constant text := 'public.preparer_rapports_automatiques()';
  c_mois_session constant text := 'date_trunc\(\s*''month''\s*,\s*now\(\)\s*\)';
  c_mois_paris constant text := 'date_trunc\(\s*''month''\s*,\s*((public\.)?aujourdhui_paris\(\)(\s*::\s*timestamp)?|\(?\s*now\(\)\s+at\s+time\s+zone\s+''Europe/Paris''(::text)?\s*\)?)\s*\)';
  v_oid regprocedure := to_regprocedure('public.preparer_rapports_automatiques()');
  v_def text;
  v_session integer;
  v_paris integer;
  v_jour_session integer;
begin
  if v_oid is null then
    raise exception 'Jour de Paris : la fonction % est absente de cette base ; rien n''est modifié.', v_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  select count(*) into v_session from regexp_matches(v_def, c_mois_session, 'gi');
  select count(*) into v_paris from regexp_matches(v_def, c_mois_paris, 'gi');
  select count(*) into v_jour_session from regexp_matches(v_def, '\mcurrent_date\M', 'gi');
  if v_jour_session <> 0 then
    raise exception 'Jour de Paris : % contient % occurrence(s) de current_date au lieu d''aucune : définition inattendue, rien n''est modifié.', v_signature, v_jour_session;
  elsif v_session = 1 and v_paris = 0 then
    execute regexp_replace(v_def, c_mois_session, 'date_trunc(''month'', public.aujourdhui_paris()::timestamp)', 'gi');
  elsif v_session = 0 and v_paris = 1 then
    raise notice 'Jour de Paris : % est déjà au mois de Paris, rien à faire.', v_signature;
  else
    raise exception 'Jour de Paris : % contient % expression(s) date_trunc(''month'', now()) et % déjà au jour de Paris, au lieu d''une seule : définition inattendue, rien n''est modifié.',
      v_signature, v_session, v_paris;
  end if;
end $jour_de_paris_mois$;

-- Valeur par défaut : une régularisation émise sans date l'est au jour de Paris. Déjà au jour de Paris : laissée telle quelle ;
-- ni `current_date` ni le jour de Paris : la migration s'arrête.
do $jour_de_paris_defaut$
declare v_defaut text;
begin
  select pg_get_expr(d.adbin, d.adrelid) into v_defaut
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.regularisations_charges'::regclass and a.attname = 'date_emission';
  if v_defaut ~* '^(public\.)?aujourdhui_paris\(\)$'
     or v_defaut ~* '^\(*\s*now\(\)\s+at\s+time\s+zone\s+''Europe/Paris''(::text)?\s*\)*\s*::\s*date\s*\)*$' then
    return;
  elsif v_defaut ~* '^current_date$' then
    alter table public.regularisations_charges alter column date_emission set default public.aujourdhui_paris();
  else
    raise exception 'Jour de Paris : le défaut de regularisations_charges.date_emission est « % » au lieu de CURRENT_DATE : définition inattendue, rien n''est modifié.', coalesce(v_defaut, '(aucun)');
  end if;
end $jour_de_paris_defaut$;

select public.fermer_fonctions_a_anon();
