-- RETOUR ARRIÈRE de 20261124110000_publications_origine.sql (décisions du 24/11/2026, lot D1 reprise, Q13 : origine
-- d'un article du Journal).
--
-- À JOUER APRÈS le retour du code de l'application : le code de ce lot lit `publications.origine` sur les pages
-- d'article ; sans le droit de lecture du visiteur, la page publique d'un article ne s'afficherait plus.
--
-- Retire le déclencheur et sa fonction, et le droit de lecture du visiteur sur la colonne. AUCUNE DONNÉE N'EST
-- SUPPRIMÉE : la colonne `publications.origine` et ses valeurs sont gardées (elle n'est simplement plus lue).
-- Réintroduit l'état d'avant : avec l'ancien code, chaque article affiche la mention, même écrit à la main.
-- Rejouable.
do $retour$
begin
  drop trigger if exists publications_origine_ia_definitive on public.publications;
  drop function if exists public.publications_origine_ia_definitive();
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'publications' and column_name = 'origine') then
    revoke select (origine) on table public.publications from anon;
  end if;
  delete from supabase_migrations.schema_migrations where version = '20261124110000';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
