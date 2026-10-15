-- Lot « fuseau-paris » (3/5) : la fiche du lot, ses contrats (colocation) et son historique lisent le jour de Paris.
--
-- Avant : `fiche_lot` et `contrats_du_lot` comptaient l'impayé échu avec `current_date` (jour de la SESSION, UTC chez
-- Supabase), pendant que l'état du loyer, l'alerte et la relance le comptaient autrement entre 22 h et 24 h UTC : la fiche
-- pouvait dire « 0 € impayé » sur un loyer que l'alerte venait de signaler. `historique_du_lot` masquait de même, en fin
-- de soirée, ce qui s'était passé « aujourd'hui » à Paris (terme appelé, encaissement, quittance, fin de bail).
-- Maintenant : `public.aujourdhui_paris()` (migration 20261014500000). Aucun montant, aucune colonne, aucune signature ne
-- change ; seul le JOUR de référence change. Aucune ligne n'est réécrite.
--
-- Objets réécrits (nombre de `current_date` remplacés, vérifié) :
--   contrats_du_lot(uuid)               2   impayé échu et termes impayés de chaque contrat individuel
--   fiche_lot(uuid)                     2   impayé échu et termes impayés de la fiche du lot
--   historique_du_lot(uuid,integer)     2   « fin de bail » déjà arrivée ; événements postérieurs à aujourd'hui masqués
--
-- COMMENT. Relecture de la définition EN VIGUEUR (pg_get_functiondef), remplacement du seul mot `current_date`, nombre
-- d'occurrences exigé à l'unité près, aucune ancre de plusieurs lignes (la mise en forme en production peut différer du banc).
-- Un autre nombre : la migration s'arrête sans rien modifier. Rejeu : déjà au jour de Paris, on laisse tel quel.
--
-- Droits : inchangés (`create or replace` conserve ceux en vigueur) ; la fermeture à `anon` est rappelée en fin de fichier.
-- Retour arrière : supabase/retours-arriere/20261014502000_jour_de_paris_lot_et_contrats.retour.sql

do $jour_de_paris$
declare
  -- signature, puis nombre exact de `current_date` attendus dans la définition en vigueur.
  v_cibles constant text[][] := array[
    ['public.contrats_du_lot(uuid)', '2'],
    ['public.fiche_lot(uuid)', '2'],
    ['public.historique_du_lot(uuid,integer)', '2']
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

select public.fermer_fonctions_a_anon();
