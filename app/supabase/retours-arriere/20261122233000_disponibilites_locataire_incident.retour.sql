-- RETOUR ARRIÈRE de 20261122233000_disponibilites_locataire_incident.sql (audit palier 1, P2-02 : le locataire dit ses
-- disponibilités dès qu'il signale un incident).
--
-- Supprime la fonction d'écriture. Les deux colonnes et leur contrainte RESTENT, avec ce que les locataires ont déjà
-- écrit : rien n'est effacé (plus aucun code ne les lit ni ne les écrit après le retour de l'application).
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente. Rejouable.
do $retour$
begin
  drop function if exists public.indiquer_mes_disponibilites_incident(uuid, text);
  delete from supabase_migrations.schema_migrations where version = '20261122233000';
end $retour$;
notify pgrst, 'reload schema';
