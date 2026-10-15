-- Lot « fuseau-paris » (5/5) : la date de règlement d'un encaissement de loyer est le jour de Paris.
--
-- Avant : un encaissement saisi sans date (le bouton « Encaisser » du quittancement, la saisie rapide) prenait la valeur par
-- défaut de la colonne, `current_date`, le jour de la SESSION (UTC chez Supabase). Le 1er janvier à 00 h 30 à Paris, le
-- règlement était daté du 31 décembre — donc de l'année précédente dans le récapitulatif fiscal et le livre — et la pièce
-- comptable qui le suit (`ecrire_encaissement` reprend la date du règlement) aussi. Même défaut pour la contre-écriture posée
-- quand on supprime un encaissement. Maintenant : `public.aujourdhui_paris()` (migration 20261014500000). Aucun montant,
-- aucune répartition, aucune colonne, aucune signature ne change ; seul le JOUR de référence change. Aucune ligne existante
-- n'est réécrite : les encaissements et écritures déjà datés gardent leur date.
--
-- Réécrit (nombre de `current_date` remplacés, vérifié) :
--   contre_passer_encaissement()   2   date de pièce et d'imputation de la contre-écriture d'un encaissement supprimé
-- Valeur par défaut : encaissements.date_paiement (la date d'un règlement saisi sans date).
--
-- HORS DE CE LOT, volontairement : le dépôt de garantie (`encaisser_depot`, `contre_passer_depot_encaissement`) et le journal
-- comptable général (`ecritures.date_piece`, `ecritures.date_imputation`, `contre_ecriture`) ne sont pas des loyers ; ils
-- gardent le jour de la session jusqu'à décision du dirigeant (voir la section « Lot fuseau-paris » de
-- supabase/retours-arriere/LISEZ-MOI.md).
--
-- COMMENT. Relecture de la définition EN VIGUEUR (pg_get_functiondef), remplacement du seul mot `current_date`, nombre
-- d'occurrences exigé à l'unité près, aucune ancre de plusieurs lignes. Un autre nombre : la migration s'arrête sans rien
-- modifier. Rejeu : déjà au jour de Paris, on laisse tel quel.
--
-- Droits : inchangés (`create or replace` conserve ceux en vigueur) ; la fermeture à `anon` est rappelée en fin de fichier.
-- Retour arrière : supabase/retours-arriere/20261014504000_jour_de_paris_encaissements.retour.sql

do $jour_de_paris$
declare
  v_signature constant text := 'public.contre_passer_encaissement()';
  v_attendu constant integer := 2;
  v_oid regprocedure;
  v_def text;
  v_nb integer;
begin
  if to_regprocedure('public.aujourdhui_paris()') is null then
    raise exception 'Jour de Paris : la fonction public.aujourdhui_paris() est absente ; appliquez d''abord 20261014500000.';
  end if;
  v_oid := to_regprocedure(v_signature);
  if v_oid is null then
    raise exception 'Jour de Paris : la fonction % est absente de cette base ; rien n''est modifié.', v_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  select count(*) into v_nb from regexp_matches(v_def, '\mcurrent_date\M', 'gi');
  if v_nb = 0 then
    if position('public.aujourdhui_paris()' in v_def) = 0 then
      raise exception 'Jour de Paris : % ne lit ni current_date ni aujourdhui_paris() : définition inattendue, rien n''est modifié.', v_signature;
    end if;
  elsif v_nb <> v_attendu then
    raise exception 'Jour de Paris : % contient % occurrence(s) de current_date au lieu de % : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.',
      v_signature, v_nb, v_attendu;
  else
    execute regexp_replace(v_def, '\mcurrent_date\M', 'public.aujourdhui_paris()', 'gi');
  end if;
end $jour_de_paris$;

-- Valeur par défaut : la date d'un règlement saisi sans date est le jour de Paris. Une colonne dont le défaut n'est ni
-- l'ancien (`current_date`) ni le nouveau n'est pas touchée : la migration s'arrête.
do $jour_de_paris_defaut$
declare v_defaut text;
begin
  select pg_get_expr(d.adbin, d.adrelid) into v_defaut
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.encaissements'::regclass and a.attname = 'date_paiement';
  if v_defaut ~* '^(public\.)?aujourdhui_paris\(\)$' then
    return;
  elsif v_defaut ~* '^current_date$' then
    alter table public.encaissements alter column date_paiement set default public.aujourdhui_paris();
  else
    raise exception 'Jour de Paris : le défaut de encaissements.date_paiement est « % » au lieu de CURRENT_DATE : définition inattendue, rien n''est modifié.', coalesce(v_defaut, '(aucun)');
  end if;
end $jour_de_paris_defaut$;

select public.fermer_fonctions_a_anon();
