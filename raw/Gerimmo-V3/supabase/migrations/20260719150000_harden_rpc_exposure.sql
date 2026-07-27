-- Durcissement sécurité (audit 2026-07-19).
--
-- Contexte : toute fonction du schéma public est exposée via l'API REST Supabase
-- (/rest/v1/rpc/<nom>). Une fonction SECURITY DEFINER qui écrit et reste exécutable par
-- `anon` ou `authenticated` peut donc être déclenchée directement, hors de l'application.
--
-- Audit : 9 fonctions SECURITY DEFINER écrivant en base étaient exposées. 6 d'entre elles
-- sont appelées légitimement par l'application avec la session de l'utilisateur ET
-- vérifient les droits en interne (auth.uid() + is_super_admin/can_manage/… + exception) :
-- accept_user_invitation, apply_promotion_code, recommend_incident_quote,
-- refresh_business_recommendations, start_organization_trial, transition_subscription.
-- Elles sont conservées telles quelles.
--
-- Les 3 ci-dessous ne sont appelées QUE côté serveur (client service role) ou pas du tout :
-- elles n'ont aucune raison d'être exposées aux utilisateurs.

-- 1) archive_stale_product_ideas : exécutable par `anon` (donc SANS être connecté) alors
--    qu'elle archive des données et n'est appelée nulle part dans l'application.
--    NB : il faut aussi révoquer PUBLIC — un droit accordé à PUBLIC s'applique à tous les
--    rôles, donc révoquer seulement anon/authenticated ne suffit pas.
revoke execute on function public.archive_stale_product_ideas() from public, anon, authenticated;
grant execute on function public.archive_stale_product_ideas() to service_role;

-- 2) et 3) Automatisations n8n : appelées uniquement via /api/automations/rent avec le
--    client service role (voir docs/05-workflows-n8n.md).
revoke execute on function public.generate_rent_periods_for_month(date) from anon, authenticated;
grant execute on function public.generate_rent_periods_for_month(date) to service_role;

revoke execute on function public.queue_document_expiry_reminders() from anon, authenticated;
grant execute on function public.queue_document_expiry_reminders() to service_role;

-- 4) Hygiène : figer le search_path de trois fonctions qui ne l'avaient pas.
--    Elles sont SECURITY INVOKER (pas d'élévation de privilèges, risque faible), mais un
--    search_path mutable reste une mauvaise pratique.
alter function public.set_updated_at() set search_path = public;
alter function public.current_profile_id() set search_path = public;
alter function public.calculate_incident_quote_score(integer, numeric, boolean) set search_path = public;
