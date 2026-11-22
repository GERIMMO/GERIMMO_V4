-- RETOUR ARRIÈRE de 20261122235950_pointage_loyer_releve.sql (audit palier 1, P2-05 : pointage d'un loyer sur relevé).
--
-- Supprime la fonction de ce lot. Les règlements déjà pointés RESTENT, avec leur note « Pointé sur un relevé de
-- banque… », leurs écritures et leurs quittances : ce sont des encaissements ordinaires, créés par
-- `declarer_reception_loyer`, que ce retour ne touche pas. Leur trace de demande (registre des encaissements) reste
-- aussi : la même ligne de relevé ne pourrait pas être enregistrée une seconde fois après une remise en service.
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente. Rejouable.
do $retour$
begin
  drop function if exists public.pointer_loyer_releve(uuid, uuid, numeric, date, text, uuid, numeric, text);
  delete from supabase_migrations.schema_migrations where version = '20261122235950';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
