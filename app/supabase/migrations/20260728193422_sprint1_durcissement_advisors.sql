-- (Rapatriée depuis la prod le 2026-09-10 — appliquée via MCP sans fichier dépôt.)
-- Suites des advisors Supabase (revue Sprint 1).
-- 1) handle_auth_user_change est une fonction TRIGGER security definer : elle
--    n'a rien à faire dans l'API RPC (signalée exécutable par anon).
revoke execute on function public.handle_auth_user_change() from public, anon, authenticated;

-- 2) Index sur les clés étrangères réellement sollicitées :
--    - acces_pieces_log.organization_id : filtre RLS de l'admin d'agence
--    - alerts.assignee_account_id : « mes alertes » (module 14)
--    - audit_log.organization_id : consultation par organisation (console SA)
create index acces_pieces_log_org_idx on public.acces_pieces_log (organization_id);
create index alerts_assignee_idx on public.alerts (assignee_account_id)
  where assignee_account_id is not null;
create index audit_log_org_idx on public.audit_log (organization_id)
  where organization_id is not null;
