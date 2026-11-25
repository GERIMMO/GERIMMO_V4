-- CONTRAT INDIVIDUEL EN COLOCATION : LE MESSAGE DE LA BASE NOMME LE PLAFOND DU LOGEMENT COMME L'ÉCRAN ET LE CONTRAT (phase 3
-- de la mission palier 1, reprise du lot 40, défaut C30 relevé sur les documents générés).
--
-- LE DÉFAUT. Le montant que le gestionnaire saisit pour le logement entier (`lots.colocation_loyer_reference`) est un plafond :
-- le total des loyers des contrats individuels ne le dépasse pas. Le lot 40 l'a renommé « Loyer maximal applicable au logement
-- entier » à l'écran du lot, dans l'aide et dans le contrat individuel : « loyer de référence » se confondait avec les loyers de
-- référence de l'encadrement, que le même contrat déclare plus loin. Le déclencheur `baux_contrat_individuel`
-- (`controler_contrat_individuel`, migration 20260914180000) refusait encore l'activation d'un contrat individuel sans plafond
-- avec « Renseignez le loyer de référence du logement entier… » : l'ancien mot, pour un champ que l'écran n'appelle plus ainsi.
--
-- MAINTENANT. « Renseignez le loyer maximal applicable au logement entier avant d’activer un contrat individuel. » Seul ce
-- message change : le contrôle (plafond absent, total des loyers, un seul locataire, contrat signé figé) est le même.
--
-- COMMENT. La fonction est relue dans sa définition EN VIGUEUR (pg_get_functiondef), jamais recopiée à la main. Le message y est
-- remplacé après avoir vérifié qu'il s'y trouve exactement UNE fois. Déjà converti (le nouveau message une fois, l'ancien
-- jamais) : rien à faire, rejeu sans effet. Toute autre forme arrête la migration, sans rien modifier. Les droits sont ceux en
-- vigueur (`create or replace` les conserve : fonction de déclencheur, fermée à tous les rôles des comptes) ; la fermeture à
-- `anon` est rappelée en fin de fichier. Aucune ligne n'est lue ni écrite.
--
-- Retour arrière : supabase/retours-arriere/20261123170000_contrat_individuel_message_plafond.retour.sql

do $message_plafond$
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
    raise exception 'Plafond de la colocation : la fonction % est absente de cette base ; appliquez d''abord 20260914180000, rien n''est modifié.', c_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  v_avant := (length(v_def) - length(replace(v_def, c_avant, ''))) / length(c_avant);
  v_pose := (length(v_def) - length(replace(v_def, c_pose, ''))) / length(c_pose);
  if v_avant = 1 and v_pose = 0 then
    execute replace(v_def, c_avant, c_pose);
  elsif v_avant = 0 and v_pose = 1 then
    raise notice 'Plafond de la colocation : % nomme déjà le loyer maximal applicable au logement entier, rien à faire.', c_signature;
  else
    raise exception 'Plafond de la colocation : % contient % fois l''ancien message et % fois celui de ce lot, au lieu d''un seul de l''un ou de l''autre : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.',
      c_signature, v_avant, v_pose;
  end if;
end $message_plafond$;

select public.fermer_fonctions_a_anon();
