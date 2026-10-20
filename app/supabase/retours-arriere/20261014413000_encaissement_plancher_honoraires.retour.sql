-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014413000_encaissement_plancher_honoraires.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Défait : le plancher d'honoraires posé dans le déclencheur d'encaissement (ecrire_encaissement).
-- Définition antérieure : extraite (pg_get_functiondef) d'une base reconstruite en rejouant les migrations d'origine SANS cette
-- migration, puis recopiée ici par un générateur — aucune n'est écrite à la main. Rejouable : sans la marque du correctif dans la
-- définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014413000_encaissement_plancher_honoraires.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (PR178-B-03) : un encaissement trop petit pour porter des honoraires (0,01 € à 7 %) est de nouveau
-- refusé par la contrainte des écritures, avec le message générique « Gerimmo n'a pas pu terminer cette action ». Aucune donnée n'est
-- touchée : aucun encaissement n'a jamais été créé par un refus.

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

-- X14 : ecrire_encaissement sans plancher d'honoraires
select pg_temp.restaurer_fonction('public.ecrire_encaissement()',
  $marque$Décision X14 du 15/10 (PR178-B-03)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.ecrire_encaissement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_lot uuid; v_taux numeric; v_mandat uuid;
begin
  select lot_id into v_lot from public.baux where id = new.bail_id;
  insert into public.ecritures
    (organization_id, bail_id, lot_id, categorie, sens, montant, date_piece, date_imputation,
     libelle, encaissement_id)
  values (new.organization_id, new.bail_id, v_lot, 'loyer', 'recette', new.montant,
          new.date_paiement, new.date_paiement, 'Encaissement de loyer', new.id);

  select ml.taux_honoraires, ml.mandat_id into v_taux, v_mandat
  from public.mandat_lignes ml
  where ml.lot_id = v_lot and ml.date_debut <= new.date_paiement
    and (ml.date_fin is null or ml.date_fin >= new.date_paiement)
  order by ml.date_debut desc limit 1;

  if v_taux is not null and v_taux > 0 then
    insert into public.ecritures
      (organization_id, bail_id, lot_id, mandat_id, categorie, sens, montant,
       date_piece, date_imputation, libelle, systeme, encaissement_id)
    values (new.organization_id, new.bail_id, v_lot, v_mandat, 'honoraires', 'depense',
            round(new.montant * v_taux / 100, 2), new.date_paiement, new.date_paiement,
            'Honoraires de gestion', true, new.id);
  end if;
  return new;
end $function$
$definition_anterieure$);


-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014413000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
