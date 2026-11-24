-- RETOUR ARRIÈRE de 20261124120000_motif_retrait_reserve_a_l_auteur.sql (décisions du 24/11/2026, lot D1 reprise,
-- Q20 : le motif du retrait d'une note n'est lu que par son auteur).
--
-- À JOUER APRÈS le retour du code de l'application : le code de ce lot lit le motif par `retraits_de_mes_notes` ;
-- sans elle, il n'affiche simplement plus le motif (l'annonce du retrait reste).
--
-- RÉINTRODUIT l'état d'avant : les gestionnaires d'une organisation lisent de nouveau directement la colonne
-- `retrait_motif`, y compris pour la note donnée par leur locataire ; le locataire ne lit plus le motif du retrait de
-- sa note. Aucune donnée n'est modifiée ni supprimée. Les politiques de la table ne sont pas touchées. Rejouable.
do $retour$
begin
  drop function if exists public.retraits_de_mes_notes(uuid);
  grant select on table public.artisan_evaluations to authenticated;
  revoke select (id, organization_id, intervention_id, artisan_id, source, note_globale, note_qualite, note_delai,
                 note_prix, commentaire, evaluateur_account_id, retiree_le, retiree_par, created_at)
    on table public.artisan_evaluations from authenticated;
  delete from supabase_migrations.schema_migrations where version = '20261124120000';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
