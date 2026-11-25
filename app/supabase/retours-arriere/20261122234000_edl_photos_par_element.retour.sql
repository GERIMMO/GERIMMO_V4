-- RETOUR ARRIÈRE de 20261122234000_edl_photos_par_element.sql (audit palier 1, P2-01 : une photo par élément de l'état
-- des lieux).
--
-- Retire la clé étrangère et l'index. La colonne `edl_lignes.photo_document_id` (antérieure à cette migration) RESTE,
-- avec les liens déjà posés : aucune photo, aucun document, aucune ligne n'est effacé. Après le retour de l'application,
-- plus aucun écran ne lit ni n'écrit ces liens ; les photos restent dans les documents du bail.
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente. Rejouable.
do $retour$
begin
  alter table public.edl_lignes drop constraint if exists edl_lignes_photo_meme_org_fk;
  drop index if exists public.edl_lignes_photo_idx;
  delete from supabase_migrations.schema_migrations where version = '20261122234000';
end $retour$;
notify pgrst, 'reload schema';
