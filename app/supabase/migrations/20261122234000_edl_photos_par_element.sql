-- ÉTAT DES LIEUX : UNE PHOTO PAR ÉLÉMENT (audit palier 1 du 22/11/2026, P2-01).
--
-- L'ÉCART. La grille de l'état des lieux ne portait aucune photo. La colonne `edl_lignes.photo_document_id` existe
-- depuis la fondation de l'état des lieux (sprint 4), mais aucun écran ne l'a jamais remplie et rien ne la reliait à la
-- table des documents.
--
-- CE QUE FAIT CETTE MIGRATION. Elle relie cette colonne aux documents DU MÊME ESPACE : une ligne d'état des lieux ne
-- peut porter que la photo d'un document de son organisation (clé étrangère sur le couple document, organisation, comme
-- pour la photo d'un relevé de compteur), avec l'index qui couvre cette clé.
--
-- CE QUI NE CHANGE PAS : les droits sur les lignes (le gestionnaire de l'espace, tant que l'état des lieux n'est pas
-- signé : le déclencheur `edl_lignes_fige_trg` fige aussi la photo), la grille, les états, les observations.
-- La colonne est vide partout aujourd'hui : la contrainte ne peut refuser aucune ligne existante ; si une valeur
-- orpheline existait, la migration s'arrêterait sans rien changer.
--
-- Retour arrière : supabase/retours-arriere/20261122234000_edl_photos_par_element.retour.sql.

do $contrainte$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.edl_lignes'::regclass and conname = 'edl_lignes_photo_meme_org_fk') then
    alter table public.edl_lignes
      add constraint edl_lignes_photo_meme_org_fk
      foreign key (photo_document_id, organization_id) references public.documents (id, organization_id);
  end if;
end $contrainte$;

-- Index couvrant de la clé étrangère (document, organisation), non partiel : c'est la règle du schéma pour toute clé
-- étrangère (tests/schema-performance-securite.test.ts). Il sert aussi la lecture des photos d'un état des lieux.
create index if not exists edl_lignes_photo_idx on public.edl_lignes (photo_document_id, organization_id);

comment on column public.edl_lignes.photo_document_id is
  'P2-01 (22/11/2026) : photo de l''élément, document du même espace. Figée avec la ligne à la signature de l''état des lieux.';

notify pgrst, 'reload schema';
