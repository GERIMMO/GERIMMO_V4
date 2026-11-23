-- RÉGULARISATION DES CHARGES ÉTALÉE : LA PREMIÈRE MENSUALITÉ TOMBE AU MOINS UN MOIS APRÈS L'ÉMISSION (phase 3 de la
-- mission palier 1, lot 42, défaut C77 relevé sur les documents générés).
--
-- LE DÉFAUT. Une régularisation tardive dont le complément est étalé sur douze mois (`p_etaler`) fixait sa première
-- mensualité au 1er du mois qui suit le jour de l'émission : émise le 23/11/2026, première mensualité le 01/12/2026, huit
-- jours plus tard (le lendemain pour une régularisation émise le 30). Deux fonctions écrivent cet étalement :
-- `regulariser_charges` (écran du bail) et `consommations_interne.emettre_regularisation` (régularisation tirée des factures
-- de fourniture). L'échéancier de charges (`preparer_echeancier_charges` et `publier_echeancier_charges`, migration
-- 20261101152354) exige au contraire au moins un mois entre la transmission du décompte et la première échéance, et le
-- courrier de régularisation annonce le décompte « communiqué un mois avant la régularisation » : les deux règles de
-- l'application se contredisaient.
--
-- MAINTENANT. La première mensualité est le premier 1er du mois qui tombe au moins un mois après le jour de l'émission (jour
-- de Paris), avec la borne de `preparer_echeancier_charges` : `(jour + interval '1 month')::date`. Émise le 23/11, le 01/01 ;
-- émise le 1er novembre, le 01/12 ; émise le 31/01, le 01/03. Les mensualités suivantes restent au 1er de chaque mois, aux
-- mêmes montants. Le délai d'un mois lui-même reste à confirmer par le juriste (JURISTE.md) : c'est la règle que
-- l'application appliquait déjà à l'échéancier.
--
-- COMMENT. Chaque fonction est relue dans sa définition EN VIGUEUR (pg_get_functiondef), jamais recopiée à la main. Une seule
-- expression y est remplacée, après avoir vérifié qu'elle s'y trouve exactement UNE fois (espaces et `public.` facultatifs) :
-- aucune ancre de plusieurs lignes. Déjà convertie (la nouvelle expression une fois, l'ancienne jamais) : rien à faire, rejeu
-- sans effet. Toute autre forme arrête la migration avec un message qui nomme la fonction, sans rien modifier. Le nombre
-- d'occurrences de la fonction du jour de Paris ne change pas (`regulariser_charges` en garde quatre, ce que compte le retour
-- de 20261014821000).
--
-- CE QUI NE CHANGE PAS : les montants et l'arrondi des douze mensualités, les refus (étalement réservé à une régularisation
-- tardive qui met un complément à la charge du locataire), les droits (`create or replace` conserve ceux en vigueur ; la
-- fermeture à `anon` est rappelée en fin de fichier). Aucune ligne n'est réécrite : une régularisation émise ne se modifie pas
-- (RM-3.9.7) ; celles qui portent déjà une première mensualité à moins d'un mois la gardent (leur courrier n'annonce plus le
-- délai d'un mois, même lot).
--
-- Retour arrière : supabase/retours-arriere/20261123150000_regularisation_premiere_mensualite.retour.sql

do $premiere_mensualite$
declare
  v_cibles constant text[] := array[
    'public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)',
    'consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text)'
  ];
  -- Forme d'avant : le 1er du mois qui suit le jour de l'émission.
  c_avant constant text := 'date_trunc\(\s*''month''\s*,\s*(public\.)?aujourdhui_paris\(\)\s*\)\s*\+\s*interval\s*''1 month''';
  -- Forme posée ici : le premier 1er du mois au moins un mois après le jour de l'émission.
  c_pose constant text := 'date_trunc(''month'', ((public.aujourdhui_paris() + interval ''1 month'')::date - 1)::timestamp) + interval ''1 month''';
  c_posee constant text := 'date_trunc\(''month'', \(\(public\.aujourdhui_paris\(\) \+ interval ''1 month''\)::date - 1\)::timestamp\) \+ interval ''1 month''';
  v_signature text;
  v_oid regprocedure;
  v_def text;
  v_avant integer;
  v_posee integer;
begin
  if to_regprocedure('public.aujourdhui_paris()') is null then
    raise exception 'Première mensualité : la fonction public.aujourdhui_paris() est absente ; appliquez d''abord 20261014500000.';
  end if;
  foreach v_signature in array v_cibles loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Première mensualité : la fonction % est absente de cette base ; rien n''est modifié.', v_signature;
    end if;
    v_def := pg_get_functiondef(v_oid);
    select count(*) into v_avant from regexp_matches(v_def, c_avant, 'gi');
    select count(*) into v_posee from regexp_matches(v_def, c_posee, 'g');
    if v_avant = 1 and v_posee = 0 then
      execute regexp_replace(v_def, c_avant, c_pose, 'i');
    elsif v_avant = 0 and v_posee = 1 then
      raise notice 'Première mensualité : % place déjà la première mensualité au moins un mois après l''émission, rien à faire.', v_signature;
    else
      raise exception 'Première mensualité : % contient % fois la première mensualité d''avant et % fois celle de ce lot, au lieu d''une seule de l''une ou de l''autre : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.',
        v_signature, v_avant, v_posee;
    end if;
  end loop;
end $premiere_mensualite$;

select public.fermer_fonctions_a_anon();
