-- Invitation d'artisan : un budget anti-abus horaire DISTINCT de celui des invitations de locataires (relecture du
-- 15/10/2026 du lot « invitation-artisan »).
--
-- Constat : `limiter_envoi_invitation_artisan` (20261014840000) comptait chaque invitation (et chaque renvoi) d'artisan
-- sur la clé `organisation:<uuid>`, celle des invitations de LOCATAIRES (src/lib/lien-mot-de-passe.ts, 30 liens par
-- organisation et par heure). Trente invitations d'artisans épuisaient donc, pour l'heure, l'invitation des locataires
-- de l'organisation : un effet de bord sur une fonction existante.
--
-- Correctif : la limite horaire des invitations d'artisans porte sur une clé à elle,
-- `invitation-artisan-organisation-heure:<uuid>`, avec le MÊME seuil (30 par organisation et par heure). Les plafonds
-- sur 24 heures du premier tour sont conservés tels quels (50 par organisation, 50 par compte, 3 par heure et 5 par
-- 24 heures par adresse). Les locataires gardent leur clé et leur seuil, inchangés.
--
-- Modèle de rejeu à marques (20261013120000) : la définition en vigueur est RELUE (pg_get_functiondef), l'ancre — UNE
-- ligne, l'appel sur la clé commune — est remplacée par l'appel sur la clé distincte, qui porte la marque. Rejouée, la
-- migration trouve sa marque et ne fait rien ; si l'ancre manque ou se répète, elle s'arrête (dans la transaction de
-- `migrations.yml`, rien ne subsiste). Aucune ligne n'est touchée (les demandes déjà comptées sur la clé commune
-- s'effacent d'elles-mêmes à l'heure).
-- Retour arrière : app/supabase/retours-arriere/20261014844000_invitation_artisan_budget_distinct.retour.sql.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

do $correctif$
declare
  v_def text;
  c_ancre constant text := $ancre$  if not public.autoriser_lien_mot_de_passe_cle('organisation:' || p_org::text, 30) then$ancre$;
  c_nouveau constant text := $nouveau$  if not public.autoriser_lien_mot_de_passe_cle('invitation-artisan-organisation-heure:' || p_org::text, 30) then -- Relecture du 15/10 (budget distinct des locataires), voir 20261014844000.$nouveau$;
begin
  select pg_get_functiondef('public.limiter_envoi_invitation_artisan(uuid,text)'::regprocedure) into v_def;
  if position($marque$Relecture du 15/10 (budget distinct des locataires)$marque$ in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, c_ancre, ''))) <> length(c_ancre) then
    raise exception 'Correctif 20261014844000 : définition inattendue de limiter_envoi_invitation_artisan (ancre absente ou répétée)';
  end if;
  execute replace(v_def, c_ancre, c_nouveau);
end $correctif$;

-- Droits explicites, identiques à ceux en vigueur : fonction interne, aucun rôle client ne l'appelle.
revoke all on function public.limiter_envoi_invitation_artisan(uuid, text) from public, anon, authenticated;

select public.fermer_fonctions_a_anon();
