-- RETOUR ARRIÈRE de 20261123090000_reperes_fiscaux_reglage.sql (audit palier 1, P2-09 : plafond et abattement du
-- micro-foncier sortis du code).
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente : l'ancien code affiche 15 000 € et 30 %
-- écrits en dur et ne lit pas ces fonctions ; le code nouveau, sans elles, affiche la phrase d'aide sans aucune
-- valeur (il ne tombe pas en panne).
--
-- Supprime les deux fonctions et la table du réglage. Les valeurs enregistrées par le superviseur et la date de
-- vérification disparaissent avec la table ; le journal de la supervision (action « reperes_fiscaux ») garde chaque
-- modification, avec les valeurs d'avant et d'après. Une remise en service repart des valeurs de livraison, SANS date
-- de vérification : le superviseur les confirme de nouveau.
--
-- `regler_reperes_fiscaux` cite `aujourdhui_paris()` : ce retour se joue AVANT celui de 20261014500000.
-- Rejouable.
do $retour$
begin
  drop function if exists public.regler_reperes_fiscaux(integer, integer);
  drop function if exists public.reperes_fiscaux();
  drop table if exists public.reperes_fiscaux_reglage;
  delete from supabase_migrations.schema_migrations where version = '20261123090000';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
