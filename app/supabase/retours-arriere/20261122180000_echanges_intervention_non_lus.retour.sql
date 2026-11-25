-- RETOUR ARRIÈRE de 20261122180000_echanges_intervention_non_lus.sql (audit palier 1, P1-05).
--
-- Retire le signalement des nouveaux messages d'une discussion d'intervention : le déclencheur qui pose l'alerte du
-- gestionnaire, les deux fonctions (non-lus, marquer lu) et la table des marqueurs de lecture.
--
-- CE QUI EST PERDU, ET SEULEMENT CELA : les marqueurs « j'ai lu jusqu'à telle heure » (une donnée technique, sans
-- contenu). AUCUN MESSAGE N'EST TOUCHÉ : la discussion, ses textes et son état restent tels quels.
-- Les alertes « Nouveau message sur l'intervention » encore ouvertes sont fermées (« Signalement retiré ») : le code
-- d'avant ne saurait ni les nommer ni les fermer d'elles-mêmes. Les alertes déjà fermées restent à l'historique.
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente. Rejouable.
do $retour$
declare
  v_systeme text := coalesce(current_setting('gerimmo.systeme', true), '');
begin
  drop trigger if exists signaler_message_intervention on public.intervention_messages;
  drop function if exists public.signaler_message_intervention();
  drop function if exists public.marquer_echange_intervention_lu(uuid, uuid);
  drop function if exists public.echanges_intervention_non_lus(uuid);
  drop table if exists public.intervention_echanges_lectures;

  -- Tâche de plateforme : la fermeture ne dépend pas de la situation commerciale de l'espace (tache_systeme()).
  -- Le drapeau ne vaut que pour la transaction en cours, et il est rendu à sa valeur d'avant.
  perform public.tache_systeme();
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_action = 'Signalement retiré'
   where type = 'message_intervention' and statut = 'ouverte';
  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);

  delete from supabase_migrations.schema_migrations where version = '20261122180000';
end $retour$;
notify pgrst, 'reload schema';
