-- RETOUR ARRIÈRE de 20261122160000_signatures_electroniques_locataire.sql (audit palier 1, P1-06).
--
-- Supprime la fonction de lecture du locataire. Elle ne faisait que lire : aucune donnée n'est touchée, les circuits
-- de signature et leurs documents restent en place.
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente (sinon l'écran « Mes documents » du
-- locataire signalerait une lecture en panne). Rejouable.
do $retour$
begin
  drop function if exists public.mes_signatures_electroniques(uuid);
  delete from supabase_migrations.schema_migrations where version = '20261122160000';
end $retour$;
notify pgrst, 'reload schema';
