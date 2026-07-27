-- Correctif : la création d'incident échouait pour tout utilisateur non super-admin.
--
-- Cause : incidents_select_policy utilisait can_access_incident(id), qui RE-INTERROGE
-- la table incidents pour retrouver la ligne. Pendant un INSERT ... RETURNING (ce que fait
-- createIncident via .insert().select()), la ligne n'est pas encore visible dans le snapshot
-- de cette sous-requête → la fonction renvoie false → la lecture du RETURNING est refusée →
-- l'insertion entière échoue. Les super-admins passaient car is_super_admin() court-circuite.
--
-- Correction : évaluer les mêmes droits directement sur les colonnes de la ligne évaluée.
-- La fonction can_access_incident est conservée : d'autres policies s'appuient dessus.
--
-- La condition « archived_at is null » est également retirée : elle cassait de la même façon
-- l'archivage (archiveIncident fait un UPDATE ... RETURNING ; une fois archived_at renseigné,
-- la ligne redevenait illisible et l'opération échouait). Les listes de l'application filtrent
-- déjà explicitement `.is("archived_at", null)`, donc ce filtre au niveau de la policy était
-- redondant côté lecture et bloquant côté écriture.

drop policy if exists incidents_select_policy on public.incidents;

create policy incidents_select_policy on public.incidents
  for select using (
    public.is_super_admin()
    or public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier'])
    or public.is_active_organization_member(organization_id)
    or created_by = auth.uid()
    or responsible_profile_id = auth.uid()
  );
