-- RETOUR ARRIÈRE de 20261123150000_regularisation_premiere_mensualite.sql (phase 3 de la mission palier 1, lot 42, C77 :
-- la première mensualité d'une régularisation étalée tombe au moins un mois après l'émission).
--
-- Rend à `regulariser_charges` et à `consommations_interne.emettre_regularisation` leur première mensualité d'avant : le 1er
-- du mois qui suit le jour de l'émission. Même méthode que la migration : la définition EN VIGUEUR est relue, une seule
-- expression est remplacée après vérification de son nombre exact d'occurrences ; une fonction déjà revenue est laissée
-- telle quelle (rejouable) ; une fonction réécrite depuis arrête tout le script, sans rien modifier. Un seul bloc : atomique.
--
-- RÉINTRODUIT le défaut : une régularisation étalée émise après ce retour fixe de nouveau sa première mensualité au 1er du
-- mois suivant, parfois quelques jours après l'émission, alors que l'échéancier de charges exige un mois. Aucune donnée
-- n'est modifiée : les régularisations émises entre-temps gardent leurs mensualités. Peut être joué avant ou après le retour
-- du code (le code du lot n'annonce le délai d'un mois que lorsque les dates du dossier le permettent).
--
-- Les deux fonctions citent `aujourdhui_paris()` : ce retour se joue AVANT celui de 20261014500000 (« Ordre complet si tout
-- doit être défait » dans LISEZ-MOI.md). Le nombre de `aujourdhui_paris()` de `regulariser_charges` (quatre) ne change ni à
-- l'aller ni au retour : le retour de 20261014821000 reste jouable après celui-ci.
do $retour$
declare
  -- signature, puis l'expression d'origine telle que la migration d'origine l'écrivait.
  v_cibles constant text[][] := array[
    ['public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)', 'date_trunc(''month'', public.aujourdhui_paris()) + interval ''1 month'''],
    ['consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text)', 'date_trunc(''month'',public.aujourdhui_paris())+interval ''1 month''']
  ];
  c_avant constant text := 'date_trunc\(\s*''month''\s*,\s*(public\.)?aujourdhui_paris\(\)\s*\)\s*\+\s*interval\s*''1 month''';
  c_posee constant text := 'date_trunc\(''month'', \(\(public\.aujourdhui_paris\(\) \+ interval ''1 month''\)::date - 1\)::timestamp\) \+ interval ''1 month''';
  v_i integer;
  v_signature text;
  v_oid regprocedure;
  v_def text;
  v_avant integer;
  v_posee integer;
begin
  for v_i in 1 .. array_length(v_cibles, 1) loop
    v_signature := v_cibles[v_i][1];
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue) ; rien n''est modifié.', v_signature;
    end if;
    v_def := pg_get_functiondef(v_oid);
    select count(*) into v_avant from regexp_matches(v_def, c_avant, 'gi');
    select count(*) into v_posee from regexp_matches(v_def, c_posee, 'g');
    if v_posee = 1 and v_avant = 0 then
      execute regexp_replace(v_def, c_posee, v_cibles[v_i][2]);
      raise notice '% : première mensualité d''avant rétablie (1er du mois suivant)', v_signature;
    elsif v_posee = 0 and v_avant = 1 then
      raise notice '% : déjà revenue à la première mensualité d''avant, rien à faire', v_signature;
    else
      raise exception 'Retour arrière : % contient % fois la première mensualité de la migration et % fois celle d''avant : définition réécrite depuis, rien n''est modifié.', v_signature, v_posee, v_avant;
    end if;
  end loop;
  delete from supabase_migrations.schema_migrations where version = '20261123150000';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
