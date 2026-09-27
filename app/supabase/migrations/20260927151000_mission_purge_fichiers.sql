-- AUDIT SÉCURITÉ DU 27/09 — MAJEUR : LA SUPPRESSION PHYSIQUE N'ÉTAIT PAS AUTOMATIQUE.
--
-- pg_cron met chaque nuit en file (`purge_fichiers`) les chemins des fichiers
-- dont la conservation est échue, mais seul le bouton « Lancer la purge » les
-- supprimait du Storage. Une mission planifiée (`/api/cron/equipes?mission=purge`,
-- 03:40 UTC, après `retention-quotidienne` à 03:00) vide désormais la file par
-- l'API Storage avec le client de service. Comme toute mission, elle a sa
-- ligne dans `agent_missions` (pause possible depuis Équipes) et son verrou.
--
-- Idempotent : ON CONFLICT DO NOTHING.

insert into public.agent_missions (cle) values ('purge') on conflict (cle) do nothing;
