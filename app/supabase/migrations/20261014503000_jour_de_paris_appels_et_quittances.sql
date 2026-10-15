-- Lot « fuseau-paris » (4/5) : la génération des appels de loyer et des quittances, et leur date, lisent le jour de Paris.
--
-- Avant : ces objets prenaient « aujourd'hui » dans le fuseau de la SESSION (UTC chez Supabase). Entre 22 h et 24 h UTC
-- (00 h à 02 h à Paris), une quittance émise ou réémise était datée de la veille, le mois d'un appel généré pouvait être
-- celui d'avant le changement de mois à Paris, et la fenêtre d'envoi des quittances ou la solidarité d'un colocataire se
-- décalait d'un jour. Maintenant : `public.aujourdhui_paris()` (migration 20261014500000). Aucun montant, aucune colonne,
-- aucune signature ne change ; seul le JOUR de référence change. Aucune ligne existante n'est réécrite : les appels déjà
-- générés gardent leur date d'échéance, les quittances déjà émises leur date d'émission.
--
-- Objets réécrits (nombre de `current_date` remplacés, vérifié) :
--   generer_appels_loyer_interne(uuid)   2   génération jusqu'au mois du jour de Paris (bail en cours, ou terminé)
--   cycle_mensuel_interne()              1   baux terminés encore servis : fin le mois précédent ou après (mois de Paris)
--   resynchroniser_quittances(uuid)      2   date d'émission d'une quittance ou d'un reçu réémis après un règlement
--   quittances_a_envoyer(integer)        1   pas d'arriéré : émission datant de 45 jours de Paris au plus
--   appels_a_envoyer(integer)            1   colocataires encore solidaires à la date du jour de Paris
-- Valeur par défaut : quittances.date_emission (la date d'une quittance créée sans date).
--
-- CE QUI NE CHANGE PAS, volontairement. Le moment où le cycle mensuel tourne (tâche `cycle-mensuel`, le 1er de chaque mois
-- à 05 h UTC) n'est pas touché : à cette heure, le jour de Paris et le jour UTC sont le même. Le jour de génération du
-- cycle est une règle métier, pas un fuseau ; la changer est une décision du dirigeant (voir la fiche du lot).
--
-- COMMENT. Relecture de la définition EN VIGUEUR (pg_get_functiondef), remplacement du seul mot `current_date`, nombre
-- d'occurrences exigé à l'unité près, aucune ancre de plusieurs lignes (la mise en forme en production peut différer du banc).
-- Un autre nombre : la migration s'arrête sans rien modifier. Rejeu : déjà au jour de Paris, on laisse tel quel.
--
-- Droits : inchangés (`create or replace` conserve ceux en vigueur : generer_appels_loyer_interne reste réservée à
-- service_role, cycle_mensuel_interne et les fonctions d'envoi aussi) ; la fermeture à `anon` est rappelée en fin de fichier.
-- Retour arrière : supabase/retours-arriere/20261014503000_jour_de_paris_appels_et_quittances.retour.sql

do $jour_de_paris$
declare
  -- signature, puis nombre exact de `current_date` attendus dans la définition en vigueur.
  v_cibles constant text[][] := array[
    ['public.generer_appels_loyer_interne(uuid)', '2'],
    ['public.cycle_mensuel_interne()', '1'],
    ['public.resynchroniser_quittances(uuid)', '2'],
    ['public.quittances_a_envoyer(integer)', '1'],
    ['public.appels_a_envoyer(integer)', '1']
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

-- Valeur par défaut : la date d'une quittance créée sans date est le jour de Paris. Une colonne dont le défaut n'est ni
-- l'ancien (`current_date`) ni le nouveau n'est pas touchée : la migration s'arrête.
do $jour_de_paris_defaut$
declare v_defaut text;
begin
  select pg_get_expr(d.adbin, d.adrelid) into v_defaut
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.quittances'::regclass and a.attname = 'date_emission';
  if v_defaut ~* '^(public\.)?aujourdhui_paris\(\)$' then
    return;
  elsif v_defaut ~* '^current_date$' then
    alter table public.quittances alter column date_emission set default public.aujourdhui_paris();
  else
    raise exception 'Jour de Paris : le défaut de quittances.date_emission est « % » au lieu de CURRENT_DATE : définition inattendue, rien n''est modifié.', coalesce(v_defaut, '(aucun)');
  end if;
end $jour_de_paris_defaut$;

select public.fermer_fonctions_a_anon();
