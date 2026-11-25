-- RETOUR ARRIÈRE de 20261124200000_justificatif_retenue_piece_existante.sql (décision du 24/11/2026, Q49, reprise du
-- lot D3 : une pièce déjà rangée peut justifier une retenue, sous contrôle de la base).
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente. Le code du lot rattache une pièce
-- existante à une retenue : sans ce garde-fou, `ajouter_retenue` accepterait de nouveau n'importe quel identifiant de
-- document (y compris celui d'un autre espace), comme avant le lot.
--
-- Se joue APRÈS le retour de 20261124220000 (seconde reprise du lot D3, qui réécrit la fonction du déclencheur).
--
-- Retire le déclencheur `retenues_justificatif_admis` et sa fonction. Aucune donnée n'est modifiée ni supprimée : les
-- retenues gardent leur pièce, les documents restent rangés. Aucune autre fonction n'est touchée. Rejouable.
do $retour$
begin
  if to_regclass('public.retenues') is not null then
    drop trigger if exists retenues_justificatif_admis on public.retenues;
  end if;
  drop function if exists public.garde_justificatif_retenue();
  delete from supabase_migrations.schema_migrations where version = '20261124200000';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
