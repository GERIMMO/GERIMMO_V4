-- RETOUR ARRIÈRE de 20261122235900_artisan_lignes_devis.sql (audit palier 1, P2-04 : lignes de devis réutilisables).
--
-- Supprime les trois fonctions de ce lot. La table `artisan_lignes_devis` RESTE, fermée, avec les lignes que les
-- artisans y ont gardées : rien n'est effacé. Après le retour de l'application, plus aucun écran ne la lit ni ne l'écrit.
-- Aucun devis n'est concerné : une ligne gardée n'est qu'une aide à la saisie, recopiée dans le devis au moment où
-- l'artisan la reprend.
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente. Rejouable.
do $retour$
begin
  drop function if exists public.mes_lignes_devis();
  drop function if exists public.garder_ma_ligne_devis(text, bigint, integer);
  drop function if exists public.retirer_ma_ligne_devis(uuid);
  delete from supabase_migrations.schema_migrations where version = '20261122235900';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
