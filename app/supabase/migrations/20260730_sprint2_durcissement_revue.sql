-- Revue Sprint 2 (itération 1) — durcissement et advisors.
-- Appliquée le 2026-07-30 sur « Gerimmo V4 » via MCP. Copie de référence.
-- 1. Immuabilité des clés de répartition (RM-0.4.2/4) : le privilège UPDATE
--    complet permettait à un gérant de modifier mode/date_effet d'une clé via
--    l'API. Les fonctions (valider_cle_repartition, decouper_bien, invoker)
--    n'écrivent que invalidated_at : on limite le privilège à cette colonne.
revoke update on public.cles_repartition from authenticated;
grant update (invalidated_at) on public.cles_repartition to authenticated;

-- 2. Advisors performance : index sur les clés étrangères du Sprint 2.
create index cle_repartition_lignes_lot_idx on public.cle_repartition_lignes (lot_id);
create index diagnostics_document_idx on public.diagnostics (document_id) where document_id is not null;
create index diagnostics_remplace_idx on public.diagnostics (remplace_id) where remplace_id is not null;
create index cles_repartition_org_idx on public.cles_repartition (organization_id);
create index cles_repartition_created_by_idx on public.cles_repartition (created_by) where created_by is not null;
create index lot_equipements_equipement_idx on public.lot_equipements (equipement_id);
