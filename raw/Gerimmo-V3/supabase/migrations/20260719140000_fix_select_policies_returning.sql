-- Correctif global : même bug que 20260719130000 (incidents), présent sur 6 autres tables.
--
-- Motif fautif : une policy SELECT appelle can_access_X(id) — une fonction qui RE-INTERROGE
-- la table pour retrouver la ligne. Pendant un INSERT ... RETURNING (tous les services font
-- .insert().select()) ou un UPDATE ... RETURNING, la ligne n'est pas visible dans le snapshot
-- de cette sous-requête → la fonction renvoie false → le RETURNING est refusé → l'opération
-- échoue (500). Les super-admins ne voyaient rien car is_super_admin() court-circuite avant.
-- Conséquence : créer un document, une demande de devis, un comparatif, une intervention ou
-- une demande de créneaux était IMPOSSIBLE pour tout utilisateur non super-admin.
--
-- Correction : évaluer les mêmes droits directement sur les colonnes de la ligne. Les appels
-- à can_access_X(<clé étrangère>) sont conservés : ils visent une AUTRE table dont la ligne
-- existe déjà (pas de problème de visibilité).
-- La condition « archived_at is null » est retirée des policies SELECT : elle cassait de la
-- même façon l'archivage (UPDATE ... RETURNING). Les requêtes de liste de l'application
-- filtrent déjà explicitement les lignes archivées.
-- Les fonctions can_access_* sont conservées : d'autres policies s'appuient dessus.

-- 1) documents
drop policy if exists documents_select_policy on public.documents;
create policy documents_select_policy on public.documents for select using (
  public.is_super_admin()
  or public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier'])
  or public.is_active_organization_member(organization_id)
  or owner_profile_id = auth.uid()
  or tenant_profile_id = auth.uid()
  or exists (
    select 1
    from public.document_access_rules dar
    where dar.document_id = documents.id
      and dar.archived_at is null
      and (
        dar.profile_id = auth.uid()
        or exists (
          select 1
          from public.organization_members om
          join public.member_role_assignments mra on mra.organization_member_id = om.id
          join public.roles r on r.id = mra.role_id
          where om.profile_id = auth.uid()
            and om.organization_id = documents.organization_id
            and om.archived_at is null
            and om.status = 'active'
            and r.key = dar.role_key
        )
      )
  )
);

-- 2) incident_quote_requests
drop policy if exists incident_quote_requests_select_policy on public.incident_quote_requests;
create policy incident_quote_requests_select_policy on public.incident_quote_requests for select using (
  public.is_super_admin()
  or public.can_manage_incidents(organization_id)
  or public.can_access_incident(incident_id)
  or requested_by = auth.uid()
  or exists (
    select 1
    from public.incident_quote_recipients iqrp
    where iqrp.quote_request_id = incident_quote_requests.id
      and iqrp.archived_at is null
      and iqrp.artisan_profile_id = auth.uid()
  )
);

-- 3) incident_quote_comparisons (la clé étrangère vise une autre table : sûr)
drop policy if exists incident_quote_comparisons_select_policy on public.incident_quote_comparisons;
create policy incident_quote_comparisons_select_policy on public.incident_quote_comparisons for select using (
  public.is_super_admin()
  or public.can_access_incident_quote_request(quote_request_id)
);

-- 4) incident_interventions
drop policy if exists incident_interventions_select_policy on public.incident_interventions;
create policy incident_interventions_select_policy on public.incident_interventions for select using (
  public.is_super_admin()
  or public.can_manage_incidents(organization_id)
  or public.can_access_incident(incident_id)
  or responsible_profile_id = auth.uid()
  or tenant_profile_id = auth.uid()
  or artisan_profile_id = auth.uid()
  or internal_intervenant_profile_id = auth.uid()
);

-- 5) incident_schedule_requests
drop policy if exists incident_schedule_requests_select_policy on public.incident_schedule_requests;
create policy incident_schedule_requests_select_policy on public.incident_schedule_requests for select using (
  public.is_super_admin()
  or public.can_manage_incidents(organization_id)
  or public.can_access_incident(incident_id)
  or responsible_profile_id = auth.uid()
  or tenant_profile_id = auth.uid()
  or artisan_profile_id = auth.uid()
);

-- 6) organization_members
drop policy if exists organization_members_select_policy on public.organization_members;
create policy organization_members_select_policy on public.organization_members for select using (
  public.is_super_admin()
  or profile_id = auth.uid()
  or public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier'])
);
