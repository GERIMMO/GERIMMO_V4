-- Lot « fuseau-paris » (2/5) : l'état d'un loyer, la détection, les alertes et les relances d'impayés lisent le jour de Paris.
--
-- Avant : ces objets comparaient la date d'échéance à `current_date`, le jour du fuseau de la SESSION (UTC chez Supabase).
-- Entre 22 h et 24 h UTC, un loyer échu la veille à Paris restait « attendu », pendant que d'autres objets, lus à un autre
-- instant ou par une autre voie, le tenaient déjà pour impayé. Maintenant : `public.aujourdhui_paris()` (migration
-- 20261014500000), pour tous, sans exception. Aucun montant, aucune colonne, aucune signature ne change ; seul le JOUR de
-- référence change. Aucune ligne existante n'est réécrite (les appels déjà générés gardent leur date d'échéance).
--
-- Objets réécrits (nombre de `current_date` remplacés, vérifié) :
--   etat_loyers_bail_brut(uuid)                 1   statut « impayé » : échéance avant le jour de Paris
--   suivre_impayes_bail(uuid)                   1   termes échus pris en compte par l'alerte d'impayé
--   relances_loyer_dues(integer)                6   jours de retard, termes échus, colocataires encore solidaires, courrier du jour
--   relance_loyer_consigner(uuid,text,text)     2   date de la relance consignée, un seul courrier par jour de Paris
--   actualiser_orchestration()                  2   dossier de loyer impayé et sa priorité (plus de 30 jours de retard)
--   collecter_source_direction(text)            7   brief de la direction : échéances en retard / dans 7 jours (loyers) et alertes
--                                                   en retard / dans 7 jours (alertes de toutes natures, dont l'alerte d'impayé :
--                                                   le compteur est commun, on ne peut pas le couper par nature sans changer sa règle)
-- Valeur par défaut : relances.date_envoi (la date d'une relance saisie sans date).
--
-- COMMENT ELLES SONT RÉÉCRITES. Chaque fonction est relue dans sa définition EN VIGUEUR (pg_get_functiondef), jamais recopiée à
-- la main : une définition recopiée écraserait ce que d'autres migrations y ont ajouté (gardes de portefeuille, arrêt
-- d'urgence). Aucune ancre de plusieurs lignes : la mise en forme d'une fonction en production peut différer de celle du banc
-- (espaces, retours à la ligne) sans que sa logique change. On remplace donc le seul mot `current_date` (hors identifiant) et on
-- exige le NOMBRE EXACT d'occurrences indiqué ci-dessus : un autre nombre veut dire que la définition n'est pas celle qu'on a
-- relue, et la migration s'arrête sans rien modifier (dans la transaction du chantier `migrations.yml`, rien ne subsiste).
-- Rejeu : une fonction qui ne lit plus `current_date` et lit déjà `aujourdhui_paris()` est laissée telle quelle.
--
-- Droits : inchangés (`create or replace` conserve ceux en vigueur) ; la fermeture à `anon` est rappelée en fin de fichier.
-- Retour arrière : supabase/retours-arriere/20261014501000_jour_de_paris_etat_loyers_et_impayes.retour.sql

do $jour_de_paris$
declare
  -- signature, puis nombre exact de `current_date` attendus dans la définition en vigueur.
  v_cibles constant text[][] := array[
    ['public.etat_loyers_bail_brut(uuid)', '1'],
    ['public.suivre_impayes_bail(uuid)', '1'],
    ['public.relances_loyer_dues(integer)', '6'],
    ['public.relance_loyer_consigner(uuid,text,text)', '2'],
    ['public.actualiser_orchestration()', '2'],
    ['public.collecter_source_direction(text)', '7']
  ];
  v_i integer;
  v_signature text;
  v_attendu integer;
  v_oid regprocedure;
  v_def text;
  v_nb integer;
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
    select count(*) into v_nb from regexp_matches(v_def, '\mcurrent_date\M', 'gi');
    if v_nb = 0 then
      if position('public.aujourdhui_paris()' in v_def) > 0 then continue; end if;
      raise exception 'Jour de Paris : % ne lit ni current_date ni aujourdhui_paris() : définition inattendue, rien n''est modifié.', v_signature;
    end if;
    if v_nb <> v_attendu then
      raise exception 'Jour de Paris : % contient % occurrence(s) de current_date au lieu de % : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.',
        v_signature, v_nb, v_attendu;
    end if;
    execute regexp_replace(v_def, '\mcurrent_date\M', 'public.aujourdhui_paris()', 'gi');
  end loop;
end $jour_de_paris$;

-- Valeur par défaut : la date d'une relance saisie sans date est le jour de Paris. Une colonne dont le défaut n'est ni
-- l'ancien (`current_date`) ni le nouveau n'est pas touchée : la migration s'arrête.
do $jour_de_paris_defaut$
declare v_defaut text;
begin
  select pg_get_expr(d.adbin, d.adrelid) into v_defaut
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.relances'::regclass and a.attname = 'date_envoi';
  if v_defaut ~* '^(public\.)?aujourdhui_paris\(\)$' then
    return;
  elsif v_defaut ~* '^current_date$' then
    alter table public.relances alter column date_envoi set default public.aujourdhui_paris();
  else
    raise exception 'Jour de Paris : le défaut de relances.date_envoi est « % » au lieu de CURRENT_DATE : définition inattendue, rien n''est modifié.', coalesce(v_defaut, '(aucun)');
  end if;
end $jour_de_paris_defaut$;

select public.fermer_fonctions_a_anon();
