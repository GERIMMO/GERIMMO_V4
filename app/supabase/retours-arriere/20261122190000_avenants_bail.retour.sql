-- RETOUR ARRIÈRE de 20261122190000_avenants_bail.sql (audit palier 1, P1-14).
--
-- Retire l'enregistrement et l'application des avenants : le déclencheur posé sur les appels de loyer et les quatre
-- fonctions (enregistrer, annuler, appliquer, appliquer à l'appel).
--
-- RIEN N'EST EFFACÉ, RIEN N'EST DÉFAIT :
--   · la table `avenants_bail` reste, lisible par qui gère le bail (sa politique et sa fonction d'accès sont
--     conservées) : les avenants enregistrés et leurs pièces signées restent au dossier ;
--   · un avenant DÉJÀ APPLIQUÉ reste appliqué : le loyer et les charges du bail gardent leurs valeurs d'après l'avenant
--     (les ramener en arrière réécrirait un contrat signé) ;
--   · un avenant EN ATTENTE ne s'appliquera plus tout seul : ce retour les compte et le dit (NOTICE). Ils restent
--     enregistrés ; après ce retour, leur effet devra être repris à la main ou la migration rejouée.
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente. Rejouable.
do $retour$
declare
  v_attente integer := 0;
begin
  drop trigger if exists a_avenant_du_bail on public.appels_loyer;
  drop function if exists public.appliquer_avenant_a_l_appel();
  drop function if exists public.enregistrer_avenant_bail(uuid, uuid, text, date, date, numeric, numeric, text, text, bigint, text);
  drop function if exists public.annuler_avenant_bail(uuid, uuid, text);
  drop function if exists public.appliquer_avenant_bail_interne(uuid);
  if to_regclass('public.avenants_bail') is not null then
    select count(*) into v_attente from public.avenants_bail where annule_le is null and applique_le is null;
    if v_attente > 0 then
      raise notice 'Retour P1-14 : % avenant(s) en attente ne s''appliqueront plus automatiquement (ils restent enregistrés).', v_attente;
    end if;
  end if;
  delete from supabase_migrations.schema_migrations where version = '20261122190000';
end $retour$;
notify pgrst, 'reload schema';
