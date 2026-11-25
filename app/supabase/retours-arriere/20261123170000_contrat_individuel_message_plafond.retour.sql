-- RETOUR ARRIÈRE de 20261123170000_contrat_individuel_message_plafond.sql (phase 3 de la mission palier 1, reprise du lot 40,
-- C30 : le message de la base nomme le plafond de la colocation « loyer maximal applicable au logement entier »).
--
-- Rend à `controler_contrat_individuel` son message d'avant : « Renseignez le loyer de référence du logement entier avant
-- d’activer un contrat individuel ». Même méthode que la migration : la définition EN VIGUEUR est relue, le message n'est
-- remplacé qu'après vérification de son nombre exact d'occurrences ; une fonction déjà revenue est laissée telle quelle
-- (rejouable) ; une fonction réécrite depuis arrête tout le script, sans rien modifier. Un seul bloc : atomique.
--
-- RÉINTRODUIT le défaut : le refus reparle du « loyer de référence », que l'écran du lot et le contrat appellent « loyer
-- maximal applicable au logement entier ». Aucune donnée n'est modifiée ; le contrôle lui-même ne change ni à l'aller ni au
-- retour. Peut être joué avant ou après le retour du code.
do $retour$
declare
  c_signature constant text := 'public.controler_contrat_individuel()';
  c_avant constant text := 'Renseignez le loyer de référence du logement entier avant d’activer un contrat individuel';
  c_pose constant text := 'Renseignez le loyer maximal applicable au logement entier avant d’activer un contrat individuel';
  v_oid regprocedure;
  v_def text;
  v_avant integer;
  v_pose integer;
begin
  v_oid := to_regprocedure(c_signature);
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue) ; rien n''est modifié.', c_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  v_avant := (length(v_def) - length(replace(v_def, c_avant, ''))) / length(c_avant);
  v_pose := (length(v_def) - length(replace(v_def, c_pose, ''))) / length(c_pose);
  if v_pose = 1 and v_avant = 0 then
    execute replace(v_def, c_pose, c_avant);
    raise notice '% : message d''avant rétabli (loyer de référence du logement entier)', c_signature;
  elsif v_pose = 0 and v_avant = 1 then
    raise notice '% : déjà revenue au message d''avant, rien à faire', c_signature;
  else
    raise exception 'Retour arrière : % contient % fois le message de la migration et % fois celui d''avant : définition réécrite depuis, rien n''est modifié.', c_signature, v_pose, v_avant;
  end if;
  delete from supabase_migrations.schema_migrations where version = '20261123170000';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
